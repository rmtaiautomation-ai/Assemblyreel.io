import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, interpolate, spring, useVideoConfig } from 'remotion';
import type { PresentationEnvelope } from '../../lib/presentations/schema';
import { presentationSources } from '../../lib/presentations/content';
import { presentationSafeBottom } from '../captions/layout';
import { FONTS, waitForFonts } from '../fonts';
import { presentationTheme } from './themes';
import { loadScriptFont } from './script-fonts';

export type StageStyle = { unit: number; portrait: boolean; square: boolean; theme: ReturnType<typeof presentationTheme>; frame: number; fps: number; scriptFont: string; comparisonFonts?: string[] };
export function reveal(frame: number, fps: number, cueSeconds = 0) { return Math.min(1, Math.max(0, (frame / fps - cueSeconds) / .55)); }
export function Stage({ envelope, captions, frame, duration, children }: { envelope: PresentationEnvelope; captions: boolean; frame: number; duration: number; children: (style: StageStyle) => React.ReactNode }) {
  const { width, height, fps } = useVideoConfig();
  const theme = presentationTheme(envelope.theme), unit = Math.min(width, height) / 1080;
  const root = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender('Checking documentary typography and safe area'));
  const [failure, setFailure] = useState('');
  const [font] = useState(() => loadScriptFont(envelope.templateId === 'text-translation' ? envelope.content.script : 'none'));
  const [comparisonFonts] = useState(() => envelope.templateId === 'manuscript-comparison' ? envelope.content.passages.map(passage => loadScriptFont(passage.script)) : []);
  useEffect(() => {
    let active = true, done = false;
    const finish = () => { if (!done) { done = true; continueRender(handle); } };
    Promise.all([waitForFonts(), font.waitUntilDone(), ...comparisonFonts.map(font => font.waitUntilDone())]).then(() => {
      if (!active) return;
      const box = root.current;
      // Measure final layout, not an intentional entrance translation or spring scale.
      const transformed = box ? [box, ...box.querySelectorAll<HTMLElement>('[data-layout-motion]')].filter(element => element.style?.transform && element.style.transform !== 'none').map(element => ({ element, transform: element.style.transform })) : [];
      transformed.forEach(({ element }) => { element.style.transform = 'none'; });
      const bounds = box?.getBoundingClientRect();
      const elements = box ? [...box.querySelectorAll<HTMLElement>('[data-fit], [data-fit-height]')] : [];
      const failed = elements.filter(element => {
        const rect = element.getBoundingClientRect();
        // Compare in screen pixels because Player scales the entire composition.
        if (!bounds) return true;
        const tolerance = Math.max(1, bounds.width / width * 4 * unit);
        return element.scrollWidth > element.clientWidth + 4 * unit ||
          (element.hasAttribute('data-fit-height') && element.scrollHeight > element.clientHeight + 4 * unit) ||
          rect.top < bounds.top - tolerance || rect.bottom > bounds.bottom + tolerance || rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance;
      });
      transformed.forEach(({ element, transform }) => { element.style.transform = transform; });
      const collisionBoxes = box ? [...box.querySelectorAll<HTMLElement>('[data-collision]')].map(element => element.getBoundingClientRect()) : [];
      const collision = collisionBoxes.some((a,index) => collisionBoxes.slice(index+1).some(b => a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1));
      setFailure(!bounds || failed.length || collision ? 'Documentary text does not fit this ratio. Shorten the copy, reduce items, or use another scene; text and caption safety cannot be shrunk.' : '');
      finish();
    }).catch(() => { if (active) { setFailure('Documentary fonts could not be loaded. Retry before exporting.'); finish(); } });
    return () => { active = false; finish(); };
  }, [handle, font, comparisonFonts, width, height, captions, unit]);
  if (failure) throw new Error(failure);
  const style = { unit, portrait: height / width > 1.2, square: width === height, theme, frame, fps, scriptFont: font.fontFamily, comparisonFonts: comparisonFonts.map(font => font.fontFamily) };
  const credits = [...new Set(presentationSources(envelope).map(source => [source.classification === 'reconstruction' ? 'Reconstruction' : source.classification === 'illustration' ? 'Illustration' : '', source.credit].filter(Boolean).join(' · ')).filter(Boolean))];
  const entrance = Math.min(1,Math.max(0,frame/fps/(envelope.motion.intensity === 'calm' ? .75 : .55)));
  const progress = envelope.motion.intensity === 'expressive' ? spring({ frame, fps, config: { damping: 15, stiffness: 100 } }) : 1 - (1 - entrance) ** 3;
  const opacity = entrance * interpolate(frame, [Math.max(1, duration - fps * .25), duration - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const initialScale = envelope.motion.intensity === 'calm' ? .96 : .92;
  const scale = envelope.motion.entrance === 'scale' ? initialScale + (1-initialScale) * progress : 1;
  const background = envelope.style?.background ?? 'plain';
  return <AbsoluteFill style={{ background: theme.background, color: theme.text, fontFamily: FONTS.sans }}>
    {background === 'grid' && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', width: '100%', height: '100%', opacity: .27 }}>{Array.from({ length: 15 }, (_, i) => <React.Fragment key={i}><path d={`M${i * 75} 0 Q${i * 75 + (i - 7) * 10} 500 ${i * 75} 1000`} fill="none" stroke={theme.grid} strokeWidth="1" /><path d={`M0 ${i * 75} Q500 ${i * 75 + (i - 7) * 10} 1000 ${i * 75}`} fill="none" stroke={theme.grid} strokeWidth="1" /></React.Fragment>)}</svg>}
    {background === 'paper' && <AbsoluteFill style={{ opacity: .15, backgroundImage: `repeating-linear-gradient(${(envelope.motion.seed % 5) + 88}deg, transparent 0px, ${theme.grid} 1px, transparent 2px, transparent 19px)` }} />}
    {background === 'halo' && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 28% 45%, ${theme.accent}55, transparent 65%)` }} />}
    <div ref={root} style={{ position: 'absolute', inset: `${Math.min(width, height) * .055}px`, bottom: presentationSafeBottom(width, height, captions), display: 'flex', flexDirection: 'column', gap: (envelope.style?.density === 'compact' ? 18 : 28) * unit, minHeight: 0, opacity, transform: `scale(${scale})` }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children(style)}</div>
      {credits.length > 0 && <div data-fit style={{ flexShrink: 0, fontSize: 24 * unit, lineHeight: 1.2, color: theme.muted, overflowWrap: 'anywhere' }}>{credits.join(' • ')}</div>}
    </div>
  </AbsoluteFill>;
}
export function Heading({ children, style }: { children: React.ReactNode; style: StageStyle }) { return children ? <h2 data-fit style={{ fontFamily: FONTS.serif, fontWeight: 600, fontSize: 54 * style.unit, lineHeight: 1.08, margin: 0, overflowWrap: 'anywhere', flexShrink: 0 }}>{children}</h2> : null; }
export function Copy({ children, style, size = 34 }: { children: React.ReactNode; style: StageStyle; size?: number }) { return <div data-fit style={{ fontSize: size * style.unit, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{children}</div>; }
