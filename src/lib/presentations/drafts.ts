import type { PresentationEnvelope, PresentationImage } from './schema';
import { createComparisonDraft } from './schema';
import type { PresentationTemplateId } from './registry';

export const emptySource = () => ({ credit: '', url: '', classification: 'unknown' as const });
export function emptyImage(id: string): PresentationImage {
  return { id, asset: { kind: 'media', mediaId: '' }, label: '', fit: 'contain', focalPoint: { x: .5, y: .5 }, source: emptySource() };
}
export const draftId = (index: number) => `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
export const emptyRegion = (index: number) => ({ id: draftId(index), label: '', x: .25, y: .25, width: .5, height: .5, cueSeconds: 1 });

/** Blank authoring drafts, deliberately invalid until required copy/assets are supplied. */
export function createPresentationDraft(id: PresentationTemplateId): PresentationEnvelope {
  const comparison = createComparisonDraft(['', '']);
  const base = { schemaVersion: 1 as const, templateVersion: 1 as const, variantId: 'auto' as const,
    theme: { ...comparison.theme, version: 2 as const }, motion: comparison.motion, provenance: comparison.provenance,
    style: { background: 'plain' as const, density: 'spacious' as const } };
  switch (id) {
    case 'journey-map': return { ...base, templateId: id, content: { heading: '', mapId: 'west-asia-v1', viewport: { west: 20, east: 65, south: 12, north: 50 }, mode: 'schematic', route: [], source: emptySource(), stops: [1, 2].map(index => ({ id: draftId(index), label: '', date: '', point: [44, 33], approximate: true, cueSeconds: index - 1, source: emptySource() })) } };
    case 'territory-change': return { ...base, templateId: id, content: { heading: '', mapId: 'west-asia-v1', viewport: { west: 20, east: 65, south: 12, north: 50 }, dataset: '', states: [1, 2].map(index => ({ id: draftId(index), date: '', year: 0, label: '', approximate: true, cueSeconds: (index - 1) * 2, source: emptySource(), polygons: [] })) } };
    case 'then-now': return { ...base, templateId: id, content: { heading: '', images: [emptyImage(draftId(1)), emptyImage(draftId(2))], labels: ['', ''], method: 'side-by-side', alignmentReviewed: false, cueSeconds: 1, crops: [{ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }] } };
    case 'layered-parallax': return { ...base, templateId: id, content: { heading: '', preparedReviewed: false, motion: 'right', focalPoint: { x: .5, y: .5 }, layers: [1, 2].map((index) => ({ image: emptyImage(draftId(index)), role: index === 1 ? 'background' : 'transparent', depth: index === 1 ? 0 : 1 })) } };
    case 'structure-cutaway': return { ...base, templateId: id, content: { heading: '', image: emptyImage(draftId(1)), diagramReviewed: false, sections: [2, 3].map(index => ({ ...emptyRegion(index), description: '' })) } };
    case 'manuscript-comparison': { const passage = () => ({ text: '', edition: '', language: '', script: 'latin' as const, direction: 'ltr' as const, transliteration: '', fallbackReviewed: false, source: emptySource() }); return { ...base, templateId: id, content: { heading: '', passages: [passage(), passage()], mappings: [] } }; }
    case 'evidence-board': return { ...base, templateId: id, content: { heading: '', cards: [1, 2, 3].map(index => ({ id: draftId(index), label: '', detail: '', image: null, source: emptySource() })), links: [4, 5].map((index, i) => ({ id: draftId(index), from: draftId(i + 1), to: draftId(i + 2), label: '', cueSeconds: i, source: emptySource() })) } };
    case 'animated-chart': return { ...base, templateId: id, content: { heading: '', kind: 'bar', unit: '', axisLabel: '', points: [1, 2].map((index) => ({ id: draftId(index), label: '', x: index, value: null, low: null, high: null, estimated: false })), source: emptySource(), caveat: '' } };
    case 'competing-explanations': return { ...base, templateId: id, content: { heading: '', explanations: [1, 2].map(index => ({ id: draftId(index), name: '', support: '', limitation: '', source: emptySource() })) } };
    case 'chapter-recap': return { ...base, templateId: id, content: { heading: '', nextCue: '', items: [1, 2].map(index => ({ id: draftId(index + 2), sceneId: '', image: emptyImage(draftId(index)), takeaway: '' })) } };
    case 'cause-effect': return { ...base, templateId: id, content: { heading: '', steps: [1, 2].map(index => ({ id: draftId(index), label: '', detail: '', cueSeconds: index - 1 })), links: [{ id: draftId(3), type: 'sequential', label: '', support: '', source: emptySource() }] } };
    case 'scale-comparison': return { ...base, templateId: id, content: { heading: '', dimension: 'height', method: 'proportional', referenceId: draftId(1), items: [1, 2].map(index => ({ id: draftId(index), label: '', value: 0, unit: 'm', approximate: false, source: emptySource() })) } };
    case 'fact-reveal': return { ...base, templateId: id, content: { kind: 'quantity', value: '', unit: '', qualifier: '', context: '', source: emptySource(), cueSeconds: 0 } };
    case 'claim-evidence': return { ...base, templateId: id, content: { heading: '', claim: '', scope: 'context-only', evidence: { kind: 'passage', label: '', passage: '', image: null, source: emptySource() }, interpretation: '', limitation: '', cueSeconds: 1 } };
    case 'image-comparison': return { ...comparison, ...base, content: { ...comparison.content, images: [emptyImage(draftId(1)), emptyImage(draftId(2))] } };
    case 'historical-timeline': return { ...base, templateId: id, content: { heading: '', spacing: 'equal', events: [1, 2].map(index => ({ id: draftId(index), date: { display: '', year: null, endYear: null, approximate: false }, label: '', source: emptySource(), image: null, cueSeconds: index - 1 })) } };
    case 'person-introduction': return { ...base, templateId: id, content: { name: '', role: '', affiliation: '', dates: '', portrait: null, source: emptySource(), side: 'left', treatment: 'framed' } };
    case 'archival-explainer': return { ...base, templateId: id, content: { kicker: '', heading: '', body: '', highlights: [], textKind: 'explanation', source: emptySource() } };
    case 'map-locator': return { ...base, templateId: id, content: { heading: '', mapId: 'west-asia-v1', markers: [{ id: draftId(1), label: '', latitude: 33, longitude: 44, approximate: false, cueSeconds: 0, source: emptySource() }], viewport: { west: 20, east: 65, south: 12, north: 50 } } };
    case 'artifact-spotlight': return { ...base, templateId: id, content: { heading: '', image: emptyImage(draftId(1)), metadata: [] } };
    case 'detail-annotation': return { ...base, templateId: id, content: { heading: '', image: emptyImage(draftId(1)), regions: [emptyRegion(2)] } };
    case 'manuscript-highlight': return { ...base, templateId: id, content: { heading: '', image: emptyImage(draftId(1)), region: emptyRegion(2), edition: '', folio: '', excerpt: '', translation: '' } };
    case 'text-translation': return { ...base, templateId: id, content: { heading: '', original: '', translation: '', transliteration: '', language: '', script: 'latin', direction: 'ltr', edition: '', source: emptySource(), fallbackReviewed: false, cueSeconds: 1 } };
    case 'relationship-diagram': return { ...base, templateId: id, content: { heading: '', context: '', layout: 'chain', nodes: [1, 2].map(index => ({ id: draftId(index), label: '', image: null })), edges: [{ id: draftId(3), from: draftId(1), to: draftId(2), label: '', type: 'relationship', source: emptySource(), cueSeconds: 1 }] } };
  }
}
