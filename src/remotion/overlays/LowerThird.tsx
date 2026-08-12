import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface LowerThirdProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/**
 * Kinetic "Lower Third" preset: A professional name-tag / location badge
 * that unfolds from the bottom-left corner with a colored accent bar.
 */
export const LowerThird: React.FC<LowerThirdProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 32,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bar width animation via spring
  const barSpring = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 180, mass: 0.6 },
  });

  // Text fades in slightly after the bar
  const textOpacity = interpolate(
    frame,
    [Math.round(fps * 0.15), Math.round(fps * 0.4)],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Exit animation
  const exitStart = durationInFrames - Math.round(fps * 0.3);
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  const translateY = frame >= exitStart ? interpolate(exitProgress, [0, 1], [0, 40]) : 0;
  const globalOpacity = frame >= exitStart ? 1 - exitProgress : 1;

  // Placement is OverlayFrame's job, not this component's — see
  // overlays/OverlayFrame.tsx. The bottom-12%/left-6% geometry that used to
  // live here now lives there as the 'bottom-left' default align, which is what
  // the scene-scoped path still uses, so this preset lands exactly where it
  // always did while ALSO being free-positionable as an overlay clip.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        transform: `translateY(${translateY}px)`,
        opacity: globalOpacity,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: 5,
          borderRadius: 3,
          background: 'linear-gradient(to bottom, #a855f7, #6366f1)',
          transform: `scaleY(${barSpring})`,
          transformOrigin: 'bottom',
        }}
      />
      {/* Text container */}
      <div
        style={{
          marginLeft: 14,
          opacity: textOpacity,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            color,
            fontSize,
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 700,
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            lineHeight: 1.2,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
