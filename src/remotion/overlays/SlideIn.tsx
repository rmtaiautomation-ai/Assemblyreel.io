import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface SlideInProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/**
 * Kinetic "Slide" preset: Text slides in from the right with a slight motion blur feel,
 * holds, then slides out to the left.
 */
export const SlideIn: React.FC<SlideInProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 64,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterDuration = Math.round(fps * 0.4); // 0.4s slide in
  const exitStart = durationInFrames - Math.round(fps * 0.3);

  // Slide in from right
  const translateX = interpolate(
    frame,
    [0, enterDuration],
    [120, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Slide out to left
  const exitTranslateX = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, -120],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Opacity fades
  const enterOpacity = interpolate(
    frame,
    [0, enterDuration * 0.6],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  const exitOpacity = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  const x = frame < exitStart ? translateX : exitTranslateX;
  const opacity = frame < exitStart ? enterOpacity : exitOpacity;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          transform: `translateX(${x}%)`,
          opacity,
          color,
          fontSize,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 800,
          textAlign: 'center',
          textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          maxWidth: '80%',
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
