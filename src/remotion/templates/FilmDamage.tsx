import React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeProgress } from './fadeProgress';
import { hexToRgbTriple } from './hexToRgbTriple';

interface FilmDamageProps {
  grainAmount?: number;
  grainScale?: number;
  scratchCount?: number;
  scratchIntensity?: number;
  /** Scratch color as a hex — this kind's `clip.color`, which is not text color. */
  color?: string;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  durationInFrames: number;
}

/**
 * Fraction of frame size the noise is generated at before being scaled back up.
 * Full-frame `feTurbulence` every frame is the render-cost hotspot of this
 * component; at 0.5 it costs a quarter of the pixels. Upscaling also makes the
 * grain chunkier, which is what we want — pixel-level noise reads as a digital
 * sensor, film grain has visible size.
 */
const GRAIN_RESOLUTION = 0.5;
/**
 * Re-roll the noise every N frames rather than every frame. Cheaper, and more
 * accurate: film grain is perceived on twos, and fresh noise at 30fps reads as
 * video static.
 */
const GRAIN_STEP = 2;
/** Length of the noise cycle in steps. Long enough that the loop is not visible. */
const GRAIN_SEEDS = 24;

/**
 * Old-film print damage: drifting vertical scratch hairlines plus emulsion
 * grain. The "old film overlay" of stock-footage packs, generated procedurally
 * rather than bought as an After Effects template — no asset weight, no
 * licensing, and every parameter stays live in the editor.
 *
 * Scope is damage only. The rest of that look — gate mask, vignette, faded
 * print grade, exposure flicker — is deliberately not here; the footage stays
 * full-bleed and normally graded and we add wear on top of it.
 *
 * IMPORTANT — two things about this component are load-bearing:
 *
 * 1. The grain and scratch layers must stay SIBLINGS with their own
 *    `mixBlendMode`, and nothing above them may set `opacity`, `filter`,
 *    `transform` or `isolation`. Any of those on a shared wrapper creates a
 *    stacking context, and the layers would blend against each other on black
 *    instead of against the footage. That is why the clip fade envelope is
 *    folded into each layer's own alpha maths rather than applied once to the
 *    wrapper, which would be the obvious way to write it and would break both.
 * 2. Every value is a pure function of `frame` plus stable seeds, via
 *    Remotion's `random()` and never `Math.random()` — frames render across
 *    parallel workers, and per-worker rolls would strobe. Same requirement
 *    spelled out in `ParticleField`.
 *
 * Deliberately rendered WITHOUT `OverlayFrame` in VideoComposition, and ranked
 * ABOVE text by `zRank` — unlike every other environmental kind. Print damage
 * is on the film, so burned-in captions get scratched too.
 */
