import { z } from 'zod';
import { presentationSchema, type PresentationAsset, type PresentationEnvelope, type PresentationRow, type PresentationTiming } from './schema';
import { DOCUMENTARY_TEMPLATES } from './registry';
import { createPresentationDraft } from './drafts';
import { applyVisualSettings, type VisualSettings } from './visual-settings';
import { resolvePresentation, isPresentationUrl } from './compiler';
import { presentationImages, presentationSources } from './content';
import type { PresentationSceneReference } from './phase-5-validation';

export const SUGGESTION_VERSION = 1;
export const SUGGESTION_WINDOW_SIZE = 8;
export const MAX_SUGGESTION_SCENES = 48;
export const suggestionStatusSchema = z.enum(['ready', 'needs-assets', 'needs-source-review', 'needs-timing-review']);
export const evidenceSchema = z.object({
  id: z.uuid(), project_id: z.uuid(), title: z.string().trim().min(1).max(90),
  revision: z.number().int().positive(), envelope: presentationSchema,
}).strict();
export type PresentationEvidence = z.infer<typeof evidenceSchema>;
export type SuggestionScene = { id: string; text: string; duration: number; sequence: number; act: number; mediaId: string | null; mediaUrl: string | null; mediaType: string | null; words: { text: string; startMs: number; endMs: number }[]; row: PresentationRow | null; unsupported: boolean; timingVerified?: boolean };
export const suggestionChoiceSchema = z.object({
  id: z.string().min(1).max(100), family: z.enum(['clean', ...DOCUMENTARY_TEMPLATES.map(item => item.id)]), title: z.string().max(100),
  status: suggestionStatusSchema, requirements: z.array(z.string().max(300)).max(12), evidenceIds: z.array(z.uuid()).max(30),
  envelope: presentationSchema.nullable(),
  timing: z.object({ start_time: z.number().nonnegative(), duration: z.number().positive(), duration_mode: z.literal('scene-remainder') }).strict(),
  anchor: z.object({ phrase: z.string().max(160), occurrence: z.number().int().nonnegative(), estimated: z.boolean() }).nullable(),
}).strict();
export type SuggestionChoice = z.infer<typeof suggestionChoiceSchema>;
export const sceneSuggestionSchema = z.object({
  sceneId: z.uuid(), sequence: z.number(), expectedId: z.uuid().nullable(), expectedRevision: z.number().int().nonnegative(),
  previousFamily: z.string().nullable(), skipped: z.string().nullable(), chosenId: z.string().max(100),
  reason: z.string().max(300), notes: z.array(z.string().max(300)).max(8), choices: z.array(suggestionChoiceSchema).max(3),
}).strict();
export type SceneSuggestion = z.infer<typeof sceneSuggestionSchema>;
export const suggestionResultSchema = z.object({ version: z.literal(1), inputHash: z.string().regex(/^[a-f0-9]{32}$/), scenes: z.array(sceneSuggestionSchema).max(MAX_SUGGESTION_SCENES) }).strict();
export type SuggestionResult = z.infer<typeof suggestionResultSchema>;

/** Approval is an explicit creator action, not a model flag or a credited URL. */
export function evidenceIssues(envelope: PresentationEnvelope): string[] {
  if (envelope.templateId === 'clean') return ['Clean media is not a source packet.'];
  const sources = presentationSources(envelope);
  return sources.length === 0 || sources.some(source => !source.credit.trim() || source.classification === 'unknown')
    ? ['Credit and classify every source before approving this content.'] : [];
}

export function sceneHasBaseMedia(scene: SuggestionScene, assets: readonly PresentationAsset[]) {
  const linked = assets.find(asset => asset.id === scene.mediaId);
  return Boolean(linked?.status === 'ready' && ['image', 'video'].includes(linked.mediaType) && isPresentationUrl(linked.url)
    || scene.mediaUrl && ['image', 'video'].includes(scene.mediaType ?? '') && isPresentationUrl(scene.mediaUrl));
}

