import { z } from 'zod';

export const sourceSchema = z.object({
  credit: z.string().trim().max(90),
  url: z.string().max(1000).refine(value => !value || /^https?:\/\//i.test(value), 'Use an http or https source link'),
  classification: z.enum(['historical', 'illustration', 'reconstruction', 'unknown']),
}).strict();
export const imageSchema = z.object({
  id: z.uuid(), asset: z.object({ kind: z.literal('media'), mediaId: z.uuid() }).strict(),
  label: z.string().trim().min(1).max(60), fit: z.enum(['cover', 'contain']),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(), source: sourceSchema,
}).strict();
