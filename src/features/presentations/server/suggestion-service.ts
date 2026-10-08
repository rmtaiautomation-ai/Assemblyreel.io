import type { BillingDependencies } from '@/server/billing/authorization';
import type { BillingJson } from '@/server/billing/fingerprint';
import { runMeteredGeneration } from '@/server/generation/metered-generation';
import { DIRECTOR_MAX_OUTPUT_TOKENS, DIRECTOR_SYSTEM, directPresentations } from '@/lib/ai/agents/presentation-director';
import { AGENT_MODEL } from '@/lib/ai/openai-provider';
import { candidatesForScene, validateDecision, paceSuggestions, suggestionResultSchema, SUGGESTION_VERSION, SUGGESTION_WINDOW_SIZE, MAX_SUGGESTION_SCENES, type SuggestionResult } from '@/lib/presentations/suggestions';
import type { SuggestionContext } from './suggestion-context';

export type SuggestionRun = { id: string; project_id: string; requested_by: string; target_scene_ids: string[]; input_hash: string; include_manual: boolean; state: 'running' | 'generated' | 'complete' | 'failed' | 'unknown'; result: SuggestionResult | null; error_code: string | null; billing_operation_id?: string | null };
export interface SuggestionRunStore {
  claim(run: SuggestionRun): Promise<{ created: boolean; run: SuggestionRun }>;
  update(id: string, patch: Partial<SuggestionRun> & { provider_request_id?: string }): Promise<void>;
}

