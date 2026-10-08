'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createBillingAdminClient, createRequestDependencies } from '@/server/billing/runtime';
import { isOpenAIConfigured } from '@/lib/ai/openai-provider';
import { presentationSchema, presentationRowSchema } from '@/lib/presentations/schema';
import { evidenceSchema, evidenceIssues, sourcePacketTiming, MAX_SUGGESTION_SCENES, suggestionResultSchema } from '@/lib/presentations/suggestions';
import { resolvePresentation } from '@/lib/presentations/compiler';
import { requirePresentationProject } from './access';
import { readSuggestionContext } from './suggestion-context';
import { planPresentations, type SuggestionRun, type SuggestionRunStore } from './suggestion-service';

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('STALE_SUGGESTION')) return 'Inputs changed since this suggestion. Generate a fresh suggestion or edit manually; nothing was overwritten.';
  if (message.includes('PRESENTATION_LOCKED')) return 'Keep my edits is on. AI cannot replace this presentation.';
  if (message.includes('MANUAL_REVIEW_REQUIRED')) return 'Explicitly approve replacement of this unlocked manual presentation.';
  if (message.includes('REVISION_CONFLICT')) return 'This scene/source changed elsewhere. Reload before applying; your existing content is preserved.';
  if (message.includes('BILLING_DISABLED')) return 'AI suggestions require the approved billing/generation setup. Manual editing remains available.';
  if (message.includes('LIMIT_REACHED') || message.includes('CONCURRENCY_LIMIT')) return 'Generation usage or concurrency limit reached. Wait or review your plan before a new request.';
  if (message.includes('SUBSCRIPTION_REQUIRED') || message.includes('PLAN_NOT_CONFIGURED') || message.includes('BILLING_UNAVAILABLE') || message.includes('BILLING_SYNC_PENDING') || message.includes('FEATURE_UNAVAILABLE')) return 'Generation access is not ready. Check billing setup/subscription; no new provider call is allowed.';
  if (message.includes('Sign in') || message.includes('own this project') || message.includes('AUTH_REQUIRED') || message.includes('OWNERSHIP_REQUIRED')) return 'Sign in with the owner of this project to use suggestions.';
  if (message.includes('setup') || message.includes('PGRST202') || message.includes('presentation_suggestion') || message.includes('mutate_presentation_evidence')) return 'Phase 3 database setup is required: db/add-presentation-suggestions.sql.';
  if (message.includes('EVIDENCE_LIMIT')) return 'This project has 30 source packets. Remove or update an existing packet first.';
  if (message.includes('requested scenes') || message.includes('Requested scenes') || message.includes('no provider call was made') || message.includes('Inputs changed for this request') || message.includes('pending or failed') || message.includes('source/context window')) return message;
  return 'The suggestion/source operation could not complete. Existing scenes were preserved. Check the saved request before retrying an interrupted AI call.';
}

