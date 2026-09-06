/**
 * ── Text fitting for card styles ─────────────────────────────────────────
 *
 * A leaf module: imports nothing, so both `card-registry.ts` (whose `measure`
 * functions need a style's real line count and type size) and the style
 * components themselves can use it without the two importing each other.
 *
 * Everything here is deliberately arithmetic on character counts rather than
 * real text measurement. Remotion renders every frame independently and a
 * DOM-measure pass would have to happen after layout, which is both a
 * per-frame cost and unavailable to `measure()` at all — that runs in the
 * editor, outside any composition. Approximating from average glyph width is
 * accurate enough to keep a headline inside its card, which is the only
 * decision these numbers drive.
 */

/**
 * Average glyph advance as a fraction of font size, for the faces used by the
 * card styles. Uppercase condensed grotesques are much narrower than their
 * point size suggests, which is exactly why a naive fit overflows.
 */
export const GLYPH_WIDTH = {
  /** Oswald, uppercase. */
  displayUpper: 0.46,
  /** Inter, mixed case. */
  sans: 0.52,
  /** Source Serif 4, mixed case. */
  serif: 0.48,
  /** JetBrains Mono — a true fixed advance, so this one is exact. */
  mono: 0.6,
} as const;

/**
 * Splits a headline into 1-3 lines of roughly equal word count.
 *
 * Balancing by words rather than cutting at a character limit is what stops a
 * title ending on a single orphan word, the most common way stacked type looks
 * accidental.
 */
export const balanceLines = (text: string): string[] => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];
  const lineCount = words.length <= 3 ? 1 : words.length <= 6 ? 2 : 3;
  const perLine = Math.ceil(words.length / lineCount);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(' '));
  }
  return lines;
};

/**
 * Largest type size at which the longest of `lines` still fits `availableWidth`,
 * capped at `preferredSize`.
 *
 * This is what makes a stacked headline honest. Without it the component
 * balances a title into (say) two lines and then renders them at a size where
 * each one wraps AGAIN — so a 2-line design silently becomes four lines, one
 * of which is an orphan word, and the per-line reveal stagger no longer lines
 * up with the lines the viewer sees. Pair it with `whiteSpace: 'nowrap'`: the
 * fit decides the size, and nowrap guarantees the browser cannot re-break the
 * line behind its back.
 */
export const fitTextSize = (
  lines: string[],
  availableWidth: number,
  preferredSize: number,
  glyphWidth: number = GLYPH_WIDTH.displayUpper
): number => {
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (longest === 0) return preferredSize;
  return Math.min(preferredSize, availableWidth / (longest * glyphWidth));
};
