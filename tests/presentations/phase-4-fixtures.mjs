import { loadSource } from './load-source.mjs';
import { familyFixture as previousFixture, assets, projectId, sceneId, actorId, otherActorId, mediaIds } from './phase-2-fixtures.mjs';
export { assets, projectId, sceneId, actorId, otherActorId, mediaIds };
const { createPresentationDraft, draftId } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const SOURCE = { credit: 'Authored layout fixture · not historical evidence', url: '', classification: 'illustration' };
export { SOURCE as source };
export function familyFixture(id) {
  const source = { ...SOURCE };
  const draft = createPresentationDraft(id), c = draft.content;
  switch (id) {
    case 'cause-effect': return { ...draft, content: { ...c, heading: 'How a source travels', steps: c.steps.map((step, i) => ({ ...step, label: i ? 'Later copy' : 'Earlier source', detail: 'Authored sequence example' })), links: c.links.map(link => ({ ...link, label: 'Copied later', source })) } };
    case 'scale-comparison': return { ...draft, content: { ...c, heading: 'Linear measurement study', items: c.items.map((item, i) => ({ ...item, label: i ? 'Reference B' : 'Reference A', value: i ? 200 : 1, unit: i ? 'cm' : 'm', source })) } };
    case 'fact-reveal': return { ...draft, content: { ...c, kind: 'date', value: '1947', unit: 'CE', qualifier: 'Supplied date', context: 'Authored date reveal fixture, not a verified historical claim.', source } };
    case 'claim-evidence': return { ...draft, content: { ...c, heading: 'Read the source carefully', claim: 'A source can preserve a tradition.', evidence: { ...c.evidence, label: 'Authored passage fixture', passage: '  The text records a tradition.  ', source }, interpretation: 'This provides context for the supplied account.', limitation: 'It does not establish that the described event occurred.' } };
    default: return previousFixture(id);
  }
}
export function maximumFixture(id) {
  const draft = familyFixture(id);
  if (id === 'cause-effect') {
    draft.content.steps = Array.from({ length: 4 }, (_, i) => ({ id: draftId(20 + i), label: `Step ${i + 1}`, detail: 'A distinct authored beat.', cueSeconds: i }));
    draft.content.links = Array.from({ length: 3 }, (_, i) => ({ id: draftId(30 + i), type: 'sequential', label: 'Then', support: '', source: { ...SOURCE } }));
  }
  if (id === 'scale-comparison') draft.content.items.push({ ...draft.content.items[0], id: draftId(5), label: 'Reference C', value: .5, unit: 'm', approximate: true });
  return draft;
}
