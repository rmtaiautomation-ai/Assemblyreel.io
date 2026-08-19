/**
 * Rate-limited fan-out for the per-scene agents.
 *
 * Plan 03 specifies `Promise.all` for these, which is right in spirit but unbounded:
 * plan 07 targets 25-30 minute videos, which is 150-300 scenes fired at the provider
 * at once.
 *
 * The first version of this file capped concurrency at 6 and claimed free-tier quotas
 * "sit well below this". That was backwards, and a real run proved it — Gemini's free
 * tier allows **5 requests per minute total**, so 6 parallel calls exceeded the quota
 * before the first scene finished. In one 16-scene act, 9 scenes lost their visual pass
 * and all 16 skipped the safety pass. Worse, each failure was retried 3 times by the AI
 * SDK, burning yet more quota and pushing the retry window past 58 seconds.
 *
 * So the throttle is now a genuine rate limiter, not just a concurrency cap.
 */

/**
 * Minimum gap between the *start* of any two agent calls.
 *
 * 5 requests/minute is one every 12s; 13s leaves headroom for clock skew and for the
 * provider counting a request slightly before we do. Set
 * `AI_MIN_CALL_INTERVAL_MS=0` once on a paid tier to remove the throttle entirely.
 */
const DEFAULT_MIN_CALL_INTERVAL_MS = 13_000;

function getMinCallIntervalMs(): number {
  const configured = process.env.AI_MIN_CALL_INTERVAL_MS;
  if (configured === undefined) return DEFAULT_MIN_CALL_INTERVAL_MS;

  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_CALL_INTERVAL_MS;
}

/**
 * Timestamp of the next free slot, shared across every agent in the process.
 *
 * Module-level on purpose. The Visual Architect and the Safety Officer each call
 * `mapWithConcurrency` separately, so a per-call-site limiter would let the two of them
 * collide and blow the same quota they were each trying to respect.
 */
let nextAvailableSlotAt = 0;

/**
 * Reserves the next slot and waits for it.
 *
 * Reserving *before* awaiting is what makes this safe under concurrent callers: each
 * caller claims a distinct slot synchronously, so two calls can never be handed the
 * same one.
 *
 * Exported because the single-shot agents (Script Writer, Scene Slicer, Casting
 * Director) do not fan out and so never touch `mapWithConcurrency` — but they spend
 * from the very same provider quota. Leaving them ungated meant three unthrottled
 * calls at the head of every act, which is over half a free-tier minute's allowance
 * before the per-scene work even starts.
 */
export async function acquireCallSlot(): Promise<void> {
  const minIntervalMs = getMinCallIntervalMs();
  if (minIntervalMs <= 0) return;

  const now = Date.now();
  const slotAt = Math.max(now, nextAvailableSlotAt);
  nextAvailableSlotAt = slotAt + minIntervalMs;

  const waitMs = slotAt - now;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

/**
 * Runs an async mapper over items, throttled to the shared call rate.
 *
 * Results are returned in input order regardless of completion order.
 */
export async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;

      await acquireCallSlot();
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, worker));

  return results;
}

/**
 * How many scene-level agent calls may be in flight at once.
 *
 * Defaults to 1 because the rate limiter above, not parallelism, is what governs
 * throughput on a quota-limited tier — extra workers would only queue behind the same
 * gate. Now configurable so a paid tier can actually use its headroom: set
 * `AI_SCENE_CONCURRENCY` together with `AI_MIN_CALL_INTERVAL_MS=0`. Raising this alone
 * changes nothing, which is the whole point of the pairing.
 *
 * This matters most for the post-approval visual pass, which is ~2 calls per scene:
 * a 25-minute video is ~300 calls, i.e. over an hour at the free tier's 13s spacing.
 */
const DEFAULT_SCENE_AGENT_CONCURRENCY = 1;

function getSceneAgentConcurrency(): number {
  const configured = process.env.AI_SCENE_CONCURRENCY;
  if (configured === undefined) return DEFAULT_SCENE_AGENT_CONCURRENCY;

  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_SCENE_AGENT_CONCURRENCY;
}

export const SCENE_AGENT_CONCURRENCY = getSceneAgentConcurrency();

/**
 * Rough wall-clock estimate for a batch, so callers can warn the user before starting
 * rather than leaving them staring at a spinner of unknown length.
 */
export function estimateBatchDurationMs(callCount: number): number {
  return callCount * getMinCallIntervalMs();
}
