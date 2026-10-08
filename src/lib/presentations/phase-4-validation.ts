import type { PresentationEnvelope } from './schema';
import { measurementRatios, MIN_READABLE_SCALE_RATIO } from './measurements';

export function phase4ContentIssues(envelope: PresentationEnvelope, seconds: number): string[] {
  const issues: string[] = [];
  const credit = (value: string) => { if (!value.trim()) issues.push('Supply a specific source credit before applying this template.'); };
  const cue = (value: number) => { if (value + 1.5 > seconds) issues.push('Each reveal needs at least 1.5 seconds before the presentation ends.'); };
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) issues.push('Item IDs must be distinct.'); };
  switch (envelope.templateId) {
    case 'cause-effect': {
      const { steps, links } = envelope.content;
      unique([...steps.map(step => step.id), ...links.map(link => link.id)]);
      if (links.length !== steps.length - 1) issues.push('Provide exactly one link between each adjacent pair of steps.');
      steps.forEach((step, index) => { cue(step.cueSeconds); if (index && step.cueSeconds < steps[index - 1].cueSeconds) issues.push('Ordered steps must reveal in authored order.'); });
      links.forEach(link => {
        credit(link.source.credit);
        if (link.type === 'causal' && (!link.support.trim() || link.source.classification !== 'historical')) issues.push('A causal link needs a supplied supporting explanation and a historical source. Otherwise explicitly use a sequential link.');
      });
      break;
    }
    case 'scale-comparison': {
      const { items, referenceId, method } = envelope.content;
      unique(items.map(item => item.id)); items.forEach(item => credit(item.source.credit));
      if (!items.some(item => item.id === referenceId)) issues.push('Choose a reference from the supplied measurement items.');
      if (method === 'proportional' && measurementRatios(items).some(ratio => ratio < MIN_READABLE_SCALE_RATIO)) issues.push('The smallest item is below the readable proportional scale. Choose values-only or split the comparison; dimensions will not be exaggerated.');
      break;
    }
    case 'fact-reveal': credit(envelope.content.source.credit); cue(envelope.content.cueSeconds); break;
    case 'claim-evidence': {
      const { evidence, scope, cueSeconds } = envelope.content;
      credit(evidence.source.credit); cue(cueSeconds);
      if (evidence.kind === 'passage' && !evidence.passage.trim()) issues.push('Supply the exact passage, or explicitly choose attributed explanation.');
      if (evidence.kind === 'object' && !evidence.image) issues.push('Object evidence needs a supplied project image.');
      if (evidence.kind === 'attributed' && (scope !== 'context-only' || evidence.image)) issues.push('Attributed explanation is context-only, without a direct-evidence image.');
      break;
    }
  }
  return issues;
}
