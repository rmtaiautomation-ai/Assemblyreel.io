import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadEditor } from './load-editor.mjs';
import { loadSource } from '../presentations/load-source.mjs';
import { buildExport, exportFixture, digest } from './export-fixture.mjs';
const { layoutScenes } = await loadSource(new URL('../../src/remotion/timeline.ts', import.meta.url));
const { prepareRenderPayload } = await loadSource(new URL('../../src/server/rendering/render-payload.ts', import.meta.url));
const { visibleClips } = await loadSource(new URL('../../src/features/timeline-editor/viewport.ts', import.meta.url));
const baseline = JSON.parse(await readFile(new URL('./export-baseline.json', import.meta.url), 'utf8'));

for (const count of [25, 100, 250, 500]) test(`${count} scenes retain pre-change timing and serialized export across frame rates and narration modes`, () => {
  for (const expected of baseline.cases.filter(item => item.count === count)) {
    const fixture = exportFixture(count, expected.fps, expected.longForm);
    const original = JSON.stringify(fixture);
    const before = buildExport(loadEditor, fixture, layoutScenes, prepareRenderPayload);
    assert.equal(digest(before.payload), expected.payloadSha256);
    assert.equal(digest(before.layout), expected.layoutSha256);
    assert.equal(before.payload.durationInFrames, expected.durationInFrames);
    let selected;
    const select = loadEditor('handleSelectSceneBlock', {
      focusSelection() {}, setSelectedAsset() {}, setSelectedTimelineClip() {}, setSelectedSceneKeys() {},
      setSelectedScene: scene => { selected = scene.id; }, setSelectedSceneTrack() {}, setSelectedActNumber() {}, setActiveTab() {},
      setIsPlaying() {}, setCursorPosition() {}, getUnshiftedLeftPosition: (_track, index) => before.layout.segments[index].from / expected.fps * 30,
      persistSceneFields: () => assert.fail('selection must not save timing'),
    });
    for (const scale of [10, 30, 100]) for (let cycle = 0; cycle < 100; cycle++) {
      for (const number of [5, 8, 6, 7, 8, 9, 8, 7, 6, 5]) {
        select({ stopPropagation() {} }, fixture.scenes[number - 1], 'V1', number - 1);
        assert.equal(selected, fixture.scenes[number - 1].id);
      }
      const start = cycle % 2 ? count * scale : 0;
      visibleClips(fixture.timelineClips, scale, { start, end: start + 1200 });
      visibleClips(fixture.overlayClips, scale, { start, end: start + 1200 });
    }
    const after = buildExport(loadEditor, fixture, layoutScenes, prepareRenderPayload);
    assert.deepEqual(after.payload, before.payload);
    assert.deepEqual(after.layout, before.layout);
    assert.equal(JSON.stringify(fixture), original);
    const preview = loadEditor('remotionPreviewProps', { useMemo: fn => fn(), remotionInputProps: after.input, isolatedScene: null, isolatedDurationInFrames: 1 });
    assert.equal(preview.audioUrl, undefined); assert.equal(preview.audioClips, undefined);
    assert.equal(after.payload.audioClips.length, count + (expected.longForm ? 2 : 0));
    assert.equal(after.payload.overlayClips.length, count);
    assert.ok(after.payload.audioClips.every(clip => !clip.src.startsWith('blob:')));
  }
});

function renderHarness(overrides = {}) {
  const state = { busy: false, polling: false, requests: [], warnings: [], messages: [] };
  const render = loadEditor('handleRenderVideo', {
    saveQueue: { flushAll: async () => true }, presentationIssues: [], unexportableClipNames: [],
    setIsRendering: value => { state.busy = value; }, setRenderStatusMessage: value => state.messages.push(value),
    setPersistenceWarning: value => state.warnings.push(value), setRenderOutputPath() {}, setRenderProgress() {}, setRenderStage() {},
    startRenderProgressPolling: () => { state.polling = true; }, stopRenderProgressPolling: () => { state.polling = false; },
    initialProject: { id: 'fixture-project' }, remotionInputProps: { scenes: [{ id: 'seven' }] },
    markStatus: async () => true,
    fetch: async (_url, options) => { state.requests.push(JSON.parse(options.body)); return { json: async () => ({ success: true, mode: 'local' }) }; },
    ...overrides,
  });
  return { state, render };
}

test('export waits for pending saves and blocked saves or presentation errors issue no request', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const good = renderHarness({ saveQueue: { flushAll: () => pending } });
  const task = good.render(); assert.deepEqual(good.state.requests, []);
  resolve(true); await task;
  assert.deepEqual(good.state.requests, [{ projectId: 'fixture-project', scenes: [{ id: 'seven' }] }]);
  for (const overrides of [{ saveQueue: { flushAll: async () => false } }, { presentationIssues: ['Unsupported version'] }]) {
    const failed = renderHarness(overrides); await failed.render();
    assert.deepEqual(failed.state.requests, []); assert.equal(failed.state.busy, false); assert.equal(failed.state.polling, false);
    assert.equal(failed.state.warnings.length, 1);
  }
});

test('failed render submission releases busy state even when the project-status request also rejects', async () => {
  for (const failure of ['status', 'network', 'response']) {
    const { state, render } = renderHarness({
      markStatus: async status => { if (failure === 'status' || status === 'failed') throw new Error('status offline'); },
      fetch: async () => {
        if (failure === 'network') throw new Error('network offline');
        return { json: async () => ({ success: false, error: 'render rejected' }) };
      },
    });
    await render(); assert.equal(state.busy, false); assert.equal(state.polling, false);
    assert.ok(state.warnings.some(message => message.includes('status offline')));
  }
});
