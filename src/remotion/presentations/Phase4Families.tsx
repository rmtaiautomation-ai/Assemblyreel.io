import React from 'react';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import { measurementRatios } from '../../lib/presentations/measurements';
import { FONTS } from '../fonts';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { SourceImage } from './CoreFamilies';

type Props = { envelope: PresentationEnvelope; presentation: ResolvedPresentation; style: StageStyle };
function Label({ children, style }: { children: React.ReactNode; style: StageStyle }) {
  return <div data-fit style={{ fontFamily: FONTS.mono, fontSize: 24 * style.unit, lineHeight: 1.2, color: style.theme.accentText, overflowWrap: 'anywhere' }}>{children}</div>;
}
export function Phase4Family({ envelope, presentation, style }: Props) {
  if (envelope.templateId === 'cause-effect') return <CauseEffect envelope={envelope} style={style} />;
  if (envelope.templateId === 'scale-comparison') return <ScaleComparison envelope={envelope} style={style} />;
  if (envelope.templateId === 'fact-reveal') {
    const c = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 * style.unit, textAlign: 'center', opacity: reveal(style.frame, style.fps, c.cueSeconds) }}>
      <Label style={style}>{c.kind === 'date' ? 'DATE' : c.kind === 'range' ? 'SUPPLIED RANGE' : 'ONE SOURCED FACT'}</Label>
      {c.qualifier && <Copy style={style} size={34}>{c.qualifier}</Copy>}
      <div data-fit style={{ fontFamily: FONTS.serif, fontSize: Math.max(52, Math.min(146, 900 / Math.max(1, c.value.length))) * style.unit, lineHeight: 1.05, fontWeight: 600, color: style.theme.accentText, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{c.value}</div>
      {c.unit && <Copy style={style} size={36}>{c.unit}</Copy>}<Copy style={style} size={36}>{c.context}</Copy>
    </div>;
  }
  if (envelope.templateId === 'claim-evidence') return <ClaimEvidence envelope={envelope} presentation={presentation} style={style} />;
  return null;
}

function CauseEffect({ envelope, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'cause-effect' }>; style: StageStyle }) {
  const c = envelope.content, vertical = style.portrait || style.square, compact = style.square && c.steps.length > 2;
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 * style.unit }}>
    <Heading style={style}>{c.heading}</Heading><Label style={style}>{c.links.every(link => link.type === 'sequential') ? 'NUMBERED SEQUENCE · ORDER DOES NOT ESTABLISH CAUSE' : 'AUTHORED LINKS · SEE THE SUPPLIED SUPPORT BELOW'}</Label>
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: compact ? 'grid' : 'flex', gridTemplateColumns: compact ? '1fr 1fr' : undefined, gridTemplateRows: compact ? '1fr 1fr' : undefined, flexDirection: vertical ? 'column' : 'row', gap: (compact ? 34 : 16) * style.unit, justifyContent: 'center' }}>
      {compact && <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', width: '100%', height: '100%' }}><defs><marker id="cause-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill={style.theme.accentLine} /></marker></defs>{c.links.map((link, i) => <path key={link.id} d={['M47 24L53 24', 'M76 47L76 53', 'M53 76L47 76'][i]} fill="none" stroke={style.theme.accentLine} strokeWidth=".35" strokeDasharray={link.type === 'sequential' ? '1 1' : undefined} markerEnd={link.type === 'causal' ? 'url(#cause-arrow)' : undefined} opacity={reveal(style.frame, style.fps, c.steps[i + 1].cueSeconds)} />)}</svg>}
      {c.steps.map((step, i) => <React.Fragment key={step.id}>
        <div data-fit-height style={{ flex: 1, minHeight: 0, order: i * 2, gridColumn: compact ? i === 0 || i === 3 ? 1 : 2 : undefined, gridRow: compact ? i < 2 ? 1 : 2 : undefined, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 * style.unit, padding: 18 * style.unit, background: style.theme.surface, border: `${2 * style.unit}px solid ${style.theme.grid}`, opacity: reveal(style.frame, style.fps, step.cueSeconds) }}>
          <Label style={style}>{String(i + 1).padStart(2, '0')}</Label><Copy style={style} size={34}>{step.label}</Copy>{step.detail && <Copy style={style} size={26}>{step.detail}</Copy>}
        </div>
        {!compact && i < c.links.length && <div data-fit style={{ order: i * 2 + 1, alignSelf: 'center', flexShrink: 0, fontSize: 28 * style.unit, color: style.theme.accentText, opacity: reveal(style.frame, style.fps, c.steps[i + 1].cueSeconds) }}>{c.links[i].type === 'causal' ? vertical ? '↓' : '→' : '·'}</div>}
      </React.Fragment>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: vertical ? '1fr' : `repeat(${c.links.length}, 1fr)`, gap: 12 * style.unit }}>{c.links.map((link, i) => <div key={link.id} style={{ opacity: reveal(style.frame, style.fps, c.steps[i + 1].cueSeconds) }}><Label style={style}>{i + 1}–{i + 2} · {link.type === 'causal' ? 'Causal' : 'Sequential'} · {link.label}</Label>{link.support && <Copy style={style} size={26}>{link.support}</Copy>}</div>)}</div>
  </div>;
}

function ScaleComparison({ envelope, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'scale-comparison' }>; style: StageStyle }) {
  const c = envelope.content, ratios = measurementRatios(c.items), reference = c.items.find(item => item.id === c.referenceId)!;
  const value = (item: typeof reference) => `${item.approximate ? 'c. ' : ''}${item.value} ${item.unit}`;
  const labels = c.items.map(item => <div key={item.id} style={{ textAlign: 'center', padding: 10 * style.unit }}><Label style={style}>{item.id === c.referenceId ? 'REFERENCE' : 'COMPARISON'}</Label><Copy style={style} size={30}>{item.label}</Copy><Copy style={style} size={32}>{value(item)}</Copy></div>);
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22 * style.unit }}>
    <Heading style={style}>{c.heading}</Heading><Label style={style}>{c.method === 'values-only' ? 'VALUES ONLY · NOT TO SCALE' : `PROPORTIONAL ${c.dimension.toUpperCase()} · LINEAR DIMENSIONS ONLY`}</Label>
    {c.method === 'values-only' ? <div style={{ flex: 1, display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : `repeat(${c.items.length}, 1fr)`, alignContent: 'center', gap: 18 * style.unit }}>{labels}</div> : c.dimension === 'height' ? <>
      <div data-scale-baseline style={{ flex: 1, minHeight: 100 * style.unit, display: 'flex', alignItems: 'flex-end', borderBottom: `${3 * style.unit}px solid ${style.theme.accentLine}`, gap: 30 * style.unit }}>
        {c.items.map((item, i) => <div key={item.id} style={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}><div data-measurement={item.id} style={{ width: '65%', height: `${ratios[i] * 100}%`, boxSizing: 'border-box', background: style.theme.accentLine, opacity: reveal(style.frame, style.fps, i * .2), border: item.id === c.referenceId ? `${3 * style.unit}px solid ${style.theme.text}` : undefined }} /></div>)}
      </div><div style={{ display: 'grid', gridTemplateColumns: `repeat(${c.items.length}, 1fr)`, gap: 30 * style.unit }}>{labels}</div>
    </> : <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24 * style.unit }}>{c.items.map((item, i) => <div key={item.id}>
      <Copy style={style} size={30}>{item.label} · {value(item)}{item.id === c.referenceId ? ' · reference' : ''}</Copy>
      <div data-scale-baseline style={{ borderLeft: `${3 * style.unit}px solid ${style.theme.text}`, marginTop: 10 * style.unit }}><div data-measurement={item.id} style={{ width: `${ratios[i] * 100}%`, height: 38 * style.unit, background: style.theme.accentLine, opacity: reveal(style.frame, style.fps, i * .2) }} /></div>
    </div>)}</div>}
    <Copy style={style} size={24}>Reference: {reference.label}. {c.items.some(item => item.approximate) ? 'c. = approximate. ' : ''}Neutral measurement guides, not object reconstructions.</Copy>
  </div>;
}

