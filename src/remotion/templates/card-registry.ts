import type { ChecklistCardData, OverlayClipKind, TitleCutoutCardData } from '../types';
import { balanceLines, fitTextSize } from './card-text';

/**
 * ── The graphic-card style registry (data half) ──────────────────────────
 *
 * A "graphic card" is an OV-track clip that composites a designed LAYOUT
 * rather than animating one block of words — the `checklist-card` and
 * `title-cutout-card` kinds. Each kind is not one design but a LIBRARY of
 * interchangeable styles, the way a professional motion-graphics pack ships
 * ten list designs rather than one.
 *
 * WHY A STYLE, NOT A KIND
 * A variant could have been a new `OverlayClipKind`. It isn't, because `kind`
 * is load-bearing in eight places (lane packing, chip accent + icon, the add
 * menu, z-order, the environmental predicate, defaults, the resize handler,
 * the inspector). Adding a design should not touch any of them. Instead the
 * design lives in `template_data.styleId`, which is unenforced JSON — so a new
 * style is a code change with NO database migration, exactly as
 * `db/add-overlay-clip-templates.sql` anticipated.
 *
 * WHY THIS MODULE HAS NO JSX
 * `measure()` is called by the Timeline Editor (a client component) to size
 * the drag-to-reposition box in the preview. The React components live in the
 * sibling `card-styles.tsx`. Keeping geometry apart from rendering means the
 * editor's math never imports JSX, and the layering stays acyclic:
 *
 *     overlays/ ← templates/ ← card-styles.tsx ← VideoComposition
 *                            ↖ card-registry.ts ← TimelineEditor
 *
 * EXHAUSTIVENESS
 * `CARD_STYLES` is typed `Record<CardStyleId, CardStyleDefinition>` over a
 * literal union, so forgetting an entry is a compile error. That deliberately
 * reproduces the safety net `Record<OverlayClipKind, …>` gives on the maps in
 * TimelineEditor — the one real thing given up by choosing styleId over kind.
 */

/** Every shipping style id. Adding one here forces every map below to handle it. */
export type CardStyleId =
  // ── Title Card styles (kind: 'title-cutout-card') ──
  | 'cutout-hero'
  | 'broadcast-bar'
  | 'dossier-stamp'
  | 'serif-plate'
  | 'stack-wipe'
  | 'quote-card'
  // ── List / Checklist styles (kind: 'checklist-card') ──
  | 'ledger-classic'
  | 'ledger'
  | 'numbered-stack'
  | 'tick-sheet'
  | 'side-rail'
  | 'evidence-list';

/** The kinds that are graphic cards, i.e. the ones this registry governs. */
export type CardKind = Extract<OverlayClipKind, 'checklist-card' | 'title-cutout-card'>;

export const isCardKind = (kind: OverlayClipKind): kind is CardKind =>
  kind === 'checklist-card' || kind === 'title-cutout-card';

/**
 * Which inspector controls a style actually uses.
 *
 * The inspector renders from this list instead of branching on `kind`. Without
 * it, a quote style would still show the two image pickers the title kind
 * hard-codes today, and the panel would grow one arm per design.
 */
export type CardField =
  | 'text'
  | 'bullets'
  | 'accentColor'
  | 'textColor'
  | 'backgroundColor'
  | 'backgroundImage'
  | 'foregroundImage'
  | 'attribution'
  | 'kicker'
  | 'startNumber'
  | 'showDividers'
  | 'edgeSide'
  | 'animationPreset'
  | 'fontSize'
  | 'scale';

/** Composition-pixel footprint of a rendered card. */
export interface CardBox {
  width: number;
  height: number;
}

/** The subset of a clip `measure()` is allowed to read. */
export interface MeasurableClip {
  text: string;
  fontSize?: number;
  templateData?: unknown;
}

