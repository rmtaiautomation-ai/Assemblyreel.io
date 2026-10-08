import { z } from 'zod';
import { LINEAR_UNITS } from './measurements';
import { sourceSchema, imageSchema } from './primitives';
import { advancedContents } from './advanced-families';
export { sourceSchema, imageSchema } from './primitives';

export const regionSchema = z.object({
  id: z.uuid(), label: z.string().trim().min(1).max(50),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1), cueSeconds: z.number().nonnegative(),
}).strict();
const heading = z.string().trim().max(100);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
// Exact source text must not be trimmed: textarea highlight offsets refer to this string.
const suppliedText = (max: number) => z.string().min(1).max(max).refine(value=>value.trim().length>0,'Supply non-empty text');
export const highlightSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), cueSeconds: z.number().nonnegative() }).strict();
export const dateSchema = z.object({
  display: requiredText(40), approximate: z.boolean(),
  year: z.number().int().min(-9999).max(9999).nullable(),
  endYear: z.number().int().min(-9999).max(9999).nullable(),
}).strict();

/** Content schemas are separate from the envelope so renderers/editors share one contract. */
export const familyContents = {
  ...advancedContents,
  'cause-effect': z.object({ heading, steps: z.array(z.object({
    id: z.uuid(), label: requiredText(55), detail: z.string().trim().max(100), cueSeconds: z.number().nonnegative(),
  }).strict()).min(2).max(4), links: z.array(z.object({
    id: z.uuid(), type: z.enum(['sequential', 'causal']), label: requiredText(40),
    support: z.string().trim().max(140), source: sourceSchema,
  }).strict()).min(1).max(3) }).strict(),
  'scale-comparison': z.object({ heading, dimension: z.enum(['height', 'length']), method: z.enum(['proportional', 'values-only']),
    referenceId: z.uuid(), items: z.array(z.object({ id: z.uuid(), label: requiredText(55),
      value: z.number().positive().max(1e12), unit: z.enum(LINEAR_UNITS), approximate: z.boolean(), source: sourceSchema,
    }).strict()).min(2).max(3) }).strict(),
  'fact-reveal': z.object({ kind: z.enum(['quantity', 'date', 'range']), value: requiredText(45),
    unit: z.string().trim().max(20), qualifier: z.string().trim().max(30), context: requiredText(140),
    source: sourceSchema, cueSeconds: z.number().nonnegative() }).strict(),
  'claim-evidence': z.object({ heading, claim: requiredText(150), scope: z.enum(['supports', 'context-only']),
    evidence: z.object({ kind: z.enum(['passage', 'object', 'attributed']), label: requiredText(75),
      passage: z.string().max(280), image: imageSchema.nullable(), source: sourceSchema }).strict(),
    interpretation: requiredText(180), limitation: requiredText(140), cueSeconds: z.number().nonnegative(),
  }).strict(),
  'historical-timeline': z.object({ heading, spacing: z.enum(['equal', 'proportional']), events: z.array(z.object({
    id: z.uuid(), date: dateSchema, label: requiredText(65), source: sourceSchema, image: imageSchema.nullable(), cueSeconds: z.number().nonnegative(),
  }).strict()).min(1).max(5) }).strict(),
  'person-introduction': z.object({ name: requiredText(80), role: requiredText(80), affiliation: z.string().trim().max(70), dates: z.string().trim().max(40),
    portrait: imageSchema.nullable(), source: sourceSchema, side: z.enum(['left', 'right']), treatment: z.enum(['framed', 'cutout']) }).strict(),
  'archival-explainer': z.object({ kicker: z.string().trim().max(50), heading: requiredText(100), body: suppliedText(550),
    highlights: z.array(highlightSchema).max(4), textKind: z.enum(['explanation', 'quotation']), source: sourceSchema }).strict(),
  'map-locator': z.object({ heading, mapId: z.literal('west-asia-v1'), markers: z.array(z.object({
    id: z.uuid(), label: requiredText(45), latitude: z.number().min(12).max(50), longitude: z.number().min(20).max(65),
    approximate: z.boolean(), cueSeconds: z.number().nonnegative(), source: sourceSchema,
  }).strict()).min(1).max(4), viewport: z.object({ west: z.number().min(20).max(65), east: z.number().min(20).max(65), south: z.number().min(12).max(50), north: z.number().min(12).max(50) }).strict() }).strict(),
  'artifact-spotlight': z.object({ heading: requiredText(90), image: imageSchema,
    metadata: z.array(z.object({ id: z.uuid(), label: requiredText(25), value: requiredText(65) }).strict()).max(4) }).strict(),
  'detail-annotation': z.object({ heading, image: imageSchema, regions: z.array(regionSchema).min(1).max(3) }).strict(),
  'manuscript-highlight': z.object({ heading, image: imageSchema, region: regionSchema, edition: requiredText(90), folio: requiredText(45),
    excerpt: z.string().max(220), translation: z.string().max(220) }).strict(),
  'text-translation': z.object({ heading, original: suppliedText(200), translation: suppliedText(240),
    transliteration: z.string().max(200), language: requiredText(45), script: z.enum(['latin', 'hebrew', 'syriac', 'ethiopic', 'cuneiform', 'transliteration-only']),
    direction: z.enum(['ltr', 'rtl']), edition: requiredText(90), source: sourceSchema,
    fallbackReviewed: z.boolean(), cueSeconds: z.number().nonnegative() }).strict(),
  'relationship-diagram': z.object({ heading, context: requiredText(85), layout: z.enum(['chain', 'hub', 'tree']),
    nodes: z.array(z.object({ id: z.uuid(), label: requiredText(45), image: imageSchema.nullable() }).strict()).min(2).max(6),
    edges: z.array(z.object({ id: z.uuid(), from: z.uuid(), to: z.uuid(), label: requiredText(35),
      type: z.enum(['relationship', 'influence', 'tradition', 'uncertain']), source: sourceSchema, cueSeconds: z.number().nonnegative() }).strict()).min(1).max(7),
  }).strict(),
} as const;
export type DocumentaryFamilyId = keyof typeof familyContents;
export type Source = z.infer<typeof sourceSchema>;
export type FocusRegion = z.infer<typeof regionSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
