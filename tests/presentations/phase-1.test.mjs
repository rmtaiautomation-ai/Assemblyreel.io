import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { assets, envelope, projectId, timing, schema } from './phase-1-fixtures.mjs';

const { resolvePresentation, presentationFrameRange, mapPresentationAssets } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { layoutScenes } = await loadSource(new URL('../../src/remotion/timeline.ts', import.meta.url));
const { prepareRenderPayload } = await loadSource(new URL('../../src/server/rendering/render-payload.ts', import.meta.url));
const { presentationCompositionId, DOCUMENTARY_COMPOSITION_ID } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));

test('cloud presentations require a versioned composition instead of silently using an old bundle', () => {
  assert.equal(presentationCompositionId([{ id: 'legacy' }]), 'MainVideo');
  assert.equal(presentationCompositionId([{ presentation: { envelope } }]), DOCUMENTARY_COMPOSITION_ID);
  assert.equal(presentationCompositionId([{ presentation: { envelope: schema.cleanEnvelope(envelope) } }]), DOCUMENTARY_COMPOSITION_ID);
});

test('the versioned family rejects unknown versions, executable fields, unsupported themes, and bad crops', () => {
  assert.equal(schema.presentationSchema.safeParse(envelope).success, true);
  for (const patch of [{ templateVersion: 2 }, { schemaVersion: 2 }, { css: 'unsafe' }, { theme: { ...envelope.theme, version: 3 } }]) {
    assert.equal(schema.presentationSchema.safeParse({ ...envelope, ...patch }).success, false);
  }
  assert.equal(schema.presentationSchema.safeParse({ ...envelope, content: { ...envelope.content, images: [{ ...envelope.content.images[0], focalPoint: { x: 2, y: 0.5 } }, envelope.content.images[1]] } }).success, false);
});

test('attached timing follows nominal scene boundaries after reorder without modifying saved offsets', () => {
  const a = { id: 'a', durationInSeconds: 10 }, b = { id: 'b', durationInSeconds: 6 };
  const first = layoutScenes([a, b], 30).segments[1];
  const second = layoutScenes([{ ...a, durationInSeconds: 20 }, b], 30).segments[1];
  const range = presentationFrameRange(timing, 6, 30);
  assert.equal(first.from + range.startFrame, 315);
  assert.equal(second.from + range.startFrame, 615);
  assert.equal(range.durationInFrames, 165);
  assert.equal(timing.start_time, 0.5);
});

test('scene trim preserves requested timing, flags unreadable holds, and rejects an out-of-scene start', () => {
  assert.equal(presentationFrameRange(timing, 2, 30).durationInFrames, 45);
  assert.ok(resolvePresentation(envelope, timing, 2, 30, assets, projectId).issues.some(issue => issue.includes('needs about')));
  assert.ok(presentationFrameRange({ ...timing, start_time: 6 }, 6, 30).issues.length);
  assert.ok(presentationFrameRange({ ...timing, start_time: NaN }, 6, 30).issues.length);
  assert.equal(presentationFrameRange({ ...timing, duration_mode: 'fixed', duration: 4 }, 6, 60).durationInFrames, 240);
});

test('missing, unfinished, cross-project, non-image, and browser-only assets cannot compile', () => {
  for (const patch of [{ projectId: 'other' }, { status: 'uploading' }, { mediaType: 'video' }, { url: 'blob:local' }, { url: 'javascript:alert(1)' }, { url: '//other-host/image' }]) {
    assert.equal(resolvePresentation(envelope, timing, 6, 30, [{ ...assets[0], ...patch }, assets[1]], projectId).presentation, undefined);
  }
  assert.equal(resolvePresentation(envelope, timing, 6, 30, [assets[0]], projectId).presentation, undefined);
  assert.ok(resolvePresentation(envelope, timing, 6, 30, assets, projectId).presentation);
});

test('nested image preparation matches scene media and cloud mapping does not mutate saved configuration', async () => {
  const presentation = resolvePresentation(envelope, timing, 6, 30, assets, projectId).presentation;
  const prepared = prepareRenderPayload({ projectId, scenes: [{ id: 'scene', mediaUrl: '/media/base.svg', presentation }] }, 'https://app.example');
  assert.equal(prepared.success, true);
  assert.equal(prepared.payload.scenes[0].presentation.assets[0].url, 'https://app.example/media/fixture-1.svg');
  const mapped = await mapPresentationAssets(presentation, async url => `https://storage.example${url}`);
  assert.equal(mapped.assets[1].url, 'https://storage.example/media/fixture-2.svg');
  assert.equal(presentation.assets[0].url, '/media/fixture-1.svg');
  assert.equal(envelope.content.images[0].asset.mediaId, assets[0].id);
  const bad = { ...presentation, assets: [{ itemId: 'bad', url: 'blob:local' }] };
  assert.equal(prepareRenderPayload({ projectId, scenes: [{ id: 'scene', presentation: bad }] }, 'https://app.example').success, false);
});

test('clean is a durable explicit choice and draws no new assets', () => {
  const clean = schema.cleanEnvelope(envelope);
  const result = resolvePresentation(clean, timing, 6, 30, [], projectId);
  assert.equal(result.presentation.envelope.templateId, 'clean');
  assert.deepEqual(result.presentation.assets, []);
});
