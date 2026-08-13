import React from 'react';
import { AbsoluteFill, Img } from 'remotion';

interface TitleCutoutCardProps {
  backgroundImageUrl?: string;
  foregroundImageUrl?: string;
  /** Fallback background color — used only when no background image is set. */
  color?: string;
  /** Uniform scale of the whole card, images included. Independent of the headline's own font size. */
  scale?: number;
  /**
   * Renders the animated headline. Supplied by the caller (`VideoComposition`)
   * rather than imported here, since the headline's animation is the EXISTING
   * `renderPreset` switch that already lives there — passing it in as a
   * render prop is what lets the headline reuse real kinetic-text motion
   * without this file importing VideoComposition (which would be circular,
   * as VideoComposition is what renders this component).
   */
  renderHeadline: () => React.ReactNode;
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
 */
export const TitleCutoutCard: React.FC<TitleCutoutCardProps> = ({
  backgroundImageUrl,
  foregroundImageUrl,
  color = '#111111',
  scale = 1,
  renderHeadline,
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
        {renderHeadline()}
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
