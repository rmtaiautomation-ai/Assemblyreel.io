import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, rowProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface SideRailProps {
  text: string;
  bullets: string[];
  edgeSide: 'left' | 'right';
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * An edge-anchored list: rows slide in from off-frame and sit flush against
 * the left or right edge, each on its own tinted plate.
 *
 * The only list style that ignores the clip's dragged position, and
 * deliberately so — it is anchored to a frame EDGE, which is the whole idea.
 * It is `fullBleed` in the registry for the same reason: `OverlayFrame` centres
 * its child on `xPercent`/`yPercent` and clamps it to 90% width, which would
 * pull the rail off the edge it exists to hug. Vertical placement still tracks
 * `yPercent` so it can sit high or low.
 *
 * Rows travel from outside the frame rather than fading, so they read as
 * arriving from somewhere. `edgeSide` mirrors the travel direction, the text
 * alignment and the accent bar together — a right-hand rail whose rows still
 * slid in from the left would read as broken.
 */
export const SideRail: React.FC<SideRailProps> = ({
  text,
  bullets,
  edgeSide,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const titleSize = cardWidth * 0.072 * textScale;
  const rowSize = titleSize * 0.62;
  const isLeft = edgeSide === 'left';
  const barWidth = Math.max(3, cardWidth * 0.009);

  const titleIn = revealProgress(frame, fps, 0);

  return (
    <AbsoluteFill
      style={{
        alignItems: isLeft ? 'flex-start' : 'flex-end',
        justifyContent: 'center',
        opacity: cardExitOpacity(frame, durationInFrames, fps),
      }}
    >
      {/* No separate maxWidth clamp: `cardWidth` already reflects the rail's
          intended column width (see the registry's `widthFraction` note on
          this style — it drives type size, not just this box). Clamping
          again here at a different fraction is what previously let the type
          basis and the visible column disagree. */}
      <div style={{ width: cardWidth }}>
        {text ? (
          <div
            style={{
              display: 'flex',
              flexDirection: isLeft ? 'row' : 'row-reverse',
              alignItems: 'center',
              gap: rowSize * 0.5,
              marginBottom: rowSize * 0.55,
              opacity: titleIn,
              transform: `translateX(${(1 - titleIn) * (isLeft ? -40 : 40)}px)`,
            }}
          >
            <div style={{ width: barWidth * 3, height: barWidth, background: color }} />
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: titleSize * 0.44,
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color,
              }}
            >
              {text}
            </div>
          </div>
        ) : null}

        {bullets.map((bullet, index) => {
          const enter = rowProgress(frame, fps, index, 0.18);
          return (
            <div
              key={`${bullet}-${index}`}
              style={{
                display: 'flex',
                flexDirection: isLeft ? 'row' : 'row-reverse',
                alignItems: 'stretch',
                marginBottom: rowSize * 0.34,
                opacity: enter,
                // Travels from beyond the frame edge, not merely from nearby.
                transform: `translateX(${(1 - enter) * (isLeft ? -100 : 100)}%)`,
              }}
            >
              <div style={{ width: barWidth, background: color, flexShrink: 0 }} />
              <div
                style={{
                  background: 'rgba(10,10,14,0.78)',
                  padding: `${rowSize * 0.42}px ${rowSize * 0.7}px`,
                  fontFamily: FONTS.sans,
                  fontSize: rowSize,
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: textColor,
                  textAlign: isLeft ? 'left' : 'right',
                  flex: 1,
                }}
              >
                {bullet}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
