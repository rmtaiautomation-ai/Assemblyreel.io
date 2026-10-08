import type { PresentationEnvelope, PresentationImage } from './schema';
import type { Source } from './families';
import { advancedImages, advancedSourceSlots } from './advanced-editing';

/** Explicit slots, never an arbitrary walk of user JSON or URLs. */
export function presentationImages(envelope: PresentationEnvelope): PresentationImage[] {
  switch (envelope.templateId) {
    case 'claim-evidence': return envelope.content.evidence.image ? [envelope.content.evidence.image] : [];
    case 'image-comparison': return envelope.content.images;
    case 'historical-timeline': return envelope.content.events.flatMap(event => event.image ? [event.image] : []);
    case 'person-introduction': return envelope.content.portrait ? [envelope.content.portrait] : [];
    case 'artifact-spotlight': case 'detail-annotation': case 'manuscript-highlight': return [envelope.content.image];
    case 'relationship-diagram': return envelope.content.nodes.flatMap(node => node.image ? [node.image] : []);
    default: return advancedImages(envelope);
  }
}
export function presentationSources(envelope: PresentationEnvelope): Source[] {
  const images = presentationImages(envelope).map(image => image.source);
  switch (envelope.templateId) {
    case 'cause-effect': return envelope.content.links.map(link => link.source);
    case 'scale-comparison': return envelope.content.items.map(item => item.source);
    case 'fact-reveal': return [envelope.content.source];
    case 'claim-evidence': return [...images, envelope.content.evidence.source];
    case 'historical-timeline': return [...images, ...envelope.content.events.map(event => event.source)];
    case 'map-locator': return envelope.content.markers.map(marker => marker.source);
    case 'person-introduction': case 'archival-explainer': case 'text-translation': return [...images, envelope.content.source];
    case 'relationship-diagram': return [...images, ...envelope.content.edges.map(edge => edge.source)];
    default: return [...images, ...advancedSourceSlots(envelope).map(slot => slot.value)];
  }
}
/** UTF-16 offsets match textarea selectionStart/End, preserving exact supplied text. */
export function splitHighlights(text: string, highlights: readonly { start: number; end: number; cueSeconds: number }[]) {
  const pieces: { text: string; cueSeconds?: number }[] = [];
  let cursor = 0;
  for (const range of [...highlights].sort((a, b) => a.start - b.start)) {
    if (range.start > cursor) pieces.push({ text: text.slice(cursor, range.start) });
    pieces.push({ text: text.slice(range.start, range.end), cueSeconds: range.cueSeconds }); cursor = range.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces;
}
export const historicalYearOrdinal = (year: number) => year < 0 ? year + 1 : year;
