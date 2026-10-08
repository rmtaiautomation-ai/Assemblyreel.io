'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPresentationSuggestionWorkspace, suggestPresentations, applyPresentationSuggestion, savePresentationEvidence, removePresentationEvidence } from '../server/suggestion-actions';
import type { PresentationEnvelope, PresentationRow, PresentationTiming } from '../../../lib/presentations/schema';
import { suggestionCanApply, type SuggestionResult } from '../../../lib/presentations/suggestions';
import { createPresentationDraft } from '../../../lib/presentations/drafts';
import { applyVisualSettings } from '../../../lib/presentations/visual-settings';
import { PresentationPanel } from './PresentationPanel';
import { TemplatePoster } from './TemplatePoster';
import { buttonClass, fieldClass } from './fields';

type Workspace = Extract<Awaited<ReturnType<typeof getPresentationSuggestionWorkspace>>, { success: true }>;
type Applied = Extract<Awaited<ReturnType<typeof applyPresentationSuggestion>>, { success: true }>;
type Props = { projectId: string; sceneIds: string[]; label?: string; onApplied: (result: Applied) => void };

export function SuggestionReview({ projectId, sceneIds, label = 'Suggest presentation', onApplied }: Props) {
  const [open, setOpen] = useState(false), [workspace, setWorkspace] = useState<Workspace | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [review, setReview] = useState<{ runId: string; result: SuggestionResult } | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({}), [allowManual, setAllowManual] = useState(false), [results, setResults] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [hasRequest, setHasRequest] = useState(false);
  const [packetTitle, setPacketTitle] = useState(''), [packetId, setPacketId] = useState<string | null>(null), [editingPacket, setEditingPacket] = useState(false);
  const [packetSeed, setPacketSeed] = useState<PresentationEnvelope | undefined>();
  const request = useRef<{ id: string; includeManual: boolean } | null>(null), operations = useRef<Record<string, string>>({}), trigger = useRef<HTMLButtonElement>(null);
  const targetsKey = [...sceneIds].sort().join(',');
  const load = async () => {
    try {
      const response = await getPresentationSuggestionWorkspace(projectId);
      if (!response.success) { setError(response.error); return null; }
      setWorkspace(response); return response;
    } catch { setError('Could not refresh the saved request/source library. Existing scenes are unchanged.'); return null; }
  };
  const removePacket = async (id: string, revision: number) => {
    if (!window.confirm('Remove this source packet? Existing presentations remain; old suggestions become stale.')) return;
    setBusy(true);
    try { const response = await removePresentationEvidence(projectId,id,revision); if (!response.success) setError(response.error); else await load(); }
    catch { setError('Source removal response was interrupted. Reload the source list before retrying.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    getPresentationSuggestionWorkspace(projectId).then(response => {
      if (!active) return;
      if (!response.success) { setError(response.error); return; }
      setWorkspace(response);
      const matching = response.runs.filter(run => [...run.targetIds].sort().join(',') === targetsKey);
      const existing = matching.find(run => run.result && run.state === 'complete');
      const latest = matching[0];
      if (latest) {
        request.current = { id: latest.id,includeManual: latest.includeManual }; setHasRequest(true);
        if (latest.state !== 'complete') setError(`Saved request: ${latest.state}. Check its result before any new paid request; no automatic provider retry.`);
      }
      if (existing?.result) { setReview({ runId: existing.id, result: existing.result }); setSelected({}); }
    }).catch(() => { if (active) setError('Could not load suggestions. Existing scenes are unchanged.'); });
    return () => { active = false; };
  }, [open, projectId, targetsKey]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('[data-suggestion-review] button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-presentation-dialog]')) return; // the nested source/draft editor owns focus
      if (event.key === 'Escape' && !busy) setOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = [...document.querySelectorAll<HTMLElement>('[data-suggestion-review] button:not(:disabled), [data-suggestion-review] input:not(:disabled), [data-suggestion-review] select:not(:disabled), [data-suggestion-review] a[href]')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); before?.focus(); };
  }, [open, busy]);
  const run = async (fresh: boolean) => {
    setBusy(true); setError(''); setResults({});
    if (fresh || !request.current) request.current = { id: crypto.randomUUID(),includeManual: allowManual };
    setHasRequest(true);
    try {
      const response = await suggestPresentations({ projectId, sceneIds, requestId: request.current.id,includeManual: request.current.includeManual });
      if (!response.success) setError(response.error);
      else { setReview({ runId: response.runId, result: response.result }); setSelected({}); setExcluded({}); setAllowManual(false); }
    } catch { setError('Response interrupted. Check saved requests before retrying; the same request ID will be retained.'); }
    finally { setBusy(false); }
  };
  const chosenId = (scene: SuggestionResult['scenes'][number]) => selected[scene.sceneId] ?? scene.chosenId;
  const apply = async (sceneId: string, candidateId: string, draft?: { envelope: PresentationEnvelope; timing: PresentationTiming; reviewed: true }): Promise<string | undefined> => {
    if (!review) return 'Choose a saved suggestion first.';
    const fingerprint = JSON.stringify({ runId: review.runId, sceneId, candidateId, draft, allowManual });
    const operationId = operations.current[fingerprint] ??= crypto.randomUUID();
    try {
      const response = await applyPresentationSuggestion({ projectId, sceneId, runId: review.runId, candidateId, operationId, allowManual, ...(draft ? { draft } : {}) });
      if (!response.success) { setResults(previous => ({ ...previous, [sceneId]: response.error })); return response.error; }
      onApplied(response); setResults(previous => ({ ...previous, [sceneId]: response.replayed ? 'Applied (saved result recovered).' : 'Applied · Keep my edits is on.' })); return undefined;
    } catch { const message = 'Apply response interrupted. Retry retains its operation ID; check the saved scene before changing the draft.'; setResults(previous => ({ ...previous, [sceneId]: message })); return message; }
  };
  const batchApply = async () => {
    if (!review || busy) return;
    const targets = review.result.scenes.filter(scene => sceneIds.includes(scene.sceneId) && !excluded[scene.sceneId] && suggestionCanApply(scene, chosenId(scene), allowManual) && !results[scene.sceneId]?.startsWith('Applied'));
    if (!targets.length || !window.confirm(`Apply ${targets.length} reviewed ready suggestion(s)? Locked scenes are skipped. Each scene saves separately; partial failures will be reported.`)) return;
    setBusy(true); try { for (const scene of targets) await apply(scene.sceneId, chosenId(scene)); } finally { setBusy(false); }
  };
  const checkSaved = async () => {
    const fresh = await load();
    const saved = fresh?.runs.find(run => run.id === request.current?.id || run.id === review?.runId);
    if (saved?.state === 'complete' && saved.result) { setReview({ runId: saved.id, result: saved.result }); setError(''); }
    else setError(saved ? `Saved request: ${saved.state}. No automatic provider retry. Pending/unknown operations need reconciliation.` : 'No saved request found. Check setup before starting a new paid request.');
  };
  const packet = workspace?.evidence.find(item => item.id === packetId);
  const savedScene = sceneIds.length === 1 ? workspace?.scenes.find(scene => scene.id === sceneIds[0])?.row : null;
  const packetRow: PresentationRow | undefined = packet ? { id: packet.id, project_id: projectId, scene_id: sceneIds[0], kind: 'scene-template', time_basis: 'scene', start_time: 0, duration: 120, duration_mode: 'scene-remainder', revision: packet.revision, locked: true, origin: 'user', template_data: packet.envelope } : undefined;

  return <><button ref={trigger} type="button" className={buttonClass} title={sceneIds.length > 48 ? 'At most 48 scenes per request; use individual scene suggestions for this act.' : undefined} disabled={busy || !sceneIds.length || sceneIds.length > 48} onClick={event => { event.stopPropagation(); setOpen(true); }}>{label}</button>
    {open && createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-3" onClick={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}><section data-suggestion-review role="dialog" aria-modal="true" aria-labelledby="suggestion-review-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-ed-border bg-ed-base text-ed-text shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-ed-border p-4"><div><h2 id="suggestion-review-title" className="font-bold">Presentation suggestions</h2><p className="text-xs text-ed-text-dim">{sceneIds.length} scene(s) · reviewed source content · no automatic replacement or media purchase</p></div><button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen(false)}>Close suggestions</button></header>
      <div className="space-y-5 overflow-y-auto p-4">
        <p className="text-xs text-ed-text-dim">AI chooses source packets; it cannot invent their facts, translations, coordinates or image details. Reasons are suggestions, not verification. Review identity, narration fit, readability and sources before applying. Generation is metered text usage under the approved plan, in windows of at most eight scenes; preview and source preparation do not call AI.</p>
        <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={allowManual} onChange={e => { setAllowManual(e.target.checked); setSelected({}); }} />I explicitly allow replacing unlocked manual presentations in this review. Locked scenes remain protected.</label>
        <div className="flex flex-wrap gap-2"><button className={`${buttonClass} bg-ed-accent text-ed-base`} disabled={busy || !workspace} onClick={() => run(true)}>{busy ? 'Working…' : 'Generate new suggestions'}</button><button className={buttonClass} disabled={busy || !hasRequest} onClick={() => run(false)}>Retry same request</button><button className={buttonClass} disabled={busy} onClick={checkSaved}>Check saved requests</button></div>
        {error && <p role="alert" className="text-sm text-ed-warn">{error}</p>}{!workspace && !error && <p role="status">Loading project evidence and suggestions…</p>}
        {workspace && <details className="rounded border border-ed-border p-3"><summary className="cursor-pointer text-sm font-semibold">Reviewed source library ({workspace.evidence.length}/30)</summary><p className="my-3 text-xs text-ed-text-dim">Prepare reusable typed content with the same manual editor. Approval saves a source packet only—it does not change a scene or verify history automatically.</p>
          <div className="flex flex-wrap gap-2">{workspace.evidence.map(item => <span key={item.id} className="flex items-center gap-1"><button className={buttonClass} disabled={busy} onClick={() => { setPacketSeed(undefined); setPacketId(item.id); setPacketTitle(item.title); setEditingPacket(true); }}>{item.title}</button><button aria-label={`Remove source ${item.title}`} className={buttonClass} disabled={busy} onClick={() => removePacket(item.id,item.revision)}>×</button></span>)}<button className={buttonClass} disabled={busy || workspace.evidence.length >= 30} onClick={() => { setPacketSeed(undefined); setPacketId(crypto.randomUUID()); setPacketTitle(''); setEditingPacket(true); }}>Add reviewed source content</button>{savedScene && savedScene.template_data.templateId !== 'clean' && <button className={buttonClass} disabled={busy || workspace.evidence.length >= 30} onClick={() => { setPacketId(crypto.randomUUID()); setPacketTitle(`Scene ${workspace.scenes.find(scene => scene.id === sceneIds[0])?.sequence ?? 1} · ${savedScene.template_data.templateId}`); setPacketSeed(savedScene.template_data); setEditingPacket(true); }}>Reuse saved scene content for source review</button>}</div>
          {editingPacket && packetId && <div className="mt-3 space-y-3"><label className="block text-xs">Source packet name<input aria-label="Source packet name" className={fieldClass} value={packetTitle} maxLength={90} onChange={e => setPacketTitle(e.target.value)} /></label><PresentationPanel key={`${packetId}:${packet?.revision ?? 0}`} purpose="evidence" sceneReferences={workspace.scenes} projectId={projectId} sceneId={sceneIds[0]} sceneDuration={120} row={packetRow} initialDraft={packetSeed ? { envelope:packetSeed,timing:{ start_time:0,duration:120,duration_mode:'scene-remainder' } } : undefined} assets={workspace.assets} visualSettings={workspace.settings} captions={false} unsupported={false} canUndo={false} onRemove={async () => undefined} onUndo={async () => undefined} onSave={async envelope => { if (!packetTitle.trim()) return 'Enter a source packet name before approval.'; const response = await savePresentationEvidence({ projectId,id:packetId,expectedRevision:packet?.revision ?? 0,title:packetTitle,envelope,reviewed:true }); if (!response.success) return response.error; setEditingPacket(false); await load(); return undefined; }} /></div>}
        </details>}
        {review && workspace && <><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-ed-text-dim">{review.result.inputHash === workspace.inputHash ? 'Input snapshot matches the loaded project. Apply rechecks it.' : 'STALE: project inputs changed. Regenerate or review manually; Apply will reject.'}</p><p className="mt-2 text-xs text-ed-text-dim">Manual and locked content is protected by default. Use the explicit permission above to include unlocked manual presentations.</p></div><button className={buttonClass} disabled={busy || review.result.inputHash !== workspace.inputHash} onClick={batchApply}>Apply selected ready suggestions</button></div>
          {review.result.scenes.filter(scene => sceneIds.includes(scene.sceneId)).map(proposal => {
            const id = chosenId(proposal), choice = proposal.choices.find(item => item.id === id), scene = workspace.scenes.find(item => item.id === proposal.sceneId);
            const protectedScene = Boolean(proposal.skipped && !(allowManual && proposal.skipped.startsWith('Manual presentation')));
            const selectedReady = suggestionCanApply(proposal,id,allowManual);
            const draftEnvelope = choice?.envelope ?? (choice && choice.family !== 'clean' ? applyVisualSettings(createPresentationDraft(choice.family),workspace.settings) : undefined);
            return <article key={proposal.sceneId} className="space-y-3 rounded-lg border border-ed-border bg-ed-surface p-3" aria-label={`Suggestion scene ${proposal.sequence}`}>
              <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Scene {proposal.sequence}</h3><label className="flex gap-2 text-xs"><input aria-label={`Select scene ${proposal.sequence}`} type="checkbox" checked={!excluded[proposal.sceneId] && selectedReady} disabled={!selectedReady || busy || results[proposal.sceneId]?.startsWith('Applied')} onChange={e => setExcluded(previous => ({ ...previous, [proposal.sceneId]: !e.target.checked }))} />Include in Apply</label></div>
              <p className="text-xs text-ed-text-dim">Before: {proposal.previousFamily ?? 'No attached presentation'} → Proposed: {choice?.family ?? 'Skipped'}. Changed: presentation content/style/timing only; narration and media are not rewritten.</p>
              <p className="text-sm">{proposal.reason}</p>{proposal.skipped && <p className="text-xs text-ed-warn">{proposal.skipped}</p>}{proposal.notes.map(note => <p key={note} className="text-xs text-ed-warn">{note}</p>)}
              <div className="grid gap-2 sm:grid-cols-3">{proposal.choices.map(candidate => <button key={candidate.id} aria-pressed={id === candidate.id} disabled={busy || protectedScene} className={`rounded border p-2 text-left text-xs ${id === candidate.id ? 'border-ed-accent-border' : 'border-ed-border'}`} onClick={() => setSelected(previous => ({ ...previous,[proposal.sceneId]:candidate.id }))}>{candidate.family !== 'clean' && <TemplatePoster id={candidate.family} />}<span className="block font-semibold">{candidate.title}</span><span className="block">{candidate.status.replaceAll('-',' ')}</span></button>)}</div>
              {choice?.requirements.map(requirement => <p key={requirement} className="text-xs text-ed-warn">{requirement}</p>)}{choice?.anchor && <p className="text-xs text-ed-text-dim">Cue: “{choice.anchor.phrase}” · occurrence {choice.anchor.occurrence+1} · {choice.anchor.estimated ? 'estimated, not aligned' : `${choice.timing.start_time.toFixed(2)}s into scene`}</p>}
              {choice && draftEnvelope && scene && !protectedScene && !results[proposal.sceneId]?.startsWith('Applied') && <PresentationPanel key={`${review.runId}:${proposal.sceneId}:${choice.id}`} purpose="suggestion-review" sceneReferences={workspace.scenes} projectId={projectId} sceneId={proposal.sceneId} sceneDuration={scene.duration} initialDraft={{ envelope:draftEnvelope,timing:choice.timing }} assets={workspace.assets} visualSettings={workspace.settings} captions={workspace.captions} canUndo={false} unsupported={false} onRemove={async () => undefined} onUndo={async () => undefined} onSave={(envelope,timing) => apply(proposal.sceneId,choice.id,{envelope,timing,reviewed:true})} />}
              {results[proposal.sceneId] && <p role="status" className="text-xs text-ed-warn">{results[proposal.sceneId]}</p>}
            </article>;
          })}
        </>}
      </div>
    </section></div>,document.body)}
  </>;
}
