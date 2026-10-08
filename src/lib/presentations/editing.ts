import type { PresentationEnvelope, PresentationImage } from './schema';
import type { Source } from './families';
import { presentationImages } from './content';
import { advancedSourceSlots, updateAdvancedImage, updateAdvancedSource } from './advanced-editing';

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const next = [...items], destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return next;
  [next[index],next[destination]] = [next[destination],next[index]]; return next;
}

export function updatePresentationImage(envelope: PresentationEnvelope, id: string, patch: Partial<PresentationImage>): PresentationEnvelope {
  const update = (image: PresentationImage) => image.id === id ? { ...image, ...patch } : image;
  switch (envelope.templateId) {
    case 'claim-evidence': return { ...envelope, content: { ...envelope.content, evidence: { ...envelope.content.evidence, image: envelope.content.evidence.image ? update(envelope.content.evidence.image) : null } } };
    case 'image-comparison': return { ...envelope, content: { ...envelope.content, images: envelope.content.images.map(update) as [PresentationImage, PresentationImage] } };
    case 'historical-timeline': return { ...envelope, content: { ...envelope.content, events: envelope.content.events.map(event => ({ ...event, image: event.image ? update(event.image) : null })) } };
    case 'person-introduction': return { ...envelope, content: { ...envelope.content, portrait: envelope.content.portrait ? update(envelope.content.portrait) : null } };
    case 'artifact-spotlight': return { ...envelope, content: { ...envelope.content, image: update(envelope.content.image) } };
    case 'detail-annotation': return { ...envelope, content: { ...envelope.content, image: update(envelope.content.image) } };
    case 'manuscript-highlight': return { ...envelope, content: { ...envelope.content, image: update(envelope.content.image) } };
    case 'relationship-diagram': return { ...envelope, content: { ...envelope.content, nodes: envelope.content.nodes.map(node => ({ ...node, image: node.image ? update(node.image) : null })) } };
    default: return updateAdvancedImage(envelope, id, patch);
  }
}
export function sourceSlots(envelope: PresentationEnvelope): { key: string; label: string; value: Source }[] {
  const images = presentationImages(envelope).map(image => ({ key: `image:${image.id}`, label: image.label || 'Image credit', value: image.source }));
  switch (envelope.templateId) {
    case 'cause-effect': return envelope.content.links.map((link, i) => ({ key: `link:${link.id}`, label: `Step ${i + 1} → ${i + 2}`, value: link.source }));
    case 'scale-comparison': return envelope.content.items.map((item, i) => ({ key: `measure:${item.id}`, label: item.label || `Measurement ${i + 1}`, value: item.source }));
    case 'fact-reveal': return [{ key: 'main', label: 'Fact source', value: envelope.content.source }];
    case 'claim-evidence': return [...images, { key: 'main', label: 'Specific evidence / attribution', value: envelope.content.evidence.source }];
    case 'historical-timeline': return [...images, ...envelope.content.events.map((event, i) => ({ key: `event:${event.id}`, label: `Event ${i + 1}`, value: event.source }))];
    case 'map-locator': return envelope.content.markers.map((marker, i) => ({ key: `marker:${marker.id}`, label: `Marker ${i + 1}`, value: marker.source }));
    case 'person-introduction': case 'archival-explainer': case 'text-translation': return [...images, { key: 'main', label: 'Text / attribution', value: envelope.content.source }];
    case 'relationship-diagram': return [...images, ...envelope.content.edges.map((edge, i) => ({ key: `edge:${edge.id}`, label: `Relationship ${i + 1}`, value: edge.source }))];
    default: return [...images, ...advancedSourceSlots(envelope)];
  }
}
export function updatePresentationSource(envelope: PresentationEnvelope, key: string, source: Source): PresentationEnvelope {
  if (key.startsWith('image:')) return updatePresentationImage(envelope, key.slice(6), { source });
  switch (envelope.templateId) {
    case 'cause-effect': return { ...envelope, content: { ...envelope.content, links: envelope.content.links.map(link => key === `link:${link.id}` ? { ...link, source } : link) } };
    case 'scale-comparison': return { ...envelope, content: { ...envelope.content, items: envelope.content.items.map(item => key === `measure:${item.id}` ? { ...item, source } : item) } };
    case 'fact-reveal': return { ...envelope, content: { ...envelope.content, source } };
    case 'claim-evidence': return { ...envelope, content: { ...envelope.content, evidence: { ...envelope.content.evidence, source } } };
    case 'historical-timeline': return { ...envelope, content: { ...envelope.content, events: envelope.content.events.map(event => key === `event:${event.id}` ? { ...event, source } : event) } };
    case 'map-locator': return { ...envelope, content: { ...envelope.content, markers: envelope.content.markers.map(marker => key === `marker:${marker.id}` ? { ...marker, source } : marker) } };
    case 'person-introduction': return { ...envelope, content: { ...envelope.content, source } };
    case 'archival-explainer': return { ...envelope, content: { ...envelope.content, source } };
    case 'text-translation': return { ...envelope, content: { ...envelope.content, source } };
    case 'relationship-diagram': return { ...envelope, content: { ...envelope.content, edges: envelope.content.edges.map(edge => key === `edge:${edge.id}` ? { ...edge, source } : edge) } };
    default: return updateAdvancedSource(envelope, key, source);
  }
}
