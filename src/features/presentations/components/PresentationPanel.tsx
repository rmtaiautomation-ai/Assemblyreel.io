'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player, type PlayerRef } from '@remotion/player';
import { VideoComposition } from '../../../remotion/compositions/VideoComposition';
import { cleanEnvelope } from '../../../lib/presentations/schema';
import type { PresentationAsset, PresentationEnvelope, PresentationRow, PresentationTiming } from '../../../lib/presentations/schema';
import { resolvePresentation } from '../../../lib/presentations/compiler';
import { DOCUMENTARY_TEMPLATES, presentationDefinition, type PresentationTemplateId } from '../../../lib/presentations/registry';
import { createPresentationDraft } from '../../../lib/presentations/drafts';
import { sourceSlots, updatePresentationSource } from '../../../lib/presentations/editing';
import { applyVisualSettings, defaultVisualSettings, updatePresentationTheme, type VisualSettings } from '../../../lib/presentations/visual-settings';
import { presentationTheme } from '../../../remotion/presentations/themes';
import { ContentEditor } from './ContentEditor';
import { TemplatePoster } from './TemplatePoster';
import { SelectField, NumberField, SourceEditor, fieldClass, buttonClass } from './fields';
import type { PresentationSceneReference } from '../../../lib/presentations/phase-5-validation';

