import { loadSource } from './load-source.mjs';
import { familyFixture as previousFixture, assets as previousAssets, projectId, sceneId, actorId, otherActorId, mediaIds as previousIds } from './phase-4-fixtures.mjs';
export { projectId, sceneId, actorId, otherActorId };
const { createPresentationDraft, draftId } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const foregroundId = '40000000-0000-4000-8000-000000000003';
export const assets = [...previousAssets, { ...previousAssets[0], id: foregroundId, url: '/parallax-foreground.svg', name: 'Prepared synthetic foreground' }];
export const mediaIds = [...previousIds, foregroundId];
export const priorSceneIds = ['30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'];
export const references = [{ id: priorSceneIds[0], sequence: 1, mediaId: assets[0].id }, { id: priorSceneIds[1], sequence: 2, mediaId: assets[1].id }, { id: sceneId, sequence: 3, mediaId: null }];
const source = () => ({ credit: 'Synthetic layout fixture · not historical evidence', url: '', classification: 'illustration' });
const image = i => ({ ...previousFixture('image-comparison').content.images[i % 2], id: draftId(50 + i), source: source() });
export function familyFixture(id) {
  const draft = createPresentationDraft(id), c = draft.content;
  switch (id) {
    case 'journey-map': return { ...draft, content: { ...c, heading: 'A schematic journey', source: source(), stops: c.stops.map((stop,i) => ({ ...stop, label: `Authored stop ${i + 1}`, point: i ? [50,38] : [35,30], date: `Stage ${i + 1}`, source: source() })) } };
    case 'territory-change': return { ...draft, content: { ...c, heading: 'Discrete dated snapshots', dataset: 'Synthetic geometry v1 · not ancient territory', states: c.states.map((state,i) => ({ ...state, date: `Sample ${i + 1} CE`, year: i + 1, label: `Authored region ${i + 1}`, polygons: [i ? [[34,28],[49,28],[49,38],[34,38]] : [[34,28],[43,28],[43,35],[34,35]]], source: { ...source(), classification: 'reconstruction' } })) } };
    case 'then-now': return { ...draft, content: { ...c, heading: 'Two reviewed views', images: [image(0),image(1)], labels: ['Earlier supplied view','Later supplied view'], method: 'wipe', alignmentReviewed: true, crops: [{x:0,y:0,width:1,height:1},{x:0,y:.2,width:1,height:4/9}] } };
    case 'layered-parallax': return { ...draft, content: { ...c, heading: 'Prepared depth illustration', preparedReviewed: true, layers: c.layers.map((layer,i) => ({ ...layer, image: { ...image(i), asset: { kind: 'media', mediaId: i ? foregroundId : assets[0].id } } })) } };
    case 'structure-cutaway': return { ...draft, content: { ...c, heading: 'Read the authored diagram', image: image(0), diagramReviewed: true, sections: c.sections.map((section,i) => ({ ...section, label: `Section ${i + 1}`, description: 'Existing authored geometry.', x: i ? .55 : .25, y: .25, width: .2, height: .45, cueSeconds: i })) } };
    case 'manuscript-comparison': return { ...draft, content: { ...c, heading: 'Compare supplied passages', passages: c.passages.map((passage,i) => ({ ...passage, text: i ? '  A later reading.  ' : '  An earlier reading.  ', edition: `Authored edition ${i + 1}`, language: 'English layout sample', source: source() })), mappings: [{ id: draftId(20), label: 'A supplied wording difference', leftStart: 5, leftEnd: 12, rightStart: 4, rightEnd: 9, cueSeconds: 1 }] } };
    case 'evidence-board': return { ...draft, content: { ...c, heading: 'Explain source relationships', cards: c.cards.map((card,i) => ({ ...card, label: `Source ${i + 1}`, detail: 'Supplied context.', source: source() })), links: c.links.map(link => ({ ...link, label: 'Related supplied context', source: source() })) } };
    case 'animated-chart': return { ...draft, content: { ...c, heading: 'Supplied data comparison', unit: 'items', axisLabel: 'Sample categories', source: source(), caveat: 'Synthetic values · not a historical dataset.', points: c.points.map((point,i) => ({ ...point, label: `Sample ${i + 1}`, value: i ? 20 : 10, low: i ? 18 : null, high: i ? 23 : null, estimated: i === 1 })) } };
    case 'competing-explanations': return { ...draft, content: { ...c, heading: 'Two attributed readings', explanations: c.explanations.map((item,i) => ({ ...item, name: `Explanation ${i + 1}`, support: 'A supplied source supports this reading.', limitation: 'The source does not resolve every question.', source: source() })) } };
    case 'chapter-recap': return { ...draft, content: { ...c, heading: 'Chapter recap', nextCue: 'Read the next source in context.', items: c.items.map((item,i) => ({ ...item, sceneId: priorSceneIds[i], image: image(i), takeaway: `Earlier source ${i + 1} in context.` })) } };
    default: return previousFixture(id);
  }
}
export function maximumFixture(id) {
  const f = familyFixture(id), c = f.content;
  if (id === 'journey-map') c.stops = Array.from({ length: 5 },(_,i) => ({ ...c.stops[0], id: draftId(i + 1), label: `Stop ${i + 1}`, date: '', point: [28 + i * 6,25 + i * 3], cueSeconds: i, source: source() }));
  if (id === 'territory-change') c.states = Array.from({ length: 4 },(_,i) => ({ ...c.states[0], id: draftId(i + 1), date: `Sample ${i + 1}`, year: i + 1, cueSeconds: i * 2, polygons: [[[28,25],[34 + i * 3,25],[34 + i * 3,34],[28,34]]], source: { ...source(), classification: 'reconstruction' } }));
  if (id === 'layered-parallax') c.layers = Array.from({ length: 4 },(_,i) => ({ image: { ...image(i), asset: { kind: 'media', mediaId: i ? foregroundId : assets[0].id } }, role: i ? 'transparent' : 'background', depth: i / 3 }));
  if (id === 'structure-cutaway') c.sections = Array.from({ length: 4 },(_,i) => ({ ...c.sections[0], id: draftId(i + 1), x: .1 + (i % 2) * .45, y: .1 + Math.floor(i / 2) * .45, width: .3, height: .3, label: `Section ${i + 1}`, description: 'Authored geometry.', cueSeconds: i }));
  if (id === 'evidence-board') { c.cards = Array.from({ length: 5 },(_,i) => ({ ...c.cards[0], id: draftId(i + 1), label: `Source ${i + 1}`, detail: 'Supplied context.', source: source() })); c.links = Array.from({ length: 4 },(_,i) => ({ ...c.links[0], id: draftId(20 + i), from: draftId(i + 1), to: draftId(i + 2), label: 'Supplied connection', cueSeconds: i, source: source() })); }
  if (id === 'animated-chart') { c.kind = 'line'; c.points = Array.from({ length: 6 },(_,i) => ({ ...c.points[0], id: draftId(i + 1), label: `Sample ${i + 1}`, x: [0,1,2,4,6,8][i], value: i === 2 ? null : (i + 1) * 5, low: null, high: null, estimated: i === 4 })); }
  if (id === 'competing-explanations') c.explanations = Array.from({ length: 3 },(_,i) => ({ ...c.explanations[0], id: draftId(i + 1), name: `Explanation ${i + 1}`, source: source() }));
  if (id === 'chapter-recap') { c.items = Array.from({ length: 4 },(_,i) => ({ id: draftId(10 + i), sceneId: `30000000-0000-4000-8000-${String(i + 2).padStart(12,'0')}`, image: image(i), takeaway: `Earlier supplied source ${i + 1}.` })); }
  return f;
}
