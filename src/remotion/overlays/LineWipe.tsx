import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitOpacity } from './kinetic-utils';

interface LineWipeProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/** Seconds the wipe takes to cross the headline. */
const WIPE_SECONDS = 0.6;
/** Width of the bar riding the wipe's leading edge, relative to font size. */
const BAR_WIDTH_RATIO = 0.09;

/**
 * The headline is uncovered by a wipe travelling left to right, with a bright
 * bar riding the leading edge.
 *
 * Uses `clip-path: inset()` rather than animating width or a masking overlay:
 * clipping leaves the text's own layout completely untouched, so letters are
 * revealed exactly where they will finally sit. Animating a container's width
 * would reflow the text as it grew, and a solid rectangle sliding across only
 * works over a flat background — this reveals cleanly over footage.
 *
 * Eased out (matching SmoothZoom's convention) because a linear wipe reads as
 * mechanical; the bar should arrive fast and settle.
 */
export const LineWipe: React.FC<LineWipeProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 64,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wipeFrames = Math.max(1, Math.round(fps * WIPE_SECONDS));

  const progress = interpolate(frame, [0, wipeFrames], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        opacity: exitOpacity(frame, durationInFrames, fps),
      }}
    >
      <div
        style={{
          // Hides everything to the right of the wipe front. At progress 0 the
          // inset is 100% (nothing visible); at 1 it's 0% (fully revealed).
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          color,
          fontSize,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          textAlign: 'center',
          textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>

      {/* Leading-edge bar. Fades out as the wipe lands so it doesn't sit
          parked against the last letter for the rest of the clip. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${progress * 100}%`,
          width: Math.max(3, fontSize * BAR_WIDTH_RATIO),
          background: color,
          opacity: progress >= 1 ? 0 : 0.9,
          boxShadow: `0 0 18px ${color}`,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
