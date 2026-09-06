import { interpolate, useVideoConfig } from 'remotion';
import { cardMetricsForStyle } from './card-registry';
import type { CardMetrics, CardStyleDefinition, MeasurableClip } from './card-registry';

export type { CardMetrics } from './card-registry';

/**
 * ── Shared measurements and timing for the graphic-card styles ───────────
 *
 * ── Why card geometry is frame-relative ──
 * The two original card designs were sized in absolute pixels (a 420px list,
 * a 400x500 title box). This app exports at three composition sizes, so the
 * same card was 39% of frame width at 1080 wide and 22% at 1920 — the design
 * silently changed meaning per format, and users corrected it by hand with the
 * scale slider every time. Every style added from here sizes as a FRACTION of
 * composition width, so one design reads correctly in all three.
 *
 * Width, not `min(width, height)`, is the basis: `xPercent` positioning and
 * `OverlayFrame`'s own `maxWidth` are already width-relative, so mixing bases
 * would make cards drift against their own placement.
 *
 * ── Why type size derives from card width ──
 * A designed template never exposes "card width" and "font size" as two knobs
 * that can disagree — its proportions are fixed and one control scales them.
 * So each style derives every type size from its own resolved card width, and
 * `clip.fontSize` acts as a MULTIPLIER against the style's natural size rather
 * than an absolute pixel value.
 *
 * That keeps the stored column an ordinary number (no migration, the existing
 * slider and the drag handle still write plain px) while making it behave
 * proportionally. It also keeps `measure()` a pure function of card width,
 * which is what lets the editor's drag box agree with the render — if type
 * size were an independent absolute, the two would desync at every
 * composition size but 1080.
 */

/** Reveal length, in seconds.
 *
 * Professional title/lower-third packs land their reveal in roughly 15-25
 * frames — about 0.6-1.0s. Slower than this reads as sluggish; faster reads as
 * a pop rather than a reveal. Every style here shares the value so the set
 * feels like one family rather than twelve unrelated animations. */
export const REVEAL_SECONDS = 0.7;

/** Gap between successive rows/lines in a staggered reveal, in seconds. */
export const STAGGER_SECONDS = 0.12;

/** How long a card takes to fade out at the end of its clip. */
export const CARD_EXIT_SECONDS = 0.35;

/**
 * Hook form of the registry's `cardMetricsForStyle`, for use inside a style
 * component. The arithmetic itself lives in `card-registry.ts` so the
 * `measure()` functions and the components share ONE implementation — two
 * copies is exactly how an editor drag box drifts away from the card it is
 * supposed to be tracking.
 */
export const useCardMetrics = (style: CardStyleDefinition, clip: MeasurableClip): CardMetrics => {
  const { width, height } = useVideoConfig();
  return cardMetricsForStyle(style, clip, { width, height });
};

/**
 * 0 → 1 over `REVEAL_SECONDS`, starting at `delaySeconds`.
 *
 * Deliberately eased rather than linear: a linear reveal reads mechanical at
 * this duration. Cubic-out decelerates into place, which is what every
 * broadcast template does.
 */
export const revealProgress = (
  frame: number,
  fps: number,
  delaySeconds = 0,
  durationSeconds = REVEAL_SECONDS
): number => {
  const start = delaySeconds * fps;
  const end = start + Math.max(1, durationSeconds * fps);
  const linear = interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return 1 - Math.pow(1 - linear, 3);
};

/**
 * Staggered reveal for row `index`, so lists cascade rather than appearing at
 * once. Shares `REVEAL_SECONDS` with everything else.
 */
export const rowProgress = (
  frame: number,
  fps: number,
  index: number,
  delaySeconds = 0,
  staggerSeconds = STAGGER_SECONDS
): number => revealProgress(frame, fps, delaySeconds + index * staggerSeconds);

/**
 * Fade applied to a whole card as its clip ends.
 *
 * Every style multiplies its root opacity by this. `TitleCutoutCard`
 * historically had no exit at all and simply cut, while `ChecklistCard` faded —
 * having one shared envelope is what makes the twelve read as a single family.
 */
export const cardExitOpacity = (
  frame: number,
  durationInFrames: number,
  fps: number,
  exitSeconds = CARD_EXIT_SECONDS
): number => {
  const exitFrames = Math.round(fps * exitSeconds);
  const start = durationInFrames - exitFrames;
  // A clip shorter than the exit itself has nowhere to fade; hold it visible
  // rather than starting the video already part-way faded out.
  if (start <= 0) return 1;
  if (frame < start) return 1;
  return interpolate(frame, [start, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
