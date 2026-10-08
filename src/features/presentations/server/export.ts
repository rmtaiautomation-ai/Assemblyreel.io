import type { SupabaseClient } from '@supabase/supabase-js';
import type { RenderPayload } from '@/server/rendering/render-payload';
import { presentationRowSchema } from '@/lib/presentations/schema';
import { resolvePresentation } from '@/lib/presentations/compiler';
import { requirePresentationProject } from './access';

/** Resolve durable IDs and authoritative saved rows immediately before export. */
export async function prepareProjectPresentations(client: SupabaseClient, payload: RenderPayload): Promise<RenderPayload> {
  await requirePresentationProject(client, payload.projectId);
  const sceneIds = payload.scenes.map(scene => scene.id);
  if (new Set(sceneIds).size !== sceneIds.length) throw new Error('Duplicate scenes cannot be exported.');
  const owned = await client.from('scenes').select('id,sequence_number,media_id').eq('project_id', payload.projectId).in('id', sceneIds);
  if (owned.error || owned.data?.length !== sceneIds.length) throw new Error('One or more scenes do not belong to this project.');
  const rows = await client.from('overlay_clips').select('*').eq('project_id', payload.projectId).eq('kind', 'scene-template').in('scene_id', sceneIds);
  // A pre-Phase-1 database has no scene_id; keep its legacy render path usable.
  const preAttachmentSchema = rows.error && ['42703', 'PGRST204'].includes(rows.error.code) && rows.error.message.includes('scene_id');
  if (rows.error && !preAttachmentSchema) throw new Error('Saved presentations could not be loaded.');
  const presentations = (rows.error ? [] : rows.data ?? []).map(row => presentationRowSchema.parse(row));
  const media = presentations.length ? await client.from('media').select('id,project_id,media_type,status,url,original_filename').eq('project_id', payload.projectId) : { data: [], error: null };
  if (media.error) throw new Error('Presentation images could not be loaded.');
  const assets = (media.data ?? []).map(row => ({ id: row.id, projectId: row.project_id, mediaType: row.media_type, status: row.status, url: row.url ?? '', name: row.original_filename ?? 'Image' }));
  return { ...payload, scenes: payload.scenes.map(scene => {
    const row = presentations.find(item => item.scene_id === scene.id);
    if (!row) return { ...scene, presentation: undefined };
    const resolved = resolvePresentation(row.template_data, row, Number(scene.durationInSeconds), Number(payload.fps) || 30, assets, payload.projectId,
      { sceneId: scene.id, scenes: (owned.data ?? []).map(item => ({ id: item.id, sequence: item.sequence_number, mediaId: item.media_id })) });
    if (resolved.issues.length) throw new Error(`Scene ${scene.id}: ${resolved.issues.join(' ')}`);
    return { ...scene, presentation: resolved.presentation };
  }) };
}
