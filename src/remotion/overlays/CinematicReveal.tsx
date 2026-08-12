import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { exitOpacity, splitWords, staggerProgress } from './kinetic-utils';

interface CinematicRevealProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/** Seconds between each word starting its entrance. */
const STAGGER_SECONDS = 0.09;
/** Seconds one word takes to travel from hidden to settled. */
const RISE_SECONDS = 0.5;
/** How far below its resting place a word starts, in px at the composition's own scale. */
const RISE_DISTANCE = 24;
/** Starting blur. Sharpens to 0 as the word settles. */
const START_BLUR = 8;

/**
 * Words rise into place one after another, sharpening from blurred and dim to
 * crisp and solid.
 *
 * The three properties move together on one ramp per word — that coupling is
 * the whole effect. Blur alone reads as a focus pull, translate alone reads as
 * a cheap slide; combined they read as the word resolving into existence, which
 * is the look most "premium" title sequences are actually doing.
 *
 * Deliberately per-WORD, not per-character: per-character at this rise distance
 * reads as jittery noise on anything longer than a couple of words, and titles
 * here are typically a short phrase.
 */
export const CinematicReveal: React.FC<CinematicRevealProps> = ({
  text,
  color = '#FFFFFF',
  fontSize = 64,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = splitWords(text);
  const staggerFrames = Math.max(1, Math.round(fps * STAGGER_SECONDS));
  const riseFrames = Math.max(1, Math.round(fps * RISE_SECONDS));

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        // Row gap carries the line spacing here rather than lineHeight: each
        // word is its own positioned box, so lineHeight alone would leave
        // wrapped lines overlapping.
        gap: `${fontSize * 0.18}px ${fontSize * 0.28}px`,
        opacity: exitOpacity(frame, durationInFrames, fps),
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        fontWeight: 800,
        fontSize,
        letterSpacing: '-0.02em',
        textAlign: 'center',
      }}
    >
      {words.map((word, index) => {
        const progress = staggerProgress(frame, index, staggerFrames, riseFrames);
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: 'inline-block',
              color,
              opacity: progress,
              transform: `translateY(${(1 - progress) * RISE_DISTANCE}px)`,
              filter: `blur(${(1 - progress) * START_BLUR}px)`,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
