import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS } from '../../fonts';
import { revealProgress, cardExitOpacity, type CardMetrics } from '../card-utils';

interface SerifPlateProps {
  text: string;
  kicker?: string;
  color: string;
  textColor: string;
  metrics: CardMetrics;
  durationInFrames: number;
}

/**
 * The chapter plate: a full-frame scrim, a centred serif headline held between
 * two rules, everything arriving on a slow fade.
 *
 * This is the one card that deliberately takes the whole frame. A chapter
 * break is a pause in the edit — it wants the footage suppressed, not
 * decorated, which is why the scrim covers everything rather than sitting in a
 * box. It is `fullBleed` in the registry for that reason: `OverlayFrame` would
 * otherwise clamp it to 90% and leave a visible margin of un-dimmed footage
 * around a layer whose whole job is to cover.
 *
 * Serif, and no uppercase. Every other title style here is condensed sans in
 * caps; the chapter card is the moment to change voice, and a book-weight
 * serif is what signals "section" rather than "label".
 *
 * The rules deliberately grow from the centre outward, unlike `BroadcastBar`'s
 * left-anchored wipe — a symmetric layout needs a symmetric gesture.
 */
export const SerifPlate: React.FC<SerifPlateProps> = ({
  text,
  kicker,
  color,
  textColor,
  metrics,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { video, textScale } = metrics;

  // Sized against frame width directly rather than a card box — this style has
  // no card, it IS the frame.
  const headlineSize = video.width * 0.062 * textScale;
  const kickerSize = Math.max(11, headlineSize * 0.28);
  const ruleWidth = video.width * 0.16;

  const scrimIn = revealProgress(frame, fps, 0, 0.9);
  const kickerIn = revealProgress(frame, fps, 0.25);
  const headlineIn = revealProgress(frame, fps, 0.35, 1.0);
  const rulesIn = revealProgress(frame, fps, 0.5, 0.9);

  const exit = cardExitOpacity(frame, durationInFrames, fps, 0.6);

  const rule = (
    <div
      style={{
        width: ruleWidth,
        height: Math.max(1, video.width * 0.0012),
        background: color,
        opacity: 0.85,
        transform: `scaleX(${rulesIn})`,
      }}
    />
  );

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <AbsoluteFill style={{ background: 'rgba(6,6,9,0.72)', opacity: scrimIn }} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: headlineSize * 0.42,
          padding: '0 8%',
        }}
      >
        {kicker ? (
          <div
            style={{
              fontFamily: FONTS.sans,
              fontSize: kickerSize,
              fontWeight: 600,
              letterSpacing: '0.34em',
              textTransform: 'uppercase',
              color,
              opacity: kickerIn,
            }}
          >
            {kicker}
          </div>
        ) : null}

        {rule}

        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: headlineSize,
            fontWeight: 400,
            lineHeight: 1.18,
            textAlign: 'center',
            color: textColor,
            opacity: headlineIn,
            // A very small rise only. At this size a large translate reads as
            // the text sliding into frame; the plate should settle, not travel.
            transform: `translateY(${(1 - headlineIn) * (headlineSize * 0.12)}px)`,
          }}
        >
          {text}
        </div>

        {rule}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