export interface CardStyleDefinition {
  id: CardStyleId;
  kind: CardKind;
  /** Shown in the style picker. */
  label: string;
  /** One line under the label in the picker. */
  description: string;
  /** Which inspector controls to render for this style. */
  fields: CardField[];
  /**
   * Default `template_data` merged in when a clip switches TO this style.
   * Only fills gaps — it never overwrites content the user already has, which
   * is what makes flipping between styles lossless.
   */
  defaults: Record<string, unknown>;
  /**
   * The style's natural type size, in composition px against a 1080-wide
   * frame. Doubles as the denominator that turns the clip's stored `fontSize`
   * into a proportional multiplier — see `cardMetrics` in `card-utils.ts`.
   */
  defaultFontSize: number;
  /**
   * Card width as a fraction of composition width. Omitted by the two legacy
   * styles, whose geometry is frozen in absolute pixels; every style added
   * after them sets it so one design reads correctly at all three export
   * sizes. Values above 0.9 also need `fullBleed`, since `OverlayFrame` clamps
   * its child to 90%.
   */
  widthFraction?: number;
  /**
   * Footprint in COMPOSITION pixels, at the clip's current scale.
   *
   * Must apply `template_data.scale` itself: every card sizes via CSS
   * `transform: scale()`, which does not affect layout, so a caller measuring
   * "intrinsic size" would get a box that disagrees with what's on screen.
   *
   * Takes the composition dimensions because frame-relative styles derive
   * their width from them. The two legacy styles ignore `video` entirely and
   * return their historical fixed pixel sizes.
   */
  measure: (clip: MeasurableClip, video: { width: number; height: number }) => CardBox;
  /**
   * Set when the style paints beyond 90% of the frame width. `OverlayFrame`
   * clamps its child to `maxWidth: 90%`, which would silently squeeze a
   * full-bleed design, so these bypass it.
   */
  fullBleed?: boolean;
}

const readScale = (clip: MeasurableClip): number =>
  (clip.templateData as { scale?: number } | undefined)?.scale ?? 1;

/** Resolved geometry for one style at one composition size. */
export interface CardMetrics {
  /** Card width in composition px, user scale applied. */
  cardWidth: number;
  /** User scale multiplier from `template_data.scale`. */
  scale: number;
  /**
   * Type multiplier from `clip.fontSize`, relative to the style's own natural
   * size — so a style's proportions hold and the stored column stays an
   * ordinary number. See the header of `card-utils.ts`.
   */
  textScale: number;
  video: { width: number; height: number };
}

/**
 * The one implementation of card geometry.
 *
 * Lives HERE, not in `card-utils`, because the `measure` functions below need
 * it and `card-utils` imports this module — putting it there would make the
 * two import each other at runtime. `card-utils` wraps this in a hook for the
 * components, so the drag box and the render are computing from the same
 * arithmetic rather than from two copies that can drift.
 */
export const cardMetricsForStyle = (
  style: CardStyleDefinition,
  clip: MeasurableClip,
  video: { width: number; height: number }
): CardMetrics => {
  const scale = readScale(clip);
  const widthFraction = style.widthFraction ?? 0.42;
  const textScale = (clip.fontSize ?? style.defaultFontSize) / style.defaultFontSize;
  return { cardWidth: video.width * widthFraction * scale, scale, textScale, video };
};

/**
 * Shorthand for a `measure` implementation to get its own metrics by id.
 * Safe despite referencing `CARD_STYLES` before its initialiser completes:
 * every caller is inside a `measure` closure, which only ever runs after the
 * module has finished evaluating.
 */
const metricsFor = (
  id: CardStyleId,
  clip: MeasurableClip,
  video: { width: number; height: number }
): CardMetrics => cardMetricsForStyle(CARD_STYLES[id], clip, video);

const readBullets = (clip: MeasurableClip): string[] => {
  const bullets = (clip.templateData as ChecklistCardData | undefined)?.bullets;
  return Array.isArray(bullets) ? bullets.filter((b) => typeof b === 'string' && b.trim().length > 0) : [];
};

