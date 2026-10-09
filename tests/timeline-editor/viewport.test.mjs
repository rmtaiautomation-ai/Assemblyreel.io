import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import { loadSource } from '../presentations/load-source.mjs';
import { loadEditor } from './load-editor.mjs';
const { visibleClips, intersectsViewport } = await loadSource(new URL('../../src/features/timeline-editor/viewport.ts', import.meta.url));
const { CLIP_WAVEFORM_PATH, NARRATION_WAVEFORM_PATH, actWaveformPath } = await loadSource(new URL('../../src/features/timeline-editor/waveform.ts', import.meta.url));

for (const count of [250, 500]) test(`${count} clips keep visible counts bounded and stable identities on scroll/re-entry at every zoom`, () => {
  const clips = Array.from({ length: count }, (_, i) => ({ id: 'clip-' + i, startTime: i * 5, duration: 4, trackId: 'A2' }));
  const before = JSON.stringify(clips);
  for (const scale of [10, 30, 100]) for (let repeat = 0; repeat < 20; repeat++) {
    for (const seconds of [0, 250, 750, 0]) {
      const range = { start: seconds * scale, end: seconds * scale + 1200 };
      const filtered = visibleClips(clips, scale, range);
      assert.ok(filtered.length <= Math.ceil((1200 + 3200) / (5 * scale)) + 2);
      assert.ok(filtered.every(clip => clips.includes(clip)));
      const selected = clips.find(clip => clip.id === 'clip-200');
      assert.equal(selected, clips[200]); // Logical selection stays independent of visual filtering.
    }
  }
  assert.equal(visibleClips(clips, 30, { start: 0, end: 1200 })[0], clips[0]);
  assert.equal(JSON.stringify(clips), before);
});

test('viewport retains intersecting long clips, exact edges, and an offscreen active gesture only', () => {
  assert.ok(intersectsViewport(0, 500, 30, { start: 6000, end: 7200 }));
  assert.ok(intersectsViewport(100, 5, 10, { start: 2650, end: 2800 }));
  const clips = [{ id: 'far', startTime: 1000, duration: 2 }, { id: 'near', startTime: 0, duration: 2 }];
  assert.deepEqual(visibleClips(clips, 30, { start: 0, end: 1200 }, 'far'), clips);
  assert.deepEqual(visibleClips(clips, 30, { start: 0, end: 1200 }), [clips[1]]);
});

test('global lane packing is retained when an earlier overlapping overlay scrolls out of view', () => {
  const greedyPackLanes = loadEditor('greedyPackLanes');
  const pack = loadEditor('packOverlayLanes', { greedyPackLanes, isEnvironmentalKind: kind => kind === 'dim-scrim' });
  const clips = [
    { id: 'earlier', kind: 'text', startTime: 0, duration: 60 },
    { id: 'long', kind: 'text', startTime: 1, duration: 500 },
    { id: 'later', kind: 'text', startTime: 150, duration: 8 },
    { id: 'environment', kind: 'dim-scrim', startTime: 145, duration: 20 },
  ];
  const global = pack(clips);
  const filtered = loadEditor('visibleOverlayClips', { useMemo: fn => fn(), visibleClips, displayOverlayClips: clips,
    scale: 30, visiblePxRange: { start: 4500, end: 5700 }, activeOverlayGestureId: null });
  assert.ok(!filtered.includes(clips[0])); assert.equal(global.laneByClipId.long, 1);
  assert.equal(pack(filtered).laneByClipId.long, 0); // Demonstrates why packing must precede filtering.
  assert.equal(global.laneByClipId.environment, 2); assert.equal(global.laneCount, 3);
});

test('audio trim and native drag retain their own offscreen visual without retaining all selected clips', () => {
  const clips = [{ id: 'trim', startTime: 500, duration: 4 }, { id: 'drag', startTime: 600, duration: 4 }];
  const bindings = { useMemo: fn => fn(), visibleClips, timelineClips: clips, scale: 30, visiblePxRange: { start: 0, end: 1200 },
    isResizing: true, gestureRef: { current: { kind: 'clip', id: 'trim' } }, draggingTimelineClipId: null };
  assert.deepEqual(loadEditor('visibleTimelineClips', bindings), [clips[0]]);
  bindings.isResizing = false; bindings.draggingTimelineClipId = 'drag';
  assert.deepEqual(loadEditor('visibleTimelineClips', bindings), [clips[1]]);
  bindings.draggingTimelineClipId = null;
  assert.deepEqual(loadEditor('visibleTimelineClips', bindings), []);
});

test('scene visibility includes A1 reorder positions even when V1 is beyond overscan', () => {
  const scenes = [{ id: 'scene-1', video_duration: 5 }];
  const entries = loadEditor('visibleSceneEntries', { useMemo: fn => fn(), scenes, mediaAssets: [], visiblePxRange: { start: 0, end: 1200 },
    VIRTUALIZE_BUFFER_PX: 1600, scale: 30, isLongForm: false, narratedActNumbers: new Set(),
    getSceneDuration: scene => scene.video_duration, getSceneLeftPosition: track => track === 'V1' ? 10000 : 100,
    v1DragInsertIndex: null, a1DragInsertIndex: 0, draggingAsset: null, draggingScene: null });
  assert.deepEqual(entries, [{ scene: scenes[0], idx: 0 }]);
});

test('cached decorative waveform paths preserve the existing appearance across cache eviction', () => {
  const original = (kind, act = 0) => Array.from({ length: 250 }, (_, i) => {
    const h = kind === 'clip' ? 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45
      : 8 + Math.abs(Math.sin((i + act * 7) * 0.3) * Math.cos(i * 1.7)) * 40;
    return 'M' + (i * 4 + 2) + ',' + (50 - h) + ' L' + (i * 4 + 2) + ',' + (50 + h);
  }).join(' ');
  assert.equal(CLIP_WAVEFORM_PATH, original('clip')); assert.equal(NARRATION_WAVEFORM_PATH, original('narration'));
  for (let act = 1; act <= 100; act++) assert.equal(actWaveformPath(act), original('narration', act));
  assert.equal(actWaveformPath(1), original('narration', 1));
});

test('offscreen audio stays mounted in the actual hidden playback tree', async () => {
  const source = await readFile(new URL('../../src/features/timeline-editor/components/TimelineEditor.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.getText(ast) === '<div className="hidden">'
      && node.getText(ast).includes('master-narration')) expression = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression);
  const clips = [{ id: 'far', startTime: 500, duration: 10, trimStart: 2, trackId: 'A2', asset: { type: 'audio', url: '/sound' } }];
  assert.deepEqual(visibleClips(clips, 30, { start: 0, end: 1200 }), []);
  const bindings = { React, masterAudioUrl: null, actNarrations: [], isLongForm: false, scenes: [], timelineClips: clips,
    trackStates: { A2: { muted: false } }, mediaRefs: { current: {} } };
  const code = ts.transpileModule('const tree = ' + expression, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const tree = new Function(...Object.keys(bindings), code + '; return tree;')(...Object.values(bindings));
  const audio = React.Children.toArray(tree.props.children).find(child => child.type === 'audio');
  assert.equal(audio.props.src, '/sound'); assert.equal(audio.props['data-start'], 500); assert.equal(audio.props['data-trim-start'], 2);
});