type Props = {
  projectId: string; sceneId: string; sceneDuration: number; row?: PresentationRow;
  assets: PresentationAsset[]; captions: boolean; canUndo: boolean; unsupported: boolean; visualSettings?: VisualSettings;
  onSave: (envelope: PresentationEnvelope, timing: PresentationTiming, locked: boolean) => Promise<string | undefined>;
  onRemove: () => Promise<string | undefined>; onUndo: () => Promise<string | undefined>;
  initialDraft?: { envelope: PresentationEnvelope; timing: PresentationTiming };
  purpose?: 'evidence' | 'suggestion-review'; suggestionControl?: React.ReactNode;
  sceneReferences?: readonly PresentationSceneReference[];
};
export function PresentationPanel(props: Props) {
  const { row, sceneId, sceneDuration, assets } = props;
  const defaults = props.visualSettings ?? defaultVisualSettings();
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'Content' | 'Style' | 'Timing' | 'Sources'>('Content');
  const [query, setQuery] = useState('');
  const [draft, setDraftState] = useState<PresentationEnvelope>(() => {
    if (props.initialDraft) return props.initialDraft.envelope;
    if (row && row.template_data.templateId !== 'clean') return row.template_data;
    const fresh = applyVisualSettings(createPresentationDraft(defaults.allowedFamilies.includes('image-comparison') ? 'image-comparison' : defaults.allowedFamilies[0] ?? 'image-comparison'),defaults);
    return defaults.allowedFamilies.length ? fresh : cleanEnvelope(fresh);
  });
  const drafts = useRef<Partial<Record<PresentationTemplateId, PresentationEnvelope>>>({});
  const [timing, setTimingState] = useState<PresentationTiming>(() => props.initialDraft?.timing ?? (row ? { start_time: row.start_time, duration: row.duration, duration_mode: row.duration_mode } : { start_time: 0, duration: sceneDuration, duration_mode: 'scene-remainder' }));
  const [reviewed, setReviewed] = useState(false);
  const [locked, setLocked] = useState(row?.locked ?? true), [ratio, setRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [previewFailure, setPreviewFailure] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0), [safeGuides, setSafeGuides] = useState(true);
  const resetPreviewFailure = () => { if (previewFailure) { setPreviewFailure(''); setPreviewRevision(previous => previous + 1); } };
  const setDraft = (value: PresentationEnvelope) => { resetPreviewFailure(); setLocked(true); setDraftState(value); };
  const setTiming = (value: PresentationTiming) => { resetPreviewFailure(); setLocked(true); setTimingState(value); };
  const player = useRef<PlayerRef>(null);
  const readyAssets = assets.filter(asset => asset.projectId === props.projectId && asset.mediaType === 'image' && asset.status === 'ready');
  const references = useMemo(() => ({ sceneId, scenes: props.sceneReferences ?? [], sourcePacket: props.purpose === 'evidence' }), [sceneId, props.sceneReferences, props.purpose]);
  const result = useMemo(() => resolvePresentation(draft, timing, sceneDuration, 30, assets, props.projectId, references), [draft, timing, sceneDuration, assets, props.projectId, references]);
  const savedIssues = row ? resolvePresentation(row.template_data, row, sceneDuration, 30, assets, props.projectId, references).issues : [];
  const width = ratio === '16:9' ? 1920 : 1080, height = ratio === '9:16' ? 1920 : 1080, frames = Math.max(1, Math.round(sceneDuration * 30));
  const definition = presentationDefinition(draft.templateId, draft.templateVersion), previewReady = Boolean(result.presentation);
  const changeFamily = (id: PresentationTemplateId) => {
    if (draft.templateId !== 'clean') drafts.current[draft.templateId] = draft;
    setDraft(drafts.current[id] ?? applyVisualSettings(createPresentationDraft(id), defaults)); setTab('Content');
  };
  useEffect(() => {
    const current = player.current;
    if (!open || !previewReady || !current) return;
    const handleError = (event: { detail: { error: Error } }) => setPreviewFailure(event.detail.error.message);
    current.addEventListener('error', handleError); current.seekTo(Math.min(frames - 1, Math.round(timing.start_time * 30) + 40));
    return () => current.removeEventListener('error', handleError);
  }, [open, frames, timing.start_time, previewReady, ratio, previewRevision, draft.templateId]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false);
      if (event.key === 'Tab') {
        const focusable = [...document.querySelectorAll<HTMLElement>('[data-presentation-dialog] button:not(:disabled), [data-presentation-dialog] input:not(:disabled), [data-presentation-dialog] textarea:not(:disabled), [data-presentation-dialog] select:not(:disabled), [data-presentation-dialog] a[href]')].filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey); document.querySelector<HTMLElement>('[data-presentation-dialog] button')?.focus();
    return () => { document.removeEventListener('keydown', handleKey); before?.focus(); };
  }, [open, busy]);
  const perform = async (action: () => Promise<string | undefined>, close = false) => {
    setBusy(true); setError('');
    try { const failure = await action(); if (failure) setError(failure); else if (close) setOpen(false); }
    catch { setError('Save response was interrupted. Retry the same save or reload to check its result.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-lg border border-ed-border bg-ed-surface p-3 space-y-2" aria-label="Scene presentation">
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold">{props.purpose === 'evidence' ? 'Reviewed source content' : props.purpose === 'suggestion-review' ? 'Review / edit suggestion' : 'Presentation'}</h3><span className="text-[10px] text-ed-text-dim">{props.purpose === 'evidence' ? 'Source packet · no scene change' : 'Attached to scene'}</span></div>
    <p className="text-xs text-ed-text-dim">{props.unsupported ? 'Unsupported presentation — preserve saved content until a compatible renderer is available.' : row ? `${presentationDefinition(row.template_data.templateId, 1)?.name ?? row.template_data.templateId} · ${row.locked ? 'Keep my edits' : 'Unlocked'}` : 'Choose a presentation'}</p>
    {savedIssues.map(issue => <p role="status" key={issue} className="text-xs text-ed-warn">{issue}</p>)}
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || props.unsupported} onClick={() => { resetPreviewFailure(); setOpen(true); }}>{props.purpose === 'evidence' ? 'Prepare source content' : props.purpose === 'suggestion-review' ? 'Preview / edit draft' : row && row.template_data.templateId !== 'clean' ? 'Edit / Preview' : 'Browse templates'}</button>{!props.purpose && row && <button type="button" className={buttonClass} disabled={busy} onClick={() => perform(props.onRemove)}>Remove</button>}{!props.purpose && <button type="button" className={buttonClass} disabled={busy || !props.canUndo} onClick={() => perform(props.onUndo)}>Undo</button>}{props.suggestionControl}</div>
    {error && <p role="alert" className="text-xs text-ed-warn">{error}</p>}
    {open && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3" onClick={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}><div data-presentation-dialog role="dialog" aria-modal="true" aria-labelledby="presentation-dialog-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-ed-border bg-ed-base text-ed-text shadow-2xl">
      <header className="flex items-center justify-between border-b border-ed-border p-4"><div><h2 id="presentation-dialog-title" className="font-bold">Presentation library</h2><p className="text-xs text-ed-text-dim">{definition?.name} · {sceneDuration.toFixed(1)}s scene · {props.purpose === 'evidence' ? 'source approval, not scene Apply' : 'editable draft'}</p></div><button type="button" aria-label="Close presentation library" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>Close</button></header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[370px_minmax(0,1fr)]"><div className="order-last space-y-4 border-r border-ed-border p-4 md:order-first">
        <label className="block text-xs">Find a template<input aria-label="Find a template" className={`${fieldClass} mt-1`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Dates, person, map, source…" /></label>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto" aria-label="Template families">{DOCUMENTARY_TEMPLATES.filter(item => defaults.allowedFamilies.includes(item.id) || item.id === row?.template_data.templateId).filter(item => `${item.name} ${item.purpose}`.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} type="button" disabled={busy} aria-pressed={draft.templateId === item.id} className={`group rounded-lg border p-2 text-left text-xs ${draft.templateId === item.id ? 'border-ed-accent-border bg-ed-raised' : 'border-ed-border hover:bg-ed-well'}`} onClick={() => changeFamily(item.id)}><TemplatePoster id={item.id} /><span className="text-[10px] font-mono text-ed-text-dim">{item.code} · Layout preview</span><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-[10px] text-ed-text-dim">{item.assetsRequired === 0 ? 'Text / data required' : readyAssets.length >= item.assetsRequired ? 'Project images available' : `Needs ${item.assetsRequired} ready image(s)`} · {item.typicalDurationSeconds.join('–')}s</span></button>)}</div>
        {definition && 'purpose' in definition && <p className="text-xs text-ed-text-dim">{definition.purpose}</p>}
        <nav aria-label="Presentation settings" className="flex gap-1">{(['Content', 'Style', 'Timing', 'Sources'] as const).map(name => <button type="button" key={name} aria-pressed={tab === name} className={`${buttonClass} flex-1 px-1 ${tab === name ? 'bg-ed-raised text-ed-accent-text' : ''}`} onClick={() => setTab(name)}>{name}</button>)}</nav>
        <fieldset disabled={busy} className="space-y-3">
          {tab === 'Content' && <ContentEditor draft={draft} assets={readyAssets} onChange={setDraft} dateConvention={defaults.dateConvention} references={references.scenes} sceneId={props.purpose === 'evidence' ? undefined : sceneId} />}
          {tab === 'Style' && <><SelectField label="Theme" value={draft.theme.id} options={['dark-documentary', 'parchment-archive']} onChange={id => setDraft(updatePresentationTheme(draft, { id }))} /><p className="text-[11px] text-ed-text-dim">{draft.theme.version === 1 ? 'Legacy Phase 1 tokens are preserved. Use the button below for the new pack.' : 'Documentary theme pack v2'}</p><button type="button" className={buttonClass} onClick={() => setDraft(applyVisualSettings(draft, defaults))}>Use project visual defaults</button><label className="block text-xs">Accent<input type="color" className="ml-3 h-8 w-14" value={draft.theme.overrides.accent ?? presentationTheme(draft.theme).accent} onChange={e => setDraft(updatePresentationTheme(draft, { overrides: { accent: e.target.value } }))} /></label>
            {draft.templateId === 'image-comparison' ? <><SelectField label="Border" value={draft.content.border} options={['paper', 'thin', 'none']} onChange={border => setDraft({ ...draft, content: { ...draft.content, border } })} />{draft.theme.version === 1 ? <SelectField label="Background" value={draft.content.background} options={['grid', 'plain']} onChange={background => setDraft({ ...draft, content: { ...draft.content, background } })} /> : <SelectField label="Background" value={draft.style?.background ?? draft.content.background} options={['plain', 'grid', 'paper', 'halo']} onChange={background => setDraft({ ...draft, style: { background, density: draft.style?.density ?? 'spacious' }, content: { ...draft.content, background: background === 'grid' ? 'grid' : 'plain' } })} />}</> : <SelectField label="Background" value={draft.style?.background ?? 'plain'} options={['plain', 'grid', 'paper', 'halo']} onChange={background => setDraft({ ...draft, style: { background, density: draft.style?.density ?? 'spacious' } })} />}
            {draft.theme.version === 2 && <SelectField label="Density" value={draft.style?.density ?? 'spacious'} options={['spacious', 'compact']} onChange={density => setDraft({ ...draft, style: { background: draft.style?.background ?? 'plain', density } })} />}<SelectField label="Entrance" value={draft.motion.entrance} options={['scale', 'fade']} onChange={entrance => setDraft({ ...draft, motion: { ...draft.motion, entrance } })} />{draft.templateId === 'image-comparison' ? <SelectField label="Order" value={draft.motion.sequence} options={['together', 'staggered']} onChange={sequence => setDraft({ ...draft, motion: { ...draft.motion, sequence } })} /> : <p className="text-xs text-ed-text-dim">Individual reveals use the authored cues on Content.</p>}<SelectField label="Motion" value={draft.motion.intensity} options={['calm', 'standard', 'expressive']} onChange={intensity => setDraft({ ...draft, motion: { ...draft.motion, intensity } })} /></>}
          {tab === 'Timing' && <><NumberField label="Start within scene (seconds)" min={0} value={timing.start_time} onChange={value => setTiming({ ...timing, start_time: value ?? 0 })} /><SelectField label="Duration" value={timing.duration_mode} options={['scene-remainder', 'fixed']} onChange={duration_mode => setTiming({ ...timing, duration_mode })} />{timing.duration_mode === 'fixed' && <NumberField label="Length (seconds)" min={.1} value={timing.duration} onChange={value => setTiming({ ...timing, duration: value ?? 0 })} />}<p className="text-xs text-ed-text-dim">Reveal cues are seconds within this presentation—not global video time. The presentation follows its scene when reordered.</p></>}
          {tab === 'Sources' && <>{sourceSlots(draft).map(slot => <div key={slot.key} className="space-y-2 rounded border border-ed-border p-3"><h4 className="text-xs font-semibold">{slot.label}</h4><SourceEditor source={slot.value} onChange={source => setDraft(updatePresentationSource(draft, slot.key, source))} /></div>)}<p className="text-xs text-ed-text-dim">Credits are supplied by you, not verified automatically. Review source accuracy and usage rights. Reconstruction labels stay visible on video.</p></>}
          {props.purpose && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed this content, source identity, attribution, usage rights and timing. This is my approval, not AI verification.</label>}<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />Keep my edits (lock presentation)</label>
        </fieldset>
      </div><div className="order-first space-y-3 p-4 md:order-last">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">Unsaved preview</span><select aria-label="Preview aspect ratio" className={`${fieldClass} !w-auto`} value={ratio} onChange={e => { resetPreviewFailure(); setRatio(e.target.value as typeof ratio); }}><option>16:9</option><option>9:16</option><option>1:1</option></select></div>
        <div className="relative mx-auto flex min-h-48 max-h-[55vh] items-center justify-center rounded-lg bg-black" style={{ aspectRatio: `${width}/${height}`, maxWidth: height > width ? '310px' : '100%' }}>{result.presentation ? <Player key={`${draft.templateId}:${previewRevision}`} ref={player} component={VideoComposition} errorFallback={({ error: failure }) => <p role="alert" className="p-5 text-sm text-ed-warn">{failure.message}</p>} inputProps={{ scenes: [{ id: sceneId, mediaUrl: '', mediaType: 'image', durationInSeconds: sceneDuration, trimStartInSeconds: 0, presentation: result.presentation }], fps: 30, width, height, showCaptions: props.captions, captionWords: props.captions ? [{ text: 'Caption safe area', startMs: 0, endMs: sceneDuration * 1000 }] : [] }} compositionWidth={width} compositionHeight={height} fps={30} durationInFrames={frames} controls autoPlay={false} style={{ width: '100%' }} /> : <p className="px-6 text-center text-sm text-stone-300">Supply the required text, data, and project images to preview.</p>}{safeGuides && <div className="pointer-events-none absolute inset-[5%] border border-dashed border-white/40"><span className="absolute left-1 top-1 text-[9px] text-white/70">Safe margin</span></div>}</div>
        <label className="flex gap-2 text-xs text-ed-text-dim"><input type="checkbox" checked={safeGuides} onChange={e => setSafeGuides(e.target.checked)} />Show safe guides</label><p className="text-xs text-ed-text-dim">Preview ratio does not change export ratio. Preview starts paused; press Play to inspect the reveal. AI suggestions stay separate until reviewed and applied. No media is purchased by previewing.</p>
        <div aria-live="polite" className="space-y-1 text-xs">{result.issues.map(issue => <p key={issue} className="text-ed-warn">{issue}</p>)}{!result.issues.length && !previewFailure && <p className="text-ed-ok">Ready to apply to this scene.</p>}{previewFailure && <p role="alert" className="text-ed-warn">{previewFailure}</p>}{error && <p role="alert" className="text-ed-warn">{error}</p>}</div>
      </div></div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ed-border p-4">{!props.purpose && <button type="button" className={buttonClass} disabled={busy} onClick={() => perform(() => props.onSave(cleanEnvelope(draft), { start_time: 0, duration: sceneDuration, duration_mode: 'scene-remainder' }, true), true)}>Use clean media</button>}<div className="flex gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={`${buttonClass} bg-ed-accent text-white`} disabled={busy || result.issues.length > 0 || Boolean(previewFailure) || Boolean(props.purpose && !reviewed)} onClick={() => perform(() => props.onSave(draft, timing, locked), true)}>{busy ? 'Saving…' : props.purpose === 'evidence' ? 'Approve source content' : props.purpose === 'suggestion-review' ? 'Apply reviewed draft' : 'Apply to scene'}</button></div></footer>
    </div></div>, document.body)}
  </section>;
}
