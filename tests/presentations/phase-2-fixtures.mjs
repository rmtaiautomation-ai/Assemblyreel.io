import { loadSource } from './load-source.mjs';
import { envelope, assets, projectId, sceneId, actorId, otherActorId, mediaIds } from './phase-1-fixtures.mjs';
export { assets, projectId, sceneId, actorId, otherActorId, mediaIds };
const { createPresentationDraft } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const source = { credit: 'Authored test fixture', url: '', classification: 'illustration' };
const image = index => ({ ...envelope.content.images[index], label: `Source ${index + 1}`, fit: 'contain', source });
export function familyFixture(id) {
  const draft = createPresentationDraft(id), c = draft.content;
  switch (id) {
    case 'historical-timeline': draft.content = { ...c, heading: 'A chronology', events: c.events.map((event, i) => ({ ...event, label: i ? 'A later event' : 'An earlier event', date: { display: i ? '1947 CE' : '364 CE', year: i ? 1947 : 364, endYear: null, approximate: false }, source })) }; break;
    case 'person-introduction': draft.content = { ...c, name: 'Example Scholar', role: 'Researcher', affiliation: 'Authored profile fixture', portrait: image(0), source }; break;
    case 'image-comparison': draft.content = { ...c, heading: 'Compare the sources', images: [image(0), image(1)] }; break;
    case 'archival-explainer': draft.content = { ...c, kicker: 'SOURCE CONTEXT', heading: 'Reading a fragment', body: 'The supplied source should be read in context. A highlighted passage is an explanation, not archaeological proof.', highlights: [{ start: 4, end: 19, cueSeconds: 1 }], source }; break;
    case 'map-locator': draft.content = { ...c, heading: 'Regional reference', markers: c.markers.map(marker => ({ ...marker, label: 'Authored coordinate sample', source })) }; break;
    case 'artifact-spotlight': draft.content = { ...c, heading: 'Object study', image: image(0), metadata: [{ id: '60000000-0000-4000-8000-000000000001', label: 'Image', value: 'Authored illustration' }] }; break;
    case 'detail-annotation': draft.content = { ...c, heading: 'Look closer', image: image(0), regions: c.regions.map(region => ({ ...region, label: 'Selected detail' })) }; break;
    case 'manuscript-highlight': draft.content = { ...c, heading: 'Page and passage', image: image(1), region: { ...c.region, label: 'Selected region' }, edition: 'Authored layout fixture', folio: 'Sample page', excerpt: 'Supplied excerpt', translation: 'Supplied reading' }; break;
    case 'text-translation': draft.content = { ...c, heading: 'Original and reading', language: 'Hebrew font sample', script: 'hebrew', direction: 'rtl', original: 'שָׁלוֹם', translation: 'Typography sample; not a verified translation.', edition: 'Authored text fixture', source }; break;
    case 'relationship-diagram': draft.content = { ...c, heading: 'Source relationships', context: 'Authored diagram · no historical claim', nodes: c.nodes.map((node, i) => ({ ...node, label: i ? 'Source B' : 'Source A' })), edges: c.edges.map(edge => ({ ...edge, label: 'Related tradition', type: 'tradition', source })) }; break;
  }
  return draft;
}
