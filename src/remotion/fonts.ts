import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadSourceSerif } from '@remotion/google-fonts/SourceSerif4';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

/**
 * ── The four typefaces every composition draws with ──────────────────────
 *
 * Before this module existed NO font was loaded anywhere in the app. Nine
 * overlay components asked for `'Inter', 'Helvetica Neue', sans-serif` and got
 * whatever Chromium happened to have, because `next/font` in the Next.js
 * layout styles the WEB APP — its CSS never reaches the Remotion bundle, which
 * is compiled and rendered separately (on Lambda, in a headless browser with
 * no relation to the page the editor runs in).
 *
 * So the single biggest lever on whether output looks professional — the
 * typography — was unset. Loading these here fixes that for the existing
 * overlays and gives the card styles a real type system to design against.
 *
 * ── Why these four ──
 * Two of them are not a restyle at all, they are the app finally rendering
 * what it always declared: `Inter` is the family all nine overlay components
 * already name, and `JetBrains Mono` is what `Typewriter` already names. The
 * other two are new, used only by card styles: a condensed grotesque for
 * headline work and a serif for editorial/chapter cards.
 *
 * ── Why the weights are restricted ──
 * A bare `loadFont()` pulls every weight and subset of a family. Four families
 * unrestricted is a lot of woff2 to fetch on a Lambda cold start, on every
 * chunk. Each face below requests only the weights its designs actually use,
 * all from the `latin` subset. The available weight sets differ per family
 * (Oswald tops out at 700, Source Serif starts at 200) — the values here are
 * checked against each family's own metadata, and asking for a weight a family
 * does not publish is a silent no-op that yields a synthesized fake-bold.
 *
 * ── Why `waitUntilDone` matters (the Lambda-specific trap) ──
 * `loadFont` resolves asynchronously. Remotion renders a Lambda job as
 * independent CHUNKS on separate workers, so if frames are captured before the
 * face resolves, some frames get fallback metrics and others get the real
 * font — the type visibly changes partway through the video, and no error is
 * raised. `waitForFonts()` below exposes the combined promise so the
 * composition can hold rendering via `delayRender` until every face is ready.
 */

const LATIN = ['latin'] as const;

const inter = loadInter('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
  subsets: [...LATIN],
});

const oswald = loadOswald('normal', {
  // Oswald publishes 200-700 only; 700 is its heaviest.
  weights: ['400', '500', '600', '700'],
  subsets: [...LATIN],
});

const sourceSerif = loadSourceSerif('normal', {
  weights: ['400', '600', '700'],
  subsets: [...LATIN],
});

const jetBrainsMono = loadJetBrainsMono('normal', {
  weights: ['400', '500', '700'],
  subsets: [...LATIN],
});

/**
 * Resolved font-family strings, each with a real fallback stack so a face that
 * fails to load degrades to something of the same shape rather than to the
 * browser default.
 *
 * Always reference these rather than typing a family name inline — an inline
 * string is exactly how the app ended up asking for a font it never loaded.
 */
export const FONTS = {
  /** Body / UI sans. The default for overlay text. */
  sans: `${inter.fontFamily}, 'Helvetica Neue', Helvetica, Arial, sans-serif`,
  /** Condensed grotesque for headline work — title cards, big display type. */
  display: `${oswald.fontFamily}, 'Oswald', 'Arial Narrow', Impact, sans-serif`,
  /** Editorial serif for chapter plates and pulled quotes. */
  serif: `${sourceSerif.fontFamily}, 'Source Serif 4', Georgia, 'Times New Roman', serif`,
  /** Monospace for typewriter text and evidence/dossier styling. */
  mono: `${jetBrainsMono.fontFamily}, 'JetBrains Mono', 'Fira Code', 'Courier New', monospace`,
} as const;

export type FontKey = keyof typeof FONTS;

/**
 * Resolves once every face above is ready to draw.
 *
 * `VideoComposition` holds a `delayRender` handle on this. See the
 * `waitUntilDone` note in this file's header for why skipping it produces a
 * video whose typography changes partway through, on Lambda only.
 */
export const waitForFonts = (): Promise<unknown> =>
  Promise.all([
    inter.waitUntilDone(),
    oswald.waitUntilDone(),
    sourceSerif.waitUntilDone(),
    jetBrainsMono.waitUntilDone(),
  ]);
