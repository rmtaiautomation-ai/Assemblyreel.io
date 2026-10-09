import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
const { ThumbnailCache, loadTimelineThumbnail, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } = await loadSource(new URL('../../src/features/timeline-editor/thumbnail-cache.ts', import.meta.url));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('thumbnail loads deduplicate, reuse cached results, and evict least recently used resources', async () => {
  const loads = []; const disposed = [];
  const cache = new ThumbnailCache(async source => {
    loads.push(source);
    return { url: 'thumb:' + source, bytes: 30, dispose: () => disposed.push(source) };
  }, 2, 100);
  const seen = [];
  const a = cache.subscribe('a', value => seen.push(value?.url));
  const a2 = cache.subscribe('a', () => {});
  const b = cache.subscribe('b', () => {});
  await flush();
  assert.deepEqual(loads, ['a', 'b']); assert.equal(seen.at(-1), 'thumb:a');
  a(); a2(); b();
  const reused = cache.subscribe('a', value => seen.push(value?.url));
  assert.equal(seen.at(-1), 'thumb:a'); assert.equal(loads.length, 2);
  const c = cache.subscribe('c', () => {}); await flush();
  assert.deepEqual(disposed, ['b']); assert.equal(cache.stats.entries, 2);
  reused(); c(); cache.clear();
  assert.equal(cache.stats.bytes, 0); assert.deepEqual(disposed.sort(), ['a', 'b', 'c']);
});

test('byte budget evicts resources and rejects an oversized result without flushing usable thumbnails', async () => {
  const disposed = [];
  const cache = new ThumbnailCache(async source => ({ url: source, bytes: source === 'huge' ? 100 : 30, dispose: () => disposed.push(source) }), 10, 60);
  for (const source of ['a', 'b', 'c', 'huge']) { cache.subscribe(source, () => {}); await flush(); }
  assert.equal(cache.stats.bytes, 60); assert.deepEqual(disposed, ['a', 'huge']);
  cache.clear();
});

test('delayed and cancelled loads cannot publish stale thumbnails or exceed concurrency', async () => {
  const pending = []; const disposed = []; const seen = [];
  const cache = new ThumbnailCache((source, signal) => new Promise(resolve => pending.push({ source, signal, resolve })), 3, 100, 2);
  const release = cache.subscribe('old', value => seen.push(value?.url));
  cache.subscribe('second', () => {});
  cache.subscribe('queued', () => {});
  await flush();
  assert.equal(pending.length, 2); assert.equal(cache.stats.running, 2);
  release(); assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ url: 'stale', bytes: 10, dispose: () => disposed.push('old') });
  await flush();
  assert.deepEqual(disposed, ['old']); assert.ok(!seen.includes('stale'));
  assert.equal(pending.length, 3); assert.equal(cache.stats.running, 2);
  cache.clear();
  for (const item of pending.slice(1)) item.resolve({ url: item.source, bytes: 10, dispose: () => disposed.push(item.source) });
  await flush(); assert.deepEqual(cache.stats, { entries: 0, bytes: 0, running: 0 });
});

test('missing images settle as placeholders and do not repeatedly retry on remount', async () => {
  let loads = 0;
  const cache = new ThumbnailCache(async () => { loads++; throw new Error('CORS or missing'); });
  const seen = [];
  const release = cache.subscribe('missing', value => seen.push(value)); await flush(); release();
  cache.subscribe('missing', value => seen.push(value)); await flush();
  assert.equal(loads, 1); assert.deepEqual(seen, [null, null]); cache.clear();
});

for (const count of [250, 500]) test(`${count} delayed thumbnails keep pending entries and retained resources bounded across repeated use`, async () => {
  let created = 0; let disposed = 0; let peakRunning = 0;
  const cache = new ThumbnailCache(async source => {
    peakRunning = Math.max(peakRunning, cache.stats.running);
    await flush(); created++;
    return { url: source, bytes: 60_000, dispose: () => disposed++ };
  });
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < count; i++) {
      const release = cache.subscribe('image-' + i, () => {});
      if (i % 8 === 0) await flush();
      release();
      assert.ok(cache.stats.entries <= 128); assert.ok(cache.stats.bytes <= 8 * 1024 * 1024);
    }
  }
  cache.clear();
  while (cache.stats.running) await flush();
  assert.equal(peakRunning, 2); assert.equal(created, disposed); assert.equal(cache.stats.entries, 0);
});

test('browser loader creates a static 160x90 crop and releases the decoded source and cached URL', async t => {
  const original = { fetch: globalThis.fetch, bitmap: globalThis.createImageBitmap, document: globalThis.document };
  let closed = 0; let revoked = 0; let draw;
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => { draw = args; } }),
    toBlob: callback => callback(new Blob(['small'], { type: 'image/webp' })) };
  t.after(() => { globalThis.fetch = original.fetch; globalThis.createImageBitmap = original.bitmap; globalThis.document = original.document; });
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['source']) });
  globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close: () => closed++ });
  globalThis.document = { createElement: () => canvas };
  t.mock.method(URL, 'createObjectURL', () => 'blob:thumbnail');
  t.mock.method(URL, 'revokeObjectURL', () => revoked++);
  const result = await loadTimelineThumbnail('/image', new AbortController().signal);
  assert.equal(canvas.width, THUMBNAIL_WIDTH); assert.equal(canvas.height, THUMBNAIL_HEIGHT);
  assert.deepEqual(draw.slice(1), [0, -15, 160, 120]); assert.equal(closed, 1);
  assert.equal(result.url, 'blob:thumbnail'); assert.equal(result.bytes, 5 + 160 * 90 * 4);
  result.dispose(); assert.equal(revoked, 1);
});
