import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { presentationRowSchema, type PresentationRow, type PresentationAsset } from '@/lib/presentations/schema';
import { evidenceSchema, type SuggestionScene } from '@/lib/presentations/suggestions';
import { defaultVisualSettings, visualSettingsFromSnapshot, visualSettingsSchema } from '@/lib/presentations/visual-settings';

const wordSchema = z.object({ text: z.string(), startMs: z.number(), endMs: z.number() });
const snapshotSchema = z.object({ inputHash: z.string().regex(/^[a-f0-9]{32}$/), presentations: z.array(z.unknown()), inputs: z.object({
  project: z.object({ id: z.uuid(), topic: z.string().nullable(), format: z.unknown(), facts: z.unknown(), visuals: z.unknown(), words: z.array(wordSchema).nullable(), audio: z.string().nullable(), ratio: z.string().nullable(), captions: z.boolean().nullable().optional() }),
  narrations: z.array(z.object({ act: z.number(), words: z.array(wordSchema).nullable(), audio: z.string(), start: z.number(), duration: z.number() })),
  scenes: z.array(z.object({ id: z.uuid(), text: z.string().max(12000), duration: z.number().nonnegative().nullable(), sequence: z.number().nullable(), act: z.number().nullable(), mediaId: z.uuid().nullable(), mediaUrl: z.string().nullable(), mediaType: z.string().nullable() })).max(1000),
  assets: z.array(z.object({ id: z.uuid(), projectId: z.uuid(), name: z.string(), url: z.string(), mediaType: z.string(), status: z.string() })).max(1000), evidence: z.array(evidenceSchema).max(30),
}) });

export async function readSuggestionContext(client: SupabaseClient, projectId: string) {
  const response = await client.rpc('presentation_suggestion_snapshot', { p_project: projectId });
  if (response.error) throw new Error('Phase 3 setup/access is required: db/add-presentation-suggestions.sql.');
  const snapshot = snapshotSchema.parse(response.data), inputs = snapshot.inputs;
  const rows: PresentationRow[] = [], unsupported = new Set<string>();
  for (const input of snapshot.presentations) {
    const parsed = presentationRowSchema.safeParse(input);
    if (parsed.success) rows.push(parsed.data);
    else if (input && typeof input === 'object' && 'scene_id' in input && typeof input.scene_id === 'string') unsupported.add(input.scene_id);
  }
  let start = 0;
  const scenes: SuggestionScene[] = inputs.scenes.map((scene, index) => {
    const duration = scene.duration && scene.duration > 0 ? scene.duration : 5;
    const narration = inputs.narrations.find(item => item.act === (scene.act ?? 1));
    const words = narration ? (narration.words ?? []).map(word => ({ ...word, startMs: word.startMs + narration.start * 1000, endMs: word.endMs + narration.start * 1000 })) : inputs.project.words ?? [];
    const localWords = words.filter(word => word.startMs >= start * 1000 && word.startMs < (start + duration) * 1000).map(word => ({ ...word, startMs: word.startMs - start * 1000, endMs: word.endMs - start * 1000 }));
    const value = { ...scene, duration, timingVerified: Boolean(scene.duration && (narration?.audio || inputs.project.audio)), act: scene.act ?? 1, sequence: scene.sequence ?? index + 1, words: localWords, row: rows.find(row => row.scene_id === scene.id) ?? null, unsupported: unsupported.has(scene.id) };
    start += duration;
    return value;
  });
  const settings = inputs.project.visuals ? visualSettingsSchema.parse(inputs.project.visuals) : visualSettingsFromSnapshot(inputs.project.format) ?? defaultVisualSettings();
  const facts = Array.isArray(inputs.project.facts) ? inputs.project.facts.filter(fact => fact && typeof fact === 'object' && fact.verified === true).map(fact => ({ id: fact.id,kind: fact.kind,label: fact.label,detail: fact.detail })) : [];
  return { inputHash: snapshot.inputHash, scenes, settings, evidence: inputs.evidence, assets: inputs.assets as PresentationAsset[], project: { ...inputs.project, facts } };
}
export type SuggestionContext = Awaited<ReturnType<typeof readSuggestionContext>>;
