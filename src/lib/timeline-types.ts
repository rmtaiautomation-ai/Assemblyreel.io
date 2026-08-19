/**
 * Shared timeline/track and project-status types.
 *
 * These live outside the editor component so the server actions that persist them
 * (`updateProjectTrackStates`, `updateProjectStatus`) and the UI that reads them
 * agree on one shape. Previously `trackStates` was inferred from `initialProject`
 * (typed `any`), which silently widened the whole state to `any` and broke the
 * build via four implicitly-typed `setTrackStates(prev => ...)` callbacks.
 */

export type TrackId = 'V1' | 'A1' | 'A2';

export const TRACK_IDS: TrackId[] = ['V1', 'A1', 'A2'];

export interface TrackState {
  locked: boolean;
  muted: boolean;
  volume: number;
}

export type TrackStates = Record<TrackId, TrackState>;

export const DEFAULT_TRACK_STATES: TrackStates = {
  V1: { locked: false, muted: false, volume: 1.0 },
  A1: { locked: false, muted: false, volume: 1.0 },
  A2: { locked: false, muted: false, volume: 1.0 },
};

/**
 * `track_states` arrives as untyped JSONB and may be absent entirely (if
 * add-track-states-column.sql hasn't been run yet) or predate the current shape.
 * Normalise per-key rather than trusting the blob: a single malformed entry would
 * otherwise leave e.g. `trackStates.A1.volume` undefined, and the playback sync
 * effect assigns that straight onto `media.volume`, which throws.
 */
export function parseTrackStates(raw: unknown): TrackStates {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TRACK_STATES };

  const source = raw as Record<string, unknown>;
  const out = {} as TrackStates;

  for (const id of TRACK_IDS) {
    const fallback = DEFAULT_TRACK_STATES[id];
    const entry = source[id];

    if (!entry || typeof entry !== 'object') {
      out[id] = { ...fallback };
      continue;
    }

    const e = entry as Record<string, unknown>;
    out[id] = {
      locked: typeof e.locked === 'boolean' ? e.locked : fallback.locked,
      muted: typeof e.muted === 'boolean' ? e.muted : fallback.muted,
      volume:
        typeof e.volume === 'number' && Number.isFinite(e.volume)
          ? Math.min(1, Math.max(0, e.volume))
          : fallback.volume,
    };
  }

  return out;
}

/**
 * Project lifecycle. `pending` is written at creation before the script exists;
 * `drafting` once it does; `rendering`/`exported`/`failed` are driven by the
 * render pipeline. `failed` matters: without it a render that errors leaves the
 * row stuck on `rendering` forever, with no way back from the UI.
 *
 * `scripted`, `narrated` and `approved` split what used to be a single `drafting`
 * state, because long-form is generated in phases: write, then per-Act hear-and-see,
 * interleaved in whatever order the user chooses.
 *
 * `scripted` means every Act's script exists and characters have been cast ONCE for
 * the whole project (`castProjectCharactersOnce`) — but no Act has audio or visuals
 * yet. This is where the Whiteboard hands off to the Timeline Editor, which drives
 * per-Act narration and visual approval from here. Unlike `narrated`/`approved`, this
 * one is NOT a whole-project completion marker: individual Acts progress through audio
 * and visuals independently after this, tracked on `act_narrations` rows and each
 * scene's `final_video_prompt`/`environment`, not on this single project-level field.
 * `approved` IS still meaningful as a completion marker — it is set once every Act's
 * visuals are done, however many separate approvals that took.
 *
 * `narrated` is short/mid-form only now: single-pass projects still narrate the whole
 * project in one action and land here before their (also inline, whole-project)
 * visual pass. Long-form does not pass through this status at all — it goes straight
 * from `scripted` to `approved` once every Act has been individually approved.
 *
 * Projects created straight from the dashboard form (short/mid-form only) still run
 * their visual pass inline and never enter `scripted` or `narrated`.
 */
export const PROJECT_STATUSES = [
  'pending',
  'drafting',
  'scripted',
  'narrated',
  'approved',
  'rendering',
  'exported',
  'failed',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Coerces whatever is in the DB into the current vocabulary.
 *
 * Needed because migrate-project-status.sql is run by hand, so rows may still hold
 * the pre-rename `completed` or the capitalised `Drafting` that database_setup.sql
 * declares as the column default. Anything unrecognised reads as a draft, which is
 * the safe direction — it never claims work is finished when it isn't.
 */
export function normalizeProjectStatus(raw: unknown): ProjectStatus {
  if (typeof raw !== 'string') return 'drafting';
  const value = raw.toLowerCase();
  if (value === 'completed') return 'exported'; // legacy, pre-rename
  return (PROJECT_STATUSES as readonly string[]).includes(value)
    ? (value as ProjectStatus)
    : 'drafting';
}
