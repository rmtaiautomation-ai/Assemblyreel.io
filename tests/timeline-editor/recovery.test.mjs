import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
import { loadEditor } from './load-editor.mjs';
const { validateTimelineInput } = await loadSource(new URL('../../src/features/timeline-editor/validation.ts', import.meta.url));
const { shouldHandleTimelineShortcut } = await loadSource(new URL('../../src/features/timeline-editor/interaction.ts', import.meta.url));
const input = () => ({ project: { id: 'project' }, scenes: [{ id: 'seven', video_duration: 4.125 }], media: [], items: [], overlays: [] });

test('loaded input validation rejects malformed identities and nonfinite timing without mutating rows', () => {
  for (const bad of [undefined, '', 7]) {
    const data = input(); data.scenes[0].id = bad;
    assert.ok(validateTimelineInput(data).length);
  }
  for (const duration of [NaN, Infinity, -1, 0, '5']) {
    const data = input(); data.scenes[0].video_duration = duration;
    assert.ok(validateTimelineInput(data).length);
    assert.ok(Object.is(data.scenes[0].video_duration, duration));
  }
  const duplicate = input(); duplicate.scenes.push({ ...duplicate.scenes[0] });
  assert.ok(validateTimelineInput(duplicate).length);
  const valid = input(); const before = JSON.stringify(valid);
  assert.deepEqual(validateTimelineInput(valid), []);
  assert.equal(JSON.stringify(valid), before);
  valid.scenes[0].video_duration = null;
  assert.deepEqual(validateTimelineInput(valid), [], 'existing missing-duration fallback is preserved');
});

test('shortcut ownership respects editor scope, fields, editable content, dialogs and native buttons', () => {
  class Target {
    constructor(kind = 'timeline') { this.kind = kind; }
    closest(selector) {
      if (selector === '[data-timeline-editor]') return this.kind === 'outside' ? null : this;
      if (selector.includes('input,')) return ['input', 'textarea', 'select', 'editable', 'dialog'].includes(this.kind) ? this : null;
      if (selector.includes('button,')) return this.kind === 'button' ? this : null;
      return null;
    }
  }
  globalThis.Element = Target;
  let dialog = false;
  globalThis.document = { querySelector: () => dialog ? {} : null };
  const event = kind => ({ target: new Target(kind), code: 'Space', defaultPrevented: false });
  for (const kind of ['outside', 'input', 'textarea', 'select', 'editable', 'dialog', 'button']) assert.equal(shouldHandleTimelineShortcut(event(kind)), false);
  assert.equal(shouldHandleTimelineShortcut(event('timeline')), true);
  assert.equal(shouldHandleTimelineShortcut({ ...event('button'), code: 'Escape' }), true);
  dialog = true;
  assert.equal(shouldHandleTimelineShortcut(event('timeline')), false);
});

test('rejected audio request is visible, clears its busy state and cannot change selection', async () => {
  const warnings = [], generating = [];
  const generate = loadEditor('handleRegenerateSingleAudio', {
    selectedVoiceId: '', setGeneratingSceneId: value => generating.push(value),
    generateSceneAudio: async () => { throw new Error('offline'); },
    setPersistenceWarning: value => warnings.push(value),
    setScenes: () => assert.fail('failed request must not modify rows'),
    setSelectedScene: () => assert.fail('failed request must not modify selection'),
  });
  await generate('seven', 'voice text');
  assert.deepEqual(generating, ['seven', null]);
  assert.match(warnings[0], /offline/);
});

test('supported navigation awaits saving, keeps failed drafts in the editor and pauses playback only on success', async () => {
  for (const saved of [true, false]) {
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const pushes = [], warnings = [], play = [];
    const ref = { current: false };
    const navigate = loadEditor('navigateAfterSave', {
      isRendering: false, navigationPendingRef: ref, activePointerGestureRef: { current: null }, gestureRef: { current: null },
      mediaAssets: [], scenes: [], timelineClips: [], overlayClips: [], isPersistedScene: () => true,
      saveQueue: { flushAll: () => pending }, setPersistenceWarning: value => warnings.push(value),
      setIsPlaying: value => play.push(value), router: { push: href => pushes.push(href) },
    });
    const task = navigate('/scene-board');
    assert.equal(ref.current, true);
    assert.deepEqual(pushes, []);
    resolve(saved);
    await task;
    assert.deepEqual(pushes, saved ? ['/scene-board'] : []);
    assert.deepEqual(play, saved ? [false] : []);
    assert.equal(warnings.length, saved ? 0 : 1);
    assert.equal(ref.current, false);
  }
});

test('missing floating-clip timing is rejected before inspector formatting or geometry', () => {
  for (const collection of ['items', 'overlays']) {
    const data = input(); data[collection] = [{ id: 'clip', duration: null, start_time: 0 }];
    assert.ok(validateTimelineInput(data).length);
  }
});
