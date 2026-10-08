import { z } from 'zod';
import { imageSchema, sourceSchema } from './primitives';

const text = (max: number) => z.string().trim().min(1).max(max);
const exact = (max: number) => z.string().min(1).max(max).refine(value => Boolean(value.trim()), 'Supply exact source text');
const heading = z.string().trim().max(100);
const cue = z.number().nonnegative();
export const coordinateSchema = z.tuple([z.number().min(20).max(65), z.number().min(12).max(50)]);
export const viewportSchema = z.object({ west: z.number().min(20).max(65), east: z.number().min(20).max(65), south: z.number().min(12).max(50), north: z.number().min(12).max(50) }).strict();
export const passageSchema = z.object({ text: exact(170), edition: text(70), language: text(40),
  script: z.enum(['latin', 'hebrew', 'syriac', 'ethiopic', 'cuneiform', 'transliteration-only']), direction: z.enum(['ltr', 'rtl']),
  transliteration: z.string().max(170), fallbackReviewed: z.boolean(), source: sourceSchema }).strict();

/** Authored data only. No arbitrary SVG, HTML, URLs or generated historical geometry. */
export const advancedContents = {
  'journey-map': z.object({ heading, mapId: z.literal('west-asia-v1'), viewport: viewportSchema,
    mode: z.enum(['schematic', 'supplied-route']), route: z.array(coordinateSchema).max(128), source: sourceSchema,
    stops: z.array(z.object({ id: z.uuid(), label: text(40), date: z.string().trim().max(35), point: coordinateSchema, approximate: z.boolean(), cueSeconds: cue, source: sourceSchema }).strict()).min(2).max(5) }).strict(),
  'territory-change': z.object({ heading, mapId: z.literal('west-asia-v1'), viewport: viewportSchema, dataset: text(80),
    states: z.array(z.object({ id: z.uuid(), date: text(35), year: z.number().int().min(-9999).max(9999), label: text(50), approximate: z.boolean(), cueSeconds: cue, source: sourceSchema,
      polygons: z.array(z.array(coordinateSchema).min(3).max(64)).min(1).max(4) }).strict()).min(2).max(4) }).strict(),
  'then-now': z.object({ heading, images: z.tuple([imageSchema, imageSchema]), labels: z.tuple([text(35), text(35)]),
    method: z.enum(['wipe', 'side-by-side']), alignmentReviewed: z.boolean(), cueSeconds: cue,
    crops: z.tuple([z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict(), z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()]) }).strict(),
  'layered-parallax': z.object({ heading, preparedReviewed: z.boolean(), motion: z.enum(['left', 'right', 'up', 'down']),
    focalPoint: z.object({ x: z.number().min(.15).max(.85), y: z.number().min(.15).max(.85) }).strict(),
    layers: z.array(z.object({ image: imageSchema, role: z.enum(['background', 'transparent']), depth: z.number().min(0).max(1) }).strict()).min(2).max(4) }).strict(),
  'structure-cutaway': z.object({ heading, image: imageSchema, diagramReviewed: z.boolean(),
    sections: z.array(z.object({ id: z.uuid(), label: text(40), description: text(80), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1), cueSeconds: cue }).strict()).min(2).max(4) }).strict(),
  'manuscript-comparison': z.object({ heading, passages: z.tuple([passageSchema, passageSchema]),
    mappings: z.array(z.object({ id: z.uuid(), label: text(50), leftStart: z.number().int().nonnegative(), leftEnd: z.number().int().positive(), rightStart: z.number().int().nonnegative(), rightEnd: z.number().int().positive(), cueSeconds: cue }).strict()).max(3) }).strict(),
  'evidence-board': z.object({ heading, cards: z.array(z.object({ id: z.uuid(), label: text(45), detail: text(70), image: imageSchema.nullable(), source: sourceSchema }).strict()).min(3).max(5),
    links: z.array(z.object({ id: z.uuid(), from: z.uuid(), to: z.uuid(), label: text(50), source: sourceSchema, cueSeconds: cue }).strict()).min(2).max(4) }).strict(),
  'animated-chart': z.object({ heading, kind: z.enum(['bar', 'line']), unit: text(20), axisLabel: text(40),
    points: z.array(z.object({ id: z.uuid(), label: text(25), x: z.number().min(-1e12).max(1e12), value: z.number().min(0).max(1e12).nullable(), low: z.number().min(0).max(1e12).nullable(), high: z.number().min(0).max(1e12).nullable(), estimated: z.boolean() }).strict()).min(2).max(6),
    source: sourceSchema, caveat: text(100) }).strict(),
  'competing-explanations': z.object({ heading, explanations: z.array(z.object({ id: z.uuid(), name: text(45), support: text(120), limitation: text(100), source: sourceSchema }).strict()).min(2).max(3) }).strict(),
  'chapter-recap': z.object({ heading: text(90), nextCue: text(70), items: z.array(z.object({ id: z.uuid(), sceneId: z.uuid(), image: imageSchema, takeaway: text(70) }).strict()).min(2).max(4) }).strict(),
} as const;
