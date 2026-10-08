'use server';

import { createClient } from '@/lib/supabase/server';
import { mutationSchema, presentationRowSchema } from '@/lib/presentations/schema';
import type { PresentationMutation } from '@/lib/presentations/schema';
import { presentationMediaIds, resolvePresentation } from '@/lib/presentations/compiler';
import { requirePresentationProject } from './access';

function message(error: unknown) {
  const raw = error instanceof Error ? error.message : 'Presentation could not be saved.';
  if (raw.includes('REVISION_CONFLICT')) return 'This presentation changed elsewhere. Reload the scene before saving or undoing.';
  if (raw.includes('OPERATION_REUSED')) return 'This save attempt has different content. Start a new save.';
  if (raw.includes('ASSET_NOT_READY')) return 'One of the images is unavailable. Choose a ready project image.';
  if (raw.includes('INVALID_PRESENTATION')) return 'The database rejected this presentation version or configuration. Check the ordered presentation migrations through db/add-documentary-phase-5.sql. Your saved presentation was not replaced.';
  if (raw.includes('RECAP_REFERENCE_INVALID')) return 'A recap source scene was deleted, reordered or linked to different media. Repair the earlier-scene references before saving.';
  if (/PGRST202|mutate_scene_presentation.*(find|exist|schema)/i.test(raw)) return 'Presentation setup is required. Run the Phase 1 migration in the selected database.';
  return raw;
}

export async function saveScenePresentation(input: PresentationMutation) {
  try {
    const parsed = mutationSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid presentation.' };
    const value = parsed.data;
    const client = await createClient();
    await requirePresentationProject(client, value.projectId);
    const scene = await client.from('scenes').select('id,video_duration').eq('id', value.sceneId).eq('project_id', value.projectId).maybeSingle();
    if (scene.error || !scene.data) throw new Error('Scene access could not be verified.');
    if (value.action === 'save' && value.envelope) {
      const ids = presentationMediaIds(value.envelope);
      const media = ids.length ? await client.from('media').select('id,project_id,media_type,status,url,original_filename').eq('project_id', value.projectId).in('id', ids) : { data: [], error: null };
      if (media.error) throw new Error('Project images could not be loaded.');
      const references = value.envelope.templateId === 'chapter-recap' ? await client.from('scenes').select('id,sequence_number,media_id').eq('project_id', value.projectId) : { data: [], error: null };
      if (references.error) throw new Error('Recap scene references could not be loaded.');
      const resolved = resolvePresentation(value.envelope, value.timing, Number(scene.data.video_duration) || 5, 30,
        (media.data ?? []).map(row => ({ id: row.id, projectId: row.project_id, mediaType: row.media_type, status: row.status, url: row.url ?? '', name: row.original_filename ?? 'Image' })), value.projectId,
        { sceneId: value.sceneId, scenes: (references.data ?? []).map(row => ({ id: row.id, sequence: row.sequence_number, mediaId: row.media_id })) });
      if (resolved.issues.length) throw new Error(resolved.issues[0]);
    }
    const { data, error } = await client.rpc('mutate_scene_presentation', {
      p_project_id: value.projectId, p_scene_id: value.sceneId, p_expected_id: value.expectedId,
      p_expected_revision: value.expectedRevision, p_operation_id: value.operationId,
      p_envelope: value.envelope ?? null, p_start: value.timing.start_time, p_duration: value.timing.duration,
      p_duration_mode: value.timing.duration_mode, p_locked: value.locked, p_action: value.action,
    });
    if (error) throw new Error(error.message);
    const row = data?.row === null ? null : presentationRowSchema.parse(data?.row);
    const previous = data?.previous === null ? null : presentationRowSchema.parse(data?.previous);
    return { success: true as const, row, previous, replayed: Boolean(data?.replayed) };
  } catch (error) {
    return { success: false as const, error: message(error) };
  }
}
