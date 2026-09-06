import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface QuoteCardProps {
  text: string;
  attribution?: string;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * A pulled quote: an oversized quotation mark, the quote in serif, and an
 * attribution under a short rule.
 *
 * A documentary staple and the reason `attribution` exists on the title data
 * type — it is the one field no other title style uses, and the case that
 * proves the registry's `fields` list is doing real work (this style must NOT
 * show the two image pickers the title kind used to hard-code).
 *
 * The quote glyph is set as a real character rather than drawn, at a size that
 * makes it a graphic element instead of punctuation, and pushed behind the
 * text with a negative offset so the first line overlaps it. Low opacity so it
 * reads as texture, not as a competing mark.
 */
export const QuoteCard: React.FC<QuoteCardProps> = ({
  text,
  attribution,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { cardWidth, textScale } = metrics;

  const quoteSize = cardWidth * 0.072 * textScale;
  const markSize = cardWidth * 0.26;
  const attributionSize = Math.max(10, quoteSize * 0.42);

  const markIn = revealProgress(frame, fps, 0, 0.9);
  const quoteIn = revealProgress(frame, fps, 0.15, 0.9);
  const ruleIn = revealProgress(frame, fps, 0.45);
  const attributionIn = revealProgress(frame, fps, 0.55);

  return (
    <div
      style={{
        position: 'relative',
        width: cardWidth,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
        // Only a third of the mark's height is cleared, so the first line of
        // the quote overlaps its lower half — the mark reads as something the
        // text sits ON rather than as a separate element stacked above it.
        paddingTop: markSize * 0.3,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -markSize * 0.04,
          fontFamily: FONTS.serif,
          fontSize: markSize,
          fontWeight: 700,
          lineHeight: 0.8,
          color,
          // Bright enough to read as the accent colour. At the 0.28 this
          // started on, a warm accent over a dark frame composited to a muddy
          // olive that looked like a rendering fault rather than a design
          // choice — low opacity is only "subtle" against a light ground.
          opacity: markIn * 0.55,
          userSelect: 'none',
        }}
      >
        &ldquo;
      </div>

      <div
        style={{
          position: 'relative',
          fontFamily: FONTS.serif,
          fontSize: quoteSize,
          fontWeight: 400,
          fontStyle: 'italic',
          lineHeight: 1.32,
          color: textColor,
          opacity: quoteIn,
          transform: `translateY(${(1 - quoteIn) * (quoteSize * 0.35)}px)`,
        }}
      >
        {text}
      </div>

      {attribution ? (
        <div style={{ marginTop: quoteSize * 0.55, display: 'flex', alignItems: 'center', gap: quoteSize * 0.4 }}>
          <div
            style={{
              width: cardWidth * 0.09,
              height: Math.max(1, cardWidth * 0.0025),
              background: color,
              transform: `scaleX(${ruleIn})`,
              transformOrigin: 'left center',
            }}
          />
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: attributionSize,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: textColor,
              opacity: attributionIn * 0.85,
            }}
          >
            {attribution}
          </div>
        </div>
      ) : null}
    </div>
  );
};
