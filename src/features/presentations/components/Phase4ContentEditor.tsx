'use client';
import React from 'react';
import type { PresentationEnvelope } from '../../../lib/presentations/schema';
import { emptyImage, emptySource } from '../../../lib/presentations/drafts';
import { LINEAR_UNITS, measurementRatios } from '../../../lib/presentations/measurements';
import { TextField, NumberField, SelectField, buttonClass, fieldClass } from './fields';

export function Phase4ContentEditor({ draft, onChange }: { draft: PresentationEnvelope; onChange: (draft: PresentationEnvelope) => void }) {
  switch (draft.templateId) {
    case 'cause-effect': {
      const c = draft.content, update = (patch: Partial<typeof c>) => onChange({ ...draft, content: { ...c, ...patch } });
      return <><TextField label="Optional heading" value={c.heading} onChange={heading => update({ heading })} />
        <p className="text-xs text-ed-text-dim">Steps are ordered. Sequential links describe order, not cause. A causal link needs your supporting explanation and historical source on Sources.</p>
        {c.steps.map((step, index) => <div key={step.id} className="space-y-2 rounded border border-ed-border p-3">
          <TextField label={`Step ${index + 1}`} max={55} value={step.label} onChange={label => update({ steps: c.steps.map(item => item.id === step.id ? { ...item, label } : item) })} />
          <TextField label={`Step ${index + 1} detail`} max={100} value={step.detail} onChange={detail => update({ steps: c.steps.map(item => item.id === step.id ? { ...item, detail } : item) })} />
          <NumberField label={`Step ${index + 1} reveal (seconds)`} min={0} value={step.cueSeconds} onChange={value => update({ steps: c.steps.map(item => item.id === step.id ? { ...item, cueSeconds: value ?? 0 } : item) })} />
          {c.links[index] && <><SelectField label={`Link ${index + 1} meaning`} value={c.links[index].type} options={['sequential', 'causal']} onChange={type => update({ links: c.links.map((link, i) => i === index ? { ...link, type } : link) })} />
            <TextField label={`Link ${index + 1} label`} max={40} value={c.links[index].label} onChange={label => update({ links: c.links.map((link, i) => i === index ? { ...link, label } : link) })} />
            <TextField label={`Link ${index + 1} support`} multiline max={140} value={c.links[index].support} onChange={support => update({ links: c.links.map((link, i) => i === index ? { ...link, support } : link) })} /></>}
        </div>)}
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={c.steps.length >= 4} onClick={() => update({ steps: [...c.steps, { id: crypto.randomUUID(), label: '', detail: '', cueSeconds: c.steps.at(-1)!.cueSeconds + 1 }], links: [...c.links, { id: crypto.randomUUID(), type: 'sequential', label: '', support: '', source: emptySource() }] })}>Add step (up to 4)</button>
          <button type="button" className={buttonClass} disabled={c.steps.length <= 2} onClick={() => update({ steps: c.steps.slice(0, -1), links: c.links.slice(0, -1) })}>Remove last step and link</button></div></>;
    }
    case 'scale-comparison': {
      const c = draft.content, update = (patch: Partial<typeof c>) => onChange({ ...draft, content: { ...c, ...patch } });
      const ratios = measurementRatios(c.items);
      return <><TextField label="Optional heading" value={c.heading} onChange={heading => update({ heading })} />
        <SelectField label="Measured dimension" value={c.dimension} options={['height', 'length']} onChange={dimension => update({ dimension })} />
        <SelectField label="Scale method" value={c.method} options={['proportional', 'values-only']} onChange={method => update({ method })} />
        <p className="text-xs text-ed-text-dim">Linear measurements only. Proportions come from unit conversion, not guessed object size. Extremely unequal items require values-only; that layout explicitly says “not to scale”.</p>
        {c.items.map((item, index) => <div key={item.id} className="space-y-2 rounded border border-ed-border p-3">
          <TextField label={`Object ${index + 1}`} max={55} value={item.label} onChange={label => update({ items: c.items.map(row => row.id === item.id ? { ...row, label } : row) })} />
          <NumberField label={`Measurement ${index + 1}`} min={0} max={1e12} step={.001} value={item.value} onChange={value => update({ items: c.items.map(row => row.id === item.id ? { ...row, value: value ?? 0 } : row) })} />
          <SelectField label={`Unit ${index + 1}`} value={item.unit} options={LINEAR_UNITS} onChange={unit => update({ items: c.items.map(row => row.id === item.id ? { ...row, unit } : row) })} />
          <label className="flex gap-2 text-xs"><input type="checkbox" checked={item.approximate} onChange={e => update({ items: c.items.map(row => row.id === item.id ? { ...row, approximate: e.target.checked } : row) })} />Approximate measurement</label>
          {c.method === 'proportional' && Number.isFinite(ratios[index]) && <p className="text-xs">{(ratios[index] * 100).toFixed(2)}% of the largest supplied measurement</p>}
          <button type="button" className={buttonClass} disabled={c.items.length <= 2} onClick={() => { const items = c.items.filter(row => row.id !== item.id); update({ items, referenceId: c.referenceId === item.id ? items[0].id : c.referenceId }); }}>Remove measurement</button>
        </div>)}
        <label className="block text-xs">Reference object<select aria-label="Reference object" className={`${fieldClass} mt-1`} value={c.referenceId} onChange={e => update({ referenceId: e.target.value })}>{c.items.map((item, i) => <option key={item.id} value={item.id}>{item.label || `Object ${i + 1}`}</option>)}</select></label>
        <button type="button" className={buttonClass} disabled={c.items.length >= 3} onClick={() => update({ items: [...c.items, { id: crypto.randomUUID(), label: '', value: 0, unit: 'm', approximate: false, source: emptySource() }] })}>Add measurement (up to 3)</button></>;
    }
    case 'fact-reveal': {
      const c = draft.content, update = (patch: Partial<typeof c>) => onChange({ ...draft, content: { ...c, ...patch } });
      return <><SelectField label="Fact kind" value={c.kind} options={['quantity', 'date', 'range']} onChange={kind => update({ kind })} />
        <TextField label="Exact displayed value" max={45} value={c.value} onChange={value => update({ value })} />
        <TextField label="Unit / date convention" max={20} value={c.unit} onChange={unit => update({ unit })} />
        <TextField label="Qualifier (for example: approximately)" max={30} value={c.qualifier} onChange={qualifier => update({ qualifier })} />
        <TextField label="Fact context" max={140} multiline value={c.context} onChange={context => update({ context })} />
        <NumberField label="Fact reveal (seconds)" min={0} value={c.cueSeconds} onChange={value => update({ cueSeconds: value ?? 0 })} />
        <p className="text-xs text-ed-text-dim">Copy the supplied value exactly, including ranges and uncertainty. The reveal does not count from zero or animate through fabricated dates. Credit the fact on Sources.</p></>;
    }
    case 'claim-evidence': {
      const c = draft.content, update = (patch: Partial<typeof c>) => onChange({ ...draft, content: { ...c, ...patch } });
      return <><TextField label="Optional heading" value={c.heading} onChange={heading => update({ heading })} />
        <TextField label="Claim" multiline max={150} value={c.claim} onChange={claim => update({ claim })} />
        <SelectField label="Evidence kind" value={c.evidence.kind} options={['passage', 'object', 'attributed']} onChange={kind => update({ evidence: { ...c.evidence, kind }, ...(kind === 'attributed' ? { scope: 'context-only' as const } : {}) })} />
        <SelectField label="Evidence scope" value={c.scope} options={c.evidence.kind === 'attributed' ? ['context-only'] : ['supports', 'context-only']} onChange={scope => update({ scope })} />
        <TextField label="Specific evidence / attribution" max={75} value={c.evidence.label} onChange={label => update({ evidence: { ...c.evidence, label } })} />
        <TextField label="Exact supplied passage / explanation" multiline max={280} value={c.evidence.passage} onChange={passage => update({ evidence: { ...c.evidence, passage } })} />
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={Boolean(c.evidence.image)} disabled={c.evidence.kind === 'attributed' && !c.evidence.image} onChange={e => update({ evidence: { ...c.evidence, image: e.target.checked ? emptyImage(crypto.randomUUID()) : null } })} />Include a source image (required for object evidence)</label>
        <TextField label="What the evidence establishes" multiline max={180} value={c.interpretation} onChange={interpretation => update({ interpretation })} />
        <TextField label="Limits / what remains uncertain" multiline max={140} value={c.limitation} onChange={limitation => update({ limitation })} />
        <NumberField label="Evidence reveal (seconds)" min={0} value={c.cueSeconds} onChange={value => update({ cueSeconds: value ?? 0 })} />
        <p className="text-xs text-ed-text-dim">No automatic verified stamp. When direct evidence is unavailable choose attributed, remove any source image, and explain its limits. Changing a kind keeps your text for review.</p></>;
    }
    default: return null;
  }
}
