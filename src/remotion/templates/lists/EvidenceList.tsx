import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface EvidenceListProps {
  text: string;
  bullets: string[];
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * A monospaced index: a header rule, a reference marker per row, and hairline
 * separators. The list counterpart to `DossierStamp` — use them together and
 * the two read as pages from the same file.
 *
 * Mono throughout, and that is load-bearing rather than decorative: a fixed
 * advance width makes the markers (`01 /`, `02 /`) form a true column, which
 * is what makes the block read as a record rather than as styled prose. The
 * accent is used only on the markers and rules, never on the body text, so the
 * whole graphic stays close to monochrome.
 *
 * Rows type in by clipping their own width — a horizontal reveal, unlike every
 * other list here — so the effect echoes a line being printed.
 */
export const EvidenceList: React.FC<EvidenceListProps> = ({
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

  const headerSize = cardWidth * 0.05 * textScale;
  const rowSize = headerSize * 0.86;

  const headerIn = revealProgress(frame, fps, 0);
  const ruleIn = revealProgress(frame, fps, 0.12, 0.8);

  return (
    <div
      style={{
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
        background: 'rgba(8,8,10,0.62)',
        padding: `${headerSize * 0.9}px ${headerSize}px`,
      }}
    >
      {text ? (
        <>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: headerSize,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: textColor,
              opacity: headerIn,
            }}
          >
            {text}
          </div>
          <div
            style={{
              height: Math.max(1, cardWidth * 0.003),
              background: color,
              margin: `${headerSize * 0.55}px 0`,
              transform: `scaleX(${ruleIn})`,
              transformOrigin: 'left center',
            }}
          />
        </>
      ) : null}

      {bullets.map((bullet, index) => {
        const enter = rowProgress(frame, fps, index, 0.25);
        return (
          <div
            key={`${bullet}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: rowSize * 0.75,
              padding: `${rowSize * 0.42}px 0`,
              borderBottom:
                index < bullets.length - 1 ? '1px solid rgba(255,255,255,0.12)' : undefined,
              // Clipped horizontally rather than faded, so the row reads as
              // being printed out.
              clipPath: `inset(0 ${(1 - enter) * 100}% 0 0)`,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: rowSize * 0.82,
                fontWeight: 500,
                color,
                flexShrink: 0,
                letterSpacing: '0.06em',
              }}
            >
              {String(index + 1).padStart(2, '0')} /
            </span>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: rowSize,
                fontWeight: 400,
                lineHeight: 1.42,
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
