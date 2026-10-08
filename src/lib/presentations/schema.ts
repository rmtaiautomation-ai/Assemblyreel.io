import { z } from 'zod';
import { familyContents, imageSchema, sourceSchema } from './families';

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export { sourceSchema };
const image = imageSchema;
const base = {
  schemaVersion: z.literal(1), templateVersion: z.literal(1),
  theme: z.object({ id: z.enum(['dark-documentary', 'parchment-archive']), version: z.union([z.literal(1), z.literal(2)]),
    overrides: z.object({ accent: color.optional() }).strict() }).strict(),
  variantId: z.literal('auto'),
  motion: z.object({ intensity: z.enum(['calm', 'standard', 'expressive']), seed: z.number().int().min(0).max(2147483647),
    entrance: z.enum(['scale', 'fade']), sequence: z.enum(['together', 'staggered']) }).strict(),
  provenance: z.object({ scriptHash: z.string().max(64), assetInventoryHash: z.string().max(64) }).strict(),
  style: z.object({ background: z.enum(['plain', 'grid', 'paper', 'halo']), density: z.enum(['spacious', 'compact']) }).strict().optional(),
};
const documentaryBase = { ...base, theme: base.theme.extend({ version: z.literal(2) }) };
export const presentationSchema = z.discriminatedUnion('templateId', [
  z.object({ ...documentaryBase, templateId: z.literal('journey-map'), content: familyContents['journey-map'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('territory-change'), content: familyContents['territory-change'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('then-now'), content: familyContents['then-now'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('layered-parallax'), content: familyContents['layered-parallax'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('structure-cutaway'), content: familyContents['structure-cutaway'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('manuscript-comparison'), content: familyContents['manuscript-comparison'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('evidence-board'), content: familyContents['evidence-board'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('animated-chart'), content: familyContents['animated-chart'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('competing-explanations'), content: familyContents['competing-explanations'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('chapter-recap'), content: familyContents['chapter-recap'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('cause-effect'), content: familyContents['cause-effect'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('scale-comparison'), content: familyContents['scale-comparison'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('fact-reveal'), content: familyContents['fact-reveal'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('claim-evidence'), content: familyContents['claim-evidence'] }).strict(),
  z.object({ ...base, templateId: z.literal('image-comparison'),
    content: z.object({ heading: z.string().trim().max(100), images: z.tuple([image, image]),
      border: z.enum(['paper', 'thin', 'none']), background: z.enum(['grid', 'plain']) }).strict(),
  }).strict(),
  z.object({ ...base, templateId: z.literal('clean'), content: z.object({}).strict() }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('historical-timeline'), content: familyContents['historical-timeline'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('person-introduction'), content: familyContents['person-introduction'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('archival-explainer'), content: familyContents['archival-explainer'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('map-locator'), content: familyContents['map-locator'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('artifact-spotlight'), content: familyContents['artifact-spotlight'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('detail-annotation'), content: familyContents['detail-annotation'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('manuscript-highlight'), content: familyContents['manuscript-highlight'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('text-translation'), content: familyContents['text-translation'] }).strict(),
  z.object({ ...documentaryBase, templateId: z.literal('relationship-diagram'), content: familyContents['relationship-diagram'] }).strict(),
]);
export type PresentationEnvelope = z.infer<typeof presentationSchema>;
export type ImageComparisonEnvelope = Extract<PresentationEnvelope, { templateId: 'image-comparison' }>;
export type PresentationImage = ImageComparisonEnvelope['content']['images'][number];

export const presentationRowSchema = z.object({
  id: z.uuid(), project_id: z.uuid(), scene_id: z.uuid(), kind: z.literal('scene-template'),
  time_basis: z.literal('scene'), duration_mode: z.enum(['fixed', 'scene-remainder']),
  start_time: z.number().nonnegative(), duration: z.number().positive(),
  revision: z.number().int().positive(), locked: z.boolean(), origin: z.enum(['user', 'ai']),
  template_data: presentationSchema,
  last_operation_id: z.uuid().nullable().optional(),
}).passthrough();
export type PresentationRow = z.infer<typeof presentationRowSchema>;
export type PresentationTiming = Pick<PresentationRow, 'start_time' | 'duration' | 'duration_mode'>;
export type PresentationAsset = { id: string; projectId: string; name: string; url: string; mediaType: string; status: string };
export type ResolvedPresentation = { envelope: PresentationEnvelope; assets: { itemId: string; url: string }[]; startFrame: number; durationInFrames: number };

export const mutationSchema = z.object({
  projectId: z.uuid(), sceneId: z.uuid(), operationId: z.uuid(),
  expectedId: z.uuid().nullable(), expectedRevision: z.number().int().nonnegative(),
  action: z.enum(['save', 'delete']), envelope: presentationSchema.optional(),
  timing: z.object({ start_time: z.number().nonnegative(), duration: z.number().positive(), duration_mode: z.enum(['fixed', 'scene-remainder']) }).strict(),
  locked: z.boolean(),
}).strict().refine(input => input.action !== 'save' || input.envelope !== undefined, 'Choose a presentation');
export type PresentationMutation = z.infer<typeof mutationSchema>;

export function createComparisonDraft(mediaIds: [string, string]): ImageComparisonEnvelope {
  return { schemaVersion: 1, templateVersion: 1, templateId: 'image-comparison', variantId: 'auto',
    theme: { id: 'dark-documentary', version: 1, overrides: {} },
    motion: { intensity: 'calm', seed: 1, entrance: 'scale', sequence: 'staggered' },
    provenance: { scriptHash: '', assetInventoryHash: '' },
    content: { heading: '', border: 'paper', background: 'grid', images: mediaIds.map((mediaId, index) => ({
      id: index === 0 ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002',
      asset: { kind: 'media' as const, mediaId }, label: index === 0 ? 'First subject' : 'Second subject',
      fit: 'cover' as const, focalPoint: { x: 0.5, y: 0.5 }, source: { credit: '', url: '', classification: 'unknown' as const },
    })) as [PresentationImage, PresentationImage] },
  };
}

export function cleanEnvelope(previous: PresentationEnvelope): PresentationEnvelope {
  return { schemaVersion: 1, templateVersion: 1, templateId: 'clean', content: {}, variantId: 'auto',
    theme: previous.theme, motion: previous.motion, provenance: previous.provenance };
}
