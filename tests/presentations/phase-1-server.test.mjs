import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { actorId, otherActorId, projectId, sceneId, envelope, timing, assets } from './phase-1-fixtures.mjs';

const { requirePresentationProject } = await loadSource(new URL('../../src/features/presentations/server/access.ts', import.meta.url));
const { prepareProjectPresentations } = await loadSource(new URL('../../src/features/presentations/server/export.ts', import.meta.url));
const ioUrl = `data:text/javascript,${encodeURIComponent('let client; export function useClient(value) { client = value; } export async function createClient() { return client; }')}`;
const io = await import(ioUrl);
const { saveScenePresentation } = await loadSource(new URL('../../src/features/presentations/server/actions.ts', import.meta.url), { '@/lib/supabase/server': ioUrl });
const row = { id: '60000000-0000-4000-8000-000000000001', scene_id: sceneId, project_id: projectId, kind: 'scene-template', time_basis: 'scene', revision: 1, locked: true, origin: 'user', ...timing, template_data: envelope };

function clientFixture(overrides = {}) {
  const queries = [];
  const rpcCalls = [];
  return { queries, rpcCalls, auth: { async getUser() { return { data: { user: overrides.signedOut ? null : { id: actorId } }, error: null }; } },
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: { row, previous: null, replayed: overrides.replayed ?? false }, error: overrides.rpcError ?? null }; },
    from(table) {
      const query = { filters: [], select() { return this; }, eq(...args) { this.filters.push(args); return this; }, in(...args) { this.filters.push(args); return this; },
        async maybeSingle() { queries.push(table); return { data: table === 'video_projects' ? { id: projectId, workspace_id: projectId } : table === 'scenes' ? overrides.missingScene ? null : { id: sceneId, video_duration: 6 } : { user_id: overrides.ownerId ?? actorId }, error: overrides.readError ?? null }; },
        then(resolve) { queries.push(table); const data = table === 'scenes' ? overrides.scenes ?? [{ id: sceneId }] : table === 'overlay_clips' ? Object.hasOwn(overrides, 'rows') ? overrides.rows : [row] : (overrides.media ?? assets).map(asset => ({ id: asset.id, project_id: asset.projectId, media_type: asset.mediaType, status: asset.status, url: asset.url, original_filename: asset.name })); return Promise.resolve({ data, error: overrides[`${table}Error`] ?? null }).then(resolve); },
      }; return query;
    },
  };
}

test('presentation access verifies login and workspace ownership without a billing dependency', async () => {
  const client = clientFixture();
  assert.equal((await requirePresentationProject(client, projectId)).id, actorId);
  assert.deepEqual(client.queries, ['video_projects', 'workspaces']);
  await assert.rejects(requirePresentationProject(clientFixture({ signedOut: true }), projectId), /Sign in/);
  await assert.rejects(requirePresentationProject(clientFixture({ ownerId: otherActorId }), projectId), /do not own/);
  await assert.rejects(requirePresentationProject(clientFixture({ readError: { message: 'unavailable' } }), projectId), /could not be verified/);
});

const mutation = { projectId, sceneId, envelope, timing, action: 'save', expectedId: null, expectedRevision: 0, operationId: '50000000-0000-4000-8000-000000000001', locked: true };

test('the actual save action carries identity, revision, operation, lock, and timing into the atomic RPC', async () => {
  const client = clientFixture(); io.useClient(client);
  const result = await saveScenePresentation(mutation);
  assert.equal(result.success, true);
  assert.equal(result.row.id, row.id);
  assert.equal(client.rpcCalls.length, 1);
  assert.deepEqual(client.rpcCalls[0], { name: 'mutate_scene_presentation', args: {
    p_project_id: projectId, p_scene_id: sceneId, p_expected_id: null, p_expected_revision: 0,
    p_operation_id: mutation.operationId, p_envelope: envelope, p_start: timing.start_time,
    p_duration: timing.duration, p_duration_mode: timing.duration_mode, p_locked: true, p_action: 'save',
  } });
});

test('save validation, ownership, scene access, and image readiness fail before any presentation mutation', async () => {
  for (const overrides of [{ signedOut: true }, { ownerId: otherActorId }, { missingScene: true }, { media: [assets[0]] }, { media: [{ ...assets[0], status: 'uploading' }, assets[1]] }, { media: [{ ...assets[0], projectId: otherActorId }, assets[1]] }]) {
    const client = clientFixture(overrides); io.useClient(client);
    assert.equal((await saveScenePresentation(mutation)).success, false);
    assert.deepEqual(client.rpcCalls, []);
  }
  const client = clientFixture(); io.useClient(client);
  assert.equal((await saveScenePresentation({ ...mutation, envelope: { ...envelope, templateVersion: 2 } })).success, false);
  assert.deepEqual(client.queries, []);
});

test('save exposes a useful conflict/setup state and accepts an idempotent canonical replay', async () => {
  io.useClient(clientFixture({ rpcError: { message: 'REVISION_CONFLICT' } }));
  assert.match((await saveScenePresentation(mutation)).error, /changed elsewhere/);
  io.useClient(clientFixture({ rpcError: { message: 'Could not find the function public.mutate_scene_presentation in the schema cache' } }));
  assert.match((await saveScenePresentation(mutation)).error, /setup is required/);
  io.useClient(clientFixture({ replayed: true }));
  const result = await saveScenePresentation(mutation);
  assert.equal(result.success, true);
  assert.equal(result.replayed, true);
});

test('export ignores client-supplied presentation URLs and resolves the saved IDs from owned project media', async () => {
  const payload = { projectId, fps: 30, scenes: [{ id: sceneId, durationInSeconds: 6, mediaUrl: '/media/base.svg', presentation: { assets: [{ url: 'https://untrusted.example/image' }] } }] };
  const result = await prepareProjectPresentations(clientFixture(), payload);
  assert.equal(result.scenes[0].presentation.assets[0].url, assets[0].url);
  assert.equal(result.scenes[0].presentation.startFrame, 15);
  assert.equal(payload.scenes[0].presentation.assets[0].url, 'https://untrusted.example/image');
});

test('export blocks foreign scenes, missing media, unsupported saved versions, and read failures', async () => {
  const payload = { projectId, fps: 30, scenes: [{ id: sceneId, durationInSeconds: 6 }] };
  await assert.rejects(prepareProjectPresentations(clientFixture({ scenes: [] }), payload), /do not belong/);
  await assert.rejects(prepareProjectPresentations(clientFixture({ mediaError: { code: 'unavailable' } }), payload), /images could not/);
  await assert.rejects(prepareProjectPresentations(clientFixture({ rows: [{ ...row, template_data: { ...envelope, templateVersion: 99 } }] }), payload));
  await assert.rejects(prepareProjectPresentations(clientFixture({ overlay_clipsError: { code: 'unavailable' } }), payload), /could not be loaded/);
  await assert.rejects(prepareProjectPresentations(clientFixture({ overlay_clipsError: { code: '42703', message: 'column kind does not exist' } }), payload), /could not be loaded/);
  await assert.rejects(prepareProjectPresentations(clientFixture(), { ...payload, scenes: [payload.scenes[0], payload.scenes[0]] }), /Duplicate scenes/);
});

test('a pre-attachment schema preserves legacy export and removes forged attached content', async () => {
  const result = await prepareProjectPresentations(clientFixture({ rows: null, overlay_clipsError: { code: '42703', message: 'column overlay_clips.scene_id does not exist' } }), { projectId, scenes: [{ id: sceneId, presentation: { unsafe: true } }] });
  assert.equal(result.scenes[0].presentation, undefined);
});
