"use server";

import { createClient } from "@/lib/supabase/server";
import { isFactKind, type ChannelFact, type FactKind } from "@/lib/ai/channel-facts";
import type { FactCandidate } from "@/lib/ai/agents/fact-archivist";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const MIGRATION_HINT =
  "Run db/add-channel-facts.sql in the Supabase SQL editor to enable this channel's source list.";

/**
 * Server actions for the Channel Fact Ledger.
 * (implementation_plans/22-channel-fact-ledger.md)
 *
 * Separate from `format-actions.ts` even though the two are read together during
 * generation: that file is already the largest actions module here, and the split follows
 * the boundary the data actually has — a blueprint is one jsonb column on the workspace row
 * edited as a whole, while the ledger is a table of rows edited one at a time. Only
 * `generateFormatFromBrief` spans both, because one paste feeds both agents.
 */

/* -------------------------------------------------------------------------- */
/*                                   Rows                                     */
/* -------------------------------------------------------------------------- */

interface ChannelFactRow {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  always_use: boolean;
  verified: boolean;
  source_note: string | null;
}

/**
 * Rows arrive from PostgREST with `kind` as a plain string. The column has a CHECK
 * constraint so an invalid value cannot be stored, but narrowing here rather than casting
 * means a row written by some future path that bypasses it degrades to a usable kind
 * instead of producing a `FactKind` the prompt compiler cannot group.
 */
function toChannelFact(row: ChannelFactRow): ChannelFact {
  return {
    id: row.id,
    kind: (isFactKind(row.kind) ? row.kind : "event") as FactKind,
    label: row.label,
    detail: row.detail ?? "",
    alwaysUse: row.always_use,
    verified: row.verified,
    sourceNote: row.source_note ?? "",
  };
}

const FACT_COLUMNS = "id, kind, label, detail, always_use, verified, source_note";

/* -------------------------------------------------------------------------- */
/*                        Workspace read — the live ledger                    */
/* -------------------------------------------------------------------------- */

export interface GetChannelFactsResult {
  success: boolean;
  facts?: ChannelFact[];
  /** True when db/add-channel-facts.sql has not been run for this database yet. */
  migrationPending?: boolean;
  error?: string;
}

/**
 * Every fact for a workspace, verified or not — the settings table's read.
 *
 * Degrades to an empty ledger rather than an error when the table does not exist, matching
 * `readWorkspaceFormatColumns` in format-actions.ts: a database that has not run the
 * migration must keep generating exactly as it did before, with the settings tab explaining
 * why rather than the page failing.
 */
