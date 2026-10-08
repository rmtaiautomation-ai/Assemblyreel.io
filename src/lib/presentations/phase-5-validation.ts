import type { PresentationEnvelope } from './schema';
import type { z } from 'zod';
import type { passageSchema } from './advanced-families';
import { inViewport, polygonsOverlap, simplePolygon } from './geometry';
import { presentationSources } from './content';
import { PHASE_5_FAMILIES } from './registry';

export type PresentationSceneReference = { id: string; sequence: number; mediaId: string | null };
export type PresentationReferenceContext = { sceneId?: string; scenes: readonly PresentationSceneReference[]; sourcePacket?: boolean };

export function passageIssues(passage: z.infer<typeof passageSchema>): string[] {
  const { script, direction, text, transliteration, fallbackReviewed } = passage;
  const supported = { latin: /^[\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, hebrew: /^[\p{Script=Hebrew}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, syriac: /^[\p{Script=Syriac}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, ethiopic: /^[\p{Script=Ethiopic}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, cuneiform: /^[\p{Script=Cuneiform}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u };
  const issues: string[] = [];
  if (direction !== (['hebrew', 'syriac'].includes(script) ? 'rtl' : 'ltr')) issues.push('Choose the supported direction for each passage’s script.');
  if (script === 'transliteration-only' ? !fallbackReviewed || !transliteration.trim() || !supported.latin.test(transliteration) : !supported[script].test(text)) issues.push('Supply supported original-script text or an explicitly reviewed Latin transliteration fallback.');
  return issues;
}
export function phase5ContentIssues(envelope: PresentationEnvelope, seconds: number): string[] {
  if (!PHASE_5_FAMILIES.some(id => id === envelope.templateId)) return [];
  const issues: string[] = [];
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) issues.push('Authored item IDs must be distinct.'); };
  const cues = (items: { cueSeconds: number }[], minimumSpacing = 0) => items.forEach((item, i) => {
    if (item.cueSeconds + 1.5 > seconds) issues.push('Each reveal needs at least 1.5 seconds before the presentation ends.');
    if (i && item.cueSeconds < items[i - 1].cueSeconds + minimumSpacing) issues.push('Reveals must follow authored order with enough time to read each state.');
  });
  if (presentationSources(envelope).some(source => !source.credit.trim())) issues.push('Credit every supplied dataset, passage, image and explained relationship.');
  switch (envelope.templateId) {
    case 'journey-map': case 'territory-change': {
      const c = envelope.content, viewport = c.viewport;
      if (viewport.east - viewport.west < 6 || viewport.north - viewport.south < 6) issues.push('The West Asia reference map needs a viewport at least six degrees wide and high.');
      if (envelope.templateId === 'journey-map') {
        const c = envelope.content; unique(c.stops.map(stop => stop.id)); cues(c.stops);
        if (c.stops.some(stop => !inViewport(stop.point, viewport)) || c.route.some(point => !inViewport(point, viewport))) issues.push('Route points and stops must stay inside the supplied viewport.');
        if (new Set(c.stops.map(stop => stop.point.join(','))).size !== c.stops.length) issues.push('Use distinct stop locations; combine repeat visits into a supplied date label.');
        if (c.mode === 'schematic' && c.route.length) issues.push('Schematic mode connects the supplied stops only. Clear detailed geometry or select supplied-route.');
        if (c.mode === 'supplied-route') {
          let cursor = -1;
          for (const stop of c.stops) { const index = c.route.findIndex((point, i) => i > cursor && Math.abs(point[0] - stop.point[0]) < 1e-6 && Math.abs(point[1] - stop.point[1]) < 1e-6); if (index < 0) issues.push('A supplied route must contain every stop vertex in the authored order.'); else cursor = index; }
          if (c.route.length < 2) issues.push('Supply reviewed route vertices; a place name cannot establish a travel path.');
        }
      } else {
        const c = envelope.content; unique(c.states.map(state => state.id)); cues(c.states, 2);
        c.states.forEach((state, i) => {
          if (state.year === 0 || i && state.year <= c.states[i - 1].year) issues.push('Dated territory states need ascending BCE/CE years without year zero.');
          if (state.polygons.some(polygon => !simplePolygon(polygon) || polygon.some(point => !inViewport(point, viewport)))) issues.push('Supply simple, unclosed, non-self-intersecting polygon rings inside the viewport; holes and border morphs are not supported.');
          if (state.polygons.some((polygon, j) => state.polygons.slice(j + 1).some(other => polygonsOverlap(polygon, other)))) issues.push('Polygons in one snapshot must be disjoint. Curate merged geometry before importing it.');
          if (!['historical', 'reconstruction'].includes(state.source.classification)) issues.push('Classify each territory dataset as historical or reconstruction; this is a creator assertion, not verification.');
        });
      }
      break;
    }
    case 'then-now': {
      const c = envelope.content; cues([c]);
      if (c.method === 'wipe' && !c.alignmentReviewed) issues.push('Review aligned landmarks and crops before using a wipe, or select side-by-side.');
      if (c.crops.some(crop => crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001)) issues.push('Comparison crops must stay within their original images.');
      break;
    }
    case 'layered-parallax': {
      const c = envelope.content;
      if (!c.preparedReviewed || c.layers[0].role !== 'background' || c.layers[0].depth !== 0 || c.layers.slice(1).some((layer, i) => layer.role !== 'transparent' || layer.depth <= c.layers[i].depth)) issues.push('Review a complete opaque background and co-registered transparent foreground layers in increasing depth order. Automatic segmentation/inpainting is not included.');
      break;
    }
    case 'structure-cutaway': {
      const c = envelope.content; unique(c.sections.map(section => section.id)); cues(c.sections);
      if (!c.diagramReviewed || !['historical', 'illustration', 'reconstruction'].includes(c.image.source.classification)) issues.push('Review the supplied cutaway diagram and classify its authored or reconstructed geometry.');
      if (c.sections.some(section => section.x + section.width > 1.000001 || section.y + section.height > 1.000001)) issues.push('Every cutaway section must stay inside the source diagram.');
      break;
    }
    case 'manuscript-comparison': {
      const c = envelope.content; unique(c.mappings.map(mapping => mapping.id)); cues(c.mappings);
      c.passages.forEach(passage => issues.push(...passageIssues(passage)));
      for (const side of ['left', 'right'] as const) {
        const passage = c.passages[side === 'left' ? 0 : 1];
        const text = passage.script === 'transliteration-only' ? passage.transliteration : passage.text;
        const boundaries = new Set([0, text.length, ...Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text), segment => segment.index)]);
        let end = 0;
        [...c.mappings].sort((a,b) => a[`${side}Start`] - b[`${side}Start`]).forEach(mapping => { const start = mapping[`${side}Start`], next = mapping[`${side}End`]; if (start < end || next <= start || next > text.length || !boundaries.has(start) || !boundaries.has(next)) issues.push('Difference mappings must select exact, non-overlapping whole graphemes in both displayed passages.'); end = next; });
      }
      break;
    }
    case 'evidence-board': {
      const c = envelope.content; unique([...c.cards.map(card => card.id), ...c.links.map(link => link.id)]); cues(c.links);
      const ids = c.cards.map(card => card.id), pairs = new Set<string>();
      c.links.forEach(link => { const pair = [link.from, link.to].sort().join(':'); if (!ids.includes(link.from) || !ids.includes(link.to) || link.from === link.to || pairs.has(pair)) issues.push('Every explained relationship must join two distinct existing cards once.'); pairs.add(pair); });
      const visited = new Set<string>(); const visit = (id: string) => { if (visited.has(id)) return; visited.add(id); c.links.filter(link => link.from === id || link.to === id).forEach(link => visit(link.from === id ? link.to : link.from)); }; visit(ids[0]);
      if (c.links.length !== c.cards.length - 1 || visited.size !== ids.length) issues.push('Use a connected, readable board with one fewer relationship than cards. Split dense networks across scenes.');
      break;
    }
    case 'animated-chart': {
      const c = envelope.content; unique(c.points.map(point => point.id));
      if (!c.points.some(point => point.value !== null && point.value > 0)) issues.push('Supply at least one positive supported value; empty and all-zero charts should use fact cards.');
      c.points.forEach((point, i) => {
        if (point.value === null && (point.low !== null || point.high !== null) || (point.low === null) !== (point.high === null) || point.value !== null && point.low !== null && point.high !== null && (point.low > point.value || point.high < point.value)) issues.push('Uncertainty bounds must bracket a supplied value; missing values have no fabricated bounds.');
        if (c.kind === 'line' && i && point.x <= c.points[i - 1].x) issues.push('Line-chart x values must be strictly increasing; coordinates use their actual spacing.');
      });
      if (c.kind === 'line' && c.points.slice(1).some((point, i) => (point.x - c.points[i].x) / (c.points.at(-1)!.x - c.points[0].x) < .08)) issues.push('Line points are too close for readable labels. Split the series or use bars; x spacing will not be distorted.');
      break;
    }
    case 'competing-explanations': unique(envelope.content.explanations.map(item => item.id)); break;
    case 'chapter-recap': unique(envelope.content.items.flatMap(item => [item.id, item.sceneId])); break;
  }
  return [...new Set(issues)];
}
export function recapReferenceIssues(envelope: PresentationEnvelope, context?: PresentationReferenceContext): string[] {
  if (envelope.templateId !== 'chapter-recap') return [];
  const current = context?.scenes.find(scene => scene.id === context.sceneId);
  if (!context || !context.sourcePacket && !current) return ['Load the project scene references before preparing a recap.'];
  return envelope.content.items.flatMap(item => {
    const earlier = context.scenes.find(scene => scene.id === item.sceneId);
    return !earlier || !context.sourcePacket && earlier.sequence >= current!.sequence || earlier.mediaId !== item.image.asset.mediaId
      ? ['A recap image must still be the linked still image of an earlier owned scene. Repair deleted, reordered or changed scene references.'] : [];
  });
}
