import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, cardExitOpacity, type CardMetrics } from '../card-utils';
import { balanceLines, fitTextSize } from '../card-text';

interface BroadcastBarProps {
  text: string;
  kicker?: string;
  /** Rule + kicker accent. */
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * The documentary/broadcast standard: a small letterspaced kicker, a hairline
 * rule that wipes out from the left, and the headline rising from behind a
 * mask.
 *
 * The mask is the point. Sliding text up while fading it in reads as a web
 * animation; clipping it to a box it emerges from reads as broadcast, because
 * the letters are revealed rather than moved. Each line owns its own
 * `overflow: hidden` wrapper so the reveal edge is the text's own baseline box
 * and not one shared rectangle.
 *
 * Left-aligned and set against the card's left edge — a title card that
 * centres everything has no anchor, and the rule gives the eye one.
 */
export const BroadcastBar: React.FC<BroadcastBarProps> = ({
  text,
  kicker,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  // Balanced and fitted for the same reason StackWipe is: a long headline set
  // at a fixed fraction of card width wraps into however many lines it likes,
  // and the single mask then reveals a block of unpredictable height. Fitting
  // keeps the card the shape the design intends.
  const lines = balanceLines(text);
  const headlineSize = fitTextSize(lines, cardWidth, cardWidth * 0.115) * textScale;
  const kickerSize = Math.max(10, headlineSize * 0.26);

  const kickerIn = revealProgress(frame, fps, 0);
  const ruleIn = revealProgress(frame, fps, 0.12);
  const headlineIn = revealProgress(frame, fps, 0.22);

  return (
    <div
      style={{
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
        textAlign: 'left',
      }}
    >
      {kicker ? (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: kickerSize,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color,
            opacity: kickerIn,
            transform: `translateX(${(1 - kickerIn) * -12}px)`,
            marginBottom: kickerSize * 0.7,
          }}
        >
          {kicker}
        </div>
      ) : null}

      {/* Scales from the left edge, so the rule draws outward rather than
          growing from its own centre. */}
      <div
        style={{
          height: Math.max(2, cardWidth * 0.004),
          background: color,
          transform: `scaleX(${ruleIn})`,
          transformOrigin: 'left center',
          marginBottom: headlineSize * 0.3,
        }}
      />

      {/* One mask per line rather than one around the block: the reveal edge
          is then each line's own baseline, which is what reads as broadcast
          rather than as a fade-and-slide. A shared mask would also let a
          descender from the line above clip into the line below. */}
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: headlineSize,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: '0.005em',
              color: textColor,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              transform: `translateY(${(1 - headlineIn) * 100}%)`,
            }}
          >
            {line}
          </div>
        </div>
      ))}
    </div>
  );
};
