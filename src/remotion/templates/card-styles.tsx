import React from 'react';
import type { ChecklistCardData, OverlayClipData, TitleCutoutCardData } from '../types';
import type { CardStyleId } from './card-registry';
import { CARD_STYLES } from './card-registry';
import { useCardMetrics } from './card-utils';
import { ChecklistCard } from './ChecklistCard';
import { TitleCutoutCard } from './TitleCutoutCard';
import { BroadcastBar } from './titles/BroadcastBar';
import { DossierStamp } from './titles/DossierStamp';
import { SerifPlate } from './titles/SerifPlate';
import { StackWipe } from './titles/StackWipe';
import { QuoteCard } from './titles/QuoteCard';
import { Ledger } from './lists/Ledger';
import { NumberedStack } from './lists/NumberedStack';
import { TickSheet } from './lists/TickSheet';
import { SideRail } from './lists/SideRail';
import { EvidenceList } from './lists/EvidenceList';

/**
 * ── The graphic-card style registry (component half) ─────────────────────
 *
 * Maps a `CardStyleId` to the component that draws it. Split from
 * `card-registry.ts` so that module stays React-free and can be imported by
 * the Timeline Editor purely for geometry — see the layering note there.
 *
 * Every style takes the SAME props (`CardStyleProps`), so the composition
 * needs one lookup instead of a branch per design. Each entry is a thin
 * adapter that destructures the clip and calls a presentational component,
 * which keeps the drawing components themselves dumb and independently
 * testable rather than coupling all twelve of them to `OverlayClipData`.
 */

export interface CardStyleProps {
  clip: OverlayClipData;
  durationInFrames: number;
}

export const CARD_STYLE_COMPONENTS: Record<CardStyleId, React.FC<CardStyleProps>> = {
  'cutout-hero': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <TitleCutoutCard
        backgroundImageUrl={data?.backgroundImageUrl}
        foregroundImageUrl={data?.foregroundImageUrl}
        color={clip.color}
        scale={data?.scale}
        text={clip.text}
        preset={clip.preset}
        // The headline never reads `clip.color` — for this kind that field
        // means "fallback background colour". Its own colour is the
        // independent `template_data.textColor`.
        textColor={data?.textColor}
        fontSize={clip.fontSize}
        kickerText={clip.kickerText}
        durationInFrames={durationInFrames}
      />
    );
  },

  'ledger-classic': ({ clip, durationInFrames }) => {
    // `template_data` is unenforced JSON — a row with a missing or
    // wrongly-typed `bullets` still renders (header-only), it never throws.
    const data = clip.templateData as ChecklistCardData | undefined;
    const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
    return (
      <ChecklistCard
        text={clip.text}
        bullets={bullets}
        color={clip.color}
        textColor={data?.textColor}
        fontSize={clip.fontSize}
        scale={data?.scale}
        durationInFrames={durationInFrames}
      />
    );
  },

  // ── Title Card styles ──
  //
  // Each adapter resolves the clip's colours the same way: `clip.color` is the
  // ACCENT for these styles (rules, kickers, numerals) and `templateData
  // .textColor` is the wording, defaulting white. That split is inherited from
  // the two legacy designs, where `color` never meant "the text".

  'broadcast-bar': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <BroadcastBar
        text={clip.text}
        kicker={data?.kicker}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['broadcast-bar'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'dossier-stamp': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <DossierStamp
        text={clip.text}
        kicker={data?.kicker}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['dossier-stamp'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'serif-plate': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <SerifPlate
        text={clip.text}
        kicker={data?.kicker}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['serif-plate'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'stack-wipe': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <StackWipe
        text={clip.text}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['stack-wipe'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'quote-card': ({ clip, durationInFrames }) => {
    const data = clip.templateData as TitleCutoutCardData | undefined;
    return (
      <QuoteCard
        text={clip.text}
        attribution={data?.attribution}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['quote-card'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  // ── List / Checklist styles ──

  ledger: ({ clip, durationInFrames }) => {
    const data = clip.templateData as ChecklistCardData | undefined;
    return (
      <Ledger
        text={clip.text}
        bullets={safeBullets(data)}
        showDividers={data?.showDividers ?? true}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES.ledger, clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'numbered-stack': ({ clip, durationInFrames }) => {
    const data = clip.templateData as ChecklistCardData | undefined;
    return (
      <NumberedStack
        text={clip.text}
        bullets={safeBullets(data)}
        startNumber={typeof data?.startNumber === 'number' ? data.startNumber : 1}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['numbered-stack'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'tick-sheet': ({ clip, durationInFrames }) => {
    const data = clip.templateData as ChecklistCardData | undefined;
    return (
      <TickSheet
        text={clip.text}
        bullets={safeBullets(data)}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['tick-sheet'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'side-rail': ({ clip, durationInFrames }) => {
    const data = clip.templateData as ChecklistCardData | undefined;
    return (
      <SideRail
        text={clip.text}
        bullets={safeBullets(data)}
        edgeSide={data?.edgeSide === 'right' ? 'right' : 'left'}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['side-rail'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },

  'evidence-list': ({ clip, durationInFrames }) => {
    const data = clip.templateData as ChecklistCardData | undefined;
    return (
      <EvidenceList
        text={clip.text}
        bullets={safeBullets(data)}
        color={clip.color}
        textColor={data?.textColor ?? '#FFFFFF'}
        metrics={useCardMetrics(CARD_STYLES['evidence-list'], clip)}
        durationInFrames={durationInFrames}
      />
    );
  },
};

/**
 * `template_data` is unenforced JSON, so a row can carry a missing, non-array,
 * or partly non-string `bullets`. Every list style takes its rows through here
 * rather than trusting the shape — an old row renders empty, it never throws
 * mid-render.
 */
function safeBullets(data: ChecklistCardData | undefined): string[] {
  if (!Array.isArray(data?.bullets)) return [];
  return data.bullets.filter((b): b is string => typeof b === 'string' && b.trim().length > 0);
}

/**
 * Rendered when a clip names a style this build does not have.
 *
 * Deliberately loud and ugly. The realistic way to hit this is a STALE LAMBDA
 * BUNDLE: `REMOTION_SERVE_URL` points at a frozen site that is only rebuilt by
 * `npm run deploy:remotion`, and the render route prefers Lambda whenever it
 * is configured. If an unknown style quietly fell back to another design, the
 * Player would look perfect while the export rendered the wrong graphic, with
 * nothing thrown and nothing logged — the single easiest way for this feature
 * to ship broken. A magenta box in the export is a bug report that writes
 * itself.
 */
export const UnknownCardStyle: React.FC<{ styleId: unknown }> = ({ styleId }) => (
  <div
    style={{
      padding: '16px 20px',
      maxWidth: 520,
      background: '#FF00A8',
      color: '#FFFFFF',
      border: '4px solid #FFFFFF',
      borderRadius: 4,
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      fontSize: 22,
      fontWeight: 700,
      lineHeight: 1.35,
      textAlign: 'center',
    }}
  >
    UNKNOWN CARD STYLE
    <div style={{ fontSize: 18, fontWeight: 400, marginTop: 6, wordBreak: 'break-all' }}>
      {typeof styleId === 'string' ? styleId : String(styleId)}
    </div>
    <div style={{ fontSize: 14, fontWeight: 400, marginTop: 10, opacity: 0.9 }}>
      Run: npm run deploy:remotion
    </div>
  </div>
);