export async function getChannelFacts(workspaceId: string): Promise<GetChannelFactsResult> {
  if (!workspaceId) return { success: false, error: "Missing workspaceId" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_facts")
    .select(FACT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("always_use", { ascending: false })
    .order("kind", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return { success: true, facts: [], migrationPending: true, error: MIGRATION_HINT };
  }

  return { success: true, facts: (data as ChannelFactRow[]).map(toChannelFact) };
}

/* -------------------------------------------------------------------------- */
/*                              Workspace writes                              */
/* -------------------------------------------------------------------------- */

export interface MutateFactsResult {
  success: boolean;
  facts?: ChannelFact[];
  error?: string;
}

/**
 * Appends extracted candidates to a workspace's ledger.
 *
 * Every row is written `verified: false` HERE rather than trusting the caller to pass it.
 * The archivist's `checkable` hint is stored into `source_note` instead of into `verified`
 * on purpose — the whole value of the gate is that a human, not a model, decided each
 * fact was real, and a path that could set it any other way would erode that quietly.
 *
 * Appends rather than replaces: a channel accrues sources across several pastes, and a
 * second brief must not silently delete facts the user has already verified.
 */
export async function addExtractedFacts(
  workspaceId: string,
  candidates: FactCandidate[]
): Promise<MutateFactsResult> {
  if (!workspaceId) return { success: false, error: "Missing workspaceId" };
  if (!candidates.length) return { success: true, facts: [] };

  const supabase = await createClient();

  // Skip anything already on the ledger under the same label — re-running the analyst on a
  // revised brief is a normal thing to do, and it should not produce forty duplicates.
  const existing = await getChannelFacts(workspaceId);
  if (existing.migrationPending) {
    return { success: false, error: MIGRATION_HINT };
  }
  const seen = new Set((existing.facts ?? []).map((fact) => fact.label.trim().toLowerCase()));

  const rows = candidates
    .filter((candidate) => candidate.label.trim() && !seen.has(candidate.label.trim().toLowerCase()))
    .map((candidate) => ({
      workspace_id: workspaceId,
      kind: isFactKind(candidate.kind) ? candidate.kind : "event",
      label: candidate.label.trim(),
      detail: candidate.detail.trim(),
      always_use: candidate.alwaysUse,
      verified: false,
      source_note: candidate.checkable
        ? candidate.sourceNote.trim()
        : // Prefixed rather than stored in a column of its own: it is a one-off warning for
          // whoever verifies, not a property the pipeline ever reads, and a schema column
          // would imply the distinction survives verification. It does not — once a human
          // ticks the box, the fact is simply trusted.
          `NOT INDEPENDENTLY CHECKABLE — ${candidate.sourceNote.trim() || "the brief gives no way to confirm this exists."}`,
    }));

  if (!rows.length) return { success: true, facts: existing.facts ?? [] };

  const { error } = await supabase.from("channel_facts").insert(rows);
  if (error) return { success: false, error: error.message };

  const refreshed = await getChannelFacts(workspaceId);
  return { success: true, facts: refreshed.facts ?? [] };
}

export async function upsertChannelFact(
  workspaceId: string,
  fact: Partial<ChannelFact> & { id?: string }
): Promise<MutateFactsResult> {
  if (!workspaceId) return { success: false, error: "Missing workspaceId" };
  if (!fact.label?.trim()) return { success: false, error: "A fact needs a name." };

  const supabase = await createClient();

  const payload = {
    kind: fact.kind && isFactKind(fact.kind) ? fact.kind : "event",
    label: fact.label.trim(),
    detail: (fact.detail ?? "").trim(),
    always_use: fact.alwaysUse ?? false,
    verified: fact.verified ?? false,
    source_note: (fact.sourceNote ?? "").trim(),
  };

  const { error } = fact.id
    ? await supabase
        .from("channel_facts")
        .update(payload)
        .eq("id", fact.id)
        .eq("workspace_id", workspaceId)
    : await supabase.from("channel_facts").insert({ ...payload, workspace_id: workspaceId });

  if (error) return { success: false, error: `${error.message}. ${MIGRATION_HINT}` };

  const refreshed = await getChannelFacts(workspaceId);
  return { success: true, facts: refreshed.facts ?? [] };
}

export async function deleteChannelFact(
  workspaceId: string,
  factId: string
): Promise<MutateFactsResult> {
  if (!workspaceId || !factId) return { success: false, error: "Missing workspaceId or factId" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_facts")
    .delete()
    .eq("id", factId)
    .eq("workspace_id", workspaceId);

  if (error) return { success: false, error: error.message };

  const refreshed = await getChannelFacts(workspaceId);
  return { success: true, facts: refreshed.facts ?? [] };
}

/**
 * Bulk verify/unverify — the settings table's "tick everything checkable" affordance.
 *
 * Verifying forty rows one round trip at a time is the difference between the gate being
 * used and the gate being skipped, and a gate nobody uses protects nothing.
 */
export async function setFactsVerified(
  workspaceId: string,
  factIds: string[],
  verified: boolean
): Promise<MutateFactsResult> {
  if (!workspaceId) return { success: false, error: "Missing workspaceId" };
  if (!factIds.length) return { success: true, facts: [] };

  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_facts")
    .update({ verified })
    .in("id", factIds)
    .eq("workspace_id", workspaceId);

  if (error) return { success: false, error: error.message };

  const refreshed = await getChannelFacts(workspaceId);
  return { success: true, facts: refreshed.facts ?? [] };
}

/* -------------------------------------------------------------------------- */
/*              Project read — the FROZEN ledger generation must use           */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the fact ledger a project's generation calls must use.
 *
 * The direct counterpart of `resolveProjectFormatProfile`, and it exists for the same
 * reason: long-form generates Act by Act behind a human approval gate, so a ledger read
 * live would let a fact ticked — or unticked — after Act 3 was approved silently change
 * what Act 7 is permitted to say. A finished video must also be able to answer "what was I
 * allowed to cite" long after the channel's ledger has moved on.
 *
 * Writes the snapshot on first use rather than at project creation, the same self-healing
 * shape `castProjectCharactersOnce` uses: the column IS the flag, so a project created
 * before this feature existed, or before the migration ran, picks up a ledger the first
 * time an Act is generated instead of being permanently excluded.
 *
 * Returns `[]`, never throws, whenever a ledger cannot be resolved. An empty array is not
 * an error for the caller — `buildScriptWriterSystemInstruction` emits no NAMED SOURCES
 * block at all for one, which is precisely the pre-ledger behaviour.
 */
export async function resolveProjectFactLedger(
  supabase: SupabaseClient,
  projectId: string
): Promise<ChannelFact[]> {
  const { data: project, error: projectError } = await supabase
    .from("video_projects")
    .select("workspace_id, channel_facts_snapshot")
    .eq("id", projectId)
    .single();

  // Either the project is gone or db/add-channel-facts.sql has not run — PostgREST fails
  // the whole select on an unknown column, so this one error covers both.
  if (projectError || !project) return [];

  const snapshot = project.channel_facts_snapshot as ChannelFact[] | null;
  if (snapshot) return snapshot;

  if (!project.workspace_id) return [];

  const { data, error } = await supabase
    .from("channel_facts")
    .select(FACT_COLUMNS)
    .eq("workspace_id", project.workspace_id)
    .eq("verified", true);

  if (error) return [];

  const facts = (data as ChannelFactRow[]).map(toChannelFact);

  // Freeze even an empty result. `null` means "never resolved" and would send every later
  // Act back to the live table; `[]` means "resolved, and this channel had nothing ticked",
  // which must stay true for the rest of the video however the ledger changes meanwhile.
  const { error: writeError } = await supabase
    .from("video_projects")
    .update({ channel_facts_snapshot: facts })
    .eq("id", projectId);

  if (writeError) {
    console.warn(
      `[Fact Ledger] Could not freeze the ledger onto project ${projectId}: ${writeError.message}`
    );
  }

  return facts;
}
