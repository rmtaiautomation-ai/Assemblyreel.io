import React from 'react';
import { Img } from 'remotion';
import type { PresentationEnvelope, PresentationImage, ResolvedPresentation } from '../../lib/presentations/schema';
import { splitHighlights } from '../../lib/presentations/content';
import { FONTS } from '../fonts';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { accentTint } from './themes';

export function SourceImage({ image, presentation, style, cutout = false }: { image: PresentationImage; presentation: ResolvedPresentation; style: StageStyle; cutout?: boolean }) {
  const url = presentation.assets.find(asset => asset.itemId === image.id)?.url;
  return <div style={{ minHeight: 0, height: '100%', position: 'relative', border: cutout ? undefined : `${8 * style.unit}px solid ${style.theme.paper}`, boxSizing: 'border-box' }}>
    {url && <Img src={url} style={{ width: '100%', height: '100%', display: 'block', objectFit: image.fit, objectPosition: `${image.focalPoint.x * 100}% ${image.focalPoint.y * 100}%` }} />}
  </div>;
}
type FamilyProps = { envelope: PresentationEnvelope; presentation: ResolvedPresentation; style: StageStyle };
export function CoreFamily({ envelope, presentation, style }: FamilyProps) {
  const { unit, portrait, theme, frame, fps } = style;
  if (envelope.templateId === 'person-introduction') {
    const { portrait: image, name, role, affiliation, dates, side, treatment } = envelope.content;
    const direction = portrait ? 'column' : side === 'left' ? 'row' : 'row-reverse';
    return <div style={{ height: '100%', display: 'flex', flexDirection: direction, alignItems: 'stretch', gap: 42 * unit }}>
      {image && <div style={{ flex: portrait ? '0 1 48%' : '0 0 40%', minHeight: 150 * unit, transform: `translateX(${(1 - reveal(frame, fps)) * (side === 'left' ? -60 : 60) * unit}px)` }}><SourceImage image={image} presentation={presentation} style={style} cutout={treatment === 'cutout'} /></div>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 * unit }}>
        <div data-layout-motion style={{ transform: `translateY(${(1 - reveal(frame, fps, .12)) * -30 * unit}px)`, opacity: reveal(frame, fps, .12) }}><Copy style={style} size={30}>{role}</Copy></div>
        <div data-fit data-layout-motion style={{ fontFamily: FONTS.serif, fontSize: (portrait ? 68 : 86) * unit, lineHeight: 1.03, color: theme.accentText, overflowWrap: 'anywhere', opacity: reveal(frame, fps, .25), transform: `translateY(${(1 - reveal(frame, fps, .25)) * 35 * unit}px)` }}>{name}</div>
        <Copy style={style} size={30}>{affiliation}</Copy><Copy style={style} size={28}>{dates}</Copy>
      </div>
    </div>;
  }
  if (envelope.templateId === 'archival-explainer') {
    const { kicker, heading, body, highlights, textKind } = envelope.content;
    return <div style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 25 * unit, padding: (portrait ? 32 : 48) * unit, background: theme.paper, color: '#201B15', boxShadow: `0 ${12 * unit}px ${35 * unit}px #0003` }}>
      {kicker && <div data-fit style={{ fontFamily: FONTS.mono, fontSize: 26 * unit, letterSpacing: 3 * unit }}>{kicker}</div>}
      <Heading style={style}>{heading}</Heading>
      <div style={{ height: 2 * unit, background: '#514B4055', flexShrink: 0 }} />
      <div data-fit style={{ fontFamily: FONTS.serif, fontSize: (portrait ? 36 : 40) * unit, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {textKind === 'quotation' && '“'}{splitHighlights(body, highlights).map((piece, index) => <span key={index} style={{ background: piece.cueSeconds !== undefined ? accentTint(theme.accent,.35 * reveal(frame,fps,piece.cueSeconds)) : undefined }}>{piece.text}</span>)}{textKind === 'quotation' && '”'}
      </div>
      <Copy style={style} size={24}>{textKind === 'quotation' ? 'Supplied quotation' : 'Source explanation · not a manuscript facsimile'}</Copy>
    </div>;
  }
  if (envelope.templateId === 'artifact-spotlight') {
    const { heading, image, metadata } = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 24 * unit }}><Heading style={style}>{heading}</Heading>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 32 * unit }}>
        <div style={{ flex: metadata.length ? 2 : 1, minHeight: 150 * unit }}><SourceImage image={image} presentation={presentation} style={style} /></div>
        {metadata.length > 0 && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 * unit }}>{metadata.map(item => <div key={item.id} style={{ borderLeft: `${3 * unit}px solid ${theme.accent}`, paddingLeft: 18 * unit }}><div data-fit style={{ color: theme.muted, fontFamily: FONTS.mono, fontSize: 24 * unit, marginBottom: 5 * unit }}>{item.label}</div><Copy style={style} size={32}>{item.value}</Copy></div>)}</div>}
      </div>
    </div>;
  }
  return null;
}
