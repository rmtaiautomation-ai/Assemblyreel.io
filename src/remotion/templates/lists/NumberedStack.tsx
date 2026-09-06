import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface NumberedStackProps {
  text: string;
  bullets: string[];
  startNumber: number;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * A ranked list: an oversized numeral in the accent colour, the item beside
 * it, rows cascading up.
 *
 * The numeral is the design. Set large enough to be a graphic element and
 * zero-padded to two digits so the left edge of every label aligns whatever
 * the count — a ragged left edge from 9 → 10 is the usual tell that a
 * numbered list was laid out by hand.
 *
 * Each numeral counts in from behind its own mask a fraction before its label,
 * so the eye lands on the rank first. `startNumber` lets a list continue
 * across cards (a "5 through 8" segment) rather than always restarting at one.
 */
export const NumberedStack: React.FC<NumberedStackProps> = ({
  text,
  bullets,
  startNumber,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const titleSize = cardWidth * 0.075 * textScale;
  const numeralSize = titleSize * 1.15;
  const rowSize = titleSize * 0.6;

  const titleIn = revealProgress(frame, fps, 0);

  return (
    <div
      style={{
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
      }}
    >
      {text ? (
        <div style={{ overflow: 'hidden', marginBottom: rowSize * 0.9 }}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: titleSize * 0.42,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color,
              transform: `translateY(${(1 - titleIn) * 100}%)`,
            }}
          >
            {text}
          </div>
        </div>
      ) : null}

      {bullets.map((bullet, index) => {
        const numeralIn = rowProgress(frame, fps, index, 0.15);
        const labelIn = rowProgress(frame, fps, index, 0.26);
        return (
          <div
            key={`${bullet}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: numeralSize * 0.34,
              marginBottom: rowSize * 0.62,
            }}
          >
            <div style={{ overflow: 'hidden', flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: numeralSize,
                  fontWeight: 700,
                  lineHeight: 1,
                  color,
                  // Tabular so the digits occupy a fixed advance and the labels
                  // beside them stay on one vertical line.
                  fontVariantNumeric: 'tabular-nums',
                  transform: `translateY(${(1 - numeralIn) * 100}%)`,
                }}
              >
                {String(startNumber + index).padStart(2, '0')}
              </div>
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: rowSize,
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: textColor,
                  transform: `translateY(${(1 - labelIn) * 100}%)`,
                }}
              >
                {bullet}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
