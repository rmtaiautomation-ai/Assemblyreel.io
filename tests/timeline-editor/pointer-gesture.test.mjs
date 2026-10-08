import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
const { startPointerGesture } = await loadSource(new URL('../../src/features/timeline-editor/pointer-gesture.ts', import.meta.url));
class Surface extends EventTarget {
  listeners = new Set();
  captured = false;
  addEventListener(kind, fn, ...rest) { this.listeners.add(fn); super.addEventListener(kind, fn, ...rest); }
  removeEventListener(kind, fn, ...rest) { this.listeners.delete(fn); super.removeEventListener(kind, fn, ...rest); }
  setPointerCapture() { this.captured = true; }
  hasPointerCapture() { return this.captured; }
  releasePointerCapture() { this.captured = false; }
}
function pointer(kind, x = 100, id = 1) {
  return Object.assign(new Event(kind), { pointerId: id, clientX: x, clientY: 0 });
}
function harness() {
  globalThis.window = new Surface();
  const target = new Surface();
  const moves = [], finished = [], errors = [];
  const cancel = startPointerGesture({ event: { pointerId: 1, clientX: 100, clientY: 0 }, target,
    onMove: event => moves.push(event.clientX), onFinish: result => finished.push(result), onError: error => errors.push(error) });
  return { target, moves, finished, errors, cancel, surface: window };
}
test('bare clicks, tiny movement and foreign pointers do not become an edit', () => {
  const { target, moves, finished, surface } = harness();
  surface.dispatchEvent(pointer('pointermove', 200, 2));
  surface.dispatchEvent(pointer('pointermove', 102));
  surface.dispatchEvent(pointer('pointerup', 102));
  assert.deepEqual(moves, []);
  assert.deepEqual(finished, [{ moved: false, cancelled: false }]);
  assert.equal(target.captured, false);
  assert.equal(surface.listeners.size, 0);
});
test('all cancellation paths finish once and remove listeners and capture', () => {
  for (const kind of ['pointercancel', 'lostpointercapture', 'blur', 'scroll', 'resize', 'escape', 'unmount']) {
    const { target, finished, surface, cancel } = harness();
    surface.dispatchEvent(pointer('pointermove', 110));
    if (kind === 'lostpointercapture') target.dispatchEvent(pointer(kind));
    else if (kind === 'unmount') cancel();
    else if (kind === 'escape') surface.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
    else surface.dispatchEvent(pointer(kind));
    cancel();
    assert.deepEqual(finished, [{ moved: true, cancelled: true }]);
    assert.equal(target.listeners.size, 0);
    assert.equal(surface.listeners.size, 0);
    assert.equal(target.captured, false);
  }
});
test('release applies the final coordinate and suppresses the drag-generated click briefly', async () => {
  const { moves, finished, surface } = harness();
  surface.dispatchEvent(pointer('pointerup', 120));
  assert.deepEqual(moves, [120]);
  assert.deepEqual(finished, [{ moved: true, cancelled: false }]);
  const click = new Event('click', { cancelable: true });
  surface.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(surface.listeners.size, 0);
});
