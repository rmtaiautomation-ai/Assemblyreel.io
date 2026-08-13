import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitOpacity, splitWords, staggerProgress } from './kinetic-utils';

interface ChapterCardProps {
  text: string;
  /** Small label above the headline, e.g. "CHAPTER 02". Omitted → headline only. */
  kickerText?: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/** Seconds the kicker takes to fade and rise in. */
const KICKER_SECONDS = 0.3;
/** Seconds after the kicker STARTS before the headline begins. */
const HEADLINE_DELAY_SECONDS = 0.2;
const STAGGER_SECONDS = 0.08;
const RISE_SECONDS = 0.45;
const RISE_DISTANCE = 20;

/**
 * A section-break title: a small kicker label establishes itself first, then the
 * headline arrives word by word underneath it.
 *
 * The sequencing is the point — kicker first, headline second — which is what
 * separates this from CinematicReveal with extra text bolted on. It reads as
 * "here is where we are, and here is what it is", the structure documentary and
 * chaptered long-form content use for section breaks.
 *
 * The headline reuses CinematicReveal's per-word rise via the shared
 * `staggerProgress`/`splitWords` helpers rather than copying that logic, so the
 * two presets can't drift apart in feel.
 */
export const ChapterCard: React.FC<ChapterCardProps> = ({
  text,
  kickerText,
  color = '#FFFFFF',
  fontSize = 64,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = splitWords(text);
  const kickerFrames = Math.max(1, Math.round(fps * KICKER_SECONDS));
  const headlineDelay = Math.round(fps * HEADLINE_DELAY_SECONDS);
  const staggerFrames = Math.max(1, Math.round(fps * STAGGER_SECONDS));
  const riseFrames = Math.max(1, Math.round(fps * RISE_SECONDS));

  const kickerProgress = interpolate(frame, [0, kickerFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: fontSize * 0.28,
        opacity: exitOpacity(frame, durationInFrames, fps),
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        textAlign: 'center',
      }}
    >
      {kickerText && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: fontSize * 0.22,
            opacity: kickerProgress,
            transform: `translateY(${(1 - kickerProgress) * 12}px)`,
          }}
        >
          {/* Rules on either side of the kicker — the visual convention that
              reads as a chapter marker rather than just smaller text. */}
          <span style={{ width: fontSize * 0.7, height: 2, background: color, opacity: 0.7 }} />
          <span
            style={{
              color,
              fontSize: Math.max(12, fontSize * 0.26),
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}
          >
            {kickerText}
          </span>
          <span style={{ width: fontSize * 0.7, height: 2, background: color, opacity: 0.7 }} />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          // Sized to its own content rather than left to the browser's
          // implicit flex-item-in-a-column-parent auto-sizing — see the
          // identical fix (and full explanation) in CinematicReveal.tsx,
          // which shares this exact per-word row structure.
          width: 'max-content',
          maxWidth: '90vw',
          gap: `${fontSize * 0.16}px ${fontSize * 0.26}px`,
          fontWeight: 800,
          fontSize,
          letterSpacing: '-0.02em',
        }}
      >
        {words.map((word, index) => {
          const progress = staggerProgress(
            frame - headlineDelay,
            index,
            staggerFrames,
            riseFrames
          );
          return (
            <span
              key={`${word}-${index}`}
              style={{
                display: 'inline-block',
                color,
                opacity: progress,
                transform: `translateY(${(1 - progress) * RISE_DISTANCE}px)`,
                textShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
