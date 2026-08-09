import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionEffectProps } from './SceneTransition';

/**
 * Deliberately LINEAR and deliberately one-sided.
 *
 * The outgoing scene is painted underneath at full opacity, so compositing this layer
 * at alpha p yields exactly `(1 - p) * outgoing + p * incoming` — a true cross-dissolve
 * with no luminance dip.
 *
 * Two ways to break that identity, both common in hand-rolled crossfades:
 *   - easing the ramp, which biases the midpoint;
 *   - also fading the OUTGOING scene out, which multiplies the two alphas and dips to
 *     ~50% grey halfway through.
 * Neither is an improvement. Leave this as a bare linear opacity.
 */
export const Crossfade: React.FC<TransitionEffectProps> = ({ progress, children }) => (
  <AbsoluteFill style={{ opacity: progress }}>{children}</AbsoluteFill>
);
