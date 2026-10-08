import { presentationSchema } from './schema';
import type { PresentationAsset, PresentationEnvelope, PresentationTiming, ResolvedPresentation } from './schema';
import { IMAGE_COMPARISON_V1, presentationDefinition } from './registry';
import { presentationImages } from './content';
import { presentationContentIssues, presentationReadingWords } from './validation';
import { recapReferenceIssues, type PresentationReferenceContext } from './phase-5-validation';

export function presentationFrameRange(timing: PresentationTiming, sceneDuration: number, fps: number) {
  if (![sceneDuration, fps, timing.start_time, timing.duration].every(Number.isFinite) || fps <= 0 || sceneDuration <= 0 || timing.start_time < 0 || timing.duration <= 0) {
    return { startFrame: 0, durationInFrames: 0, issues: ['Presentation timing is invalid.'] };
  }
  const sceneFrames = Math.max(1, Math.round(sceneDuration * fps));
  const startFrame = Math.round(timing.start_time * fps);
  const available = sceneFrames - startFrame;
  const requested = Math.round(timing.duration * fps);
  const durationInFrames = timing.duration_mode === 'scene-remainder' ? available : Math.min(requested, available);
  const issues = available <= 0 || durationInFrames <= 0 ? ['Presentation starts after this scene ends.'] : [];
  return { startFrame, durationInFrames: Math.max(0, durationInFrames), issues };
}

export function resolvePresentation(input: unknown, timing: PresentationTiming, sceneDuration: number, fps: number, assets: readonly PresentationAsset[], projectId: string, references?: PresentationReferenceContext): { presentation?: ResolvedPresentation; issues: string[] } {
  const parsed = presentationSchema.safeParse(input);
  if (!parsed.success) return { issues: ['This presentation is incomplete or uses an unsupported version.', ...parsed.error.issues.slice(0, 6).map(issue => `${issue.path.join(' → ')}: ${issue.message}`)] };
  const envelope = parsed.data;
  const range = presentationFrameRange(timing, sceneDuration, fps);
  if (envelope.templateId === 'clean') return { issues: [], presentation: { envelope, assets: [], ...range } };
  const issues = [...range.issues];
  const images = presentationImages(envelope);
  const resolved = images.map(image => {
    const asset = assets.find(item => item.id === image.asset.mediaId && item.projectId === projectId);
    if (!asset || asset.mediaType !== 'image' || asset.status !== 'ready' || !asset.url || !isPresentationUrl(asset.url)) {
      issues.push(`Choose a ready project image for “${image.label}”.`);
    }
    return { itemId: image.id, url: asset?.url ?? '' };
  });
  if (new Set(images.map(image => image.id)).size !== images.length) issues.push('Image card IDs must be distinct.');
  const words = envelope.templateId === 'image-comparison'
    ? envelope.content.images.reduce((sum, image) => sum + image.label.split(/\s+/).length, 0) + envelope.content.heading.split(/\s+/).filter(Boolean).length
    : presentationReadingWords(envelope);
  const definition = presentationDefinition(envelope.templateId, envelope.templateVersion);
  const minimumSeconds = Math.max(definition && 'minimumHoldSeconds' in definition ? definition.minimumHoldSeconds : IMAGE_COMPARISON_V1.minimumHoldSeconds, .8 + words / 3);
  if (range.durationInFrames / fps < minimumSeconds) issues.push(`This ${envelope.templateId === 'image-comparison' ? 'comparison' : 'presentation'} needs about ${minimumSeconds.toFixed(1)} seconds. Extend the scene or shorten the labels.`);
  issues.push(...presentationContentIssues(envelope, range.durationInFrames / fps));
  issues.push(...recapReferenceIssues(envelope, references));
  return { issues, ...(issues.length ? {} : { presentation: { envelope, assets: resolved, startFrame: range.startFrame, durationInFrames: range.durationInFrames } }) };
}

export function isPresentationUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'));
}

/** Rewrites only declared image slots. Used by both local and cloud preparation. */
export async function mapPresentationAssets(presentation: ResolvedPresentation | undefined, map: (url: string) => Promise<string>): Promise<ResolvedPresentation | undefined> {
  if (!presentation) return undefined;
  return { ...presentation, assets: await Promise.all(presentation.assets.map(async asset => ({ ...asset, url: await map(asset.url) }))) };
}

export function presentationMediaIds(envelope: PresentationEnvelope): string[] {
  return presentationImages(envelope).map(image => image.asset.mediaId);
}
