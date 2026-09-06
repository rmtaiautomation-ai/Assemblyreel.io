import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface DossierStampProps {
  text: string;
  kicker?: string;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * An evidence-file card: a mono reference line, a heavy condensed headline,
 * and a hairline box that draws itself corner-first around both.
 *
 * The drawing box is the signature. Two L-shaped brackets (top-left and
 * bottom-right) extend along their axes rather than a rectangle fading in —
 * the same gesture a case file gets stamped with, and it reads as
 * "documented" rather than "designed". Built for archival/forensic
 * documentary work where the frame needs to look like a record, not a
 * lower-third.
 *
 * The slight rotation is deliberate and small: enough to feel physical, little
 * enough that the type still reads as level.
 */
export const DossierStamp: React.FC<DossierStampProps> = ({
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

  const headlineSize = cardWidth * 0.105 * textScale;
  const kickerSize = Math.max(9, headlineSize * 0.24);
  const pad = cardWidth * 0.055;
  const bracket = Math.max(1.5, cardWidth * 0.0035);
  /** How far along each edge a bracket arm runs. */
  const armLength = '38%';

  const boxIn = revealProgress(frame, fps, 0);
  const kickerIn = revealProgress(frame, fps, 0.18);
  const headlineIn = revealProgress(frame, fps, 0.28);

  const arm = (style: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    background: color,
    ...style,
  });

  return (
    <div
      style={{
        position: 'relative',
        width: cardWidth,
        padding: pad,
        opacity: cardExitOpacity(frame, durationInFrames, fps),
        transform: 'rotate(-0.6deg)',
        background: 'rgba(10,10,12,0.55)',
      }}
    >
      {/* Top-left bracket: horizontal arm draws rightward, vertical downward. */}
      <div style={arm({ top: 0, left: 0, height: bracket, width: armLength, transform: `scaleX(${boxIn})`, transformOrigin: 'left center' })} />
      <div style={arm({ top: 0, left: 0, width: bracket, height: armLength, transform: `scaleY(${boxIn})`, transformOrigin: 'center top' })} />
      {/* Bottom-right bracket: mirrored, so the two close on each other. */}
      <div style={arm({ bottom: 0, right: 0, height: bracket, width: armLength, transform: `scaleX(${boxIn})`, transformOrigin: 'right center' })} />
      <div style={arm({ bottom: 0, right: 0, width: bracket, height: armLength, transform: `scaleY(${boxIn})`, transformOrigin: 'center bottom' })} />

      {kicker ? (
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: kickerSize,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color,
            opacity: kickerIn,
            marginBottom: kickerSize * 0.8,
          }}
        >
          {kicker}
        </div>
      ) : null}

      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: headlineSize,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            color: textColor,
            transform: `translateY(${(1 - headlineIn) * 100}%)`,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
