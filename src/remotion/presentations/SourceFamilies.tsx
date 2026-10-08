import React, { useState } from 'react';
import { Img, continueRender, delayRender } from 'remotion';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import type { FocusRegion } from '../../lib/presentations/families';
import { FONTS } from '../fonts';
import { Heading, Copy, reveal, type StageStyle } from './Stage';

function RegionImage({ presentation, regions, style }: { presentation: ResolvedPresentation; regions: FocusRegion[]; style: StageStyle }) {
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [handle] = useState(() => delayRender('Loading the original detail image'));
  const [error, setError] = useState('');
  const url = presentation.assets[0]?.url;
  const active = [...regions].reverse().find(region => style.frame / style.fps >= region.cueSeconds) ?? regions[0];
  if (error) throw new Error(error);
  if (size && (active.width * size.width < 60 || active.height * size.height < 60)) throw new Error('This region contains fewer than 60 source pixels on one edge. Select a larger detail or upload a higher-resolution original; pixels will not be invented.');
  const viewBox = size ? `${active.x * size.width} ${active.y * size.height} ${active.width * size.width} ${active.height * size.height}` : '0 0 1 1';
  return <div style={{ height: '100%', display: 'flex', flexDirection: style.portrait ? 'column' : 'row', gap: 25 * style.unit, minHeight: 0 }}>
    {url && <Img src={url} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onLoad={event => { const image = event.currentTarget; setSize({ width: image.naturalWidth, height: image.naturalHeight }); continueRender(handle); }} onError={() => { setError('The source image could not be loaded.'); continueRender(handle); }} />}
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 * style.unit }}>
      {size && <svg style={{ flex: 1, width: '100%', minHeight: 0 }} viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet"><image href={url} width={size.width} height={size.height} />{regions.map((region, index) => <g key={region.id} opacity={reveal(style.frame, style.fps, region.cueSeconds)}><rect x={region.x * size.width} y={region.y * size.height} width={region.width * size.width} height={region.height * size.height} fill="none" stroke={style.theme.accent} strokeWidth={Math.min(size.width, size.height) * .008} /><text x={(region.x + .01) * size.width} y={(region.y + .04) * size.height} fill={style.theme.accent} fontFamily={FONTS.sans} fontSize={Math.min(size.width, size.height) * .04}>{index + 1}</text></g>)}</svg>}
      <Copy style={style} size={24}>Original image · authored region</Copy>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 * style.unit }}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', flex: 1, minHeight: 0, background: style.theme.surface, border: `${3 * style.unit}px solid ${style.theme.accent}`, opacity: reveal(style.frame, style.fps, active.cueSeconds) }}>{size && <image href={url} width={size.width} height={size.height} />}</svg>
      <Copy style={style} size={28}>{regions.indexOf(active) + 1} · {active.label}</Copy>
    </div>
  </div>;
}

export function SourceFamily({ envelope, presentation, style }: { envelope: PresentationEnvelope; presentation: ResolvedPresentation; style: StageStyle }) {
  const { unit, theme, frame, fps } = style;
  if (envelope.templateId === 'detail-annotation' || envelope.templateId === 'manuscript-highlight') {
    const manuscript = envelope.templateId === 'manuscript-highlight' ? envelope.content : undefined;
    const regions = envelope.templateId === 'detail-annotation' ? envelope.content.regions : [envelope.content.region];
    return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 22 * unit }}><Heading style={style}>{envelope.content.heading}</Heading>
      <div style={{ flex: 1, minHeight: 0 }}><RegionImage presentation={presentation} regions={regions} style={style} /></div>
      {manuscript && <div style={{ background: theme.surface, padding: 20 * unit, display: 'flex', flexDirection: 'column', gap: 12 * unit }}><Copy style={style} size={24}>{manuscript.edition} · {manuscript.folio}</Copy>{manuscript.excerpt && <Copy style={style} size={32}>“{manuscript.excerpt}”</Copy>}{manuscript.translation && <Copy style={style} size={32}>{manuscript.translation}</Copy>}</div>}
    </div>;
  }
  if (envelope.templateId === 'text-translation') {
    const { heading, original, translation, transliteration, language, edition, direction, script, cueSeconds } = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 * unit }}><Heading style={style}>{heading}</Heading>
      <div style={{ background: theme.surface, padding: 30 * unit, borderLeft: `${4 * unit}px solid ${theme.accent}` }}>
        <Copy style={style} size={26}>{language} · {script === 'transliteration-only' ? 'Reviewed transliteration fallback' : 'Supplied original'}</Copy>
        <div data-fit dir={script === 'transliteration-only' ? 'ltr' : direction} style={{ fontFamily: style.scriptFont, fontSize: (script === 'cuneiform' ? 62 : 48) * unit, lineHeight: 1.6, marginTop: 15 * unit, whiteSpace: 'pre-wrap', unicodeBidi: 'isolate', overflowWrap: 'anywhere' }}>{script === 'transliteration-only' ? transliteration : original}</div>
        {transliteration && script !== 'transliteration-only' && <div data-fit style={{ marginTop: 12 * unit,fontFamily: FONTS.serif,fontSize: 28 * unit,lineHeight: 1.3,overflowWrap: 'anywhere' }}>{transliteration}</div>}
      </div>
      <div style={{ borderTop: `${2 * unit}px solid ${theme.accent}`, paddingTop: 25 * unit, opacity: reveal(frame, fps, cueSeconds) }}><Copy style={style} size={26}>Supplied translation</Copy><div data-fit style={{ fontFamily: FONTS.serif, fontSize: 42 * unit, lineHeight: 1.3, marginTop: 15 * unit, overflowWrap: 'anywhere' }}>{translation}</div></div>
      <Copy style={style} size={24}>{edition}</Copy>
    </div>;
  }
  return null;
}
