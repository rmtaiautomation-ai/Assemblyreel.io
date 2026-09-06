import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface TickSheetProps {
  text: string;
  bullets: string[];
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * A checklist whose ticks are actually DRAWN — each checkmark is an SVG path
 * animated with `stroke-dashoffset`, so the stroke travels along itself the
 * way a pen would.
 *
 * This is the one genuinely new rendering technique in the list set. Every
 * other tick in this app is an icon that fades or scales; here the mark is a
 * two-segment polyline whose dash offset runs from its own length to zero, so
 * the short down-stroke draws before the long up-stroke. That single detail is
 * most of the difference between "a checklist graphic" and "a checklist being
 * filled in".
 *
 * The box is a real empty square that stays visible after the tick lands, so
 * the graphic still reads as a form rather than a bullet list.
 */
export const TickSheet: React.FC<TickSheetProps> = ({
  text,
  bullets,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const titleSize = cardWidth * 0.078 * textScale;
  const rowSize = titleSize * 0.6;
  const box = rowSize * 1.5;

  const titleIn = revealProgress(frame, fps, 0);

  return (
    <div
      style={{
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
      }}
    >
      {text ? (
        <div style={{ overflow: 'hidden', marginBottom: rowSize }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.1,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              color: textColor,
              transform: `translateY(${(1 - titleIn) * 100}%)`,
            }}
          >
            {text}
          </div>
        </div>
      ) : null}

      {bullets.map((bullet, index) => {
        const enter = rowProgress(frame, fps, index, 0.25);
        // The stroke only starts once the row it belongs to has arrived.
        const draw = revealProgress(frame, fps, 0.25 + index * 0.12 + 0.3, 0.4);

        return (
          <div
            key={`${bullet}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: rowSize * 0.7,
              marginBottom: rowSize * 0.72,
              opacity: enter,
              transform: `translateX(${(1 - enter) * (rowSize * -0.6)}px)`,
            }}
          >
            <svg
              width={box}
              height={box}
              viewBox="0 0 24 24"
              style={{ flexShrink: 0, marginTop: rowSize * 0.06, overflow: 'visible' }}
            >
              <rect
                x={1.5}
                y={1.5}
                width={21}
                height={21}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.85}
              />
              {/*
                The tick itself. `pathLength={1}` normalises the path's own
                length to 1 regardless of its real geometry, which is what lets
                the dash offset be driven by a plain 0-1 progress value without
                measuring the path at runtime.
              */}
              <polyline
                points="5.5,12.5 10.5,17.5 19,7"
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="square"
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
              />
            </svg>
            <span
              style={{
                fontFamily: FONTS.sans,
                fontSize: rowSize,
                fontWeight: 500,
                lineHeight: 1.34,
                color: textColor,
              }}
            >
              {bullet}
            </span>
          </div>
        );
      })}
    </div>
  );
};
