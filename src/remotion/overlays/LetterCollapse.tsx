import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitOpacity } from './kinetic-utils';

interface LetterCollapseProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/** Frames each successive character waits before starting to converge. */
const STAGGER_FRAMES = 2;
/** How far apart the characters start, relative to font size. */
const SPREAD_RATIO = 0.55;

/**
 * Characters start scattered outward from the centre and converge inward,
 * settling with a slight overshoot.
 *
 * Best on SHORT text — a word or two. Every character animates independently,
 * so a long sentence both looks chaotic and starts the last characters very
 * late. Not enforced in code: clamping or truncating the user's own text would
 * be worse than letting a long string look busy, and the preset picker already
 * frames this as a title treatment.
 *
 * The outward offset is signed by which side of the centre a character sits on,
 * so the word implodes symmetrically rather than sliding in from one side.
 */
export const LetterCollapse: React.FC<LetterCollapseProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 72,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const characters = Array.from(text);
  const centreIndex = (characters.length - 1) / 2;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
        opacity: exitOpacity(frame, durationInFrames, fps),
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontWeight: 900,
        fontSize,
        color,
        textShadow: '0 4px 24px rgba(0,0,0,0.7)',
        whiteSpace: 'pre',
      }}
    >
      {characters.map((character, index) => {
        // Characters nearer the centre settle first, so the word resolves
        // outward-in rather than left-to-right.
        const distanceFromCentre = Math.abs(index - centreIndex);
        const settle = spring({
          frame: frame - Math.round(distanceFromCentre * STAGGER_FRAMES),
          fps,
          config: { damping: 14, stiffness: 190, mass: 0.7 },
        });

        // Signed so left-of-centre characters come in from the left and
        // right-of-centre from the right.
        const direction = index < centreIndex ? -1 : 1;
        const offset = interpolate(
          settle,
          [0, 1],
          [direction * distanceFromCentre * fontSize * SPREAD_RATIO, 0]
        );

        return (
          <span
            key={`${character}-${index}`}
            style={{
              display: 'inline-block',
              transform: `translateX(${offset}px)`,
              opacity: settle,
            }}
          >
            {/* A literal space collapses in an inline-block; a non-breaking
                space keeps word gaps visible while still animating. */}
            {character === ' ' ? ' ' : character}
          </span>
        );
      })}
    </div>
  );
};
