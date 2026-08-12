import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface PopInProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/**
 * Kinetic "Pop" preset: Text pops in with a spring scale animation (like the Alex Hormozi style),
 * then fades out at the end.
 */
export const PopIn: React.FC<PopInProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 72,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring scale-in
  const scaleSpring = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
      mass: 0.8,
    },
  });

  // Exit fade
  const exitStart = durationInFrames - Math.round(fps * 0.25);
  const exitOpacity = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  const scale = interpolate(scaleSpring, [0, 1], [0.3, 1]);
  const opacity = frame < exitStart ? scaleSpring : exitOpacity;

  // Placement is OverlayFrame's job, not this component's — see
  // overlays/OverlayFrame.tsx. This renders only the animated text itself.
  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        color,
        fontSize,
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontWeight: 900,
        textAlign: 'center',
        textShadow: '0 4px 24px rgba(0,0,0,0.7)',
        maxWidth: '85%',
        lineHeight: 1.1,
        letterSpacing: '-0.03em',
      }}
    >
      {text}
    </div>
  );
};
