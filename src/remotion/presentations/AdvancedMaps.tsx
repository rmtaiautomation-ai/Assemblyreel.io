import React from 'react';
import type { PresentationEnvelope } from '../../lib/presentations/schema';
import { WEST_ASIA_LAND_V1, MAP_LONGITUDE_SCALE as scale } from './west-asia-v1';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { FONTS } from '../fonts';

export function AdvancedMap({ envelope, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'journey-map' | 'territory-change' }>; style: StageStyle }) {
  const c = envelope.content, v = c.viewport, west = v.west * scale, top = -v.north, width = (v.east - v.west) * scale, height = v.north - v.south, radius = Math.min(width, height) * .018;
  const current = envelope.templateId === 'territory-change' ? [...envelope.content.states].reverse().find(state => state.cueSeconds <= style.frame / style.fps) : undefined;
  const route = envelope.templateId === 'journey-map' ? envelope.content.mode === 'schematic' ? envelope.content.stops.map(stop => stop.point) : envelope.content.route : [];
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 * style.unit }}><Heading style={style}>{c.heading}</Heading>
    {envelope.templateId === 'territory-change' && <Copy style={style} size={34}>{current ? `${current.approximate ? 'Approximate · ' : ''}${current.date} · ${current.label}` : 'Dated snapshots · awaiting first state'}</Copy>}
    <svg viewBox={`${west} ${top} ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', flex: 1, minHeight: 0 }}>
      <rect x={west} y={top} width={width} height={height} fill={style.theme.surface} />
      <path d={WEST_ASIA_LAND_V1} fill={style.theme.accentLine} fillOpacity=".18" stroke={style.theme.accentLine} strokeWidth={width / 900} fillRule="evenodd" />
      {envelope.templateId === 'journey-map' && <><polyline data-route points={route.map(point => `${point[0] * scale},${-point[1]}`).join(' ')} pathLength={envelope.content.mode === 'schematic' ? undefined : 1} fill="none" stroke={style.theme.accent} strokeWidth={radius * .55} strokeDasharray={envelope.content.mode === 'schematic' ? `${radius}` : 1} strokeDashoffset={envelope.content.mode === 'schematic' ? undefined : 1 - reveal(style.frame, style.fps)} opacity={reveal(style.frame, style.fps)} />{envelope.content.stops.map((stop, i) => <g key={stop.id} opacity={reveal(style.frame, style.fps, stop.cueSeconds)}><circle cx={stop.point[0] * scale} cy={-stop.point[1]} r={radius * 1.7} fill={style.theme.background} stroke={style.theme.accent} strokeWidth={radius / 4} strokeDasharray={stop.approximate ? radius / 2 : undefined} /><text x={stop.point[0] * scale} y={-stop.point[1] + radius * .5} fill={style.theme.text} fontSize={radius * 1.7} textAnchor="middle" fontFamily={FONTS.sans}>{i + 1}</text></g>)}</>}
      {current?.polygons.map((polygon, i) => <polygon key={`${current.id}:${i}`} data-territory-state={current.id} points={polygon.map(point => `${point[0] * scale},${-point[1]}`).join(' ')} fill={style.theme.accent} fillOpacity={.4 * reveal(style.frame, style.fps, current.cueSeconds)} stroke={style.theme.accent} strokeWidth={radius / 3} strokeDasharray={current.approximate ? radius : undefined} />)}
    </svg>
    {envelope.templateId === 'journey-map' ? <><div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 8 * style.unit }}>{envelope.content.stops.map((stop, i) => <div key={stop.id} style={{ opacity: reveal(style.frame, style.fps, stop.cueSeconds) }}><Copy style={style} size={28}>{i + 1} · {stop.label}{stop.date ? ` · ${stop.date}` : ''}{stop.approximate ? ' · approximate' : ''}</Copy></div>)}</div><Copy style={style} size={24}>{envelope.content.mode === 'schematic' ? 'SCHEMATIC CONNECTIONS · actual travel path unknown' : 'Supplied route geometry · not independently verified'}</Copy></> : <><Copy style={style} size={26}>{envelope.content.dataset} · {envelope.content.states.map(state => state.date).join(' → ')}</Copy><Copy style={style} size={24}>Discrete supplied borders · no interpolated territory · {current?.source.classification === 'reconstruction' ? 'RECONSTRUCTION' : 'creator-reviewed dataset'}</Copy></>}
    <Copy style={style} size={22}>Modern geographic reference · Natural Earth 1:110m</Copy>
  </div>;
}
