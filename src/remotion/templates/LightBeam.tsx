import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeProgress } from './fadeProgress';
import { hexToRgbTriple } from './hexToRgbTriple';

interface LightBeamProps {
  /** Shaft centre as a percentage of frame width. */
  xPercent?: number;
  /** Half-width of the bright core, as a percentage of frame width. */
  width?: number;
  intensity?: number;
  /** Beam color as a hex — this kind's `clip.color`, which is not text color. */
  color?: string;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  durationInFrames: number;
}

/** Period of the streak gradient, in px. The drift wraps at twice this for a seamless loop. */
const STREAK_PERIOD = 11;

/**
 * A soft god-ray shaft — "light rays" in Resolve, Trapcode Shine in After
 * Effects. Screen-blended so it only ever adds light, never darkens: pair it
 * with a `DimScrim` clip underneath when the surrounding frame should fall off
 * as well.
 *
 * The motion is what makes it read as live rather than as a painted-on
 * gradient. Three oscillator pairs run at deliberately incommensurate
 * frequencies (0.23/0.41, 0.17/0.29, 0.31) so the composite never visibly
 * repeats within a normal clip length — a single sine is spotted as a loop
 * within about two cycles.
 *
 * Deliberately rendered WITHOUT `OverlayFrame` in VideoComposition. Unlike
 * `DimScrim` (which genuinely has no position), this kind DOES have one — it
 * just needs continuous animated positioning through its own gradient mask,
 * which the 9-slot placement grid cannot express.
 *
 * NOTE on blending: `mix-blend-mode` only composites against the backdrop
 * within its nearest stacking-context ancestor. `opacity`/`filter`/`transform`
 * on the elements *here* are fine (they blend correctly against the scene, the
 * same way `transitions/LightLeak.tsx` does), but adding any of those — or
 * `isolation` — to a wrapper ABOVE this clip in VideoComposition would
 * silently degrade the beam to blending against black.
 */
export const LightBeam: React.FC<LightBeamProps> = ({
  xPercent = 50,
  width = 14,
  intensity = 0.75,
  color,
  fadeInSeconds = 0.6,
  fadeOutSeconds = 0.6,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: frameWidth } = useVideoConfig();

  const t = frame / fps;
  const envelope = fadeProgress(frame, fps, fadeInSeconds, fadeOutSeconds, durationInFrames);
  const tint = hexToRgbTriple(color);

  // Drift: the shaft sways, as if the light source is shifting.
  const x = xPercent + Math.sin(t * 0.23) * 1.5 + Math.sin(t * 0.41) * 0.7;
  // Swell: intensity breathes, as if cloud cover is moving across the source.
  const swell = 0.82 + Math.sin(t * 0.17) * 0.12 + Math.sin(t * 0.29) * 0.06;
  // Waver: the shaft narrows and widens, out of phase with the drift.
  const w = Math.max(1, width * (1 + Math.sin(t * 0.31) * 0.08));

  const a = Math.max(0, Math.min(1, intensity)) * envelope * swell;

  // Bell-shaped column: peaks only at the centre line and falls away
  // continuously to nothing at 2x the half-width. Deliberately NOT a flat
  // opaque plateau between ±w — that renders as a rectangle with soft edges
  // (a slab of light) rather than as a shaft, because every pixel across the
  // core sits at the same brightness.
  // The 0.08 stops matter: ramping straight from 0 to 0.35 leaves a kink in
  // the alpha curve at the outermost stop, which the eye reads as a vertical
  // seam down the frame (Mach banding) even though the values either side are
  // nearly identical. The extra stop eases the curve into zero instead.
  const beamMask =
    `linear-gradient(90deg,` +
    ` rgba(0,0,0,0) ${x - w * 2.6}%,` +
    ` rgba(0,0,0,0.08) ${x - w * 1.7}%,` +
    ` rgba(0,0,0,0.35) ${x - w}%,` +
    ` rgba(0,0,0,0.85) ${x - w * 0.35}%,` +
    ` rgba(0,0,0,1) ${x}%,` +
    ` rgba(0,0,0,0.85) ${x + w * 0.35}%,` +
    ` rgba(0,0,0,0.35) ${x + w}%,` +
    ` rgba(0,0,0,0.08) ${x + w * 1.7}%,` +
    ` rgba(0,0,0,0) ${x + w * 2.6}%)`;

  // Blur scales with resolution so a 720p preview and a 4K render show the
  // same softness rather than the same pixel count.
  const pxPerUnit = frameWidth / 1920;

  // Twice the gradient period, so the translate wraps with no visible jump.
  // Slow: striations should shimmer, not visibly scroll.
  const streakDrift = (t * 6) % (STREAK_PERIOD * 2);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* The shaft itself: bright at the source, dissipating toward the floor.
          The falloff is steep on purpose — a shallow ramp keeps the lower half
          near full brightness, which is what makes a beam read as a lit
          rectangle rather than as light losing itself in the air. */}
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(180deg,` +
            ` rgba(${tint},${a}) 0%,` +
            ` rgba(${tint},${a * 0.55}) 28%,` +
            ` rgba(${tint},${a * 0.2}) 58%,` +
            ` rgba(${tint},0) 88%)`,
          WebkitMaskImage: beamMask,
          maskImage: beamMask,
          mixBlendMode: 'screen',
          filter: `blur(${40 * pxPerUnit}px)`,
        }}
      />

      {/* Volumetric texture: faint striations running ALONG the shaft, drifting
          sideways. This is the layer that reads as light moving through air
          rather than as a moving shape.

          The angle produces bands PERPENDICULAR to itself, so this must stay
          near 90deg (vertical bands, parallel to the beam). An angle near
          180deg gives horizontal bands across the shaft, which read as
          scanline corruption — verified in a still, not assumed. The 2deg
          offset from true vertical keeps them from looking machine-ruled. */}
      <AbsoluteFill
        style={{
          background:
            `repeating-linear-gradient(88deg,` +
            ` rgba(${tint},0) 0px,` +
            ` rgba(${tint},${a * 0.22}) 3px,` +
            ` rgba(${tint},0) ${STREAK_PERIOD}px)`,
          transform: `translateX(${streakDrift * pxPerUnit}px)`,
          WebkitMaskImage: beamMask,
          maskImage: beamMask,
          mixBlendMode: 'screen',
          filter: `blur(${6 * pxPerUnit}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
