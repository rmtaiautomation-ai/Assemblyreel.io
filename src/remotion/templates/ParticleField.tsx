import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeProgress } from './fadeProgress';
import { hexToRgbTriple } from './hexToRgbTriple';

interface ParticleFieldProps {
  count?: number;
  /** Mote color as a hex — this kind's `clip.color`, which is not text color. */
  color?: string;
  speed?: number;
  sizeScale?: number;
  /** 0-100 horizontal cluster centre. Undefined = spread evenly. */
  xBias?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  durationInFrames: number;
}

/** Above this diameter (px at 1080p-equivalent) a mote is treated as "near the lens": soft and dim. */
const DOF_THRESHOLD = 6;
/** Vertical travel range in %, wider than the frame so motes enter/leave off-screen. */
const TRAVEL = 120;

/**
 * A field of drifting motes — "dust particles" / "bokeh overlay" in
 * stock-footage terms. Screen-blended, so the transparent background
 * contributes nothing and only the motes light the frame.
 *
 * Generated procedurally rather than shipped as a stock video: no asset
 * weight, no licensing, and every parameter stays adjustable from the editor.
 *
 * IMPORTANT: every per-particle value comes from Remotion's `random(seed)`,
 * never `Math.random()`. Remotion renders frames across parallel workers, so
 * `Math.random()` would roll different values per frame and per worker — the
 * field would strobe as noise instead of drifting as a field. Everything here
 * must stay a pure function of `frame` plus stable seeds.
 *
 * Deliberately rendered WITHOUT `OverlayFrame` in VideoComposition: this is a
 * full-frame atmospheric layer, not content placed at a position.
 */
export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 45,
  color,
  speed = 1,
  sizeScale = 1,
  xBias,
  fadeInSeconds = 0.8,
  fadeOutSeconds = 0.8,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const t = frame / fps;
  const envelope = fadeProgress(frame, fps, fadeInSeconds, fadeOutSeconds, durationInFrames);
  const tint = hexToRgbTriple(color);

  // Sizes are derived from frame width rather than being pixel constants, so a
  // 720p preview and a 4K render show proportionally identical motes.
  const pxPerUnit = width / 1920;

  const safeCount = Math.max(1, Math.min(400, Math.round(count)));

  const particles = React.useMemo(
    () =>
      Array.from({ length: safeCount }, (_, i) => {
        const spread = random(`px-${i}`) * 100;
        return {
          // With a bias set, particles pull toward that column but keep some
          // scatter — a hard cluster reads as a shape rather than as air.
          x: xBias === undefined ? spread : xBias + (spread - 50) * 0.55,
          yStart: random(`py-${i}`) * TRAVEL,
          // Squared so the field is mostly small motes with a few large ones.
          // A uniform draw gives every particle a similar size, which reads as
          // a scatter of dots rather than as depth.
          size: (1.5 + random(`ps-${i}`) ** 2 * 9) * sizeScale,
          drift: 3 + random(`pv-${i}`) * 7,
          sway: 1 + random(`pw-${i}`) * 3,
          phase: random(`pp-${i}`) * Math.PI * 2,
        };
      }),
    [safeCount, sizeScale, xBias]
  );

  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
      {particles.map((p, i) => {
        // Modulo wrap, normalised positive so the field is seamless in both
        // directions regardless of how far `t` has run.
        const travelled = p.yStart - t * p.drift * speed;
        const y = ((travelled % TRAVEL) + TRAVEL) % TRAVEL;

        const x = p.x + Math.sin(t * 0.4 + p.phase) * p.sway;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.phase * 2));

        // Depth of field is what sells this. Large motes are near the lens:
        // out of focus and dim. Small ones are far: crisp and bright. Without
        // this the result reads as a screensaver, not as air.
        const isNear = p.size > DOF_THRESHOLD;
        const diameter = p.size * pxPerUnit;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              // TRAVEL exceeds 100 so motes cross the full frame and wrap
              // off-screen rather than popping in at the edges.
              top: `${y - 10}%`,
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              backgroundColor: `rgba(${tint},1)`,
              opacity: envelope * twinkle * (isNear ? 0.35 : 0.9),
              filter: isNear ? `blur(${diameter * 0.4}px)` : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
