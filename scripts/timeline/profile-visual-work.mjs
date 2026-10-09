// Source/SSR operation counts only: not browser paint, FPS, network or decoding timings.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadSource } from '../../tests/presentations/load-source.mjs';
import { loadComponent } from '../../tests/timeline-editor/load-component.mjs';
import { loadEditor } from '../../tests/timeline-editor/load-editor.mjs';
const baseline = process.argv[2] || '02a6fbd';
const require = createRequire(import.meta.url);
const labels = await loadComponent('SceneClipLabel');
const oldSource = execFileSync('git', ['show', baseline + ':src/features/timeline-editor/components/SceneBlock.tsx'], { encoding: 'utf8' });
const code = ts.transpileModule(oldSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const old = {};
new Function('require', 'exports', code)(name => name === './SceneClipLabel' ? labels : require(name), old);
const { SceneBlock } = await loadComponent('SceneBlock');
const { visibleClips } = await loadSource(new URL('../../src/features/timeline-editor/viewport.ts', import.meta.url));
const { ThumbnailCache } = await loadSource(new URL('../../src/features/timeline-editor/thumbnail-cache.ts', import.meta.url));
const flush = () => new Promise(resolve => setImmediate(resolve));
const results = [];
for (const count of [250, 500]) for (const scale of [10, 30, 100]) {
  const scenes = Array.from({ length: count }, (_, index) => ({ id: 'scene-' + index, sequence_number: index + 1, video_duration: 5 }));
  const clips = scenes.map((scene, index) => ({ id: scene.id, startTime: index * 5, duration: 5 }));
  let peakScenes = 0; let peakOldImages = 0; let peakNewSlots = 0; let peakClipVisuals = 0;
  let peakCacheEntries = 0; let peakCacheBytes = 0; let peakConcurrentLoads = 0;
  let releases = [];
  const cache = new ThumbnailCache(async source => {
    peakConcurrentLoads = Math.max(peakConcurrentLoads, cache.stats.running);
    await flush();
    return { url: source, bytes: 60_000, dispose() {} };
  });
  const maximumStart = Math.max(0, count * 5 * scale - 1200);
  for (let pass = 0; pass < 3; pass++) for (let step = 0; step <= 10; step++) {
    const start = Math.round(maximumStart * step / 10);
    const range = { start, end: start + 1200 };
    const entries = loadEditor('visibleSceneEntries', { useMemo: fn => fn(), scenes, mediaAssets: [],
      scale, visiblePxRange: range, VIRTUALIZE_BUFFER_PX: 1600, isLongForm: false, narratedActNumbers: new Set(),
      getSceneDuration: scene => scene.video_duration, getSceneLeftPosition: (_track, index) => index * 5 * scale,
      v1DragInsertIndex: null, a1DragInsertIndex: null, draggingAsset: null, draggingScene: null });
    let oldImages = 0; let newSlots = 0;
    for (const { scene } of entries) {
      const props = { track: 'V1', number: scene.sequence_number, width: 5 * scale, mediaType: 'image', mediaUrl: '/image/' + scene.id };
      oldImages += (renderToStaticMarkup(React.createElement(old.SceneBlock, { ...props, stripCount: Math.ceil(5 * scale / 80) })).match(/<img /g) ?? []).length;
      newSlots += (renderToStaticMarkup(React.createElement(SceneBlock, { ...props, thumbnailCache: cache })).match(/data-timeline-thumbnail=/g) ?? []).length;
    }
    peakScenes = Math.max(peakScenes, entries.length);
    peakOldImages = Math.max(peakOldImages, oldImages);
    peakNewSlots = Math.max(peakNewSlots, newSlots);
    peakClipVisuals = Math.max(peakClipVisuals, visibleClips(clips, scale, range).length);
    releases.forEach(release => release());
    releases = entries.map(({ scene }) => cache.subscribe(scene.id, () => {}));
    while (cache.stats.running) await flush();
    peakCacheEntries = Math.max(peakCacheEntries, cache.stats.entries);
    peakCacheBytes = Math.max(peakCacheBytes, cache.stats.bytes);
  }
  releases.forEach(release => release()); cache.clear();
  results.push({ scenes: count, pixelsPerSecond: scale, viewportPixels: 1200, scrollPasses: 3, sampledWindows: 33,
    peakVisibleScenes: peakScenes, imageNodesBefore: peakOldImages, thumbnailSlotsAfter: peakNewSlots,
    overlayOrMusicVisualsBefore: count, overlayOrMusicVisualsAfter: peakClipVisuals,
    peakCacheEntries, peakCacheBytes, peakConcurrentLoads, retainedAfterClear: cache.stats.entries });
}
console.log(JSON.stringify({ baseline, note: 'Actual scene component SSR and visibility helpers; cache uses delayed synthetic 60 KB thumbnails. No browser speed or decoded-memory claim.', results }, null, 2));
