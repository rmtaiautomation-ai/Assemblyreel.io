import type { PresentationEnvelope, PresentationImage } from './schema';
import type { Source } from './families';

export function advancedImages(envelope: PresentationEnvelope): PresentationImage[] {
  switch (envelope.templateId) {
    case 'then-now': return envelope.content.images;
    case 'layered-parallax': return envelope.content.layers.map(layer => layer.image);
    case 'structure-cutaway': return [envelope.content.image];
    case 'evidence-board': return envelope.content.cards.flatMap(card => card.image ? [card.image] : []);
    case 'chapter-recap': return envelope.content.items.map(item => item.image);
    default: return [];
  }
}
export function advancedSourceSlots(envelope: PresentationEnvelope): { key: string; label: string; value: Source }[] {
  switch (envelope.templateId) {
    case 'journey-map': return [{ key: 'main', label: 'Route / stop order', value: envelope.content.source }, ...envelope.content.stops.map(stop => ({ key: stop.id, label: stop.label || 'Stop location', value: stop.source }))];
    case 'territory-change': return envelope.content.states.map(state => ({ key: state.id, label: state.date || 'Dated polygon source', value: state.source }));
    case 'manuscript-comparison': return envelope.content.passages.map((passage, i) => ({ key: String(i), label: passage.edition || `Passage ${i + 1}`, value: passage.source }));
    case 'evidence-board': return [...envelope.content.cards.map(card => ({ key: card.id, label: card.label || 'Evidence card', value: card.source })), ...envelope.content.links.map(link => ({ key: link.id, label: link.label || 'Explained relationship', value: link.source }))];
    case 'animated-chart': return [{ key: 'main', label: 'Dataset source', value: envelope.content.source }];
    case 'competing-explanations': return envelope.content.explanations.map(item => ({ key: item.id, label: item.name || 'Explanation source', value: item.source }));
    default: return [];
  }
}
export function updateAdvancedImage(envelope: PresentationEnvelope, id: string, patch: Partial<PresentationImage>): PresentationEnvelope {
  const update = (image: PresentationImage) => image.id === id ? { ...image, ...patch } : image;
  switch (envelope.templateId) {
    case 'then-now': return { ...envelope, content: { ...envelope.content, alignmentReviewed: false, images: envelope.content.images.map(update) as [PresentationImage, PresentationImage] } };
    case 'layered-parallax': return { ...envelope, content: { ...envelope.content, preparedReviewed: false, layers: envelope.content.layers.map(layer => ({ ...layer, image: update(layer.image) })) } };
    case 'structure-cutaway': return { ...envelope, content: { ...envelope.content, diagramReviewed: false, image: update(envelope.content.image) } };
    case 'evidence-board': return { ...envelope, content: { ...envelope.content, cards: envelope.content.cards.map(card => ({ ...card, image: card.image ? update(card.image) : null })) } };
    case 'chapter-recap': return { ...envelope, content: { ...envelope.content, items: envelope.content.items.map(item => ({ ...item, image: update(item.image) })) } };
    default: return envelope;
  }
}
export function updateAdvancedSource(envelope: PresentationEnvelope, key: string, source: Source): PresentationEnvelope {
  switch (envelope.templateId) {
    case 'journey-map': return { ...envelope, content: { ...envelope.content, ...(key === 'main' ? { source } : { stops: envelope.content.stops.map(stop => stop.id === key ? { ...stop, source } : stop) }) } };
    case 'territory-change': return { ...envelope, content: { ...envelope.content, states: envelope.content.states.map(state => state.id === key ? { ...state, source } : state) } };
    case 'manuscript-comparison': return { ...envelope, content: { ...envelope.content, passages: envelope.content.passages.map((passage, i) => String(i) === key ? { ...passage, source } : passage) as typeof envelope.content.passages } };
    case 'evidence-board': return { ...envelope, content: { ...envelope.content, cards: envelope.content.cards.map(card => card.id === key ? { ...card, source } : card), links: envelope.content.links.map(link => link.id === key ? { ...link, source } : link) } };
    case 'animated-chart': return { ...envelope, content: { ...envelope.content, source } };
    case 'competing-explanations': return { ...envelope, content: { ...envelope.content, explanations: envelope.content.explanations.map(item => item.id === key ? { ...item, source } : item) } };
    default: return envelope;
  }
}
