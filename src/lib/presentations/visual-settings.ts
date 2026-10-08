import { z } from 'zod';
import { DOCUMENTARY_TEMPLATES, PHASE_5_FAMILIES } from './registry';
import type { PresentationEnvelope } from './schema';
export const visualSettingsSchema = z.object({
  version: z.literal(1), themeId: z.enum(['dark-documentary', 'parchment-archive']), themeVersion: z.literal(2),
  motionIntensity: z.enum(['calm', 'standard', 'expressive']), background: z.enum(['plain', 'grid', 'paper', 'halo']), density: z.enum(['spacious', 'compact']),
  allowedFamilies: z.array(z.enum(DOCUMENTARY_TEMPLATES.map(item => item.id))).max(DOCUMENTARY_TEMPLATES.length).refine(ids => new Set(ids).size === ids.length, 'Families must be unique'),
  dateConvention: z.enum(['BCE/CE', 'BC/AD']), cleanPreference: z.enum(['balanced', 'clean-first', 'graphics-rich']),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
}).strict();
export type VisualSettings = z.infer<typeof visualSettingsSchema>;
export function defaultVisualSettings(): VisualSettings {
  return { version: 1, themeId: 'dark-documentary', themeVersion: 2, motionIntensity: 'calm', background: 'plain', density: 'spacious', allowedFamilies: DOCUMENTARY_TEMPLATES.filter(item => !PHASE_5_FAMILIES.some(id => id === item.id)).map(item => item.id), dateConvention: 'BCE/CE', cleanPreference: 'balanced' };
}
export function visualSettingsFromSnapshot(snapshot: unknown): VisualSettings | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const visual = (snapshot as { visual?: { presentation?: unknown } }).visual?.presentation;
  return visual ? visualSettingsSchema.parse(visual) : undefined;
}
/** Only for new drafts or explicitly reviewed restyling—never export/reload. */
export function applyVisualSettings(envelope: PresentationEnvelope, settings: VisualSettings): PresentationEnvelope {
  const common = { theme: { id: settings.themeId, version: 2 as const, overrides: settings.accent ? { accent: settings.accent } : {} }, motion: { ...envelope.motion, intensity: settings.motionIntensity }, style: { background: settings.background, density: settings.density } };
  return { ...envelope, ...common };
}
export function updatePresentationTheme(envelope: PresentationEnvelope, patch: { id?: PresentationEnvelope['theme']['id']; overrides?: { accent?: string } }): PresentationEnvelope {
  if (envelope.templateId === 'image-comparison' || envelope.templateId === 'clean') return { ...envelope, theme: { ...envelope.theme, ...patch } };
  return { ...envelope, theme: { ...envelope.theme, ...patch, version: 2 } };
}
