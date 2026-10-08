'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePresentationProject } from './access';
import { presentationRowSchema } from '@/lib/presentations/schema';
import type { PresentationAsset, PresentationRow } from '@/lib/presentations/schema';
import { defaultVisualSettings, visualSettingsFromSnapshot, visualSettingsSchema } from '@/lib/presentations/visual-settings';

export async function loadPresentationContext(projectId: string) {
  try {
    const client = await createClient(); await requirePresentationProject(client, projectId);
    const [project, overlays, media] = await Promise.all([
      client.from('video_projects').select('*').eq('id', projectId).single(),
      client.from('overlay_clips').select('*').eq('project_id', projectId).eq('kind', 'scene-template'),
      client.from('media').select('id,project_id,media_type,status,url,original_filename').eq('project_id', projectId),
    ]);
    if (project.error || overlays.error || media.error) throw new Error('Presentation context could not be loaded. Check database setup and reload.');
    const rows: PresentationRow[] = [], unsupportedSceneIds: string[] = [];
    for (const row of overlays.data ?? []) {
      const parsed = presentationRowSchema.safeParse(row);
      if (parsed.success) rows.push(parsed.data); else if (row.scene_id) unsupportedSceneIds.push(row.scene_id);
    }
    const assets: PresentationAsset[] = (media.data ?? []).map(row => ({ id: row.id, projectId: row.project_id, mediaType: row.media_type, status: row.status, url: row.url ?? '', name: row.original_filename ?? 'Project media' }));
    const settings = project.data.presentation_visual_settings ? visualSettingsSchema.parse(project.data.presentation_visual_settings) : visualSettingsFromSnapshot(project.data.format_blueprint_snapshot) ?? defaultVisualSettings();
    return { success: true as const, rows, unsupportedSceneIds, assets, settings, visualRevision: Number(project.data.presentation_visual_revision ?? 0), captions: Boolean(project.data.captions_enabled) };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : 'Presentation context unavailable.' }; }
}

export async function getPresentationVisualSettings(scope: 'workspace' | 'project', id: string) {
  try {
    z.enum(['workspace', 'project']).parse(scope);
    z.uuid().parse(id);
    const client = await createClient();
    if (scope === 'project') {
      const context = await loadPresentationContext(id);
      if (!context.success) return context;
      return { success: true as const, settings: context.settings, revision: context.visualRevision };
    }
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error('Sign in to edit channel visuals.');
    const row = await client.from('workspaces').select('format_blueprint,format_blueprint_version').eq('id', id).eq('user_id', user.id).single();
    if (row.error || !row.data) throw new Error('Channel access/setup could not be verified.');
    return { success: true as const, settings: visualSettingsFromSnapshot(row.data.format_blueprint) ?? defaultVisualSettings(), revision: Number(row.data.format_blueprint_version ?? 0) };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : 'Visual settings unavailable.' }; }
}

export async function savePresentationVisualSettings(scope: 'workspace' | 'project', id: string, revision: number, input: unknown) {
  try {
    z.enum(['workspace', 'project']).parse(scope);
    z.uuid().parse(id); z.number().int().nonnegative().parse(revision);
    const settings = visualSettingsSchema.parse(input);
    const client = await createClient();
    const { data, error } = await client.rpc('mutate_presentation_visuals', { p_scope: scope, p_id: id, p_expected_revision: revision, p_settings: settings });
    if (error) throw new Error(error.message);
    return { success: true as const, settings: visualSettingsSchema.parse(data.settings), revision: z.number().int().nonnegative().parse(data.revision) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Visual settings could not be saved.';
    return { success: false as const, error: message.includes('REVISION_CONFLICT') ? 'Settings changed in another tab. Reload before saving; your draft has not overwritten them.' : /mutate_presentation_visuals|PGRST202/.test(message) ? 'Phase 2 database setup is required. Apply db/add-documentary-template-library.sql to the selected environment.' : message };
  }
}
