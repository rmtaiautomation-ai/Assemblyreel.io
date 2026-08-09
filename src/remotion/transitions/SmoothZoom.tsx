import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import type { TransitionEffectProps } from './SceneTransition';

/** How far past full-frame the incoming scene starts, as a scale factor. */
const ENTRY_SCALE = 1.18;

/**
 * The incoming scene settles from a slight overscan into place while fading up.
 *
 * Eased (unlike Crossfade) because the motion is the point here — a linear scale
 * reads as mechanical, and the opacity ramp is riding along with the movement rather
 * than carrying the effect on its own.
 */
export const SmoothZoom: React.FC<TransitionEffectProps> = ({ progress, children }) => {
  const eased = interpolate(progress, [0, 1], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(eased, [0, 1], [ENTRY_SCALE, 1]);

  return (
    <AbsoluteFill
      style={{
        opacity: eased,
        transform: `scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
