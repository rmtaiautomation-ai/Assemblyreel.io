import type { PresentationEnvelope } from './schema';
import { historicalYearOrdinal } from './content';
import { diagramPositions } from './graph';
import { phase4ContentIssues } from './phase-4-validation';
import { phase5ContentIssues } from './phase-5-validation';

export function presentationContentIssues(envelope: PresentationEnvelope, seconds: number): string[] {
  const issues: string[] = [];
  const cue = (value: number) => { if (value + 1.5 > seconds) issues.push('Each reveal needs at least 1.5 seconds before the presentation ends.'); };
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) issues.push(`${label} IDs must be distinct.`); };
  switch (envelope.templateId) {
    case 'historical-timeline': {
      const { events, spacing } = envelope.content;
      unique(events.map(event => event.id), 'Event');
      events.forEach(event => {
        cue(event.cueSeconds);
        if (event.date.year === 0 || event.date.endYear === 0) issues.push('Historical BCE/CE dates have no year zero.');
        if (event.date.endYear !== null && (event.date.year === null || event.date.endYear < event.date.year)) issues.push('A date range needs a start year and a later end year.');
      });
      if (spacing === 'proportional') {
        const years = events.map(event => event.date.year);
        if (years.some(year => year === null) || years.some((year, index) => index > 0 && historicalYearOrdinal(year ?? 0) <= historicalYearOrdinal(years[index - 1] ?? 0))) {
          issues.push('Proportional spacing needs distinct numeric years in chronological order. Use equal spacing for undated or overlapping events.');
        }
        if (events.some(event => event.date.endYear !== null || event.date.approximate)) issues.push('Use equal spacing for approximate dates and ranges; proportional spacing would imply false precision.');
        const ordinals = years.map(year => historicalYearOrdinal(year ?? 0)), span = ordinals.at(-1)! - ordinals[0];
        if (span > 0 && ordinals.some((year, index) => index > 0 && (year - ordinals[index - 1]) / span < .17)) issues.push('These proportional events are too close for readable date cards. Use equal spacing or split the timeline.');
      }
      break;
    }
    case 'archival-explainer': {
      const { body, highlights } = envelope.content;
      const boundaries = new Set([0, body.length, ...Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(body), segment => segment.index)]);
      let lastEnd = 0;
      [...highlights].sort((a, b) => a.start - b.start).forEach(range => {
        cue(range.cueSeconds);
        if (range.start < lastEnd || range.end <= range.start || range.end > body.length) issues.push('Highlights must select exact, non-overlapping passages within the supplied text.');
        // Do not split a surrogate pair / astral glyph.
        if (!boundaries.has(range.start) || !boundaries.has(range.end)) issues.push('A highlight cannot split a Unicode glyph or combining-mark cluster.');
        lastEnd = range.end;
      });
      if (envelope.content.textKind === 'quotation' && !envelope.content.source.credit) issues.push('Attribute a quotation before applying it.');
      break;
    }
    case 'map-locator': {
      const { viewport, markers } = envelope.content;
      if (viewport.east - viewport.west < 6 || viewport.north - viewport.south < 6) issues.push('This regional reference map supports viewports at least 6 degrees wide and high.');
      unique(markers.map(marker => marker.id), 'Marker');
      markers.forEach(marker => {
        cue(marker.cueSeconds);
        if (marker.longitude < viewport.west || marker.longitude > viewport.east || marker.latitude < viewport.south || marker.latitude > viewport.north) issues.push(`“${marker.label}” is outside the selected map viewport.`);
      });
      for (let a = 0; a < markers.length; a++) for (let b = a + 1; b < markers.length; b++) {
        if (Math.abs(markers[a].longitude - markers[b].longitude) < 2 && Math.abs(markers[a].latitude - markers[b].latitude) < 2) issues.push('Map markers are too close for readable labels. Use separate scenes or a wider location label.');
      }
      break;
    }
    case 'detail-annotation': case 'manuscript-highlight': {
      const regions = envelope.templateId === 'detail-annotation' ? envelope.content.regions : [envelope.content.region];
      unique(regions.map(region => region.id), 'Region');
      regions.forEach(region => { cue(region.cueSeconds); if (region.x + region.width > 1.000001 || region.y + region.height > 1.000001) issues.push('Selected detail regions must stay within the original image.'); });
      break;
    }
    case 'text-translation': {
      const { script, direction, transliteration, fallbackReviewed, original, translation, source } = envelope.content;
      cue(envelope.content.cueSeconds);
      if (['hebrew', 'syriac'].includes(script) && direction !== 'rtl') issues.push('Hebrew and Syriac originals require right-to-left direction.');
      if (['latin', 'ethiopic', 'cuneiform', 'transliteration-only'].includes(script) && direction !== 'ltr') issues.push('This supported script uses left-to-right direction.');
      if (script === 'transliteration-only' && (!transliteration || !fallbackReviewed)) issues.push('Supply and explicitly review the transliteration-only fallback.');
      if (!source.credit) issues.push('Name the supplied translation’s source or translator.');
      if (/\p{Script=Hebrew}/u.test(original) && script !== 'hebrew' && script !== 'transliteration-only') issues.push('Choose the Hebrew font for Hebrew original text.');
      if (/\p{Script=Syriac}/u.test(original) && script !== 'syriac' && script !== 'transliteration-only') issues.push('Choose the Syriac font for Syriac original text.');
      if (original === translation) issues.push('Original and translation must be reviewed as separate text fields.');
      const supported = { latin: /^[\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, hebrew: /^[\p{Script=Hebrew}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, syriac: /^[\p{Script=Syriac}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, ethiopic: /^[\p{Script=Ethiopic}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u, cuneiform: /^[\p{Script=Cuneiform}\p{Script=Latin}\p{M}\p{P}\p{N}\p{Z}\r\n]*$/u };
      if (script !== 'transliteration-only' && !supported[script].test(original)) issues.push('This original contains characters outside the selected supported script. Use an explicitly reviewed transliteration fallback.');
      if (script === 'transliteration-only' && !supported.latin.test(transliteration)) issues.push('The reviewed transliteration fallback must use supported Latin text.');
      break;
    }
    case 'relationship-diagram': {
      const { nodes, edges, layout } = envelope.content;
      unique(nodes.map(node => node.id), 'Node'); unique(edges.map(edge => edge.id), 'Edge');
      const ids = nodes.map(node => node.id);
      const pairs = new Set<string>();
      edges.forEach(edge => {
        cue(edge.cueSeconds);
        if (!ids.includes(edge.from) || !ids.includes(edge.to) || edge.from === edge.to) issues.push('Every relationship must connect two different existing nodes.');
        const pair = [edge.from, edge.to].sort().join(':');
        if (pairs.has(pair)) issues.push('Combine parallel relationships into one labelled edge.'); pairs.add(pair);
        if (!edge.source.credit) issues.push('Each relationship needs a source/tradition credit.');
      });
      if (edges.length !== nodes.length - 1) issues.push('This readable diagram supports a connected chain, hub or tree (one fewer edge than nodes). Split dense networks across scenes.');
      if (layout === 'chain' && edges.some(edge => Math.abs(ids.indexOf(edge.from) - ids.indexOf(edge.to)) !== 1)) issues.push('Chain relationships must connect adjacent nodes in the authored order.');
      if (layout === 'hub' && edges.some(edge => edge.from !== ids[0] && edge.to !== ids[0])) issues.push('Hub relationships must connect to the first node.');
      if (layout === 'tree') {
        const parentCounts = ids.map(id => edges.filter(edge => edge.to === id).length);
        if (parentCounts.filter(count => count === 0).length !== 1 || parentCounts.some(count => count > 1)) issues.push('A tree needs one root and at most one parent per node.');
      }
      const visited = new Set<string>();
      const walk = (id: string) => { if (visited.has(id)) return; visited.add(id); edges.filter(edge => edge.from === id || edge.to === id).forEach(edge => walk(edge.from === id ? edge.to : edge.from)); };
      walk(ids[0]); if (visited.size !== ids.length) issues.push('Every node must be connected.');
      const points = diagramPositions(envelope.content, false);
      const orient = (a: {x:number;y:number},b: {x:number;y:number},c: {x:number;y:number}) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
      for (let i=0;i<edges.length;i++) for (let j=i+1;j<edges.length;j++) {
        const left=edges[i],right=edges[j]; if ([left.from,left.to].some(id => id===right.from || id===right.to)) continue;
        const a=points.get(left.from),b=points.get(left.to),c=points.get(right.from),d=points.get(right.to);
        if (a&&b&&c&&d&&orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0) issues.push('Relationships cross in this layout. Reorder nodes/edges or split the diagram; no relationship will be silently dropped.');
      }
      break;
    }
  }
  return [...new Set([...issues, ...phase4ContentIssues(envelope, seconds), ...phase5ContentIssues(envelope, seconds)])];
}

export function presentationReadingWords(envelope: PresentationEnvelope): number {
  const count = (texts: string[]) => texts.join(' ').trim().split(/\s+/u).filter(Boolean).length;
  switch (envelope.templateId) {
    case 'journey-map': return count([envelope.content.heading, ...envelope.content.stops.flatMap(stop => [stop.label, stop.date])]) + 12;
    case 'territory-change': return count([envelope.content.heading, envelope.content.dataset, ...envelope.content.states.flatMap(state => [state.date, state.label])]) + 12;
    case 'then-now': return count([envelope.content.heading, ...envelope.content.labels]) + 8;
    case 'layered-parallax': return count([envelope.content.heading]) + 8;
    case 'structure-cutaway': return count([envelope.content.heading, ...envelope.content.sections.flatMap(section => [section.label, section.description])]);
    case 'manuscript-comparison': return count([envelope.content.heading, ...envelope.content.passages.flatMap(passage => [passage.text, passage.transliteration, passage.edition, passage.language]), ...envelope.content.mappings.map(mapping => mapping.label)]);
    case 'evidence-board': return count([envelope.content.heading, ...envelope.content.cards.flatMap(card => [card.label, card.detail]), ...envelope.content.links.map(link => link.label)]);
    case 'animated-chart': return count([envelope.content.heading, envelope.content.axisLabel, envelope.content.unit, envelope.content.caveat, ...envelope.content.points.map(point => point.label)]) + envelope.content.points.length * 3;
    case 'competing-explanations': return count([envelope.content.heading, ...envelope.content.explanations.flatMap(item => [item.name, item.support, item.limitation])]);
    case 'chapter-recap': return count([envelope.content.heading, envelope.content.nextCue, ...envelope.content.items.map(item => item.takeaway)]);
    case 'cause-effect': return count([envelope.content.heading, ...envelope.content.steps.flatMap(step => [step.label, step.detail]), ...envelope.content.links.flatMap(link => [link.label, link.support])]);
    case 'scale-comparison': return count([envelope.content.heading, ...envelope.content.items.map(item => item.label)]) + 12;
    case 'fact-reveal': return count([envelope.content.value, envelope.content.unit, envelope.content.qualifier, envelope.content.context]);
    case 'claim-evidence': return count([envelope.content.heading, envelope.content.claim, envelope.content.evidence.label, envelope.content.evidence.passage, envelope.content.interpretation, envelope.content.limitation]);
    case 'historical-timeline': return count([envelope.content.heading, ...envelope.content.events.flatMap(event => [event.date.display, event.label])]);
    case 'person-introduction': return count([envelope.content.name, envelope.content.role, envelope.content.affiliation, envelope.content.dates]);
    case 'archival-explainer': return count([envelope.content.heading, envelope.content.body]);
    case 'map-locator': return count([envelope.content.heading, ...envelope.content.markers.map(marker => marker.label)]);
    case 'artifact-spotlight': return count([envelope.content.heading, ...envelope.content.metadata.flatMap(item => [item.label, item.value])]);
    case 'detail-annotation': return count([envelope.content.heading, ...envelope.content.regions.map(region => region.label)]);
    case 'manuscript-highlight': return count([envelope.content.heading, envelope.content.excerpt, envelope.content.translation, envelope.content.edition, envelope.content.folio]);
    case 'text-translation': return count([envelope.content.heading, envelope.content.translation, envelope.content.transliteration]) + Math.ceil(envelope.content.original.length / 10);
    case 'relationship-diagram': return count([envelope.content.heading, envelope.content.context, ...envelope.content.nodes.map(node => node.label), ...envelope.content.edges.map(edge => edge.label)]);
    default: return 0;
  }
}
