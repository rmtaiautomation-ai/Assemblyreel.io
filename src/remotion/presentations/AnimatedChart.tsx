import React from 'react';
import type { PresentationEnvelope } from '../../lib/presentations/schema';
import { Heading, Copy, reveal, type StageStyle } from './Stage';

export function AnimatedChart({ envelope, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'animated-chart' }>; style: StageStyle }) {
  const c = envelope.content, maximum = Math.max(...c.points.map(point => point.high ?? point.value ?? 0)), xSpan = c.points.at(-1)!.x - c.points[0].x;
  // Normalized axes fill the available panel; HTML ticks retain a real readable font size.
  const x = (i: number) => c.kind === 'line' ? (c.points[i].x - c.points[0].x) / xSpan * 1000 : (i + .5) / c.points.length * 1000;
  const y = (value: number) => 1000 - value / maximum * 1000;
  const format = (value: number) => new Intl.NumberFormat('en', { maximumSignificantDigits: 4, notation: Math.abs(value) >= 1e6 || value !== 0 && Math.abs(value) < .001 ? 'scientific' : 'standard' }).format(value);
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 18 * style.unit }}><Heading style={style}>{c.heading}</Heading><Copy style={style} size={26}>{c.unit} · zero baseline</Copy>
    <div style={{ flex: 1, minHeight: 220 * style.unit, position: 'relative' }}><div style={{ position: 'absolute', top: 20 * style.unit, bottom: 42 * style.unit, left: 110 * style.unit, right: 35 * style.unit }}>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {[0,.5,1].map(fraction => <path key={fraction} d={`M0 ${y(maximum * fraction)}H1000`} stroke={style.theme.grid} vectorEffect="non-scaling-stroke" />)}<path d="M0 0V1000H1000" fill="none" stroke={style.theme.text} strokeWidth={2 * style.unit} vectorEffect="non-scaling-stroke" />
        {c.points.map((point,i) => <g key={point.id} data-chart-point={i} opacity={reveal(style.frame,style.fps,i * .25)}>
          {c.kind === 'line' && i > 0 && point.value !== null && c.points[i - 1].value !== null && <path data-chart-segment d={`M${x(i - 1)} ${y(c.points[i - 1].value!)}L${x(i)} ${y(point.value)}`} fill="none" stroke={style.theme.accent} strokeWidth={4 * style.unit} strokeDasharray={point.estimated || c.points[i - 1].estimated ? `${10 * style.unit} ${6 * style.unit}` : undefined} vectorEffect="non-scaling-stroke" />}
          {point.value !== null && (c.kind === 'bar' ? <rect data-chart-bar x={x(i) - 28} y={y(point.value)} width="56" height={1000 - y(point.value)} fill={style.theme.accent} fillOpacity={point.estimated ? .5 : 1} /> : <path d={`M${x(i)} ${y(point.value)}h.1`} stroke={style.theme.accent} strokeWidth={12 * style.unit} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          {point.low !== null && point.high !== null && <path data-chart-range d={`M${x(i)} ${y(point.low)}V${y(point.high)}M${x(i) - 10} ${y(point.low)}h20M${x(i) - 10} ${y(point.high)}h20`} stroke={style.theme.text} strokeWidth={3 * style.unit} vectorEffect="non-scaling-stroke" />}
        </g>)}
      </svg>
      {[0,.5,1].map(fraction => <div key={fraction} data-fit style={{ position: 'absolute', right: '100%', top: `${100 * (1 - fraction)}%`, transform: 'translateY(-50%)', paddingRight: 14 * style.unit, fontSize: 26 * style.unit, color: style.theme.muted }}>{format(maximum * fraction)}</div>)}
      {c.points.map((point,i) => <div key={point.id} data-fit style={{ position: 'absolute', left: `${x(i) / 10}%`, top: '100%', transform: 'translateX(-50%)', marginTop: 10 * style.unit, fontSize: 26 * style.unit }}>{i + 1}{point.value === null ? ' · —' : ''}</div>)}
    </div></div><Copy style={style} size={26}>{c.axisLabel}{c.kind === 'line' ? ' · actual x spacing' : ' · categories'}</Copy>
    <div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 8 * style.unit }}>{c.points.map((point,i) => <Copy key={point.id} style={style} size={26}>{i + 1} · {point.label}{c.kind === 'line' ? ` (x=${point.x})` : ''}: {point.value === null ? 'missing' : `${point.estimated ? '≈ ' : ''}${point.value} ${c.unit}`}{point.low !== null ? ` [${point.low}–${point.high}]` : ''}</Copy>)}</div><Copy style={style} size={24}>{c.caveat}</Copy></div>;
}
