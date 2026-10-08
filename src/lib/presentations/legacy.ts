import type { OverlayClipData } from '../../remotion/types';
import { isCardKind, LEGACY_STYLE_FOR_KIND } from '../../remotion/templates/card-registry';

type CardCompatibleClip = Pick<OverlayClipData, 'kind' | 'text' | 'templateData'>;
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Read-only adaptation of the old combo writer's JSON. Never rewrites stored rows. */
export function normalizeLegacyCard<T extends CardCompatibleClip>(clip: T): T {
  if (!isCardKind(clip.kind)) return clip;
  const data = clip.templateData;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return clip;
  const legacy = data as Record<string, unknown>;
  const hasLegacyStyle = !owns(data, 'styleId') && typeof legacy.style === 'string' && legacy.style.length > 0;
  const hasLegacyItems = clip.kind === 'checklist-card' && !owns(data, 'bullets')
    && Array.isArray(legacy.items) && legacy.items.every(item => typeof item === 'string');
  if (!hasLegacyStyle && !hasLegacyItems) return clip;

  // Only the old writer's style-tagged shape can supply nested text. A blank
  // canonical headline is an intentional edit, not a reason to restore old copy.
  const text = hasLegacyStyle && clip.text === '' && typeof legacy.text === 'string'
    ? legacy.text : clip.text;
  const templateData = {
    ...data,
    ...(hasLegacyStyle ? { styleId: legacy.style === 'default' ? LEGACY_STYLE_FOR_KIND[clip.kind] : legacy.style as string } : {}),
    ...(hasLegacyItems ? { bullets: [...legacy.items as string[]] } : {}),
  };
  return { ...clip, text, templateData };
}

/** Save the canonical content pair on an explicit content edit, never on load.
 * Without this, clearing a recovered headline resurrects nested text on reload,
 * or changing its style persists a styleId while losing the recovered headline.
 */
export function withCanonicalCardContent(
  clip: CardCompatibleClip,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  if (!isCardKind(clip.kind) || (!owns(fields, 'text') && !owns(fields, 'template_data'))) return fields;
  const normalized = normalizeLegacyCard(clip);
  return { text: normalized.text, template_data: normalized.templateData, ...fields };
}
