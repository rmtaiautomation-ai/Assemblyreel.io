import React from 'react';
import type { PresentationEnvelope } from '../../lib/presentations/schema';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { WEST_ASIA_LAND_V1, MAP_LONGITUDE_SCALE as scale } from './west-asia-v1';
import { FONTS } from '../fonts';

export function MapLocator({ envelope, style }: { envelope: Extract<PresentationEnvelope, { templateId: 'map-locator' }>; style: StageStyle }) {
  const { viewport, markers, heading } = envelope.content;
  const west = viewport.west * scale, top = -viewport.north, width = (viewport.east - viewport.west) * scale, height = viewport.north - viewport.south;
  const radius = Math.min(width, height) * .017;
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22 * style.unit }}><Heading style={style}>{heading}</Heading>
    <svg viewBox={`${west} ${top} ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', flex: 1, minHeight: 0 }}>
      <rect x={west} y={top} width={width} height={height} fill={style.theme.surface} />
      <path d={WEST_ASIA_LAND_V1} fill={style.theme.accentLine} fillOpacity=".23" stroke={style.theme.accentLine} strokeWidth={width / 900} fillRule="evenodd" />
      {markers.map((marker, index) => <g key={marker.id} opacity={reveal(style.frame, style.fps, marker.cueSeconds)}><circle cx={marker.longitude * scale} cy={-marker.latitude} r={radius * 2.1} fill={style.theme.background} stroke={style.theme.accentLine} strokeWidth={radius / 4} strokeDasharray={marker.approximate ? `${radius / 2}` : undefined} /><text x={marker.longitude * scale} y={-marker.latitude + radius * .65} textAnchor="middle" fill={style.theme.text} fontSize={radius * 2} fontFamily={FONTS.sans}>{index + 1}</text></g>)}
    </svg>
    <div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 10 * style.unit }}>{markers.map((marker, index) => <div key={marker.id} style={{ opacity: reveal(style.frame, style.fps, marker.cueSeconds) }}><Copy style={style} size={30}>{index + 1} · {marker.label}{marker.approximate ? ' (approximate)' : ''}</Copy></div>)}</div>
    <Copy style={style} size={24}>Modern geographic reference · no ancient borders · Natural Earth 1:110m</Copy>
  </div>;
}
