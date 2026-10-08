import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEditor } from './load-editor.mjs';
function harness(name) {
  const clip = { id: 'overlay', kind: 'text', startTime: 2, duration: 4, xPercent: 50, yPercent: 50, fontSize: 64 };
  const state = { clips: [clip], writes: [], gesture: null };
  const start = loadEditor(name, {
    scale: 30, playerStageRect: { left: 0, top: 0, width: 100, height: 100 },
    playerStageRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    SNAP_TARGETS: [15, 50, 85], POSITION_SNAP_TOLERANCE: 3,
    MIN_OVERLAY_FONT_SIZE: 16, MAX_OVERLAY_FONT_SIZE: 200, isCardKind: () => false,
    setOverlayClips: update => { state.clips = update(state.clips); },
    persistOverlayClipFields: (...args) => state.writes.push(args),
    nearestV1BoundaryTime: () => null, setOverlaySnapGuideTime() {},
    beginPointerGesture: (_press, onMove, onFinish) => { state.gesture = { onMove, onFinish }; },
  });
  return { clip, state, start, event: { clientX: 100, stopPropagation() {}, preventDefault() {} } };
}
for (const name of ['handleOverlayPositionDragStart', 'handleOverlayResizeDragStart', 'handleOverlayDragStart', 'handleOverlayResizeStart']) {
  test(name + ': bare click saves nothing; cancellation rolls back and release saves once', () => {
    for (const scenario of ['click', 'cancel', 'release']) {
      const { clip, state, start, event } = harness(name);
      start(event, clip, 'right');
      if (scenario !== 'click') state.gesture.onMove({ clientX: 130, clientY: 80 });
      assert.deepEqual(state.writes, [], 'pointer movement must not persist unfinished edits');
      state.gesture.onFinish({ moved: scenario !== 'click', cancelled: scenario === 'cancel' });
      assert.equal(state.writes.length, scenario === 'release' ? 1 : 0);
      if (scenario !== 'release') assert.deepEqual(state.clips[0], clip);
    }
  });
}
