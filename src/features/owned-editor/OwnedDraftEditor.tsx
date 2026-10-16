"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_TRACK_STATES, TRACK_IDS } from "@/lib/timeline-types";
import { loadEditor, prepareEditorSave, sendEditorSave, retryEditorSave, type EditorAttempt } from "./client";
import type { EditorDocument, EditorSnapshot } from "./schema";

const control = "mt-2 block w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] p-3";
const button = "rounded-lg border border-[#353B44] px-4 py-2 disabled:opacity-50";
export function OwnedDraftEditor({ initial }: { initial: EditorSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [document, setDocument] = useState(initial.document);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<EditorAttempt | null>(null);
  const [message, setMessage] = useState("Changes are saved only when you choose Save draft.");
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const locked = pending || Boolean(attempt) || conflict;
  const projectId = snapshot.project.id;
  useEffect(() => {
    if (!dirty && !attempt) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
      if (!window.confirm("Leave this draft? Unsaved edits will be lost. Resolve any pending save before leaving.")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); window.document.removeEventListener("click", navigate, true); };
  }, [dirty, attempt]);
  function change(next: EditorDocument) {
    if (locked || busy.current) return;
    setDocument(next); setDirty(true); setMessage("Unsaved changes.");
  }
  function sceneChange(id: string, fields: Partial<EditorDocument["scenes"][number]>) {
    change({ ...document, scenes: document.scenes.map(scene => scene.id === id ? { ...scene, ...fields } : scene) });
  }
  function moveScene(index: number, offset: number) {
    const next = [...document.scenes], target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change({ ...document, scenes: next });
  }
  async function save(original?: EditorAttempt) {
    if (busy.current || conflict) return;
    let next;
    try { next = original ?? prepareEditorSave(snapshot.revision, document); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Check the draft details."); return; }
    busy.current = true; setPending(true); setMessage("Saving draft…"); setAttempt(next);
    try {
      const result = await sendEditorSave(projectId, next);
      // No read-after-save dependency: an acknowledged save remains saved even if a later GET fails.
      setSnapshot(previous => ({ ...previous, revision: result.revision, document, removableSceneIds: document.scenes
        .filter(scene => !previous.document.scenes.some(old => old.id === scene.id) || previous.removableSceneIds.includes(scene.id)).map(scene => scene.id) }));
      setAttempt(null); setDirty(false); setMessage("Draft saved.");
    } catch (error) {
      const retry = retryEditorSave(error);
      setAttempt(retry ? next : null);
      // An uncertain write must be resolved before allowing changes or another operation ID.
      if (!retry) setConflict(true);
      setMessage(error instanceof Error ? error.message : "Unable to reach the service. Retry the original save.");
    } finally { busy.current = false; setPending(false); }
  }
  async function reload() {
    if (busy.current || attempt) return;
    if (dirty && !window.confirm("Discard your unsaved changes and load the saved draft?")) return;
    busy.current = true; setPending(true);
    try {
      const next = await loadEditor(projectId);
      setSnapshot(next); setDocument(next.document); setDirty(false); setConflict(false); setMessage("Saved draft loaded.");
    } catch { setMessage("Unable to load the saved draft. Your current edits are still here."); }
    finally { busy.current = false; setPending(false); }
  }
  const audio = snapshot.media.filter(media => media.media_type === "audio");
  const total = document.scenes.reduce((sum, scene) => sum + scene.video_duration, 0);
  return <div className="space-y-7">
    <Link href={`/dashboard/${snapshot.project.workspace_id}`} className="text-[#13EF93]">← Back to workspace</Link>
    <section className="rounded-xl border border-[#353B44] bg-[#15181C] p-6">
      <h2 className="text-xl font-semibold break-words">{snapshot.project.topic}</h2>
      <p className="mt-2 text-sm text-[#B5BCC6]">Plan scene text and timing, then save your draft. Media preview and video generation will open separately.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={locked || !dirty} onClick={() => void save()} className="rounded-lg bg-[#13EF93] px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? "Working…" : "Save draft"}</button>
        {attempt && <button disabled={pending} onClick={() => void save(attempt)} className={button}>Retry original save</button>}
        <button disabled={pending || Boolean(attempt)} onClick={() => void reload()} className={button}>Reload saved draft</button></div>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-amber-200">{message}</p>
      {attempt && <p className="mt-2 text-sm">Keep this page open until the original save is confirmed.</p>}
    </section>
    <section aria-label="Scene timeline" className="rounded-xl border border-[#353B44] p-5">
      <h2 className="font-semibold">Scene timeline · {Number.isFinite(total) ? total.toFixed(1) : "—"} seconds</h2>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-3">{document.scenes.map((scene, index) => <a key={scene.id} href={`#scene-${scene.id}`} style={{ minWidth: Number.isFinite(scene.video_duration) ? Math.max(80, Math.min(280, scene.video_duration * 12)) : 80 }} className="rounded-lg border border-[#13EF93] bg-[#13EF93]/10 p-3 text-sm">Scene {index + 1}<span className="mt-1 block text-[#B5BCC6]">{Number.isFinite(scene.video_duration) ? scene.video_duration : "—"}s</span></a>)}</div>
      {document.scenes.length === 0 && <p className="mt-3 text-sm text-[#B5BCC6]">No scenes yet. Add your first scene below.</p>}
    </section>
    <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
      <legend className="mb-4 text-xl font-semibold">Scenes</legend>
      {document.scenes.map((scene, index) => <section key={scene.id} id={`scene-${scene.id}`} className="rounded-xl border border-[#353B44] bg-[#15181C] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Scene {index + 1}</h3><div className="flex flex-wrap gap-2">
          <button disabled={locked || index === 0} className={button} onClick={() => moveScene(index, -1)} aria-label={`Move scene ${index + 1} up`}>Move up</button>
          <button disabled={locked || index === document.scenes.length - 1} className={button} onClick={() => moveScene(index, 1)} aria-label={`Move scene ${index + 1} down`}>Move down</button>
          <button disabled={locked || (snapshot.document.scenes.some(old => old.id === scene.id) && !snapshot.removableSceneIds.includes(scene.id))} className={button}
            onClick={() => { if (window.confirm(`Remove scene ${index + 1} from this draft?`)) change({ ...document, scenes: document.scenes.filter(row => row.id !== scene.id) }); }}>Remove scene</button></div></div>
        <label className="mt-4 block text-sm">Narration text<textarea maxLength={10000} rows={3} value={scene.voice_over_beat} className={control} onChange={event => sceneChange(scene.id, { voice_over_beat: event.target.value })} /></label>
        <label className="mt-4 block text-sm">Visual description<textarea maxLength={10000} rows={2} value={scene.final_video_prompt} className={control} onChange={event => sceneChange(scene.id, { final_video_prompt: event.target.value })} /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Duration (seconds)<input type="number" min={0.1} max={600} step={0.1} value={Number.isNaN(scene.video_duration) ? "" : scene.video_duration} className={control} onChange={event => sceneChange(scene.id, { video_duration: event.target.valueAsNumber })} /></label>
          <label className="text-sm">Source trim start (seconds)<input type="number" min={0} max={7200} step={0.1} value={Number.isNaN(scene.trim_start) ? "" : scene.trim_start} className={control} onChange={event => sceneChange(scene.id, { trim_start: event.target.valueAsNumber })} /></label></div>
      </section>)}
      <button disabled={locked || document.scenes.length >= 200} className={button} onClick={() => change({ ...document, scenes: [...document.scenes, { id: crypto.randomUUID(), voice_over_beat: "", final_video_prompt: "", video_duration: 5, trim_start: 0 }] })}>Add scene</button>
    </fieldset>
    <fieldset disabled={locked} className="space-y-5 rounded-xl border border-[#353B44] p-5 disabled:opacity-60">
      <legend className="px-2 text-xl font-semibold">Audio timeline</legend>
      {audio.length === 0 && <p className="text-sm text-[#B5BCC6]">This project has no saved audio assets. You can plan scenes now; audio delivery will open separately.</p>}
      {document.items.map((item, index) => <div key={item.id} className="grid gap-3 border-b border-[#353B44] pb-5 sm:grid-cols-3">
        <label className="text-sm">Clip {index + 1} · audio asset<select className={control} value={item.media_id} onChange={event => change({ ...document, items: document.items.map(row => row.id === item.id ? { ...row, media_id: event.target.value } : row) })}>
          {!audio.some(media => media.id === item.media_id) && <option value={item.media_id}>Unavailable asset</option>}{audio.map((media, i) => <option key={media.id} value={media.id}>Audio {i + 1} · {media.id.slice(0, 8)}</option>)}</select></label>
        <label className="text-sm">Track<select className={control} value={item.track_id} onChange={event => change({ ...document, items: document.items.map(row => row.id === item.id ? { ...row, track_id: event.target.value as "A1" | "A2" } : row) })}><option>A1</option><option>A2</option></select></label>
        {(["start_time", "duration", "trim_start"] as const).map(field => <label key={field} className="text-sm">{field === "start_time" ? "Timeline start" : field === "duration" ? "Duration" : "Source trim start"} (seconds)<input type="number" min={field === "duration" ? 0.1 : 0} max={7200} step={0.1} className={control} value={Number.isNaN(item[field]) ? "" : item[field]} onChange={event => change({ ...document, items: document.items.map(row => row.id === item.id ? { ...row, [field]: event.target.valueAsNumber } : row) })} /></label>)}
        <button className={button} onClick={() => { if (window.confirm("Remove this audio clip from the timeline?")) change({ ...document, items: document.items.filter(row => row.id !== item.id) }); }}>Remove audio clip</button>
      </div>)}
      <button disabled={locked || !audio.length || document.items.length >= 200} className={button} onClick={() => { const asset = audio[0]; if (asset) change({ ...document, items: [...document.items, { id: crypto.randomUUID(), media_id: asset.id, track_id: "A1", start_time: 0, duration: Math.min(5, asset.duration_seconds ?? 5), trim_start: 0 }] }); }}>Add audio clip</button>
    </fieldset>
    <fieldset disabled={locked} className="space-y-4 rounded-xl border border-[#353B44] p-5 disabled:opacity-60">
      <legend className="px-2 text-xl font-semibold">Project settings</legend>
      <label className="flex items-center gap-3"><input type="checkbox" checked={document.settings.captions_enabled} onChange={event => change({ ...document, settings: { ...document.settings, captions_enabled: event.target.checked } })} />Enable captions when media preview is available</label>
      {TRACK_IDS.map(id => { const track = document.settings.track_states[id] ?? DEFAULT_TRACK_STATES[id]; return <div key={id} className="flex flex-wrap items-center gap-5 border-t border-[#353B44] pt-4"><span className="font-semibold">{id}</span>
        {(["locked", "muted"] as const).map(field => <label key={field} className="flex items-center gap-2"><input type="checkbox" checked={track[field]} onChange={event => change({ ...document, settings: { ...document.settings, track_states: { ...document.settings.track_states, [id]: { ...track, [field]: event.target.checked } } } })} />{field === "locked" ? "Lock in media editor" : "Mute"}</label>)}
        <label className="text-sm">Volume<input type="number" min={0} max={1} step={0.05} value={Number.isNaN(track.volume) ? "" : track.volume} className={control} onChange={event => change({ ...document, settings: { ...document.settings, track_states: { ...document.settings.track_states, [id]: { ...track, volume: event.target.valueAsNumber } } } })} /></label></div>; })}
    </fieldset>
  </div>;
}
