import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { createTikTokStyleCaptions, type Caption, type TikTokPage } from '@remotion/captions';
import type { CaptionWord } from '../types';

/**
 * CapCut / TikTok-style burned-in captions.
 *
 * Word grouping and per-word timing come from `@remotion/captions`, which ships with
 * Remotion and is built for exactly this — hand-rolling the "how many words fit on a
 * line and when does each one light up" logic would be reimplementing a solved problem
 * with worse edge cases.
 *
 * The word timings themselves are free: Deepgram already transcribes the narration
 * during generation to align scene durations, and that result is now persisted rather
 * than discarded.
 */

/** Words closer together than this land on the same on-screen page. */
const PAGE_GROUPING_MS = 1200;

/** Vertical placement, as a percentage from the top. Clear of the CapCut UI zone. */
const CAPTION_BOTTOM_PERCENT = 18;

const ACTIVE_WORD_COLOR = '#FFD60A';
const INACTIVE_WORD_COLOR = '#FFFFFF';

export interface CaptionTrackProps {
  words: CaptionWord[];
}

export const CaptionTrack: React.FC<CaptionTrackProps> = ({ words }) => {
  const { fps } = useVideoConfig();

  const pages = useMemo(() => {
    if (!words || words.length === 0) return [];

    // `Caption` carries confidence and a midpoint timestamp that we deliberately do
    // not store. Neither affects grouping, so they are filled in rather than
    // persisted — see the CaptionWord docs.
    const captions: Caption[] = words.map((word) => ({
      text: word.text,
      startMs: word.startMs,
      endMs: word.endMs,
      timestampMs: (word.startMs + word.endMs) / 2,
      confidence: null,
    }));

    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: PAGE_GROUPING_MS,
    }).pages;
  }, [words]);

  if (pages.length === 0) return null;

  return (
    <>
      {pages.map((page, index) => {
        const from = Math.round((page.startMs / 1000) * fps);
        const durationInFrames = Math.max(1, Math.round((page.durationMs / 1000) * fps));

        return (
          <Sequence
            // startMs is unique per page and stable across re-renders, unlike the index
            // if grouping ever changes mid-edit.
            key={`caption-${page.startMs}-${index}`}
            from={from}
            durationInFrames={durationInFrames}
            layout="none"
          >
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // useCurrentFrame() is Sequence-relative, but token timings are absolute to the
  // whole narration — rebase before comparing, or every page after the first
  // highlights the wrong word.
  const absoluteMs = page.startMs + (frame / fps) * 1000;

  const entry = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 220, mass: 0.6 },
    durationInFrames: Math.round(fps * 0.25),
  });

  const scale = interpolate(entry, [0, 1], [0.86, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: `${CAPTION_BOTTOM_PERCENT}%`,
        paddingLeft: '8%',
        paddingRight: '8%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0.28em',
          transform: `scale(${scale})`,
          // Sized in vw-ish terms via em on the container so the same component reads
          // correctly at both 1080x1920 and 1920x1080 without per-format tuning.
          fontSize: '5.2em',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontWeight: 900,
          lineHeight: 1.15,
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive = absoluteMs >= token.fromMs && absoluteMs < token.toMs;

          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{
                color: isActive ? ACTIVE_WORD_COLOR : INACTIVE_WORD_COLOR,
                // Stroke + shadow rather than a background box: this is what keeps
                // text legible over arbitrary footage, which is the whole reason
                // CapCut captions look the way they do.
                WebkitTextStroke: '0.055em #000000',
                paintOrder: 'stroke fill',
                textShadow: '0 0.06em 0.12em rgba(0,0,0,0.55)',
                transform: isActive ? 'translateY(-0.03em)' : 'none',
                display: 'inline-block',
              }}
            >
              {token.text.trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
