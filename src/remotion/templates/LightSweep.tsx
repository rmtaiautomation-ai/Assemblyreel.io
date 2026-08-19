import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeProgress } from './fadeProgress';
import { hexToRgbTriple } from './hexToRgbTriple';

interface LightSweepProps {
  /** Half-width of the band, as a percentage of frame width. */
  width?: number;
  intensity?: number;
  /** Seconds for one edge-to-edge pass. */
  cycleSeconds?: number;
  /** Gradient angle in degrees. 90 is perfectly vertical; ~100 gives a raking lean. */
  angle?: number;
  /** Sweep right-to-left instead of left-to-right. */
  reverse?: boolean;
  /** Band color as a hex — this kind's `clip.color`, which is not text color. */
  color?: string;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  durationInFrames: number;
}

/** Travel range in %, overshooting both edges so the band enters and leaves off-frame. */
const TRAVEL_FROM = -25;
const TRAVEL_TO = 125;

/**
 * A soft band of light raking across the frame — "light sweep" in editing
 * terms (After Effects ships it as CC Light Sweep; also called a shine sweep,
 * glint, or glare pass).
 *
 * Distinct from `LightBeam` in the thing that matters: a beam is anchored in
 * the scene and holds position while air drifts through it, whereas a sweep is
 * a highlight that CROSSES the whole frame edge to edge, as if the light
 * source or the surface were moving. Same screen-blend plumbing, opposite
 * motion, so they are separate components rather than one with a flag.
 *
 * The travelling-gradient-stop technique is the same one already proven in
 * `transitions/LightLeak.tsx`; the difference is that this repeats on its own
 * cycle as an overlay clip, rather than being driven by a transition's
 * one-shot progress.
 *
 * Deliberately rendered WITHOUT `OverlayFrame` in VideoComposition: it covers
 * the whole frame and positions itself along its own travel axis.
 */
export const LightSweep: React.FC<LightSweepProps> = ({
  // Narrow on purpose. The gradient spans +/-2x this, so even 5 covers a fifth
  // of the frame — anything near 12 stops reading as a travelling line and
  // becomes a broad wash sliding across the shot.
  width = 5,
  intensity = 0.5,
  cycleSeconds = 4,
  angle = 100,
  reverse = false,
  color,
  fadeInSeconds = 0.5,
  fadeOutSeconds = 0.5,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: frameWidth } = useVideoConfig();

  const t = frame / fps;
  const envelope = fadeProgress(frame, fps, fadeInSeconds, fadeOutSeconds, durationInFrames);
  const tint = hexToRgbTriple(color);

  // Position within the current pass, 0-1. Guarded against a zero/negative
  // cycle, which would otherwise divide by zero and blank the layer.
  const safeCycle = Math.max(0.1, cycleSeconds);
  const cyclePos = (t % safeCycle) / safeCycle;

  const progress = reverse ? 1 - cyclePos : cyclePos;
  const edge = TRAVEL_FROM + progress * (TRAVEL_TO - TRAVEL_FROM);

  // Brightest mid-pass, nothing at either end. Without this the band would pop
  // on and off at the frame edges each time the cycle wraps — the same reason
  // LightLeak ramps its flare rather than holding it flat.
  const passEnvelope = Math.sin(Math.PI * cyclePos);

  const a = Math.max(0, Math.min(1, intensity)) * envelope * passEnvelope;
  const w = Math.max(1, width);

  // Blur scales with resolution so a preview and a 4K render match in softness
  // rather than in pixel count.
  const pxPerUnit = frameWidth / 1920;

  return (
    <AbsoluteFill
      style={{
        background:
          `linear-gradient(${angle}deg,` +
          ` rgba(${tint},0) ${edge - w * 2}%,` +
          ` rgba(${tint},${a * 0.25}) ${edge - w}%,` +
          ` rgba(${tint},${a}) ${edge}%,` +
          ` rgba(${tint},${a * 0.25}) ${edge + w}%,` +
          ` rgba(${tint},0) ${edge + w * 2}%)`,
        mixBlendMode: 'screen',
        filter: `blur(${18 * pxPerUnit}px)`,
        pointerEvents: 'none',
      }}
    />
  );
};
