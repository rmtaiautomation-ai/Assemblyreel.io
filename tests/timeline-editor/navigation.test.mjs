import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEditor } from './load-editor.mjs';

test('selection decoration cannot enlarge any timeline hit rectangle', () => {
  const transform = loadEditor('blockTransform', { SELECTED_BLOCK_SCALE: 1.07 });
  for (const x of [0, 30, 600]) assert.equal(transform(x, true), transform(x, false));
});

test('late scene audio success belongs to its origin after navigation or deselection', async () => {
  for (const selected of [{ id: 'eight', audio_url: 'old-eight' }, null]) {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const state = { selected: { id: 'seven' }, scenes: [{ id: 'seven' }, { id: 'eight', audio_url: 'old-eight' }] };
    const generate = loadEditor('handleRegenerateSingleAudio', {
      selectedVoiceId: '', setGeneratingSceneId() {}, generateSceneAudio: () => pending,
      setScenes: update => { state.scenes = update(state.scenes); },
      setSelectedScene: update => { state.selected = update(state.selected); },
    });
    const task = generate('seven', 'voice text');
    state.selected = selected;
    resolve({ success: true, audioUrl: 'seven-audio' });
    await task;
    assert.deepEqual(state.selected, selected);
    assert.equal(state.scenes[0].audio_url, 'seven-audio');
    assert.equal(state.scenes[1].audio_url, 'old-eight');
  }
});

function selectionHarness() {
  const state = { scene: null, clip: 'audio', overlay: 'overlay', act: 2, asset: 'asset', keys: [], track: null };
  const setter = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const focusSelection = loadEditor('focusSelection', {
    useCallback: fn => fn, setSelectedSceneId: setter('scene'), setSelectedTimelineClipId: setter('clip'),
    setSelectedOverlayClipId: setter('overlay'), setSelectedActNumber: setter('act'),
    setSelectedAsset: setter('asset'), setSelectedSceneTrack: setter('track'), setSelectedSceneKeys: setter('keys'),
  });
  const select = loadEditor('handleSelectSceneBlock', {
    focusSelection, setSelectedAsset: setter('asset'), setSelectedTimelineClip: setter('clip'),
    setSelectedSceneKeys: setter('keys'), setSelectedScene: scene => { state.scene = scene.id; },
    setSelectedSceneTrack: setter('track'), setSelectedActNumber: setter('act'), setActiveTab() {},
    setIsPlaying() {}, setCursorPosition() {}, getUnshiftedLeftPosition: (_track, index) => index * 100,
  });
  return { state, select, focusSelection };
}
test('100 navigation cycles clear competing inspector focus and retain modifier selection semantics', () => {
  const { state, select, focusSelection } = selectionHarness();
  for (let cycle = 0; cycle < 100; cycle++) for (const index of [5, 8, 6, 7, 8, 9]) {
    select({ stopPropagation() {} }, { id: String(index) }, 'V1', index);
    assert.equal(state.scene, String(index));
    assert.deepEqual(state.keys, [index + '_V1']);
    for (const key of ['overlay', 'act', 'asset', 'clip']) assert.equal(state[key], null);
  }
  select({ stopPropagation() {}, ctrlKey: true }, { id: '8' }, 'V1', 8);
  assert.deepEqual(state.keys, ['9_V1', '8_V1']);
  select({ stopPropagation() {}, shiftKey: true }, { id: '8' }, 'V1', 8);
  assert.deepEqual(state.keys, ['9_V1']);
  for (const kind of ['overlay', 'act', 'asset', null]) {
    focusSelection(kind);
    assert.equal(state.scene, null);
    assert.deepEqual(state.keys, []);
    assert.equal(state.track, null);
  }
});

test('A1 audio clips are deleted as clips, scene narration stays separate, and locks are respected', () => {
  for (const locked of [false, true]) {
    const scene = { id: 'scene_with_underscores', audio_url: 'voice' };
    const calls = []; let rows = [scene];
    const remove = loadEditor('handleDeleteSelectedScenes', {
      trackStates: { V1: { locked }, A1: { locked }, A2: { locked } },
      scenes: rows, timelineClips: [{ id: 'clip_with_underscores', trackId: 'A1' }],
      selectedSceneKeys: ['scene_with_underscores_A1', 'clip_with_underscores_A1'],
      removeScenesAndPersist: () => assert.fail('audio selection must not delete a scene'),
      setScenes: update => { rows = update(rows); },
      persistSceneFields: (...args) => calls.push(['narration', ...args]),
      deleteClipAndPersist: id => calls.push(['clip', id]), focusSelection() {},
    });
    remove();
    assert.deepEqual(calls, locked ? [] : [['narration', scene.id, { audio_url: null }], ['clip', 'clip_with_underscores']]);
    assert.equal(rows[0].audio_url, locked ? 'voice' : undefined);
  }
});

test('declining a scene deletion cannot clear narration or delete accompanying audio clips', () => {
  const remove = loadEditor('handleDeleteSelectedScenes', {
    trackStates: { V1: { locked: false }, A1: { locked: false } },
    scenes: [{ id: 'seven' }], timelineClips: [{ id: 'clip', trackId: 'A1' }],
    selectedSceneKeys: ['seven_V1', 'seven_A1', 'clip_A1'], removeScenesAndPersist: () => false,
    setScenes: () => assert.fail('cancel must not modify scenes'), persistSceneFields: () => assert.fail('cancel must not save'),
    deleteClipAndPersist: () => assert.fail('cancel must not delete clips'), focusSelection: () => assert.fail('cancel must retain selection'),
  });
  remove();
});

test('an older stock search cannot replace newer results or stop its loading indicator', async () => {
  const requests = [], results = [], busy = [];
  const search = loadEditor('handleStockSearch', {
    stockSearchRequestRef: { current: 0 }, globalStockProvider: 'pexels', globalStockType: 'image',
    setIsSearchingStock: value => busy.push(value), setStockSearchResults: value => results.push(value),
    setPersistenceWarning() {}, fetch: () => new Promise(resolve => requests.push(resolve)),
  });
  const first = search('seven', 'query seven');
  const last = search('eight', 'query eight');
  requests[1]({ json: async () => ({ success: true, results: ['eight result'] }) });
  await last;
  requests[0]({ json: async () => ({ success: true, results: ['seven result'] }) });
  await first;
  assert.deepEqual(results, [{ sceneId: 'eight', results: ['eight result'] }]);
  assert.deepEqual(busy, [true, true, false]);
});

test('scene selection stores identity and reads current rows rather than async snapshot copies', () => {
  const rows = { current: [{ id: 'seven', audio_url: 'old' }, { id: 'eight' }] };
  let id = 'seven';
  const select = loadEditor('setSelectedScene', {
    useCallback: callback => callback, scenesRef: rows, setSelectedSceneId: update => { id = update(id); },
  });
  rows.current[0] = { ...rows.current[0], audio_url: 'new' };
  let received;
  select(previous => { received = previous; return previous; });
  assert.equal(received.audio_url, 'new');
  select(rows.current[1]);
  select(previous => previous?.id === 'seven' ? { ...previous, audio_url: 'late-seven' } : previous);
  assert.equal(id, 'eight');
  assert.equal(rows.current[1].audio_url, undefined);
  rows.current = [];
  select(previous => ({ ...previous, audio_url: 'late' }));
  assert.equal(id, null, 'missing rows cannot become a partial selection');
});
