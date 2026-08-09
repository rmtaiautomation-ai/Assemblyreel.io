import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import type { TransitionEffectProps } from './SceneTransition';

type SlideDirection = 'left' | 'right' | 'up' | 'down';

/**
 * The incoming scene slides in over the stationary outgoing one.
 *
 * Note this is a slide-OVER, not a true push: a real push also translates the
 * outgoing scene, which lives in a sibling `<Sequence>` this component cannot reach.
 * `SceneLayout.transitionOutFrames` exists as the hook for that if it's ever wanted.
 */
export const SlidePush: React.FC<TransitionEffectProps & { direction?: SlideDirection }> = ({
  progress,
  children,
  direction = 'left',
}) => {
  const eased = interpolate(progress, [0, 1], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const offsetPercent = (1 - eased) * 100;
  const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
  const sign = direction === 'left' || direction === 'up' ? 1 : -1;

  return (
    <AbsoluteFill
      style={{
        transform: `translate${axis}(${sign * offsetPercent}%)`,
        // Fakes a contact shadow on the leading edge so the incoming scene reads as
        // sitting above rather than merely appearing. Dropped once the layer settles,
        // so a fully-arrived scene pays nothing for it.
        boxShadow: offsetPercent > 0.5 ? '0 0 90px 10px rgba(0,0,0,0.55)' : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
