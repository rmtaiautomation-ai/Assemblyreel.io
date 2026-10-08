import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
const { OrdinarySaveQueue } = await loadSource(new URL('../../src/features/timeline-editor/save-queue.ts', import.meta.url));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }

test('failed debounced fields remain available for intentional retry with newer edits', async () => {
  const queue = new OrdinarySaveQueue();
  const writes = [];
  let fail = true;
  const write = async fields => { writes.push(fields); return fail ? { success: false, error: 'offline' } : { success: true }; };
  queue.enqueue('scene:seven', { text: 'old', duration: 4 }, write, 800);
  assert.equal(await queue.flushAll(), false);
  assert.equal(queue.status().state, 'failed');
  queue.enqueue('scene:seven', { text: 'new' }, write, 800);
  assert.equal(await queue.flushAll(), false);
  assert.equal(writes.length, 1);
  fail = false;
  assert.equal(await queue.flushAll(true), true);
  assert.deepEqual(writes[1], { text: 'new', duration: 4 });
  assert.equal(queue.status().state, 'saved');
});
test('writes are serial per scene and flush waits for edits arriving during an in-flight request', async () => {
  const queue = new OrdinarySaveQueue();
  const first = deferred();
  const writes = [];
  const write = async fields => { writes.push(fields); if (writes.length === 1) await first.promise; return { success: true }; };
  queue.enqueue('scene:seven', { text: 'first' }, write);
  await Promise.resolve();
  queue.enqueue('scene:seven', { text: 'last' }, write, 800);
  queue.enqueue('scene:eight', { volume: 0.4 }, async fields => { writes.push({ eight: fields }); return { success: true }; }, 800);
  let finished = false;
  const flushed = queue.flushAll().then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false);
  first.resolve();
  assert.equal(await flushed, true);
  assert.deepEqual(writes.filter(fields => fields.text), [{ text: 'first' }, { text: 'last' }]);
  assert.ok(writes.some(fields => fields.eight?.volume === 0.4));
});
test('a rejected request retains its payload and never retries itself', async () => {
  const queue = new OrdinarySaveQueue();
  let calls = 0;
  queue.enqueue('overlay:one', { start_time: 2 }, async () => { calls++; throw new Error('connection lost'); });
  assert.equal(await queue.flushAll(), false);
  assert.equal(await queue.flushAll(), false);
  assert.equal(calls, 1);
  assert.match(queue.status().errors[0], /connection lost/);
});
test('failure with newer queued fields replays the latest values, not an older snapshot', async () => {
  const queue = new OrdinarySaveQueue();
  const request = deferred();
  const writes = [];
  queue.enqueue('clip:one', { start_time: 1, duration: 3 }, async () => request.promise);
  await Promise.resolve();
  queue.enqueue('clip:one', { start_time: 5 }, async fields => { writes.push(fields); return { success: true }; }, 800);
  const flush = queue.flushAll();
  request.resolve({ success: false, error: 'failed first request' });
  assert.equal(await flush, false);
  assert.equal(await queue.flushAll(true), true);
  assert.deepEqual(writes, [{ start_time: 5, duration: 3 }]);
});
test('forgetting a deleted row cancels its pending write', async () => {
  const queue = new OrdinarySaveQueue();
  let calls = 0;
  queue.enqueue('scene:deleted', { text: 'draft' }, async () => { calls++; return { success: true }; }, 800);
  queue.forget('scene:deleted');
  assert.equal(await queue.flushAll(), true);
  assert.equal(calls, 0);
});

test('canonical card pairs preserve an explicitly queued headline across later template edits', async () => {
  const queue = new OrdinarySaveQueue();
  const request = deferred();
  const writes = [];
  queue.enqueue('overlay:card', { text: 'new headline', template_data: { bullets: ['first'] } }, async () => request.promise);
  await Promise.resolve();
  const canonical = { text: 'stale headline', template_data: { bullets: ['second'] } };
  const fields = { template_data: { bullets: ['second'] } };
  queue.enqueue('overlay:card', { ...canonical, ...queue.pendingPayload('overlay:card'), ...fields }, async payload => { writes.push(payload); return { success: true }; });
  request.resolve({ success: true });
  assert.equal(await queue.flushAll(), true);
  assert.deepEqual(writes, [{ text: 'new headline', template_data: { bullets: ['second'] } }]);
});
