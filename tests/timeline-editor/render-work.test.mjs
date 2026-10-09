import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadEditor } from './load-editor.mjs';
import { loadComponent } from './load-component.mjs';
const labels = await loadComponent('SceneClipLabel');
const { SceneBlock } = await loadComponent('SceneBlock', { './SceneClipLabel': labels });

test('scene visuals mount one thumbnail slot with compact labels and awaiting visuals', () => {
  const html = renderToStaticMarkup(React.createElement(SceneBlock, { track: 'V1', number: 7, width: 150, mediaType: 'image', mediaUrl: '/image.jpg', thumbnailCache: {} }));
  assert.equal((html.match(/data-timeline-thumbnail=/g) ?? []).length, 1); assert.match(html, /S7/);
  assert.doesNotMatch(html, /src="\/image.jpg"/); // Full-resolution images never enter the track DOM.
  const narrow = renderToStaticMarkup(React.createElement(SceneBlock, { track: 'V1', number: 8, width: 20, awaitingVisuals: true }));
  assert.doesNotMatch(narrow, /Awaiting visuals/);
  const wide = renderToStaticMarkup(React.createElement(SceneBlock, { track: 'V1', number: 8, width: 150, awaitingVisuals: true }));
  assert.match(wide, /Awaiting visuals/);
  const audio = renderToStaticMarkup(React.createElement(SceneBlock, { track: 'A1', number: 7, width: 150, hasAudio: true }));
  assert.match(audio, /S7/); assert.match(audio, /stroke-opacity="0.95"/);
});

test('presentation index preserves first match and all consumers share one scene-reference array', () => {
  const scenes = Array.from({ length: 500 }, (_, index) => ({ id: 's-' + index, sequence_number: index + 1, media_id: 'm-' + index, video_duration: 5 }));
  const presentationRows = scenes.map(scene => ({ scene_id: scene.id, template_data: {} }));
  presentationRows.push({ scene_id: scenes[0].id, template_data: { duplicate: true } });
  const references = [];
  const bindings = { scenes, presentationRows, useMemo: fn => fn(), pendingPickFor: () => null,
    pendingStockPick: null, pendingProjectPick: null, remotionFps: 30, presentationAssets: [], initialProject: { id: 'p' }, unsupportedPresentationScenes: [],
    resolvePresentation: (...args) => { references.push(args[6].scenes); return { presentation: undefined, issues: [] }; } };
  for (const name of ['sceneById', 'presentationBySceneId', 'sceneReferences']) bindings[name] = loadEditor(name, bindings);
  assert.equal(bindings.presentationBySceneId.get('s-0'), presentationRows[0]);
  assert.equal(bindings.sceneById.get('s-499'), scenes[499]);
  const composition = loadEditor('remotionScenes', bindings);
  loadEditor('presentationIssues', bindings);
  assert.equal(composition.length, 500);
  assert.ok(references.every(reference => reference === bindings.sceneReferences));
  assert.deepEqual(bindings.sceneReferences[499], { id: 's-499', sequence: 500, mediaId: 'm-499' });
});

test('stable events adopt new locks and geometry only after the render commits', async () => {
  const source = await readFile(new URL('../../src/features/timeline-editor/use-committed-event.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let ref; let stable; let commit;
  const exports = {};
  new Function('require', 'exports', code)(() => ({
    useRef: initial => ref ??= { current: initial },
    useCallback: callback => stable ??= callback,
    useLayoutEffect: effect => { commit = effect; },
  }), exports);
  const first = exports.useCommittedEvent(() => ({ locked: false, duration: 5 })); commit();
  const next = exports.useCommittedEvent(() => ({ locked: true, duration: 8 }));
  assert.equal(first, next); assert.deepEqual(first(), { locked: false, duration: 5 });
  commit(); assert.deepEqual(first(), { locked: true, duration: 8 });
});
