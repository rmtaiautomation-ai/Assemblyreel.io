import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import type { TransitionEffectProps } from './SceneTransition';

/** Half-width of the mask's soft edge, in percent of the frame. */
const FEATHER = 18;

/**
 * A warm flare sweeps across the frame, revealing the incoming scene behind it.
 *
 * IMPORTANT: do not add `opacity`, `isolation`, `filter` or `transform` to the OUTER
 * AbsoluteFill. Each of those creates a stacking context, and `mix-blend-mode: screen`
 * only blends within its nearest stacking-context ancestor. Neither Remotion's
 * `AbsoluteFill` nor `Sequence` creates one, which is exactly why the flare currently
 * blends over the OUTGOING scene as well — that spill is what sells the effect. One
 * stray property here silently degrades it to blending against the incoming scene only.
 */
export const LightLeak: React.FC<TransitionEffectProps> = ({ progress, children }) => {
  const edge = interpolate(progress, [0, 1], [-20, 120], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const revealMask = `linear-gradient(100deg, black ${edge - FEATHER}%, transparent ${edge + FEATHER}%)`;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ WebkitMaskImage: revealMask, maskImage: revealMask }}>
        {children}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `linear-gradient(100deg, transparent ${edge - FEATHER * 2}%, rgba(255,214,170,0.9) ${edge}%, rgba(255,120,60,0.35) ${edge + FEATHER}%, transparent ${edge + FEATHER * 2.4}%)`,
          mixBlendMode: 'screen',
          filter: 'blur(30px)',
          // Fades the flare in and out so it doesn't pop at the transition's edges.
          opacity: Math.sin(Math.PI * progress),
        }}
      />
    </AbsoluteFill>
  );
};
