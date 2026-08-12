import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface TypewriterProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/**
 * Kinetic "Typewriter" preset: Characters appear one by one as if being typed,
 * with a blinking cursor at the end.
 */
export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 48,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Use 60% of duration for typing, rest for holding
  const typingDuration = Math.round(durationInFrames * 0.6);
  const charsToShow = Math.floor(
    interpolate(
      frame,
      [0, typingDuration],
      [0, text.length],
      { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    )
  );

  const visibleText = text.slice(0, charsToShow);

  // Blinking cursor (toggles every 0.5s)
  const cursorVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  const showCursor = charsToShow < text.length || cursorVisible;

  // Exit fade
  const exitStart = durationInFrames - Math.round(fps * 0.3);
  const exitOpacity = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
  const opacity = frame < exitStart ? 1 : exitOpacity;

  // Placement is OverlayFrame's job, not this component's — see
  // overlays/OverlayFrame.tsx. The exit fade moved onto this div along with it,
  // since the AbsoluteFill that used to carry it is gone.
  return (
    <div
      style={{
        opacity,
        color,
        fontSize,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontWeight: 600,
        textAlign: 'center',
        textShadow: '0 2px 16px rgba(0,0,0,0.5)',
        maxWidth: '80%',
        lineHeight: 1.4,
      }}
    >
      {visibleText}
      {showCursor && (
        <span
          style={{
            borderRight: `3px solid ${color}`,
            marginLeft: 2,
            animation: 'none',
          }}
        />
      )}
    </div>
  );
};
