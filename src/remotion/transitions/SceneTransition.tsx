import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { TransitionType } from '../types';
import { Crossfade } from './Crossfade';
import { SlidePush } from './SlidePush';
import { SmoothZoom } from './SmoothZoom';
import { Glitch } from './Glitch';
import { LightLeak } from './LightLeak';

export interface TransitionEffectProps {
  /**
   * 0 on the first frame of the transition, 1 at the scene's nominal start.
   *
   * LINEAR. Each effect applies its own easing, because crossfade specifically must
   * NOT have any — see Crossfade.tsx.
   */
  progress: number;
  /** CSS-safe and unique per scene. Only Glitch needs it, for an SVG filter id. */
  domId: string;
  children: React.ReactNode;
}

/**
 * Animates a scene's ENTRY over its predecessor.
 *
 * The scene's `<Sequence>` was started `durationInFrames` frames before its nominal
 * start and lengthened by the same amount, so its END frame is unchanged and the
 * fixed narration track never drifts (see `layoutScenes`). This component spends
 * those extra frames animating the scene in. The predecessor is already painted
 * underneath — later scenes come later in the DOM, and `<Sequence>` defaults to
 * `absolute-fill` — so no compositing tricks are needed.
 */
export const SceneTransition: React.FC<{
  type: TransitionType;
  durationInFrames: number;
  sceneId: string;
  children: React.ReactNode;
}> = ({ type, durationInFrames, sceneId, children }) => {
  const frame = useCurrentFrame();

  // Zero-length is the COMMON case: the first scene, type 'none', or a value the
  // layout pass clamped away because a neighbour was too short. `interpolate` throws
  // on a non-monotonic input range, so this early return is load-bearing rather than
  // an optimisation.
  if (type === 'none' || durationInFrames <= 0) {
    return <>{children}</>;
  }

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // React's useId() emits ids containing ':', which is invalid inside url(#...).
  // Scene ids are Supabase UUIDs (or short temp strings), so sanitise those instead.
  const domId = `tx-${String(sceneId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const effectProps = { progress, domId, children };

  switch (type) {
    case 'crossfade':
      return <Crossfade {...effectProps} />;
    case 'slide':
      return <SlidePush {...effectProps} />;
    case 'zoom':
      return <SmoothZoom {...effectProps} />;
    case 'glitch':
      return <Glitch {...effectProps} />;
    case 'light-leak':
      return <LightLeak {...effectProps} />;
    default:
      return <>{children}</>;
  }
};
