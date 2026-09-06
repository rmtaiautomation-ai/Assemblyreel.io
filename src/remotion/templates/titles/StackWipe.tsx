import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';
import { balanceLines, fitTextSize } from '../card-text';

interface StackWipeProps {
  text: string;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * A headline broken across two or three lines, each wiping up from behind its
 * own mask a beat after the one above it.
 *
 * The cascade is what this style is for: it makes a long title land as a
 * sequence of statements rather than a paragraph. Tight leading (0.92) so the
 * lines read as one block — at display sizes the default line height leaves
 * the stack looking like unrelated rows.
 *
 * Lines are balanced by word count rather than split on a fixed character
 * budget, so a title never leaves one orphan word on the last line. A left
 * accent bar spans the whole stack once every line has arrived, tying them
 * together.
 */
export const StackWipe: React.FC<StackWipeProps> = ({
  text,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const lines = balanceLines(text);
  const barWidth = Math.max(3, cardWidth * 0.008);
  // Fit to the width actually left for text after the bar and its gap, or the
  // balanced lines wrap again and the "two line" design silently becomes four.
  const textWidth = cardWidth - barWidth - cardWidth * 0.04;
  const headlineSize = fitTextSize(lines, textWidth, cardWidth * 0.125) * textScale;

  return (
    <div
      style={{
        display: 'flex',
        gap: headlineSize * 0.32,
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
      }}
    >
      {/* Grows downward as the lines arrive, so the bar finishes with them
          rather than standing there waiting for the text. */}
      <div
        style={{
          width: barWidth,
          background: color,
          flexShrink: 0,
          transform: `scaleY(${rowProgress(frame, fps, lines.length - 1)})`,
          transformOrigin: 'center top',
        }}
      />

      <div>
        {lines.map((line, index) => {
          const progress = rowProgress(frame, fps, index);
          return (
            <div key={`${line}-${index}`} style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: headlineSize,
                  fontWeight: 600,
                  // Tight enough that the stack reads as one mass of type.
                  lineHeight: 0.92,
                  letterSpacing: '0.005em',
                  textTransform: 'uppercase',
                  color: textColor,
                  // The size above is chosen so each balanced line fits;
                  // nowrap stops the browser re-breaking it anyway, which
                  // would desync the per-line stagger from the visible lines.
                  whiteSpace: 'nowrap',
                  transform: `translateY(${(1 - progress) * 100}%)`,
                }}
              >
                {line}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
