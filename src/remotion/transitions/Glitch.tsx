import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type { TransitionEffectProps } from './SceneTransition';

// feColorMatrix rows: R G B A, each with an offset column. These isolate one channel
// and keep alpha, so the three results can be screen-blended back together.
const RED_ONLY = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const GREEN_ONLY = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const BLUE_ONLY = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

/** Maximum channel separation, in px, at peak intensity. */
const MAX_CHANNEL_SHIFT = 26;

/**
 * RGB channel split with scanline tearing.
 *
 * The split is done by an SVG filter over a SINGLE copy of the scene, not by stacking
 * three screen-blended copies of `children`. Three copies would mean three
 * `<OffthreadVideo>` frame extractions per rendered frame, which is the difference
 * between a fast headless render and a slow one.
 *
 * All "randomness" is a pure function of `progress`. Remotion renders frames
 * independently and may re-render the same frame, so `Math.random()` here would
 * strobe in the preview and not match the export.
 */
export const Glitch: React.FC<TransitionEffectProps> = ({ progress, domId, children }) => {
  // Peaks mid-transition and dies at both ends, so the cut SNAPS. A glitch that eases
  // in reads as a rendering fault rather than a deliberate effect.
  const intensity = Math.sin(Math.PI * progress);
  const shift = MAX_CHANNEL_SHIFT * intensity;
  const filterId = `${domId}-rgbsplit`;

  // Snap in early rather than fading — a glitch cut should be abrupt.
  const opacity = interpolate(progress, [0, 0.28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const tearBands = [0.17, 0.43, 0.71, 0.88].map((seed, i) => ({
    top: `${(seed * 100 + Math.sin(progress * 31 + i * 2.1) * 9) % 100}%`,
    height: `${1.5 + (i % 2) * 3}%`,
    offsetX: Math.sin(progress * 47 + i * 1.7) * 5 * intensity,
    alpha: 0.1 + 0.18 * intensity,
  }));

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* The filter defs must exist in the document. Zero-sized so it stays out of
          layout. The id is scene-scoped because two scenes are mounted at once during
          a transition, and a shared id would let one steal the other's filter. */}
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter
            id={filterId}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix in="SourceGraphic" type="matrix" values={RED_ONLY} result="R" />
            <feOffset in="R" dx={-shift} dy={0} result="Rshifted" />
            <feColorMatrix in="SourceGraphic" type="matrix" values={GREEN_ONLY} result="G" />
            <feColorMatrix in="SourceGraphic" type="matrix" values={BLUE_ONLY} result="B" />
            <feOffset in="B" dx={shift} dy={0} result="Bshifted" />
            <feBlend in="Rshifted" in2="G" mode="screen" result="RG" />
            <feBlend in="RG" in2="Bshifted" mode="screen" />
          </filter>
        </defs>
      </svg>

      <AbsoluteFill style={{ filter: `url(#${filterId})` }}>{children}</AbsoluteFill>

      {tearBands.map((band, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: band.top,
            height: band.height,
            transform: `translateX(${band.offsetX}%)`,
            background: `rgba(255,255,255,${band.alpha})`,
            mixBlendMode: 'overlay',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
