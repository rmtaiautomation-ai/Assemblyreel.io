import { loadFont as hebrew } from '@remotion/google-fonts/NotoSansHebrew';
import { loadFont as syriac } from '@remotion/google-fonts/NotoSansSyriac';
import { loadFont as ethiopic } from '@remotion/google-fonts/NotoSerifEthiopic';
import { loadFont as cuneiform } from '@remotion/google-fonts/NotoSansCuneiform';
import { FONTS } from '../fonts';
import { loadFont as latin } from '@remotion/google-fonts/SourceSerif4';

/** Subsets/weights verified against the installed Remotion font metadata. Loaded on demand. */
export function loadScriptFont(script: string) {
  if (script === 'none') return { fontFamily: FONTS.serif,waitUntilDone: () => Promise.resolve() };
  const roman = latin('normal',{ weights: ['400'],subsets: ['latin','latin-ext'] });
  const combine = (font: { fontFamily: string; waitUntilDone: () => Promise<unknown> }) => ({ fontFamily: font.fontFamily,waitUntilDone: () => Promise.all([font.waitUntilDone(),roman.waitUntilDone()]) });
  switch (script) {
    case 'hebrew': return combine(hebrew('normal', { weights: ['400'], subsets: ['hebrew', 'latin','latin-ext'] }));
    case 'syriac': return combine(syriac('normal', { weights: ['400'], subsets: ['syriac', 'latin','latin-ext'] }));
    case 'ethiopic': return combine(ethiopic('normal', { weights: ['400'], subsets: ['ethiopic', 'latin','latin-ext'] }));
    case 'cuneiform': return combine(cuneiform('normal', { weights: ['400'], subsets: ['cuneiform', 'latin','latin-ext'] }));
    case 'latin': case 'transliteration-only': return roman;
    default: return { fontFamily: FONTS.serif, waitUntilDone: () => Promise.resolve() };
  }
}
