import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Easing, Img, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ImageComparisonEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import { FONTS, waitForFonts } from '../fonts';
import { presentationSafeBottom } from '../captions/layout';
import { presentationTheme } from './themes';

export function ImageComparison({ presentation, captions, preRollFrames = 0 }: { presentation: ResolvedPresentation; captions: boolean; preRollFrames?: number }) {
  const rawFrame = useCurrentFrame() - preRollFrames - presentation.startFrame;
  const frame = Math.max(0, rawFrame);
  const { envelope } = presentation;
  if (envelope.templateId !== 'image-comparison') return null;
  if (rawFrame >= presentation.durationInFrames || (rawFrame < 0 && presentation.startFrame > 0)) return null;
  return <ComparisonLayout presentation={presentation} envelope={envelope} captions={captions} frame={frame} />;
}

function ComparisonLayout({ presentation, envelope, captions, frame }: { presentation: ResolvedPresentation; envelope: ImageComparisonEnvelope; captions: boolean; frame: number }) {
  const { width, height, fps } = useVideoConfig();
  const cards = useRef<HTMLDivElement>(null);
  const [measurementHandle] = useState(() => delayRender('Measuring comparison text'));
  const [layoutError, setLayoutError] = useState<string>();
  const theme = presentationTheme(envelope.theme);
  const accent = envelope.theme.overrides.accent ?? theme.accent;
  const unit = Math.min(width, height) / 1080;
  const portrait = height / width > 1.2;
  const margin = Math.min(width, height) * 0.06;
  const gap = (envelope.theme.version === 2 && envelope.style?.density === 'compact' ? 40 : 54) * unit;
  const border = envelope.content.border === 'paper' ? 17 * unit : envelope.content.border === 'thin' ? 3 * unit : 0;
  const background = envelope.theme.version === 2 ? envelope.style?.background ?? envelope.content.background : envelope.content.background;
  const exit = interpolate(frame, [Math.max(1, presentation.durationInFrames - Math.round(fps * 0.25)), Math.max(2, presentation.durationInFrames - 1)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; continueRender(measurementHandle); } };
    // Let the browser measure the loaded fonts, not approximate glyph widths.
    // This is once per content/layout change, never once per animation frame.
    waitForFonts().then(() => {
      if (cancelled) return;
      const grid = cards.current;
      const overflow = !grid || grid.clientHeight <= 0 || [...grid.children].some(card => {
        const element = card as HTMLElement;
        // A serif descender/subpixel rounding can extend its scroll box slightly.
        return element.scrollHeight > element.clientHeight + 4 * Math.min(width, height) / 1080 || element.scrollWidth > element.clientWidth + 1;
      });
      setLayoutError(overflow ? 'Comparison text does not fit this ratio. Shorten the heading, labels, or credits; the image and caption areas cannot be reduced further.' : undefined);
      finish();
    }).catch(() => { if (!cancelled) { setLayoutError('Comparison fonts could not be loaded. Retry the preview or export.'); finish(); } });
    return () => { cancelled = true; finish(); };
  }, [envelope, width, height, captions, measurementHandle]);

  if (layoutError) throw new Error(layoutError);

  return <AbsoluteFill style={{ backgroundColor: theme.background, color: theme.text, fontFamily: FONTS.serif, overflow: 'hidden', opacity: exit }}>
    {background === 'grid' && <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.2 }} aria-hidden="true">
      {Array.from({ length: 21 }, (_, i) => <path key={`v${i}`} d={`M${width * i / 20} 0 Q${width * i / 20 + (i - 10) * 7 * unit} ${height / 2} ${width * i / 20} ${height}`} stroke={theme.grid} fill="none" strokeWidth={1.7 * unit} />)}
      {Array.from({ length: 16 }, (_, i) => <path key={`h${i}`} d={`M0 ${height * i / 15} Q${width / 2} ${height * i / 15 - (i - 7.5) * 5 * unit} ${width} ${height * i / 15}`} stroke={theme.grid} fill="none" strokeWidth={1.7 * unit} />)}
    </svg>}
    {background === 'halo' && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 28% 45%, ${accent}55, transparent 65%)` }} />}
    {background === 'paper' && <AbsoluteFill style={{ opacity: .15, backgroundImage: `repeating-linear-gradient(${(envelope.motion.seed % 5) + 88}deg, transparent 0px, ${theme.grid} 1px, transparent 2px, transparent 19px)` }} />}
    <div style={{ position: 'absolute', top: margin, bottom: presentationSafeBottom(width, height, captions) + margin, left: margin, right: margin, display: 'flex', flexDirection: 'column' }}>
      {envelope.content.heading && <div style={{ flexShrink: 0, marginBottom: 36 * unit, fontSize: 44 * unit, fontWeight: 600, textAlign: 'center', lineHeight: 1.12, overflowWrap: 'anywhere' }}>{envelope.content.heading}</div>}
      <div ref={cards} style={{ display: 'grid', flex: 1, minHeight: 0, gridTemplateColumns: portrait ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', gridTemplateRows: portrait ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)', gap }}>
      {envelope.content.images.map((image, index) => {
      const delay = envelope.motion.sequence === 'staggered' ? index * Math.round(fps * 0.18) : 0;
      const local = Math.max(0, frame - delay);
      const progress = envelope.motion.intensity === 'expressive'
        ? spring({ frame: local, fps, config: { damping: 13, stiffness: 150 } })
        : interpolate(local, [0, Math.max(1, Math.round(fps * (envelope.motion.intensity === 'calm' ? 0.75 : 0.55)))], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
      const initialScale = envelope.motion.intensity === 'calm' ? 0.78 : 0.6;
      const scale = envelope.motion.entrance === 'scale' ? initialScale + progress * (1 - initialScale) : 1;
      const labelOpacity = interpolate(local, [Math.round(fps * 0.35), Math.round(fps * 0.7)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const url = presentation.assets.find(asset => asset.itemId === image.id)?.url;
      return <div key={image.id} data-comparison-card style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', transform: `scale(${scale})`, opacity: frame < delay ? 0 : Math.min(1, progress), transformOrigin: 'center' }}>
        <div data-comparison-image style={{ flex: 1, minHeight: 160 * unit + border * 2, background: theme.paper, padding: border, boxSizing: 'border-box', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>
          {url && <Img src={url} style={{ width: '100%', height: '100%', display: 'block', objectFit: image.fit, objectPosition: `${image.focalPoint.x * 100}% ${image.focalPoint.y * 100}%` }} />}
        </div>
        <div style={{ flexShrink: 0, opacity: labelOpacity, paddingTop: 17 * unit, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', background: accent, color: envelope.theme.version === 1 ? theme.background : theme.accentLabelText, fontFamily: FONTS.sans, fontSize: 32 * unit, fontWeight: 600, padding: `${7 * unit}px ${18 * unit}px`, maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere', lineHeight: 1.22 }}>{image.label}</span>
          {image.source.classification === 'reconstruction' && <span style={{ display: 'block', fontSize: 24 * unit, color: theme.muted, marginTop: 7 * unit }}>Reconstruction</span>}
          {image.source.credit && <div style={{ fontSize: 24 * unit, lineHeight: 1.18, color: theme.muted, marginTop: 8 * unit, overflowWrap: 'anywhere' }}>{image.source.credit}</div>}
        </div>
      </div>;
      })}
      </div>
    </div>
  </AbsoluteFill>;
}