/** The model receives IDs and descriptions. It cannot author a date, quote, crop, translation or URL. */
export function candidatesForScene(scene: SuggestionScene, evidence: readonly PresentationEvidence[], settings: VisualSettings, assets: readonly PresentationAsset[], projectId: string, references: readonly PresentationSceneReference[] = []): SuggestionChoice[] {
  const timing: SuggestionChoice['timing'] = { start_time: 0, duration: scene.duration, duration_mode: 'scene-remainder' };
  const clean = { ...applyVisualSettings(createPresentationDraft('archival-explainer'), settings), templateId: 'clean' as const, content: {} };
  const candidates: SuggestionChoice[] = [{ id: 'clean', family: 'clean', title: 'Clean media', status: sceneHasBaseMedia(scene, assets) ? 'ready' : 'needs-assets', requirements: sceneHasBaseMedia(scene, assets) ? [] : ['Choose usable background media.'], evidenceIds: [], envelope: clean, timing, anchor: null }];
  for (const packet of evidence.filter(item => item.project_id === projectId && settings.allowedFamilies.includes(item.envelope.templateId as typeof settings.allowedFamilies[number]))) {
    const envelope = applyVisualSettings(packet.envelope, settings);
    const approvalIssues = evidenceIssues(envelope);
    const issues = [...approvalIssues, ...resolvePresentation(envelope, timing, scene.duration, 30, assets, projectId, { sceneId: scene.id, scenes: references }).issues, ...(scene.timingVerified === false ? ['Narration timing is estimated. Record/align narration or review timing manually.'] : [])];
    const missingImage = presentationImages(envelope).some(image => !assets.some(asset => asset.id === image.asset.mediaId && asset.projectId === projectId && asset.mediaType === 'image' && asset.status === 'ready' && isPresentationUrl(asset.url)));
    candidates.push({ id: packet.id, family: envelope.templateId, title: packet.title, status: missingImage ? 'needs-assets' : approvalIssues.length ? 'needs-source-review' : issues.length ? 'needs-timing-review' : 'ready', requirements: issues.slice(0, 12), evidenceIds: [packet.id], envelope, timing, anchor: null });
  }
  for (const family of DOCUMENTARY_TEMPLATES.filter(item => settings.allowedFamilies.includes(item.id) && !candidates.some(candidate => candidate.family === item.id))) {
    const tooShort = scene.duration < family.minimumHoldSeconds;
    candidates.push({ id: `missing:${family.id}`, family: family.id, title: family.name, status: tooShort ? 'needs-timing-review' : family.assetsRequired > 0 && !assets.some(asset => asset.mediaType === 'image' && asset.status === 'ready') ? 'needs-assets' : 'needs-source-review', requirements: [tooShort ? `Needs at least ${family.minimumHoldSeconds}s and reviewed source content.` : `Prepare and approve ${family.name} source content; image availability alone does not establish identity.`], evidenceIds: [], envelope: null, timing, anchor: null });
  }
  return candidates;
}

function normalizedWord(value: string) { return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, ''); }
/** Exact script occurrence, then measured word sequence. No fuzzy or guessed timestamps. */
export function anchorTiming(scene: SuggestionScene, phrase: string, occurrence: number): { start: number; estimated: boolean } {
  if (!phrase) return { start: 0, estimated: false };
  const hits: number[] = [];
  for (let from = 0; from <= scene.text.length;) { const at = scene.text.indexOf(phrase, from); if (at < 0) break; hits.push(at); from = at + Math.max(1, phrase.length); }
  if (!Number.isInteger(occurrence) || occurrence < 0 || hits[occurrence] === undefined) throw new Error('The cue phrase is not the requested exact occurrence in the narration.');
  const prefixWords = scene.text.slice(0, hits[occurrence]).split(/\s+/).filter(Boolean).length;
  const wanted = phrase.split(/\s+/).map(normalizedWord).filter(Boolean);
  const scriptWords = scene.text.split(/\s+/).map(normalizedWord).filter(Boolean);
  const measured = scene.words.filter(word => Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.startMs >= 0 && word.endMs >= word.startMs && word.startMs < scene.duration * 1000);
  // Alignment must agree across the whole scene; a coincidental phrase match is insufficient.
  if (measured.length === scriptWords.length && measured.every((word, index) => normalizedWord(word.text) === scriptWords[index]) && wanted.every((word, index) => word === normalizedWord(measured[prefixWords + index]?.text ?? ''))) {
    return { start: measured[prefixWords]?.startMs / 1000 || 0, estimated: false };
  }
  return { start: 0, estimated: true };
}

