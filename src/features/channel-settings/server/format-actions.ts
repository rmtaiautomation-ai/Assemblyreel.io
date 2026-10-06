"use server";

import { createClient } from "@/lib/supabase/server";
import {
  resolveFormatProfile,
  isFormatPresetKey,
  selectRotatingDevice,
  type FormatProfile,
  type FormatProfileOverride,
} from "@/lib/ai/format-profile";
import {
  analyzeChannelBrief,
  type FormatAnalysisGap,
} from "@/lib/ai/agents/format-analyst";
import { extractChannelFacts, type FactCandidate } from "@/lib/ai/agents/fact-archivist";
import type { ActContinuityEntry } from "@/lib/ai/channel-facts";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const MIGRATION_HINT =
  "Run db/add-channel-blueprint.sql in the Supabase SQL editor to enable per-channel formats.";

/* -------------------------------------------------------------------------- */
/*                    Workspace read — the LIVE, editable blueprint            */
/* -------------------------------------------------------------------------- */

interface WorkspaceFormatColumns {
  content_theme: string | null;
  format_preset_key: string | null;
  format_blueprint: FormatProfileOverride | null;
  format_blueprint_version: number | null;
}

/**
 * Reads the workspace's format columns, degrading to `content_theme` alone when
 * `db/add-channel-blueprint.sql` has not run yet.
 *
 * PostgREST fails an ENTIRE `.select()` if any named column does not exist — it does
 * not return the columns that do exist with nulls for the rest. So this cannot be one
 * query with optional fields; it is the same "try the full select, fall back to a
 * narrower one on error" shape `loadSceneBoard` uses for
 * `act_number` in this codebase.
 */
async function readWorkspaceFormatColumns(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ data: WorkspaceFormatColumns | null; migrationPending: boolean; error?: string }> {
  const full = await supabase
    .from("workspaces")
    .select("content_theme, format_preset_key, format_blueprint, format_blueprint_version")
    .eq("id", workspaceId)
    .single();

  if (!full.error) {
    return { data: full.data as WorkspaceFormatColumns, migrationPending: false };
  }

  const fallback = await supabase
    .from("workspaces")
    .select("content_theme")
    .eq("id", workspaceId)
    .single();

  if (fallback.error || !fallback.data) {
    return { data: null, migrationPending: true, error: fallback.error?.message ?? full.error.message };
  }

  return {
    data: {
      content_theme: fallback.data.content_theme as string,
      format_preset_key: null,
      format_blueprint: null,
      format_blueprint_version: null,
    },
    migrationPending: true,
  };
}

export interface GetWorkspaceFormatResult {
  success: boolean;
  profile?: FormatProfile;
  presetKey?: string | null;
  blueprintOverride?: FormatProfileOverride | null;
  /** True when db/add-channel-blueprint.sql has not been run for this database yet. */
  migrationPending?: boolean;
  error?: string;
}

/**
 * Resolves the CURRENT, live FormatProfile for a workspace — whatever is saved in the
 * Channel Format tab right now, including an edit made seconds ago.
 *
 * Correct for the settings UI (Phase 5) and for STARTING a new project. Wrong once a
 * project already exists — see `resolveProjectFormatProfile` below, which is what
 * every generation call after project creation must use instead.
 */