export async function getPresentationSuggestionWorkspace(projectId: string) {
  try {
    const client = await createClient(); await requirePresentationProject(client, projectId);
    const context = await readSuggestionContext(client, projectId);
    const runs = await client.from('presentation_suggestion_runs').select('id,state,result,error_code,target_scene_ids,include_manual,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(10);
    if (runs.error) throw new Error('Phase 3 setup required.');
    return { success: true as const, evidence: context.evidence, settings: context.settings, inputHash: context.inputHash, captions: Boolean(context.project.captions),
      scenes: context.scenes.map(scene => ({ id: scene.id, text: scene.text, duration: scene.duration, sequence: scene.sequence, mediaId: scene.mediaId, act: scene.act, row: scene.row, unsupported: scene.unsupported })),
      assets: context.assets, runs: (runs.data ?? []).map(run => ({ id: String(run.id), state: String(run.state), includeManual: Boolean(run.include_manual), targetIds: run.target_scene_ids as string[], result: run.result ? suggestionResultSchema.parse(run.result) : null })) };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function savePresentationEvidence(input: unknown) {
  try {
    const value = z.object({ projectId: z.uuid(), id: z.uuid(), expectedRevision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(90), envelope: presentationSchema, reviewed: z.literal(true) }).strict().parse(input);
    const client = await createClient(); await requirePresentationProject(client, value.projectId);
    const context = await readSuggestionContext(client, value.projectId);
    const issues = [...evidenceIssues(value.envelope), ...resolvePresentation(value.envelope, sourcePacketTiming(value.envelope), 120, 30, context.assets, value.projectId, { scenes: context.scenes, sourcePacket: true }).issues];
    if (issues.length) return { success: false as const, error: issues[0] };
    const result = await client.rpc('mutate_presentation_evidence', { p_project: value.projectId, p_id: value.id, p_revision: value.expectedRevision, p_title: value.title, p_envelope: value.envelope, p_delete: false });
    if (result.error) throw new Error(result.error.message);
    const row = result.data;
    return { success: true as const, evidence: evidenceSchema.parse({ id: row.id, project_id: row.project_id, title: row.title, revision: row.revision, envelope: row.envelope }) };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function removePresentationEvidence(projectId: string, id: string, revision: number) {
  try {
    z.uuid().parse(id); z.number().int().positive().parse(revision);
    const client = await createClient(); await requirePresentationProject(client, projectId);
    const result = await client.rpc('mutate_presentation_evidence', { p_project: projectId, p_id: id, p_revision: revision, p_title: '', p_envelope: null, p_delete: true });
    if (result.error) throw new Error(result.error.message);
    return { success: true as const };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function suggestPresentations(input: unknown) {
  try {
    const value = z.object({ projectId: z.uuid(), requestId: z.uuid(), sceneIds: z.array(z.uuid()).min(1).max(MAX_SUGGESTION_SCENES).refine(ids => new Set(ids).size === ids.length), includeManual: z.boolean().default(false) }).strict().parse(input);
    const client = await createClient(), actor = await requirePresentationProject(client, value.projectId);
    const context = await readSuggestionContext(client, value.projectId);
    if (process.env.PRESENTATION_AI_ENABLED !== 'true') return { success: false as const, error: 'AI suggestion activation is off. Manual editing and source preparation remain available.' };
    if (!isOpenAIConfigured()) return { success: false as const, error: 'The server AI provider is not configured. Manual editing remains available.' };
    const billing = createRequestDependencies(client), admin = createBillingAdminClient();
    const store: SuggestionRunStore = {
      async claim(run) {
        const insert = await admin.from('presentation_suggestion_runs').insert(run).select('*').single();
        if (!insert.error) return { created: true, run: insert.data as SuggestionRun };
        if (insert.error.code !== '23505') throw new Error('Suggestion run could not be stored.');
        const existing = await admin.from('presentation_suggestion_runs').select('*').eq('id', run.id).eq('project_id', run.project_id).eq('requested_by', run.requested_by).single();
        if (existing.error || !existing.data) throw new Error('Suggestion request identity is unavailable.');
        return { created: false, run: existing.data as SuggestionRun };
      },
      async update(id, patch) {
        const update = await admin.from('presentation_suggestion_runs').update(patch).eq('id', id).eq('project_id', value.projectId).eq('requested_by', actor.id).select('id').single();
        if (update.error || !update.data) throw new Error('Suggestion result could not be stored.');
      },
    };
    const result = await planPresentations({ context, targetIds: value.sceneIds, actorId: actor.id, requestId: value.requestId, includeManual: value.includeManual, billing, store });
    return { success: true as const, runId: value.requestId, result };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function applyPresentationSuggestion(input: unknown) {
  try {
    const value = z.object({ projectId: z.uuid(), sceneId: z.uuid(), runId: z.uuid(), candidateId: z.string().min(1).max(100), operationId: z.uuid(), allowManual: z.boolean(),
      draft: z.object({ envelope: presentationSchema, timing: z.object({ start_time: z.number().nonnegative(), duration: z.number().positive(), duration_mode: z.enum(['fixed','scene-remainder']) }).strict(), reviewed: z.literal(true) }).strict().optional(),
    }).strict().parse(input);
    const client = await createClient(); await requirePresentationProject(client, value.projectId);
    const context = await readSuggestionContext(client, value.projectId);
    const run = await client.from('presentation_suggestion_runs').select('result,state,input_hash').eq('id', value.runId).eq('project_id', value.projectId).single();
    if (run.error || !run.data || run.data.state !== 'complete') throw new Error('SUGGESTION_NOT_READY');
    const result = suggestionResultSchema.parse(run.data.result), proposal = result.scenes.find(scene => scene.sceneId === value.sceneId), choice = proposal?.choices.find(item => item.id === value.candidateId);
    const scene = context.scenes.find(item => item.id === value.sceneId);
    if (!scene || !choice || !value.draft && (choice.status !== 'ready' || !choice.envelope)) throw new Error('SUGGESTION_NOT_READY');
    const issues = resolvePresentation(value.draft?.envelope ?? choice.envelope, value.draft?.timing ?? choice.timing, scene.duration, 30, context.assets, value.projectId, { sceneId: scene.id, scenes: context.scenes }).issues;
    if (issues.length) return { success: false as const, error: issues[0] };
    // Database repeats hash/lock/identity checks under the scene lock and loads
    // the trusted stored content itself. Only an explicitly reviewed manual draft
    // may supply edits; browser readiness assertions are never authority.
    const mutation = await client.rpc('apply_presentation_suggestion', { p_project: value.projectId, p_scene: value.sceneId, p_run: value.runId, p_candidate: value.candidateId, p_operation: value.operationId, p_allow_manual: value.allowManual,
      p_draft: value.draft?.envelope ?? null, p_draft_timing: value.draft?.timing ?? null });
    if (mutation.error) throw new Error(mutation.error.message);
    return { success: true as const, row: presentationRowSchema.parse(mutation.data.row), previous: mutation.data.previous ? presentationRowSchema.parse(mutation.data.previous) : null, replayed: Boolean(mutation.data.replayed) };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}