export type DirectorDecision = { sceneId: string; candidateId: string; reason: string; alternatives: string[]; anchorPhrase: string; anchorOccurrence: number };
export function validateDecision(decision: DirectorDecision, scene: SuggestionScene, candidates: readonly SuggestionChoice[], assets: readonly PresentationAsset[], projectId: string, references: readonly PresentationSceneReference[] = []): SceneSuggestion {
  const ids = [decision.candidateId, ...decision.alternatives];
  if (new Set(ids).size !== ids.length || ids.length > 3 || ids.some(id => !candidates.some(candidate => candidate.id === id))) throw new Error('The director returned an unknown or repeated candidate.');
  const anchor = anchorTiming(scene, decision.anchorPhrase, decision.anchorOccurrence);
  const choices = ids.map(id => {
    const candidate = candidates.find(item => item.id === id)!;
    if (candidate.family === 'clean' || !candidate.envelope) return candidate;
    const timing = { ...candidate.timing, start_time: anchor.start };
    const issues = resolvePresentation(candidate.envelope, timing, scene.duration, 30, assets, projectId, { sceneId: scene.id, scenes: references }).issues;
    const requirements = [...candidate.requirements, ...(anchor.estimated ? ['Cue timing is estimated. Align/re-record narration or review timing manually.'] : []), ...issues.filter(issue => !candidate.requirements.includes(issue))].slice(0, 12);
    return { ...candidate, timing, status: candidate.status === 'ready' && (anchor.estimated || issues.length) ? 'needs-timing-review' as const : candidate.status, requirements, anchor: decision.anchorPhrase ? { phrase: decision.anchorPhrase, occurrence: decision.anchorOccurrence, estimated: anchor.estimated } : null };
  });
  return sceneSuggestionSchema.parse({ sceneId: scene.id, sequence: scene.sequence, expectedId: scene.row?.id ?? null, expectedRevision: scene.row?.revision ?? 0, previousFamily: scene.row?.template_data.templateId ?? null, skipped: scene.unsupported ? 'Unsupported saved presentation.' : scene.row?.locked ? 'Keep my edits is on.' : scene.row?.origin === 'user' ? 'Manual presentation: replacement requires explicit approval.' : null, chosenId: decision.candidateId, reason: decision.reason, choices, notes: [] });
}

/** Warn about repetition; switch only to a validated clean alternative, never fabricate a new family. */
export function paceSuggestions(scenes: readonly SceneSuggestion[], preference: VisualSettings['cleanPreference'], previousFamily: string | null = null): SceneSuggestion[] {
  let last = previousFamily, dense = previousFamily && previousFamily !== 'clean' ? 1 : 0;
  return scenes.map(scene => {
    let result = scene;
    const chosen = scene.choices.find(choice => choice.id === scene.chosenId);
    if (!chosen || scene.skipped) return scene;
    if (chosen.family !== 'clean' && (chosen.family === last || dense >= (preference === 'clean-first' ? 1 : 3))) {
      const clean = scene.choices.find(choice => choice.family === 'clean' && choice.status === 'ready');
      result = { ...scene, chosenId: preference !== 'graphics-rich' && clean ? clean.id : scene.chosenId, reason: preference !== 'graphics-rich' && clean ? 'A validated clean alternative gives this beat breathing room. Review continuity before applying.' : scene.reason, notes: ['Repeated graphics: review continuity and breathing room.', ...(preference !== 'graphics-rich' && clean ? ['Selected the validated clean alternative; no percentage quota.'] : [])] };
    }
    last = result.choices.find(choice => choice.id === result.chosenId)?.family ?? null;
    dense = last === 'clean' ? 0 : dense + 1;
    return result;
  });
}

export function suggestionCanApply(scene: SceneSuggestion, choiceId: string, allowManual: boolean): boolean {
  const choice = scene.choices.find(item => item.id === choiceId);
  return Boolean(choice?.status === 'ready' && choice.envelope && (!scene.skipped || allowManual && scene.skipped.startsWith('Manual presentation')));
}

export function sourcePacketTiming(envelope: PresentationEnvelope): PresentationTiming {
  // Approval checks structure/assets with generous timing; per-scene timing is checked again for each proposal.
  return { start_time: 0, duration: envelope.templateId === 'clean' ? 1 : 120, duration_mode: 'scene-remainder' };
}
