import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
import { loadEditor } from './load-editor.mjs';
const { createTimelineCursor, startTimelinePlayback } = await loadSource(new URL('../../src/features/timeline-editor/playback.ts', import.meta.url));

function scheduler() {
  let nextId = 0;
  const pending = new Map();
  return {
    now: () => 0,
    requestFrame(callback) { pending.set(++nextId, callback); return nextId; },
    cancelFrame(id) { pending.delete(id); },
    tick(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    get size() { return pending.size; },
  };
}
function media(overrides = {}) {
  return { paused: false, seeking: false, readyState: 1, currentTime: 0, duration: 100,
    dataset: { start: '0', duration: '100', trimStart: '0', track: 'A1' },
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, ...overrides };
}
function syncFixture(extra = {}) {
  const master = media();
  const player = { frame: 0, isMuted: () => false, unmute() {}, mute() {}, setVolume() {},
    play() {}, pause() {}, getCurrentFrame() { return this.frame; }, seekTo(frame) { this.frame = frame; } };
  const stopped = [];
  const bindings = { useCallback: fn => fn, isPlaying: true, scale: 30, exportQuality: 'Standard',
    trackStates: { V1: { muted: false, volume: 1 }, A1: { muted: false, volume: 1 }, A2: { muted: false, volume: 1 } },
    isolatedSceneId: null, previewFailed: false, handlePreviewFailure: () => stopped.push('preview'),
    setIsPlaying: value => stopped.push(value), setPersistenceWarning: value => stopped.push(value),
    mediaRefs: { current: { master } }, remotionPlayerRef: { current: player }, getMasterAudioKey: () => 'master', ...extra };
  return { master, player, stopped, bindings, sync: loadEditor('syncPlayback', bindings) };
}

test('600 playback frames move both playheads and synchronize media without editor state updates', () => {
  const cursor = createTimelineCursor();
  const frames = scheduler();
  cursor.lineRef.current = { style: {} }; cursor.handleRef.current = { style: {} };
  let syncCalls = 0; let stops = 0;
  cursor.syncRef.current = (_position, explicit) => { syncCalls++; assert.equal(explicit, false); };
  const cancel = startTimelinePlayback({ ...frames, positionRef: cursor.positionRef, scale: 30, endSeconds: 100,
    readMaster: () => null, advance: cursor.advance, stop: () => stops++ });
  for (let i = 1; i <= 600; i++) frames.tick(i * 1000 / 60);
  assert.ok(Math.abs(cursor.positionRef.current - 300) < 1e-9);
  assert.equal(syncCalls, 600); assert.equal(stops, 0);
  assert.equal(cursor.lineRef.current.style.transform, cursor.handleRef.current.style.transform);
  cancel(); assert.equal(frames.size, 0);
});

test('native narration wins over RAF deltas, including act start and trimmed source time', () => {
  const cursor = createTimelineCursor(); const frames = scheduler();
  const master = media({ currentTime: 7, dataset: { start: '20', trimStart: '2' } });
  cursor.seek(20 * 30);
  const readTimes = [];
  const cancel = startTimelinePlayback({ ...frames, positionRef: cursor.positionRef, scale: 30, endSeconds: 100,
    readMaster: time => { readTimes.push(time); return master; }, advance: cursor.advance, stop() {} });
  frames.tick(16); assert.equal(cursor.positionRef.current, 25 * 30); assert.deepEqual(readTimes, [20]);
  master.seeking = true; frames.tick(32); assert.ok(Math.abs(cursor.positionRef.current - 25.016 * 30) < 1e-9);
  master.seeking = false; master.paused = true; frames.tick(48); assert.ok(Math.abs(cursor.positionRef.current - 25.032 * 30) < 1e-9);
  cancel();
});

test('timeline end clamps exactly and cancellation prevents another frame', () => {
  const cursor = createTimelineCursor(); const frames = scheduler(); let stops = 0;
  startTimelinePlayback({ ...frames, positionRef: cursor.positionRef, scale: 30, endSeconds: 1,
    readMaster: () => null, advance: cursor.advance, stop: () => stops++ });
  frames.tick(2000); assert.equal(cursor.positionRef.current, 30); assert.equal(stops, 1); assert.equal(frames.size, 0);
  frames.tick(3000); assert.equal(stops, 1);
});

test('seeks read the latest sync callback and work without a mounted playhead', () => {
  const cursor = createTimelineCursor(); const calls = [];
  cursor.seek(90);
  cursor.syncRef.current = (position, explicit) => calls.push(['first', position, explicit]); cursor.seek(120);
  cursor.syncRef.current = (position, explicit) => calls.push(['latest', position, explicit]); cursor.advance(150);
  cursor.syncRef.current = null; cursor.seek(180);
  assert.deepEqual(calls, [['first', 120, true], ['latest', 150, false]]);
  assert.equal(cursor.positionRef.current, 180);
  const line = { style: {} }; const handle = { style: {} };
  cursor.bindLine(line); cursor.bindHandle(handle);
  assert.equal(line.style.transform, 'translateX(calc(180px - 50%))');
  assert.equal(handle.style.transform, line.style.transform);
  cursor.bindLine(null); cursor.seek(210);
  cursor.bindLine(line); assert.equal(line.style.transform, handle.style.transform);
});

test('explicit seek corrects small master jumps while normal playback keeps existing drift tolerances', () => {
  const { master, sync, player } = syncFixture(); master.currentTime = 10;
  sync(10.5 * 30); assert.equal(master.currentTime, 10); // Free-running narration clock.
  sync(10.5 * 30, true); assert.equal(master.currentTime, 10.5); assert.equal(player.frame, 315);
  master.currentTime = 0; sync(10 * 30); assert.equal(master.currentTime, 10); // New/stale master catch-up.
});

test('paused seeks, metadata and seeking guards retain the media safety rules', () => {
  const { master, sync, player } = syncFixture({ isPlaying: false });
  master.readyState = 0; sync(90, true); assert.equal(master.currentTime, 0);
  master.readyState = 1; master.seeking = true; sync(90, true); assert.equal(master.currentTime, 0);
  master.seeking = false; sync(90, true); assert.equal(master.currentTime, 3); assert.equal(master.paused, true); assert.equal(player.frame, 90);
  master.duration = 2; sync(90, true); assert.equal(master.currentTime, 3); // No unreachable seek past source duration.
});

test('overlapping media start and stop at boundaries and honor track mute and volume', () => {
  const a = media({ paused: true, dataset: { start: '0', duration: '5', track: 'A1' } });
  const b = media({ paused: true, dataset: { start: '5', duration: '5', track: 'A2' } });
  const fixture = syncFixture({ mediaRefs: { current: { a, b } }, getMasterAudioKey: () => null,
    trackStates: { V1: { muted: false, volume: 1 }, A1: { muted: true, volume: 0.4 }, A2: { muted: false, volume: 0.8 } } });
  fixture.sync(4 * 30); assert.equal(a.paused, false); assert.equal(b.paused, true); assert.equal(a.muted, true); assert.equal(a.volume, 0.4);
  fixture.sync(5 * 30); assert.equal(a.paused, true); assert.equal(b.paused, false); assert.equal(b.volume, 0.8);
  fixture.sync(10 * 30); assert.equal(b.paused, true);
});

test('isolated preview and preview failures pause native narration', () => {
  for (const extra of [{ isolatedSceneId: 'scene-2' }, { previewFailed: true }]) {
    const fixture = syncFixture(extra); fixture.sync(90); assert.equal(fixture.master.paused, true);
    assert.equal(fixture.player.frame, 0);
    if (extra.previewFailed) assert.deepEqual(fixture.stopped, [false]);
  }
});

test('act clock ownership switches at the exact narration boundary', () => {
  const getMaster = loadEditor('getMasterAudioKey', { useCallback: fn => fn, isLongForm: true, masterAudioUrl: null,
    actNarrations: [{ actNumber: 1, audioUrl: 'one', startSeconds: 0, durationSeconds: 5 }, { actNumber: 2, audioUrl: 'two', startSeconds: 5, durationSeconds: 5 }] });
  assert.equal(getMaster(4.999), 'act-narration-1'); assert.equal(getMaster(5), 'act-narration-2'); assert.equal(getMaster(10), null);
});

test('zoom preserves seconds and cancels gestures before changing geometry', () => {
  const calls = []; const position = { current: 450 };
  const zoom = loadEditor('setScale', { scale: 30, cursorPositionRef: position,
    activePointerGestureRef: { current: () => calls.push('pointer') }, sceneResizeCancelRef: { current: () => calls.push('trim') },
    setScaleState: value => calls.push(value) });
  zoom(100); assert.equal(position.current / 100, 15); assert.deepEqual(calls, ['pointer', 'trim', 100]);
});
