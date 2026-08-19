import { interpolate } from 'remotion';

/**
 * Fade-in/hold/fade-out envelope for a full-frame overlay-clip layer, as a
 * 0-1 multiplier. Shared by every environmental kind on the OV track
 * (`DimScrim`, `ParticleField`, `LightBeam`) so the clamping rules below are
 * defined once rather than re-derived per component.
 *
 * The clamping is the whole reason this is a shared function: a clip can be
 * shorter than its own fades, or have fades that overlap each other, and
 * either case would otherwise produce a zero-width (or inverted) interpolate()
 * range. `fadeOutStart` is pinned to stay at/after `fadeInFrames` and strictly
 * inside the clip.
 */
export const fadeProgress = (
  frame: number,
  fps: number,
  fadeInSeconds: number,
  fadeOutSeconds: number,
  durationInFrames: number
): number => {
  const fadeInFrames = Math.max(1, Math.round(fps * Math.max(0, fadeInSeconds)));
  const fadeOutFrames = Math.max(1, Math.round(fps * Math.max(0, fadeOutSeconds)));
  const fadeOutStart = Math.min(
    durationInFrames - 1,
    Math.max(fadeInFrames, durationInFrames - fadeOutFrames)
  );

  // Below fadeInFrames: ramping in. At/above it: the second call governs —
  // its extrapolateLeft:'clamp' holds at 1 for the whole "hold" period
  // between the two fades, then ramps out from fadeOutStart.
  return frame < fadeInFrames
    ? interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
};
