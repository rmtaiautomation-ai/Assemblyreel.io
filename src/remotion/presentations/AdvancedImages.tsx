import React, { useId } from 'react';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { PreparedImages, type ImageSize } from './PreparedImages';
import { SourceImage } from './CoreFamilies';

function cropBox(crop: { x: number; y: number; width: number; height: number }, size: ImageSize) { return `${crop.x * size.width} ${crop.y * size.height} ${crop.width * size.width} ${crop.height * size.height}`; }
function imageLabel(label: string, classification: string) { return `${label}${classification === 'reconstruction' ? ' · RECONSTRUCTION' : classification === 'illustration' ? ' · Illustration' : ''}`; }

export function AdvancedImageFamily({ envelope, presentation, style }: { envelope: PresentationEnvelope; presentation: ResolvedPresentation; style: StageStyle }) {
  const clipPrefix = useId().replace(/:/g, '');
  if (envelope.templateId === 'then-now') {
    const c = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 * style.unit }}><Heading style={style}>{c.heading}</Heading><div style={{ flex: 1, minHeight: 0 }}><PreparedImages presentation={presentation}>{sizes => {
      const ratios = sizes.map((size, i) => c.crops[i].width * size.width / (c.crops[i].height * size.height));
      if (sizes.some((size, i) => c.crops[i].width * size.width < 60 || c.crops[i].height * size.height < 60)) throw Error('A comparison crop has fewer than 60 source pixels. Use a larger crop or higher-resolution source.');
      if (c.method === 'wipe' && Math.abs(ratios[0] / ratios[1] - 1) > .01) throw Error('Aligned wipe crops need matching aspect ratios within 1%. Align the originals or use side-by-side.');
      const images = c.images.map((image, i) => <svg key={image.id} viewBox={cropBox(c.crops[i], sizes[i])} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}><image href={presentation.assets[i].url} width={sizes[i].width} height={sizes[i].height} /></svg>);
      return c.method === 'wipe' ? <div style={{ height: '100%', position: 'relative' }}>{images[0]}<div data-wipe style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 * (1 - reveal(style.frame, style.fps, c.cueSeconds))}% 0 0)` }}>{images[1]}</div></div> : <div style={{ height: '100%', display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gridTemplateRows: style.portrait ? '1fr 1fr' : '1fr', gap: 24 * style.unit }}>{images}</div>;
    }}</PreparedImages></div><div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 12 * style.unit }}>{c.labels.map((label, i) => <Copy key={i} style={style} size={30}>{i + 1} · {imageLabel(label, c.images[i].source.classification)}</Copy>)}</div><Copy style={style} size={24}>{c.method === 'wipe' ? 'Creator-reviewed aligned crops' : 'Side-by-side · alignment not implied'}</Copy></div>;
  }
  if (envelope.templateId === 'layered-parallax') {
    const c = envelope.content, progress = Math.min(1, Math.max(0, style.frame / Math.max(1, presentation.durationInFrames - 1))), axis = ['left', 'right'].includes(c.motion) ? 'x' : 'y', direction = ['left', 'up'].includes(c.motion) ? -1 : 1;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 * style.unit }}><Heading style={style}>{c.heading}</Heading><div style={{ flex: 1, minHeight: 0 }}><PreparedImages presentation={presentation}>{sizes => {
      const size = sizes[0]; if (sizes.some(item => item.width !== size.width || item.height !== size.height)) throw Error('Prepared depth layers must have identical source dimensions and registration. Use the original full-size transparent layers.');
      const focalX = (c.focalPoint.x - .5) * size.width * .04, focalY = (c.focalPoint.y - .5) * size.height * .04;
      return <svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}><defs><clipPath id={`${clipPrefix}-depth`}><rect width={size.width} height={size.height} /></clipPath></defs><g clipPath={`url(#${clipPrefix}-depth)`}>{c.layers.map((layer, i) => { const motion = (progress - .5) * .05 * layer.depth * direction, x = axis === 'x' ? motion * size.width : 0, y = axis === 'y' ? motion * size.height : 0; return <image key={layer.image.id} data-depth={layer.depth} href={presentation.assets[i].url} width={size.width} height={size.height} transform={`translate(${-size.width * .08 + focalX + x} ${-size.height * .08 + focalY + y}) scale(1.16)`} />; })}</g></svg>;
    }}</PreparedImages></div><Copy style={style} size={24}>Prepared layered image · bounded depth motion · creator-reviewed plate and transparency</Copy></div>;
  }
  if (envelope.templateId === 'structure-cutaway') {
    const c = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 * style.unit }}><Heading style={style}>{c.heading}</Heading><div style={{ flex: 1, minHeight: 0 }}><PreparedImages presentation={presentation}>{sizes => {
      const size = sizes[0]; if (c.sections.some(section => section.width * size.width < 60 || section.height * size.height < 60)) throw Error('A cutaway section contains fewer than 60 source pixels. Select a larger section or use a higher-resolution diagram.');
      return <svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}><image href={presentation.assets[0].url} width={size.width} height={size.height} opacity=".15" />{c.sections.map((section,i) => <g key={section.id} opacity={reveal(style.frame, style.fps, section.cueSeconds)}><defs><clipPath id={`${clipPrefix}-section-${section.id}`}><rect x={section.x * size.width} y={section.y * size.height} width={section.width * size.width} height={section.height * size.height} /></clipPath></defs><image href={presentation.assets[0].url} width={size.width} height={size.height} clipPath={`url(#${clipPrefix}-section-${section.id})`} /><rect x={section.x * size.width} y={section.y * size.height} width={section.width * size.width} height={section.height * size.height} fill="none" stroke={style.theme.accent} strokeWidth={Math.min(size.width,size.height) * .007} /><circle cx={(section.x + .035) * size.width} cy={(section.y + .04) * size.height} r={Math.min(size.width,size.height) * .025} fill={style.theme.background} /><text x={(section.x + .035) * size.width} y={(section.y + .05) * size.height} textAnchor="middle" fill={style.theme.text} fontSize={Math.min(size.width,size.height) * .035}>{i + 1}</text></g>)}</svg>;
    }}</PreparedImages></div><div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 10 * style.unit }}>{c.sections.map((section,i) => <div key={section.id} style={{ opacity: reveal(style.frame,style.fps,section.cueSeconds) }}><Copy style={style} size={28}>{i + 1} · {section.label} — {section.description}</Copy></div>)}</div><Copy style={style} size={24}>Authored cutaway · reveals supplied diagram pixels only</Copy></div>;
  }
  if (envelope.templateId === 'chapter-recap') {
    const c = envelope.content;
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22 * style.unit }}><Heading style={style}>{c.heading}</Heading><div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gridTemplateRows: `repeat(${style.portrait ? c.items.length : Math.ceil(c.items.length / 2)}, minmax(0,1fr))`, gap: 20 * style.unit }}>{c.items.map((item, i) => <div key={item.id} data-fit-height style={{ minHeight: 0, display: 'flex', flexDirection: style.portrait ? 'row' : 'column', gap: 12 * style.unit, padding: 16 * style.unit, background: style.theme.surface, opacity: reveal(style.frame,style.fps,i * .6) }}><div style={{ flex: 1, minHeight: 0 }}><SourceImage image={item.image} presentation={presentation} style={style} /></div><div style={{ flexGrow: style.portrait ? 1 : 0, flexBasis: style.portrait ? 0 : 'auto', flexShrink: 0 }}><Copy style={style} size={30}>{i + 1} · {item.takeaway}</Copy></div></div>)}</div><Copy style={style} size={30}>Next · {c.nextCue}</Copy></div>;
  }
  return null;
}
