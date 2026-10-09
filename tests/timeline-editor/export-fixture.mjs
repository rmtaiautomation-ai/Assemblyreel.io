import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Phase 0 duration fixture, extended with trims, all transition types, overlays,
// narration and music. No production media, credentials, or paid render requests.
export function exportFixture(count, fps, longForm) {
  const scenes = Array.from({ length: count }, (_, index) => ({
    id: 'fixture-' + index, sequence_number: index + 1,
    video_duration: 2 + (index % 7) * 0.125, trim_start: (index % 4) * 0.2,
    custom_media_url: '/media/scene-' + index + '.jpg', custom_media_type: 'image',
    transition_type: ['none', 'crossfade', 'slide', 'zoom', 'glitch', 'light-leak'][index % 6],
    transition_duration: index % 5 === 0 ? 12 : 0.5, ken_burns_enabled: index % 2 === 0,
    overlay_text: 'Caption ' + index, overlay_preset: 'none',
  }));
  const seconds = scenes.reduce((sum, scene) => sum + Math.round(scene.video_duration * fps), 0) / fps;
  const trackStates = { V1: { muted: false, volume: 1 }, A1: { muted: false, volume: 0.8 }, A2: { muted: false, volume: 0.4 } };
  const timelineClips = Array.from({ length: count }, (_, index) => ({
    id: 'music-' + index, trackId: index % 2 ? 'A1' : 'A2', startTime: index * seconds / count,
    duration: index === count - 1 ? 12 : 2, trimStart: index % 3 * 0.3,
    asset: { type: 'audio', name: 'Music ' + index, url: 'blob:browser-source-' + index, persistedUrl: '/media/music-' + index + '.mp3' },
  }));
  const overlayClips = Array.from({ length: count }, (_, index) => ({
    id: 'overlay-' + index, kind: index % 3 ? 'text' : 'dim-scrim', text: 'Overlay ' + index,
    startTime: index * seconds / count, duration: index === count - 1 ? 15 : 3,
    color: '#FFFFFF', preset: 'none', xPercent: 50, yPercent: 50, dimBackground: false,
  }));
  return {
    scenes, timelineClips, overlayClips, trackStates, remotionFps: fps, useMemo: fn => fn(),
    initialProject: { id: 'fixture-project' }, pendingPickFor: () => null, pendingStockPick: null, pendingProjectPick: null,
    presentationBySceneId: new Map(), presentationAssets: [], sceneReferences: [],
    masterAudioUrl: '/media/master.mp3', masterAudioDuration: seconds, hasActNarration: longForm,
    actNarrationDuration: longForm ? seconds : 0,
    actNarrations: longForm ? [
      { actNumber: 1, startSeconds: 0, durationSeconds: seconds / 2, audioUrl: '/media/act-1.mp3' },
      { actNumber: 2, startSeconds: seconds / 2, durationSeconds: seconds / 2, audioUrl: '/media/act-2.mp3' },
    ] : [],
    captionWords: [{ text: 'Fixture', start: 0, end: 1 }], captionsEnabled: true,
    remotionDimensions: { width: 1080, height: 1920 },
  };
}

export function buildExport(load, fixture, layoutScenes, prepareRenderPayload) {
  const bindings = { ...fixture, layoutScenes };
  bindings.remotionScenes = load('remotionScenes', bindings);
  Object.assign(bindings, load('{ remotionAudioClips, unexportableClipNames }', bindings));
  for (const name of ['remotionOverlayClips', 'remotionTotalDurationInFrames', 'actNarrationClips', 'remotionInputProps']) {
    bindings[name] = load(name, bindings);
  }
  const payload = { projectId: fixture.initialProject.id, ...bindings.remotionInputProps };
  const prepared = prepareRenderPayload(payload, 'https://fixture.invalid');
  if (!prepared.success) throw new Error(prepared.error);
  return { payload: prepared.payload, input: bindings.remotionInputProps,
    layout: layoutScenes(bindings.remotionScenes, fixture.remotionFps) };
}
