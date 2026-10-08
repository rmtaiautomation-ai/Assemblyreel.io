import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export class PresentationAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Ownership only: manual editing is independent of billing entitlements. */
export async function requirePresentationProject(client: SupabaseClient, projectId: string) {
  if (!z.uuid().safeParse(projectId).success) throw new PresentationAccessError('Invalid project.', 400);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new PresentationAccessError('Sign in to edit scene presentations.', 401);
  const project = await client.from('video_projects').select('id,workspace_id').eq('id', projectId).maybeSingle();
  if (project.error || !project.data) throw new PresentationAccessError('Project access could not be verified.', 403);
  const workspace = await client.from('workspaces').select('user_id').eq('id', project.data.workspace_id).maybeSingle();
  if (workspace.error || workspace.data?.user_id !== user.id) throw new PresentationAccessError('You do not own this project.', 403);
  return user;
}
