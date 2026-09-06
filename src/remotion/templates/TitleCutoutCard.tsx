import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { OverlayPreset } from '../types';
import { renderPreset } from '../overlays/renderPreset';

interface TitleCutoutCardProps {
  backgroundImageUrl?: string;
  foregroundImageUrl?: string;
  /** Fallback background color — used only when no background image is set. */
  color?: string;
  /** Uniform scale of the whole card, images included. Independent of the headline's own font size. */
  scale?: number;
  /** The headline wording, and how it animates in. */
  text: string;
  preset: OverlayPreset;
  /**
   * Headline text color. Deliberately NOT `color` — for this template `color`
   * means the fallback background, so the headline needs its own field.
   */
  textColor?: string;
  fontSize?: number;
  /** Small label above the headline. Only read by the 'chapter-card' preset. */
  kickerText?: string;
  durationInFrames: number;
}

const CARD_WIDTH = 400;
const CARD_HEIGHT = 500;

/**
 * A designed title card: a background image (or solid-color fallback) filling
 * the card edge-to-edge, an animated headline layered above it, and an
 * optional foreground cutout image layered on top of both — e.g. a name over
 * a sky background with a statue cutout standing in front of it.
 *
 * Structurally different from the plain kinetic-text presets — this composites
 * a background and up to two images with a layout, rather than animating one
 * block of words — which is why it lives in `templates/` rather than
 * `overlays/`. Layering a foreground image over a background is the one
 * genuinely new rendering technique in this template: nothing else in this
 * app currently stacks two images. The foreground relies entirely on the
 * source PNG's own alpha channel — this app performs no cutout/background-
 * removal processing of its own.
 *
 * Missing images (an old row, or a template with neither slot filled) degrade
 * gracefully — a solid-color background and no foreground layer — rather than
 * throwing, since `template_data` is unenforced JSON.
 *
 * The headline reuses the same eight kinetic-text presets every other overlay
 * animates with, imported directly from `overlays/renderPreset`. It used to
 * arrive as a `renderHeadline` render prop because that switch was trapped
 * inside `VideoComposition`, which this file cannot import (circular — that
 * component is what renders this one). Now that it is a leaf module, the
 * indirection is unnecessary.
 */
export const TitleCutoutCard: React.FC<TitleCutoutCardProps> = ({
  backgroundImageUrl,
  foregroundImageUrl,
  color = '#111111',
  scale = 1,
  text,
  preset,
  textColor,
  fontSize,
  kickerText,
  durationInFrames,
}) => {
  return (
    <div
      style={{
        position: 'relative',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        maxWidth: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        // transform-origin defaults to center, so this scales evenly around the
        // same point OverlayFrame already centres on xPercent/yPercent — the
        // card doesn't drift as it grows/shrinks.
        transform: `scale(${scale})`,
      }}
    >
      {backgroundImageUrl ? (
        <Img
          src={backgroundImageUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: color }} />
      )}

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {renderPreset(preset, { text, color: textColor, fontSize, durationInFrames }, kickerText)}
      </AbsoluteFill>

      {foregroundImageUrl && (
        <Img
          src={foregroundImageUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
    </div>
  );
};
