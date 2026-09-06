import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Check } from 'lucide-react';
import { FONTS } from '../../fonts';
import { revealProgress, rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface LedgerProps {
  text: string;
  bullets: string[];
  showDividers: boolean;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * The refined list: no card, no rounded corners, no drop shadow. A left accent
 * bar, a title, and rows separated by hairlines.
 *
 * Two deliberate departures from the original `ChecklistCard`:
 *
 *  1. **No box.** A rounded panel with a drop shadow is web-UI language. A
 *     documentary list is set directly on the footage and separated by rules,
 *     which is why the only container here is a bar and some hairlines.
 *
 *  2. **The tick lands late.** In the original the checkmark faded in WITH its
 *     row, so nothing ever happened — the tick was just decoration that was
 *     always there. Here the row arrives first and the tick strikes after it
 *     settles, with a short overshoot. That gives each item a beat, which is
 *     the entire reason a checklist is animated rather than static.
 */
export const Ledger: React.FC<LedgerProps> = ({
  text,
  bullets,
  showDividers,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const titleSize = cardWidth * 0.082 * textScale;
  const rowSize = titleSize * 0.62;
  const tickBox = rowSize * 1.15;
  const rowGap = rowSize * 0.72;

  const titleIn = revealProgress(frame, fps, 0);
  const barIn = revealProgress(frame, fps, 0.05, 0.8);

  return (
    <div
      style={{
        display: 'flex',
        gap: titleSize * 0.42,
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
      }}
    >
      <div
        style={{
          width: Math.max(3, cardWidth * 0.008),
          background: color,
          flexShrink: 0,
          transform: `scaleY(${barIn})`,
          transformOrigin: 'center top',
        }}
      />

      <div style={{ flex: 1 }}>
        <div style={{ overflow: 'hidden', marginBottom: rowGap }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              color: textColor,
              transform: `translateY(${(1 - titleIn) * 100}%)`,
            }}
          >
            {text}
          </div>
        </div>

        {bullets.map((bullet, index) => {
          // Rows begin after the title has settled.
          const enter = rowProgress(frame, fps, index, 0.3);
          // The tick starts only once its own row is essentially in place.
          const tick = revealProgress(frame, fps, 0.3 + index * 0.12 + 0.28, 0.35);
          // Slight overshoot so the mark snaps rather than swells.
          const tickScale = tick < 1 ? 0.6 + tick * 0.55 : 1;

          return (
            <div
              key={`${bullet}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: rowSize * 0.6,
                paddingTop: rowGap * 0.55,
                paddingBottom: rowGap * 0.55,
                borderTop: showDividers && index > 0 ? `1px solid rgba(255,255,255,0.16)` : undefined,
                opacity: enter,
                transform: `translateY(${(1 - enter) * (rowSize * 0.5)}px)`,
              }}
            >
              <div
                style={{
                  width: tickBox,
                  height: tickBox,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `${Math.max(1.5, tickBox * 0.07)}px solid ${color}`,
                  marginTop: rowSize * 0.1,
                }}
              >
                <div style={{ opacity: tick, transform: `scale(${tickScale})`, display: 'flex' }}>
                  <Check size={tickBox * 0.72} color={color} strokeWidth={3.5} />
                </div>
              </div>
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
    </div>
  );
};