export const CARD_STYLES: Record<CardStyleId, CardStyleDefinition> = {
  /**
   * The original `TitleCutoutCard` design, preserved exactly: a fixed 400x500
   * rounded box. Kept pixel-identical so every clip written before styles
   * existed renders unchanged — it is the fallback `styleId` for such rows,
   * and its geometry must never become frame-relative.
   */
  'cutout-hero': {
    id: 'cutout-hero',
    kind: 'title-cutout-card',
    label: 'Cutout Hero',
    description: 'Background image with a headline and an optional cutout in front.',
    fields: ['text', 'animationPreset', 'textColor', 'backgroundColor', 'backgroundImage', 'foregroundImage', 'fontSize', 'scale'],
    defaults: {} satisfies TitleCutoutCardData,
    defaultFontSize: 64,
    measure: (clip) => {
      const scale = readScale(clip);
      return { width: 400 * scale, height: 500 * scale };
    },
  },

  /**
   * The original `ChecklistCard` design, preserved exactly: a 420px-wide card
   * with a coloured header bar over a dark bullet panel. Same contract as
   * `cutout-hero` — it is the fallback for pre-styles rows, so its geometry is
   * frozen. The row-height constants below mirror the component's own padding
   * and gap; they are the historical values from the editor's bounding-box
   * estimate and are intentionally approximate.
   */
  'ledger-classic': {
    id: 'ledger-classic',
    kind: 'checklist-card',
    label: 'Ledger (Classic)',
    description: 'Coloured header bar above a dark panel of ticked bullets.',
    fields: ['text', 'bullets', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { bullets: ['First point', 'Second point', 'Third point'] } satisfies ChecklistCardData,
    defaultFontSize: 28,
    measure: (clip) => {
      const scale = readScale(clip);
      const bulletCount = readBullets(clip).length;
      return { width: 420 * scale, height: (60 + bulletCount * 36 + 32) * scale };
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // Title Card styles
  //
  // Every style below is frame-relative: `widthFraction` resolves against
  // composition width, and each `measure` mirrors the arithmetic its
  // component uses so the editor's drag box tracks what actually renders.
  // ──────────────────────────────────────────────────────────────────────

  'broadcast-bar': {
    id: 'broadcast-bar',
    kind: 'title-cutout-card',
    label: 'Broadcast Bar',
    description: 'Kicker, a rule that wipes out, headline rising from behind a mask.',
    fields: ['text', 'kicker', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { kicker: 'CHAPTER ONE' } satisfies TitleCutoutCardData,
    defaultFontSize: 64,
    widthFraction: 0.62,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('broadcast-bar', clip, video);
      // Mirrors the component's own balance-and-fit — see the note on
      // `stack-wipe`'s measure.
      const lines = balanceLines(clip.text);
      const headline = fitTextSize(lines, cardWidth, cardWidth * 0.115) * textScale;
      const kicker = Math.max(10, headline * 0.26);
      const hasKicker = Boolean((clip.templateData as TitleCutoutCardData | undefined)?.kicker);
      return {
        width: cardWidth,
        height:
          (hasKicker ? kicker * 1.7 : 0) +
          Math.max(2, cardWidth * 0.004) +
          headline * 0.3 +
          headline * 1.08 * lines.length,
      };
    },
  },

  'dossier-stamp': {
    id: 'dossier-stamp',
    kind: 'title-cutout-card',
    label: 'Dossier Stamp',
    description: 'Mono reference line and condensed headline inside a bracket frame.',
    fields: ['text', 'kicker', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { kicker: 'FILE 03 — 1947' } satisfies TitleCutoutCardData,
    defaultFontSize: 60,
    widthFraction: 0.58,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('dossier-stamp', clip, video);
      const headline = cardWidth * 0.105 * textScale;
      const kicker = Math.max(9, headline * 0.24);
      const pad = cardWidth * 0.055;
      const hasKicker = Boolean((clip.templateData as TitleCutoutCardData | undefined)?.kicker);
      return {
        width: cardWidth,
        height: pad * 2 + (hasKicker ? kicker * 1.8 : 0) + headline * 1.04,
      };
    },
  },

  'serif-plate': {
    id: 'serif-plate',
    kind: 'title-cutout-card',
    label: 'Serif Plate',
    description: 'Full-frame scrim with a centred serif headline between two rules.',
    fields: ['text', 'kicker', 'accentColor', 'textColor', 'fontSize'],
    defaults: { kicker: 'PART ONE' } satisfies TitleCutoutCardData,
    defaultFontSize: 64,
    // Covers the frame — it is a chapter break, not a label. See the note on
    // `fullBleed` about why OverlayFrame must be bypassed for this.
    widthFraction: 1,
    fullBleed: true,
    measure: (_clip, video) => ({ width: video.width, height: video.height }),
  },

  'stack-wipe': {
    id: 'stack-wipe',
    kind: 'title-cutout-card',
    label: 'Stack Wipe',
    description: 'Headline broken to two or three lines, each wiping up in turn.',
    fields: ['text', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: {} satisfies TitleCutoutCardData,
    defaultFontSize: 64,
    widthFraction: 0.6,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('stack-wipe', clip, video);
      // Mirrors StackWipe's own fit exactly, via the shared `card-text`
      // helpers — the component auto-shrinks its type to stop balanced lines
      // re-wrapping, so a box computed from the unfitted size would be too
      // tall for any headline long enough to trigger the shrink.
      const lines = balanceLines(clip.text);
      const barWidth = Math.max(3, cardWidth * 0.008);
      const textWidth = cardWidth - barWidth - cardWidth * 0.04;
      const headline = fitTextSize(lines, textWidth, cardWidth * 0.125) * textScale;
      return { width: cardWidth, height: headline * 0.92 * lines.length };
    },
  },

  'quote-card': {
    id: 'quote-card',
    kind: 'title-cutout-card',
    label: 'Quote Card',
    description: 'Oversized quote mark, serif body, attribution beneath a rule.',
    // The style that proves `fields` earns its keep: it must NOT show the two
    // image pickers the title kind used to hard-code, and it is the only one
    // that shows `attribution`.
    fields: ['text', 'attribution', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { attribution: 'Source' } satisfies TitleCutoutCardData,
    defaultFontSize: 52,
    widthFraction: 0.6,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('quote-card', clip, video);
      const quote = cardWidth * 0.072 * textScale;
      const mark = cardWidth * 0.26;
      // Rough line estimate — this only sizes an invisible drag target.
      const lines = Math.max(1, Math.ceil(clip.text.length / 42));
      const hasAttribution = Boolean((clip.templateData as TitleCutoutCardData | undefined)?.attribution);
      return {
        width: cardWidth,
        height: mark * 0.3 + quote * 1.32 * lines + (hasAttribution ? quote * 1.1 : 0),
      };
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // List / Checklist styles
  // ──────────────────────────────────────────────────────────────────────

  ledger: {
    id: 'ledger',
    kind: 'checklist-card',
    label: 'Ledger',
    description: 'Accent bar and hairline rows; each tick strikes after its row lands.',
    fields: ['text', 'bullets', 'showDividers', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: {
      bullets: ['First point', 'Second point', 'Third point'],
      showDividers: true,
    } satisfies ChecklistCardData,
    defaultFontSize: 44,
    widthFraction: 0.52,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('ledger', clip, video);
      const title = cardWidth * 0.082 * textScale;
      const row = title * 0.62;
      const gap = row * 0.72;
      const rows = readBullets(clip).length;
      return { width: cardWidth, height: title * 1.1 + gap + rows * (row * 1.34 + gap * 1.1) };
    },
  },

  'numbered-stack': {
    id: 'numbered-stack',
    kind: 'checklist-card',
    label: 'Numbered Stack',
    description: 'Oversized accent numerals with the item set alongside.',
    fields: ['text', 'bullets', 'startNumber', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: {
      bullets: ['First point', 'Second point', 'Third point'],
      startNumber: 1,
    } satisfies ChecklistCardData,
    defaultFontSize: 44,
    widthFraction: 0.54,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('numbered-stack', clip, video);
      const title = cardWidth * 0.075 * textScale;
      const numeral = title * 1.15;
      const row = title * 0.6;
      const rows = readBullets(clip).length;
      return {
        width: cardWidth,
        height: (clip.text ? title * 0.42 + row * 0.9 : 0) + rows * (numeral + row * 0.62),
      };
    },
  },

  'tick-sheet': {
    id: 'tick-sheet',
    kind: 'checklist-card',
    label: 'Tick Sheet',
    description: 'Real checkboxes whose ticks draw themselves stroke by stroke.',
    fields: ['text', 'bullets', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { bullets: ['First point', 'Second point', 'Third point'] } satisfies ChecklistCardData,
    defaultFontSize: 44,
    widthFraction: 0.5,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('tick-sheet', clip, video);
      const title = cardWidth * 0.078 * textScale;
      const row = title * 0.6;
      const rows = readBullets(clip).length;
      return {
        width: cardWidth,
        height: (clip.text ? title * 1.1 + row : 0) + rows * (row * 1.5 + row * 0.72),
      };
    },
  },

  'side-rail': {
    id: 'side-rail',
    kind: 'checklist-card',
    label: 'Side Rail',
    description: 'Edge-anchored rows that slide in from off-frame.',
    fields: ['text', 'bullets', 'edgeSide', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: {
      bullets: ['First point', 'Second point', 'Third point'],
      edgeSide: 'left',
    } satisfies ChecklistCardData,
    defaultFontSize: 44,
    // `widthFraction` here sizes TYPE, not the visible column — it feeds
    // `cardMetricsForStyle`, which the component uses to size its title/row
    // text. That is independent of `fullBleed`, which only controls whether
    // `OverlayFrame` positions and clamps the OUTER box. Setting this to 1
    // made the component compute type off the full frame width while its own
    // CSS clamped the visible column to 52% — oversized text in a narrow
    // column wrapped hard and the block overflowed past the top of the frame.
    widthFraction: 0.4,
    // Anchored to a frame edge, so the outer box must not be centred or
    // clamped by OverlayFrame — it positions itself full-frame instead.
    fullBleed: true,
    measure: (_clip, video) => ({ width: video.width, height: video.height }),
  },

  'evidence-list': {
    id: 'evidence-list',
    kind: 'checklist-card',
    label: 'Evidence List',
    description: 'Monospaced index with reference markers. Pairs with Dossier Stamp.',
    fields: ['text', 'bullets', 'accentColor', 'textColor', 'fontSize', 'scale'],
    defaults: { bullets: ['First point', 'Second point', 'Third point'] } satisfies ChecklistCardData,
    defaultFontSize: 40,
    widthFraction: 0.56,
    measure: (clip, video) => {
      const { cardWidth, textScale } = metricsFor('evidence-list', clip, video);
      const header = cardWidth * 0.05 * textScale;
      const row = header * 0.86;
      const rows = readBullets(clip).length;
      return {
        width: cardWidth,
        height: header * 1.8 + (clip.text ? header * 2.1 : 0) + rows * (row * 1.42 + row * 0.84),
      };
    },
  },
};

/**
 * Picker order, listed explicitly rather than derived from `Object.keys` —
 * object key order is an implementation detail, and the legacy styles should
 * stay first so existing projects see their own design at the top.
 *
 * The `satisfies` clause plus `STYLE_ORDER_IS_COMPLETE` below make a forgotten
 * entry a compile error: a style that exists but is missing from this array
 * would render correctly yet be unreachable in the picker, which is the kind
 * of omission that survives review.
 */
export const CARD_STYLE_ORDER = [
  // Title cards
  'cutout-hero',
  'broadcast-bar',
  'dossier-stamp',
  'serif-plate',
  'stack-wipe',
  'quote-card',
  // Lists
  'ledger-classic',
  'ledger',
  'numbered-stack',
  'tick-sheet',
  'side-rail',
  'evidence-list',
] as const satisfies readonly CardStyleId[];

/**
 * Compile-time proof that `CARD_STYLE_ORDER` names every style. If a new id is
 * added to `CardStyleId` and not to the array, `Exclude<…>` stops being `never`
 * and this line fails to typecheck.
 */
type _StyleOrderIsComplete = Exclude<CardStyleId, (typeof CARD_STYLE_ORDER)[number]> extends never
  ? true
  : ['CARD_STYLE_ORDER is missing a style', Exclude<CardStyleId, (typeof CARD_STYLE_ORDER)[number]>];
const STYLE_ORDER_IS_COMPLETE: _StyleOrderIsComplete = true;
void STYLE_ORDER_IS_COMPLETE;

/** Every style belonging to a kind, in picker order. */
export const cardStylesForKind = (kind: CardKind): CardStyleDefinition[] =>
  CARD_STYLE_ORDER.map((id) => CARD_STYLES[id]).filter((style) => style.kind === kind);

/** The style a clip of this kind gets when it has no `styleId` — i.e. every pre-styles row. */
export const LEGACY_STYLE_FOR_KIND: Record<CardKind, CardStyleId> = {
  'title-cutout-card': 'cutout-hero',
  'checklist-card': 'ledger-classic',
};

const isCardStyleId = (value: unknown): value is CardStyleId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CARD_STYLES, value);

/**
 * The style a clip should render as, or `null` when it names one this build
 * does not have.
 *
 * `null` is NOT "fall back to the legacy design". A row can legitimately carry
 * a styleId from a newer deploy — most importantly when the Lambda site bundle
 * is stale (see `lambda-config.ts`), because that bundle is frozen until
 * `npm run deploy:remotion` is re-run. Silently substituting another design
 * there produces a wrong export with no error anywhere, so callers must render
 * a visible marker instead. Resolving to a definition and failing to resolve
 * are different outcomes and the type says so.
 */
export const resolveCardStyle = (
  kind: OverlayClipKind,
  styleId: unknown
): CardStyleDefinition | null => {
  if (!isCardKind(kind)) return null;
  if (styleId === undefined || styleId === null || styleId === '') {
    return CARD_STYLES[LEGACY_STYLE_FOR_KIND[kind]];
  }
  if (!isCardStyleId(styleId)) return null;
  const style = CARD_STYLES[styleId];
  // A styleId belonging to the OTHER kind is data corruption, not a newer
  // deploy — treat it as unresolvable rather than rendering a list design
  // inside a title clip.
  return style.kind === kind ? style : null;
};

/** Reads `template_data.styleId` off a clip without asserting the whole shape. */
export const readStyleId = (templateData: unknown): unknown =>
  (templateData as { styleId?: unknown } | undefined)?.styleId;

/**
 * Footprint of whatever the clip currently renders as, for the editor's
 * drag box. Unknown styles fall back to the kind's legacy geometry — here a
 * rough box is strictly better than none, since this only sizes an invisible
 * drag target and never affects the render.
 */
export const measureCard = (
  kind: OverlayClipKind,
  clip: MeasurableClip,
  video: { width: number; height: number }
): CardBox | null => {
  if (!isCardKind(kind)) return null;
  const style = resolveCardStyle(kind, readStyleId(clip.templateData))
    ?? CARD_STYLES[LEGACY_STYLE_FOR_KIND[kind]];
  return style.measure(clip, video);
};