export async function getWorkspaceFormatProfile(
  workspaceId: string
): Promise<GetWorkspaceFormatResult> {
  const supabase = await createClient();
  const { data, migrationPending, error } = await readWorkspaceFormatColumns(supabase, workspaceId);

  if (!data) {
    return { success: false, error: error ?? "Workspace not found." };
  }

  const profile = resolveFormatProfile({
    presetKey: data.format_preset_key,
    blueprintOverride: data.format_blueprint,
    nicheTheme: data.content_theme,
    version: data.format_blueprint_version,
  });

  return {
    success: true,
    profile,
    presetKey: data.format_preset_key,
    blueprintOverride: data.format_blueprint,
    migrationPending,
    error: migrationPending ? MIGRATION_HINT : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Workspace write — Phase 5's save                   */
/* -------------------------------------------------------------------------- */

export interface SaveWorkspaceFormatResult {
  success: boolean;
  version?: number;
  error?: string;
}

/**
 * Saves the workspace's preset choice and/or override, and bumps its version.
 *
 * Bumped on every save, even one that changes nothing observable — the version is
 * compared against a project's frozen snapshot later purely to tell whether the
 * channel's format has moved on since that video was generated.
 */
export async function saveWorkspaceFormatProfile(
  workspaceId: string,
  params: { presetKey?: string; blueprintOverride?: FormatProfileOverride | null }
): Promise<SaveWorkspaceFormatResult> {
  if (params.presetKey !== undefined && !isFormatPresetKey(params.presetKey)) {
    return { success: false, error: `Unknown preset key: ${params.presetKey}` };
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("workspaces")
    .select("format_blueprint_version")
    .eq("id", workspaceId)
    .single();

  if (readError) {
    return { success: false, error: `${readError.message}. ${MIGRATION_HINT}` };
  }

  const nextVersion = ((current?.format_blueprint_version as number) ?? 0) + 1;

  const update: Record<string, unknown> = { format_blueprint_version: nextVersion };
  if (params.presetKey !== undefined) update.format_preset_key = params.presetKey;
  if (params.blueprintOverride !== undefined) update.format_blueprint = params.blueprintOverride;

  const { error } = await supabase.from("workspaces").update(update).eq("id", workspaceId);
  if (error) return { success: false, error: error.message };

  return { success: true, version: nextVersion };
}

/* -------------------------------------------------------------------------- */
/*              Project read — the FROZEN snapshot generation must use         */
/* -------------------------------------------------------------------------- */

type JoinedWorkspace = WorkspaceFormatColumns | WorkspaceFormatColumns[] | null;

/**
 * Resolves the FormatProfile a project's generation calls must use: its own frozen
 * snapshot if one was written at creation time, or a live resolve for a project that
 * predates `db/add-channel-blueprint.sql` (same degrade-gracefully shape as every other
 * optional migration in this codebase).
 *
 * This is the ONE this file exists to make hard to get wrong. Long-form generates Act
 * by Act with a human approval gate between each — if a later Act read the live
 * workspace row, editing the Channel Format tab after approving Act 1-3 would silently
 * change the rules Act 4 onward is written under, and a single video would sound like
 * two different channels. Mirrors `resolveWorkspaceNicheTheme` in whiteboard-actions.ts
 * (same "resolve once, from the project, with a graceful fallback" shape) but checks
 * the frozen snapshot first rather than always reading the live workspace.
 *
 * `provided` lets a caller that already resolved a profile earlier in the same request
 * (e.g. `createProjectWithActs`, before the snapshot column is even written) skip the
 * round trip — same pattern as `resolveWorkspaceNicheTheme`'s `provided` parameter.
 */
export async function resolveProjectFormatProfile(
  supabase: SupabaseClient,
  projectId: string,
  provided?: FormatProfile
): Promise<FormatProfile> {
  if (provided) return provided;

  const full = await supabase
    .from("video_projects")
    .select(
      "format_blueprint_snapshot, workspaces(content_theme, format_preset_key, format_blueprint, format_blueprint_version)"
    )
    .eq("id", projectId)
    .single();

  if (!full.error && full.data) {
    const snapshot = full.data.format_blueprint_snapshot as FormatProfile | null;
    if (snapshot) return snapshot;

    const workspace = full.data.workspaces as JoinedWorkspace;
    const w = Array.isArray(workspace) ? workspace[0] : workspace;
    if (w) {
      return resolveFormatProfile({
        presetKey: w.format_preset_key,
        blueprintOverride: w.format_blueprint,
        nicheTheme: w.content_theme,
        version: w.format_blueprint_version,
      });
    }
  }

  // Full select failed outright — db/add-channel-blueprint.sql has not run. Degrade to
  // exactly what resolveWorkspaceNicheTheme reads: the workspace's theme alone.
  const { data: joined } = await supabase
    .from("video_projects")
    .select("workspaces(content_theme)")
    .eq("id", projectId)
    .single();

  const workspace = joined?.workspaces as
    | { content_theme?: string }
    | { content_theme?: string }[]
    | null;
  const nicheTheme = Array.isArray(workspace) ? workspace[0]?.content_theme : workspace?.content_theme;

  return resolveFormatProfile({ nicheTheme });
}

/**
 * Client-callable entry point for `resolveProjectFormatProfile`.
 *
 * Every other caller of that function already holds a Supabase client from work it was
 * doing anyway (see whiteboard-actions.ts). A client component like the Timeline Editor
 * has neither a client nor a reason to create one beyond this single read, so this
 * exists purely to create one and call through — the same "resolve at the point of use
 * rather than thread a prop through the whole component" trade `resolveWorkspaceNicheTheme`
 * already documents itself as making.
 */
export async function getProjectFormatProfile(projectId: string): Promise<FormatProfile> {
  const supabase = await createClient();
  return resolveProjectFormatProfile(supabase, projectId);
}

/* -------------------------------------------------------------------------- */
/*                       Rotation ledger (Phase 7)                            */
/* -------------------------------------------------------------------------- */

/**
 * Reserves and advances the next rotation-cursor position for a project's workspace.
 *
 * Resolves `workspace_id` from `projectId` internally — same "resolve at point of use"
 * trade `resolveProjectFormatProfile` makes — so a caller in `generateAct` needs nothing
 * beyond the `projectId` it already has.
 *
 * Returns `null`, never throws, whenever a cursor cannot be safely handed out: the
 * column does not exist yet (`db/add-rotation-cursor.sql` not run), the project or its
 * workspace cannot be found, or the write back fails. A `null` here is not an error
 * condition for the caller — `buildScriptWriterSystemInstruction` already falls back to
 * letting the model choose freely from the pool when no device was pre-selected, which
 * is exactly the pre-Phase-7 behaviour.
 */
export async function consumeRotationCursor(projectId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("video_projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project?.workspace_id) return null;

  const { data: workspace, error: readError } = await supabase
    .from("workspaces")
    .select("rotation_cursor")
    .eq("id", project.workspace_id)
    .single();

  if (readError || workspace == null || workspace.rotation_cursor == null) return null;

  const cursor = workspace.rotation_cursor as number;

  const { error: writeError } = await supabase
    .from("workspaces")
    .update({ rotation_cursor: cursor + 1 })
    .eq("id", project.workspace_id);

  // Don't hand out a cursor position the write couldn't actually reserve — the next
  // call would then read the same un-advanced value and could pick the same device.
  if (writeError) return null;

  return cursor;
}

/**
 * The ONE framing device this video is built around, resolved once and then reused.
 *
 * Idempotent per project, and that is the whole point. `consumeRotationCursor` above is a
 * reservation primitive — every call advances the channel's cursor — so calling it from
 * the per-Act path (which is what shipped) gave a 9-Act video nine different devices out
 * of a 7-entry pool: it exhausted the pool, wrapped, and repeated, all inside one video.
 * The device is meant to be the lens the whole episode is shot through, varying BETWEEN
 * episodes. See db/add-project-framing-device.sql for the observed failure.
 *
 * First Act generated for a project pays the cost of drawing and storing; every later Act
 * reads back the same string, even days later behind an approval gate. The stored value is
 * the resolved device text rather than the cursor index, so editing the channel's pool
 * afterwards cannot retroactively re-frame a video that is already half-written.
 *
 * Returns `null`, never throws, on every degraded path — no pool declared, the migration
 * not run, the project missing, or the cursor unavailable. A null simply leaves
 * `selectedFramingDevice` undefined, and `buildScriptWriterSystemInstruction` falls back
 * to letting the model choose freely from the pool, exactly as it did pre-Phase-7.
 */
export async function resolveProjectFramingDevice(
  projectId: string,
  profile: FormatProfile
): Promise<string | null> {
  if (!profile.content.rotatingDevices.length) return null;

  const supabase = await createClient();

  // A stored device wins outright — this is what makes Acts 2..N reuse Act 1's choice.
  // Selected separately from the workspace read below because a failure here (column
  // absent on an un-migrated database) must fall through to drawing a fresh one rather
  // than abandoning rotation altogether.
  const { data: project, error: readError } = await supabase
    .from("video_projects")
    .select("framing_device")
    .eq("id", projectId)
    .single();

  if (!readError && project?.framing_device) {
    return project.framing_device as string;
  }

  const cursor = await consumeRotationCursor(projectId);
  if (cursor == null) return null;

  const { device } = selectRotatingDevice(profile, cursor);
  if (!device) return null;

  // Best-effort persist. A failed write costs this project its per-video consistency —
  // the next Act would draw again — but the Act being generated right now still gets a
  // real device, which is strictly better than returning null and getting none.
  const { error: writeError } = await supabase
    .from("video_projects")
    .update({ framing_device: device })
    .eq("id", projectId);

  if (writeError) {
    console.warn(
      `[Rotation] Could not persist framing device for project ${projectId} (${writeError.message}). ` +
        `Later Acts may draw a different device. Run db/add-project-framing-device.sql.`
    );
  }

  return device;
}

/* -------------------------------------------------------------------------- */
/*                     Continuity ledger — act_continuity                     */
/* -------------------------------------------------------------------------- */

/**
 * What earlier Acts of this project already covered.
 *
 * Returns `[]`, never throws, on every degraded path — column absent
 * (db/add-act-continuity.sql not run), project missing, or malformed JSON. An empty result
 * compiles to no prompt block at all, which is exactly the behaviour before the ledger
 * existed, so nothing regresses on a database that has not been migrated.
 */
export async function readActContinuity(
  supabase: SupabaseClient,
  projectId: string
): Promise<ActContinuityEntry[]> {
  const { data, error } = await supabase
    .from("video_projects")
    .select("act_continuity")
    .eq("id", projectId)
    .single();

  if (error || !data?.act_continuity) return [];

  const raw = data.act_continuity;
  if (!Array.isArray(raw)) return [];

  // Hand-validated rather than trusted: this is jsonb, so anything could be in the column,
  // and a malformed entry reaching `continuityBlock` would render "Act undefined" into a
  // prompt rather than failing loudly.
  return raw.filter(
    (entry): entry is ActContinuityEntry =>
      entry != null &&
      typeof entry === "object" &&
      typeof (entry as ActContinuityEntry).actNumber === "number" &&
      typeof (entry as ActContinuityEntry).title === "string" &&
      Array.isArray((entry as ActContinuityEntry).namedFacts)
  );
}

/**
 * Records what one Act named, replacing any existing entry for that Act.
 *
 * Upsert-by-actNumber rather than append, because re-generating an Act is a normal action
 * — appending would leave the superseded draft's facts in the ledger and suppress them in
 * every later Act for the rest of the video.
 *
 * Best-effort by design: a failure here costs the NEXT Act its continuity awareness, which
 * is a degradation, not a reason to fail an Act whose script and scenes were generated
 * successfully. Logged rather than surfaced, since the user cannot act on it beyond running
 * the migration, which the message says.
 */
export async function recordActContinuity(
  supabase: SupabaseClient,
  projectId: string,
  entry: ActContinuityEntry
): Promise<void> {
  const existing = await readActContinuity(supabase, projectId);
  const next = [
    ...existing.filter((prior) => prior.actNumber !== entry.actNumber),
    entry,
  ].sort((a, b) => a.actNumber - b.actNumber);

  const { error } = await supabase
    .from("video_projects")
    .update({ act_continuity: next })
    .eq("id", projectId);

  if (error) {
    console.warn(
      `[Continuity] Could not record Act ${entry.actNumber} for project ${projectId} ` +
        `(${error.message}). Later Acts may repeat what it covered. ` +
        `Run db/add-act-continuity.sql.`
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                  Generating a format from a written brief                  */
/* -------------------------------------------------------------------------- */

export interface GenerateFormatFromBriefResult {
  success: boolean;
  profile?: FormatProfile;
  gaps?: FormatAnalysisGap[];
  /**
   * Named sources the Fact Archivist found in the same brief, all unverified.
   *
   * Empty rather than absent when extraction fails: a brief that yields a good format but
   * no ledger is a usable outcome, and failing the whole call over the secondary agent
   * would throw away the analysis the user actually asked for.
   */
  facts?: FactCandidate[];
  /** Set when the format was built but fact extraction did not run. Not fatal. */
  factsError?: string;
  error?: string;
}

/**
 * Compiles a written channel brief into a full FormatProfile for the user to review.
 *
 * Deliberately does NOT save. The analyst infers a good deal — every inference is reported
 * back in `gaps` — and writing that straight to the workspace would make the review screen
 * decorative, which is precisely the failure mode this whole feature exists to fix. The
 * caller renders the result, the user corrects it, and `saveWorkspaceFormatProfile` persists
 * it with `presetKey: "custom"` and the whole profile as the override.
 *
 * `workspaceId` is taken but not read: it costs nothing now and means adding
 * workspace-specific context to the analysis later is not a signature change rippling
 * through the client component.
 */
export async function generateFormatFromBrief(
  workspaceId: string,
  source: string
): Promise<GenerateFormatFromBriefResult> {
  if (!workspaceId) return { success: false, error: "Missing workspaceId" };

  // Both agents read the SAME paste, so they run concurrently rather than in sequence —
  // neither needs the other's output, and the user is watching a spinner. They share the
  // provider quota, but `acquireCallSlot` is not involved here for the same reason the
  // analyst never used it: these are setup-time calls, one per channel, not the
  // per-scene fan-out that throttle exists to hold back.
  const [result, factsResult] = await Promise.all([
    analyzeChannelBrief(source),
    extractChannelFacts(source),
  ]);

  if (!result.success || !result.profile) {
    return { success: false, error: result.error || "Could not build a format from that text." };
  }

  // A failed extraction is reported, never fatal — see GenerateFormatFromBriefResult.facts.
  return {
    success: true,
    profile: result.profile,
    gaps: result.gaps ?? [],
    facts: factsResult.facts ?? [],
    factsError: factsResult.success ? undefined : factsResult.error,
  };
}
