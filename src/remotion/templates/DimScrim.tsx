import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeProgress } from './fadeProgress';

interface DimScrimProps {
  /** Scrim color. Defaults to black. */
  color?: string;
  /** Peak opacity, 0-1. Defaults to 0.45 — matches the `dimBackground` checkbox's own fixed dim elsewhere in this app. */
  opacity?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  durationInFrames: number;
}

/**
 * A full-frame dim layer with its own independent timing on the OV track —
 * unlike the `dimBackground` checkbox on a text/card clip (which dims for
 * exactly that clip's own duration, instantly on and off with no fade), this
 * is its own clip: it can start before its text arrives, linger after the
 * text is gone, and fade in/out on its own curve. Matches how professional
 * NLEs handle a "dim behind text" effect — a separate solid layer with its
 * own opacity, not an attribute of the text itself.
 *
 * Deliberately rendered WITHOUT `OverlayFrame` in VideoComposition: a scrim
 * has no "position", it always covers the whole frame.
 */
export const DimScrim: React.FC<DimScrimProps> = ({
  color = '#000000',
  opacity = 0.45,
  fadeInSeconds = 0.3,
  fadeOutSeconds = 0.3,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = fadeProgress(frame, fps, fadeInSeconds, fadeOutSeconds, durationInFrames);

  return <AbsoluteFill style={{ backgroundColor: color, opacity: opacity * progress }} />;
};
