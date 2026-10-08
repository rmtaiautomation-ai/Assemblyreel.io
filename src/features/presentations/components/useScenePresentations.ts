'use client';
import { useEffect, useRef, useState } from 'react';
import { loadPresentationContext } from '../server/context';
import { saveScenePresentation } from '../server/actions';
import type { PresentationAsset, PresentationEnvelope, PresentationMutation, PresentationRow, PresentationTiming } from '../../../lib/presentations/schema';
import { defaultVisualSettings } from '../../../lib/presentations/visual-settings';

export function useScenePresentations(projectId: string) {
  const [rows, setRows] = useState<PresentationRow[]>([]), [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]), [settings, setSettings] = useState(defaultVisualSettings);
  const [loadedProjectId, setLoadedProjectId] = useState<string | undefined>(), [error, setError] = useState(''), [captions, setCaptions] = useState(false);
  const [undos, setUndos] = useState<Record<string, { previous: PresentationRow | null; after: PresentationRow | null }>>({});
  const requests = useRef<Record<string, { fingerprint: string; operationId: string }>>({});
  useEffect(() => { let active = true; loadPresentationContext(projectId).then(result => {
    if (!active) return;
    if (!result.success) { setError(result.error); return; }
    setRows(result.rows); setAssets(result.assets); setUnsupported(result.unsupportedSceneIds); setSettings(result.settings); setCaptions(result.captions); setLoadedProjectId(projectId); setError('');
  }).catch(() => { if (active) setError('Presentation context could not be loaded. Reload before editing.'); }); return () => { active = false; }; }, [projectId]);
  const loaded = loadedProjectId === projectId;
  const mutate = async (sceneId: string, envelope: PresentationEnvelope | undefined, timing: PresentationTiming, locked: boolean, action: 'save' | 'delete', undo = false) => {
    if (!loaded) return error || 'Presentation context is loading.';
    const current = rows.find(row => row.scene_id === sceneId) ?? null;
    const input: PresentationMutation = { projectId, sceneId, action, envelope, timing, locked, expectedId: current?.id ?? null, expectedRevision: current?.revision ?? 0, operationId: crypto.randomUUID() };
    const fingerprint = JSON.stringify({ ...input, operationId: undefined });
    if (requests.current[sceneId]?.fingerprint === fingerprint) input.operationId = requests.current[sceneId].operationId;
    requests.current[sceneId] = { fingerprint, operationId: input.operationId };
    const result = await saveScenePresentation(input);
    if (!result.success) return result.error;
    setRows(previous => [...previous.filter(row => row.scene_id !== sceneId), ...(result.row ? [result.row] : [])]);
    if (undo) setUndos(previous => { const next = { ...previous }; delete next[sceneId]; return next; });
    else setUndos(previous => ({ ...previous, [sceneId]: { previous: result.previous ?? current, after: result.row } }));
    return undefined;
  };
  const undo = (sceneId: string) => {
    const operation = undos[sceneId], current = rows.find(row => row.scene_id === sceneId) ?? null;
    if (!operation) return Promise.resolve('No change to undo.');
    if (current?.id !== operation.after?.id || current?.revision !== operation.after?.revision) return Promise.resolve('This presentation changed. Reload before undoing.');
    const restore = operation.previous;
    return mutate(sceneId, restore?.template_data, restore ?? { start_time: 0, duration: 3, duration_mode: 'scene-remainder' }, restore?.locked ?? true, restore ? 'save' : 'delete', true);
  };
  const acceptApplied = (result: { row: PresentationRow; previous: PresentationRow | null; replayed: boolean }) => {
    const sceneId = result.row.scene_id, current = rows.find(row => row.scene_id === sceneId) ?? null;
    setRows(previous => [...previous.filter(row => row.scene_id !== sceneId), result.row]);
    if (!result.replayed || current?.revision !== result.row.revision) setUndos(previous => ({ ...previous, [sceneId]: { previous: result.previous ?? current, after: result.row } }));
  };
  return { rows, assets, unsupported, settings, loaded, error, captions, undos, mutate, undo, acceptApplied };
}