/** No request cookies or browser credit quantities inside the shared planning service. */
export async function planPresentations(options: { context: SuggestionContext; targetIds: readonly string[]; actorId: string; requestId: string; includeManual?: boolean; billing: BillingDependencies; store: SuggestionRunStore; direct?: typeof directPresentations }) {
  const { context, targetIds, store } = options;
  if (!targetIds.length || targetIds.length > MAX_SUGGESTION_SCENES || new Set(targetIds).size !== targetIds.length) throw new Error('Requested scenes must be unique and limited to 48 per request.');
  const targets = context.scenes.filter(scene => targetIds.includes(scene.id));
  if (targets.length !== targetIds.length || !targets.length) throw new Error('Requested scenes are not in this project.');
  const eligible = targets.filter(scene => !scene.unsupported && !scene.row?.locked && (scene.row?.origin !== 'user' || options.includeManual === true));
  if (!eligible.length) throw new Error('All requested scenes are locked, unsupported or manually protected; no provider call was made.');
  const candidateMap = new Map(eligible.map(scene => [scene.id, candidatesForScene(scene, context.evidence, context.settings, context.assets, context.project.id, context.scenes)]));
  const windows = Array.from({ length: Math.ceil(eligible.length / SUGGESTION_WINDOW_SIZE) }, (_, index) => eligible.slice(index * SUGGESTION_WINDOW_SIZE, (index + 1) * SUGGESTION_WINDOW_SIZE));
  const claim = await store.claim({ id: options.requestId, project_id: context.project.id, requested_by: options.actorId, target_scene_ids: [...targetIds], input_hash: context.inputHash, include_manual: options.includeManual === true, state: 'running', result: null, error_code: null });
  if (!claim.created) {
    if (claim.run.input_hash !== context.inputHash || claim.run.include_manual !== (options.includeManual === true) || JSON.stringify([...claim.run.target_scene_ids].sort()) !== JSON.stringify([...targetIds].sort())) throw new Error('Inputs changed for this request. Start a new suggestion request.');
    if (claim.run.state === 'complete' && claim.run.result) return suggestionResultSchema.parse(claim.run.result);
    throw new Error('This request is pending or failed. Check its saved result; do not resubmit a possibly accepted provider call.');
  }
  let currentWindow = 0;
  try {
    let resultScenes: SuggestionResult['scenes'] = [];
    for (const [index, scenes] of windows.entries()) {
      currentWindow = index;
      const sceneKeys = new Set(scenes.map(scene => scene.id));
      const firstIndex = context.scenes.findIndex(scene => scene.id === scenes[0].id), lastIndex = context.scenes.findIndex(scene => scene.id === scenes.at(-1)!.id);
      const prompt = JSON.stringify({ version: SUGGESTION_VERSION, topic: context.project.topic, channelFormat: context.project.format, verifiedFacts: context.project.facts,
        cleanPreference: context.settings.cleanPreference, ratio: context.project.ratio,
        sourceCatalog: context.evidence.filter(packet => context.settings.allowedFamilies.includes(packet.envelope.templateId as typeof context.settings.allowedFamilies[number])).map(packet => ({ id: packet.id,title: packet.title,family: packet.envelope.templateId,content: packet.envelope.content })),
        neighbors: [...context.scenes.slice(Math.max(0, firstIndex - 2),firstIndex),...context.scenes.slice(lastIndex+1,lastIndex+3)].map(scene => ({ id: scene.id, text: scene.text, family: scene.row?.template_data.templateId ?? 'clean' })),
        recentFamilies: resultScenes.slice(-3).map(scene => scene.choices.find(choice => choice.id === scene.chosenId)?.family),
        scenes: scenes.map(scene => ({ id: scene.id, text: scene.text, duration: scene.duration, candidates: candidateMap.get(scene.id)!.map(candidate => ({ id: candidate.id, family: candidate.family, title: candidate.title, status: candidate.status, requirements: candidate.requirements })) })) });
      const bytes = Buffer.byteLength(prompt + DIRECTOR_SYSTEM, 'utf8');
      if (bytes > 100000) throw new Error('The source/context window is too large. Shorten source content or suggest fewer scenes.');
      // Conservative reservation: UTF-8 bytes plus fixed protocol/schema overhead,
      // output cap, no automatic provider retries. Not an invented credit conversion.
      const metered = await runMeteredGeneration({ dependencies: options.billing, resource: { kind: 'project', id: context.project.id },
        usage: { operationKey: `${options.requestId}:${index}`, purpose: 'presentation_suggestions', items: { llm_tokens: bytes + 16000 + DIRECTOR_MAX_OUTPUT_TOKENS }, input: { model: AGENT_MODEL, version: SUGGESTION_VERSION, maxOutputTokens: DIRECTOR_MAX_OUTPUT_TOKENS, prompt } as BillingJson },
        start: async operationId => {
          await store.update(options.requestId, { billing_operation_id: operationId });
          const response = await (options.direct ?? directPresentations)(prompt);
          if (response.requestId) await store.update(options.requestId, { provider_request_id: response.requestId });
          if (response.decisions.length !== scenes.length || new Set(response.decisions.map(item => item.sceneId)).size !== scenes.length || response.decisions.some(item => !sceneKeys.has(item.sceneId))) throw new Error('Director results did not match the requested scene IDs.');
          const proposals = scenes.map(scene => validateDecision(response.decisions.find(item => item.sceneId === scene.id)!, scene, candidateMap.get(scene.id)!, context.assets, context.project.id, context.scenes));
          // Retain validated output before settlement. A crash/ledger failure can
          // be reconciled without paying to regenerate already received text.
          await store.update(options.requestId, { state: 'generated', result: suggestionResultSchema.parse({ version: SUGGESTION_VERSION,inputHash: context.inputHash,scenes: [...resultScenes,...proposals] }) });
          return { outcome: 'provider_completed', value: proposals, provider: 'openai', requestId: response.requestId };
        } });
      if (metered.kind !== 'result' || metered.result.outcome !== 'provider_completed') throw new Error('Provider operation requires reconciliation; no duplicate call was made.');
      resultScenes = [...resultScenes, ...metered.result.value];
    }
    const before = context.scenes[context.scenes.findIndex(scene => scene.id === eligible[0].id) - 1]?.row?.template_data.templateId ?? null;
    const paced = paceSuggestions(resultScenes, context.settings.cleanPreference, before);
    const skipped = targets.filter(scene => !eligible.includes(scene)).map(scene => ({ sceneId: scene.id, sequence: scene.sequence, expectedId: scene.row?.id ?? null, expectedRevision: scene.row?.revision ?? 0, previousFamily: scene.row?.template_data.templateId ?? null, skipped: scene.unsupported ? 'Unsupported saved presentation.' : scene.row?.locked ? 'Keep my edits is on.' : 'Manual presentation: request inclusion requires explicit approval.', chosenId: '', reason: 'Preserved existing presentation.', notes: [], choices: [] }));
    const result = suggestionResultSchema.parse({ version: SUGGESTION_VERSION, inputHash: context.inputHash, scenes: [...paced, ...skipped].sort((a, b) => a.sequence - b.sequence) });
    await store.update(options.requestId, { state: 'complete', result });
    return result;
  } catch (error) {
    await store.update(options.requestId, { state: 'unknown', error_code: `WINDOW_${currentWindow}_FAILED` }).catch(() => undefined);
    // Uncertainty is retained in the shared ledger. Never free a reservation on a timeout/schema failure.
    throw error;
  }
}