function ClaimEvidence({ envelope, presentation, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'claim-evidence' }>; presentation: ResolvedPresentation; style: StageStyle }) {
  const c = envelope.content, e = c.evidence;
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 18 * style.unit }}>
    <Heading style={style}>{c.heading}</Heading><div style={{ flexShrink: 0 }}><Label style={style}>CLAIM · NOT AN AUTOMATIC VERDICT</Label><Copy style={style} size={36}>{c.claim}</Copy></div>
    <div data-fit-height style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: style.portrait || style.square ? 'column' : 'row', gap: 24 * style.unit, padding: 20 * style.unit, background: style.theme.surface, opacity: reveal(style.frame, style.fps, c.cueSeconds) }}>
      {e.image && <div style={{ flex: 1, minHeight: 100 * style.unit }}><SourceImage image={e.image} presentation={presentation} style={style} /></div>}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 * style.unit }}>
        <Label style={style}>{e.kind === 'attributed' ? 'ATTRIBUTED EXPLANATION · NOT DIRECT EVIDENCE' : e.kind === 'passage' ? 'SUPPLIED PASSAGE' : 'SUPPLIED OBJECT IMAGE'}</Label><Copy style={style} size={28}>{e.label}</Copy>
        {e.passage && <div data-fit style={{ fontFamily: e.kind === 'passage' ? FONTS.serif : FONTS.sans, whiteSpace: 'pre-wrap', fontSize: 30 * style.unit, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{e.kind === 'passage' ? '“' : ''}{e.passage}{e.kind === 'passage' ? '”' : ''}</div>}
      </div>
    </div>
    <div style={{ flexShrink: 0 }}><Label style={style}>{c.scope === 'supports' ? 'SUPPORTED INTERPRETATION · CREATOR REVIEWED' : 'CONTEXT ONLY · DOES NOT ESTABLISH THE CLAIM'}</Label><Copy style={style} size={28}>{c.interpretation}</Copy></div>
    <div style={{ flexShrink: 0, borderLeft: `${3 * style.unit}px solid ${style.theme.accentLine}`, paddingLeft: 16 * style.unit }}><Label style={style}>LIMITS / WHAT REMAINS UNCERTAIN</Label><Copy style={style} size={28}>{c.limitation}</Copy></div>
  </div>;
}
