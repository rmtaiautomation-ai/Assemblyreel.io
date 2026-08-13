import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check } from 'lucide-react';
import { exitOpacity, staggerProgress } from '../overlays/kinetic-utils';

interface ChecklistCardProps {
  /** Card title, shown in the header bar. */
  text: string;
  bullets: string[];
  /** Header bar / checkmark accent color. */
  color?: string;
  /** Header title text color — independent of `color`, the header bar's own background/accent. */
  textColor?: string;
  fontSize?: number;
  /** Uniform scale of the whole card. Independent of `fontSize`, which only sizes the header title text. */
  scale?: number;
  durationInFrames: number;
}

const STAGGER_SECONDS = 0.15;
const RISE_SECONDS = 0.4;
const RISE_DISTANCE = 16;
/** Bullets start once the card's own entrance has mostly settled. */
const BULLET_DELAY_SECONDS = 0.25;

/**
 * A designed info card: colored header bar (holding `text` as the title) above
 * a body panel listing `bullets`, each prefixed with a checkmark.
 *
 * Structurally different from the plain kinetic-text presets — this composites
 * a layout with its own data rather than animating one block of words, which is
 * why it lives in `templates/` rather than `overlays/`. The card itself enters
 * with the same spring feel `PopIn` uses, then bullets stagger in one after
 * another via the shared `staggerProgress` helper every kinetic preset uses.
 *
 * A missing or empty `bullets` array (e.g. an old row written before this kind
 * existed) renders as header-only rather than throwing — `template_data` is
 * unenforced JSON, so the render path can't assume the shape is present.
 */
export const ChecklistCard: React.FC<ChecklistCardProps> = ({
  text,
  bullets,
  color = '#7C3AED',
  textColor = '#FFFFFF',
  fontSize = 28,
  scale = 1,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.8 },
  });
  const cardTranslate = interpolate(entranceSpring, [0, 1], [24, 0]);

  const bulletDelay = Math.round(fps * BULLET_DELAY_SECONDS);
  const staggerFrames = Math.max(1, Math.round(fps * STAGGER_SECONDS));
  const riseFrames = Math.max(1, Math.round(fps * RISE_SECONDS));

  const safeBullets = Array.isArray(bullets)
    ? bullets.filter((bullet) => typeof bullet === 'string' && bullet.trim().length > 0)
    : [];

  return (
    <div
      style={{
        opacity: entranceSpring * exitOpacity(frame, durationInFrames, fps),
        // translateY first so its percent-free px value isn't affected by scale,
        // then scale — same transform-order reasoning KenBurns uses for its pan.
        transform: `translateY(${cardTranslate}px) scale(${scale})`,
        width: 420,
        maxWidth: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      }}
    >
      <div
        style={{
          background: color,
          padding: '14px 20px',
          fontSize,
          fontWeight: 800,
          color: textColor,
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </div>

      {safeBullets.length > 0 && (
        <div
          style={{
            background: 'rgba(15,15,25,0.85)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {safeBullets.map((bullet, index) => {
            const progress = staggerProgress(frame - bulletDelay, index, staggerFrames, riseFrames);
            return (
              <div
                key={`${bullet}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  opacity: progress,
                  transform: `translateY(${(1 - progress) * RISE_DISTANCE}px)`,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: fontSize * 0.75,
                    height: fontSize * 0.75,
                    borderRadius: '50%',
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  }}
                >
                  <Check size={fontSize * 0.5} color="#FFFFFF" strokeWidth={3} />
                </div>
                <span
                  style={{
                    color: '#FFFFFF',
                    fontSize: fontSize * 0.64,
                    fontWeight: 500,
                    lineHeight: 1.35,
                  }}
                >
                  {bullet}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
