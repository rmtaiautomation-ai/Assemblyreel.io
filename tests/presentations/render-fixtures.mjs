import { loadSource } from './load-source.mjs';

const { CARD_STYLE_ORDER, CARD_STYLES } = await loadSource(new URL('../../src/remotion/templates/card-registry.ts', import.meta.url));
const { getComboConfigs, COMBO_PRESETS } = await loadSource(new URL('../../src/lib/combo-templates.ts', import.meta.url));

// Authored synthetic media: no customer content, paid API, attribution, or remote asset dependency.
const media = color => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1920"><rect width="1920" height="1920" fill="${color}"/><circle cx="960" cy="750" r="380" fill="#a7834c"/><path d="M0 1400L600 850L1150 1600L1550 1050L1920 1400V1920H0Z" fill="#263d4e"/></svg>`)}`;
const scene = { id: 'baseline-scene', mediaUrl: media('#15232b'), mediaType: 'image', durationInSeconds: 3, trimStartInSeconds: 0, kenBurnsEnabled: true };
const overlay = { id: 'baseline-overlay', kind: 'title-cutout-card', preset: 'pop', text: 'The ancient record', color: '#D6AD63', xPercent: 50, yPercent: 50, startInSeconds: 0, durationInSeconds: 3 };

export const renderFixtures = [
  ...CARD_STYLE_ORDER.map(styleId => ({
    name: `manual-${styleId}`, unchanged: true, frame: 45,
    props: { overlayClips: [{ ...overlay, kind: CARD_STYLES[styleId].kind, templateData: { styleId, bullets: ['Context', 'Source', 'Interpretation'], attribution: 'Fixture author', kicker: 'Archive study' } }] },
  })),
  ...COMBO_PRESETS.map(({ id }) => ({
    name: `ai-${id}`, unchanged: !['title_reveal', 'checklist', 'quote'].includes(id), frame: 45,
    props: { overlayClips: getComboConfigs(id, id === 'checklist' ? 'Context\nSource\nInterpretation' : 'The ancient record').map((config, index) => ({
      ...overlay, ...config, id: `combo-${index}`,
      // Matches the old write path for before captures, and the canonical one after.
      text: config.text ?? (config.kind === 'text' ? 'The ancient record' : ''),
    })) },
  })),
  ...[
    ['title', 'title-cutout-card', { style: 'default', text: 'The ancient record' }],
    ['quote', 'title-cutout-card', { style: 'quote-card', text: 'The ancient record' }],
    ['list', 'checklist-card', { style: 'default', items: ['Context', 'Source', 'Interpretation'] }],
  ].map(([name, kind, templateData]) => ({ name: `legacy-${name}`, unchanged: false, frame: 45, props: { overlayClips: [{ ...overlay, kind, text: '', templateData }] } })),
  { name: 'captions', unchanged: true, frame: 30, props: { showCaptions: true, captionWords: [
    { text: 'A', startMs: 0, endMs: 400 }, { text: ' surviving', startMs: 400, endMs: 900 }, { text: ' record', startMs: 900, endMs: 1600 },
  ] } },
  ...['none', 'crossfade', 'slide', 'zoom', 'glitch', 'light-leak'].map(type => ({
    name: `transition-${type}`, unchanged: true, frame: 54,
    props: { scenes: [{ ...scene, durationInSeconds: 2 }, { ...scene, id: 'second-scene', mediaUrl: media('#543426'), durationInSeconds: 2, transition: { type, durationInSeconds: 0.5 } }] },
  })),
].flatMap(fixture => [
  { ...fixture, name: `${fixture.name}-landscape`, props: { fps: 30, width: 1920, height: 1080, scenes: [scene], ...fixture.props } },
  { ...fixture, name: `${fixture.name}-portrait`, props: { fps: 30, width: 1080, height: 1920, scenes: [scene], ...fixture.props } },
]);
