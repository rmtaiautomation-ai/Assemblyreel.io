import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

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

  const fadeInFrames = Math.max(1, Math.round(fps * Math.max(0, fadeInSeconds)));
  const fadeOutFrames = Math.max(1, Math.round(fps * Math.max(0, fadeOutSeconds)));
  // Clamped so this is never a zero-width interpolate() range, even when the
  // fades are longer than the clip itself or overlap each other.
  const fadeOutStart = Math.min(durationInFrames - 1, Math.max(fadeInFrames, durationInFrames - fadeOutFrames));

  // Below fadeInFrames: ramping in. At/above it: the second call governs —
  // its extrapolateLeft:'clamp' holds at 1 for the whole "hold" period
  // between the two fades, then ramps out from fadeOutStart.
  const progress = frame < fadeInFrames
    ? interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return <AbsoluteFill style={{ backgroundColor: color, opacity: opacity * progress }} />;
};
