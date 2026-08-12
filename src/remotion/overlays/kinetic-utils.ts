import { interpolate } from 'remotion';

/**
 * Shared machinery for the kinetic-typography presets (CinematicReveal,
 * LetterCollapse, ChapterCard's headline).
 *
 * These presets all animate many small pieces — words or characters — on the
 * same offset ramp, which is the one thing they genuinely have in common. The
 * older presets (SlideIn/PopIn/Typewriter/LowerThird) animate one text block
 * and don't need any of this.
 */

/**
 * Splits on whitespace for per-word animation, dropping the empty strings a
 * naive `split(' ')` leaves behind on double spaces or a trailing space — each
 * one would otherwise render as an invisible word that still consumes a stagger
 * slot, so the visible words would drift out of time with the audio for no
 * visible reason.
 */
export const splitWords = (text: string): string[] =>
  text.split(/\s+/).filter((word) => word.length > 0);

/**
 * A 0→1 ramp for item `index` in a staggered sequence, clamped at both ends.
 *
 * Item 0 starts at frame 0; every subsequent item starts `staggerFrames` later
 * and takes `riseFrames` to complete. Clamped rather than extrapolated so an
 * item that hasn't started yet reads exactly 0 (fully hidden) and one that has
 * finished reads exactly 1 (fully settled) — an unclamped ramp would overshoot
 * into negative opacity and blur values, which render as visual garbage rather
 * than as an obviously wrong number.
 */
export const staggerProgress = (
  frame: number,
  index: number,
  staggerFrames: number,
  riseFrames: number
): number => {
  const start = index * staggerFrames;
  // Guard the degenerate zero-width range: interpolate() throws on it, and it's
  // reachable whenever a caller derives riseFrames from a very short duration.
  const end = start + Math.max(1, riseFrames);
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

/**
 * The shared exit fade every overlay preset ends with — 0.3s, so all eight feel
 * like one family rather than eight separately-tuned animations.
 *
 * Returns 1 for the whole clip until the exit window starts.
 */
export const exitOpacity = (
  frame: number,
  durationInFrames: number,
  fps: number,
  exitSeconds = 0.3
): number => {
  const exitStart = durationInFrames - Math.round(fps * exitSeconds);
  if (frame < exitStart) return 1;
  return interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