export const FilmDamage: React.FC<FilmDamageProps> = ({
  grainAmount = 0.35,
  grainScale = 0.8,
  scratchCount = 4,
  scratchIntensity = 0.5,
  color,
  fadeInSeconds = 0.4,
  fadeOutSeconds = 0.4,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const t = frame / fps;
  const envelope = fadeProgress(frame, fps, fadeInSeconds, fadeOutSeconds, durationInFrames);

  // Scratches only. Grain stays neutral monochrome regardless of `color`:
  // tinting the noise would be a colour grade, which this kind does not do.
  const tint = hexToRgbTriple(color, '255,255,255');

  // Sized off frame width rather than in pixel constants, so a 720p preview
  // and a 4K render show proportionally identical damage.
  const pxPerUnit = width / 1920;

  // Unique per instance so two overlapping film-damage clips don't collide on
  // the same SVG filter id. Sanitised because React's ids contain colons,
  // which are not safe inside a `url(#…)` reference.
  const rawId = React.useId();
  const filterId = `film-grain-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const grainAlpha = Math.max(0, Math.min(1, grainAmount)) * envelope;
  const safeScratchCount = Math.max(0, Math.min(40, Math.round(scratchCount)));

  // Noise is generated small and scaled back up. Exact per-axis scale rather
  // than 1/GRAIN_RESOLUTION so rounding can't leave an unpainted edge strip.
  const grainWidth = Math.max(1, Math.round(width * GRAIN_RESOLUTION));
  const grainHeight = Math.max(1, Math.round(height * GRAIN_RESOLUTION));

  const baseFrequency = Math.max(0.05, Math.min(2, grainScale)) * 0.9;
  const seed = Math.floor(frame / GRAIN_STEP) % GRAIN_SEEDS;

  const scratches = React.useMemo(
    () =>
      Array.from({ length: safeScratchCount }, (_, i) => ({
        // Lifetimes are seeded per slot and deliberately share no common
        // period, so the set never re-rolls in unison — which would read as
        // the whole frame blinking rather than as independent damage.
        life: 0.35 + random(`scr-life-${i}`) * 1.15,
      })),
    [safeScratchCount]
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {safeScratchCount > 0 && scratchIntensity > 0 && (
        <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
          {scratches.map((s, i) => {
            const cycle = Math.floor(t / s.life);
            const phase = (t % s.life) / s.life;

            // A scratch is present for only part of its cycle, so the frame
            // is not permanently full of them — real damage comes and goes.
            const duty = 0.25 + random(`scr-duty-${i}-${cycle}`) * 0.55;
            if (phase > duty) return null;

            // Ramps hard and holds, rather than a slow sine in and out.
            // Scratches pop onto the print; fading them reads as a soft
            // graphic effect instead of physical damage.
            const life = Math.min(1, Math.sin(Math.PI * (phase / duty)) * 3);

            const x = random(`scr-x-${i}-${cycle}`) * 100;
            // Most real scratches don't span the full gate height.
            const spanY = 35 + random(`scr-h-${i}-${cycle}`) * 65;
            const topY = random(`scr-y-${i}-${cycle}`) * (100 - spanY);
            const bright = 0.45 + random(`scr-b-${i}-${cycle}`) * 0.55;
            const lineWidth = (0.8 + random(`scr-w-${i}-${cycle}`) * 1.4) * pxPerUnit;

            // Per-frame horizontal jitter — the unsteadiness of film running
            // through a gate. Seeded on `frame`, so still deterministic.
            const jitter = (random(`scr-j-${i}-${frame}`) - 0.5) * 0.3;

            const a = Math.max(0, Math.min(1, scratchIntensity)) * bright * life * envelope;

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x + jitter}%`,
                  top: `${topY}%`,
                  width: lineWidth,
                  height: `${spanY}%`,
                  // Tapered at both ends so a scratch doesn't terminate on a
                  // hard horizontal edge, which reads as a drawn rectangle.
                  background:
                    `linear-gradient(180deg,` +
                    ` rgba(${tint},0) 0%,` +
                    ` rgba(${tint},${a}) 12%,` +
                    ` rgba(${tint},${a}) 88%,` +
                    ` rgba(${tint},0) 100%)`,
                  filter: `blur(${0.6 * pxPerUnit}px)`,
                }}
              />
            );
          })}
        </AbsoluteFill>
      )}

      {grainAlpha > 0 && (
        <svg
          width={grainWidth}
          height={grainHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            // Overlay, not screen. Grain has to darken as well as lighten
            // around a mid-grey pivot — screen-blended noise only ever adds
            // light, which washes the shot into haze instead of texturing it.
            mixBlendMode: 'overlay',
            transform: `scaleX(${width / grainWidth}) scaleY(${height / grainHeight})`,
            transformOrigin: 'top left',
          }}
        >
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            // Filters default to linearRGB, which shifts the noise off the
            // 0.5 grey that `overlay` pivots around.
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={baseFrequency}
              numOctaves={1}
              seed={seed}
            />
            {/*
              Collapse to luminance and force a constant alpha in one pass.
              Raw turbulence is coloured noise with a noisy alpha; left as-is
              it reads as chroma static rather than emulsion grain.
            */}
            <feColorMatrix
              type="matrix"
              values={
                `0.33 0.33 0.33 0 0 ` +
                `0.33 0.33 0.33 0 0 ` +
                `0.33 0.33 0.33 0 0 ` +
                `0 0 0 0 ${grainAlpha}`
              }
            />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${filterId})`} />
        </svg>
      )}
    </AbsoluteFill>
  );
};
