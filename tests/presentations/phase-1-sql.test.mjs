import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { actorId, otherActorId, projectId, sceneId, envelope, mediaIds } from './phase-1-fixtures.mjs';

test('the real migration enforces ownership, atomic revision updates, retries, Undo, and scene cascades', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
      create table public.workspaces (id uuid primary key, user_id uuid not null);
      create table public.video_projects (id uuid primary key, workspace_id uuid not null references public.workspaces);
      create table public.scenes (id uuid primary key, project_id uuid not null references public.video_projects, voice_over_beat text, video_duration numeric);
      create table public.media (id uuid primary key, project_id uuid not null references public.video_projects, media_type text, status text, url text);
    `);
    for (const name of ['create-overlay-clips.sql', 'add-overlay-clip-templates.sql', 'add-overlay-ai-origin.sql', 'add-scene-template-presentations.sql']) {
      await db.exec(await readFile(new URL(`../../db/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(await readFile(new URL('../../db/add-scene-template-presentations.sql', import.meta.url), 'utf8'));
    await db.query('insert into workspaces values ($1, $2)', [projectId, actorId]);
    await db.query('insert into video_projects values ($1, $1)', [projectId]);
    await db.query('insert into scenes values ($1, $2, $3, 6)', [sceneId, projectId, 'Actual script']);
    for (const id of mediaIds) await db.query("insert into media values ($1, $2, 'image', 'ready', '/media/image.svg')", [id, projectId]);
    await db.query("insert into overlay_clips(project_id, text) values ($1, 'Existing manual overlay')", [projectId]);
    await db.exec('grant usage on schema public, auth to authenticated, anon; grant select on all tables in schema public to authenticated; grant insert, update, delete on overlay_clips to authenticated; grant delete on scenes to authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actorId]);
    await db.exec('set role authenticated');
    let operation = 0;
    const mutate = async ({ expectedId = null, revision = 0, data = envelope, start = 0, duration = 6, action = 'save', operationId } = {}) => {
      const id = operationId ?? `50000000-0000-4000-8000-${String(++operation).padStart(12, '0')}`;
      const result = await db.query('select mutate_scene_presentation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result', [projectId, sceneId, expectedId, revision, id, data, start, duration, 'scene-remainder', true, action]);
      return result.rows[0].result;
    };
    const retryId = '50000000-0000-4000-8000-000000000099';
    const first = await mutate({ operationId: retryId });
    assert.equal(first.row.revision, 1);
    assert.equal(first.row.scene_id, sceneId);
    assert.notEqual(first.row.template_data.provenance.scriptHash, envelope.provenance.scriptHash);
    assert.equal((await mutate({ operationId: retryId })).replayed, true);
    await assert.rejects(mutate({ operationId: retryId, start: 0.5 }), /OPERATION_REUSED/);
    await assert.rejects(mutate(), /REVISION_CONFLICT/);
    const replacement = await mutate({ expectedId: first.row.id, revision: 1, data: { ...envelope, content: { ...envelope.content, heading: 'Edited heading' } } });
    assert.equal(replacement.row.revision, 2);
    assert.equal(replacement.previous.template_data.content.heading, '');
    await assert.rejects(mutate({ expectedId: first.row.id, revision: 1 }), /REVISION_CONFLICT/);
    const blocked = await db.query('update overlay_clips set template_data = $1 where id = $2', [envelope, first.row.id]);
    assert.equal(blocked.affectedRows, 0);
    await db.exec("reset role; create policy fixture_permissive_update on overlay_clips for update to authenticated using (true) with check (true); create policy fixture_permissive_read on overlay_clips for select to authenticated using (true); set role authenticated");
    await assert.rejects(db.query('update overlay_clips set template_data = $1 where id = $2', [envelope, first.row.id]), /USE_PRESENTATION_SERVICE/);

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [otherActorId]);
    await assert.rejects(mutate({ expectedId: first.row.id, revision: 2 }), /OWNERSHIP_REQUIRED/);
    assert.equal((await db.query("select * from overlay_clips where kind='scene-template'")).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(mutate(), /AUTH_REQUIRED/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actorId]);

    const restored = await mutate({ expectedId: replacement.row.id, revision: 2, data: replacement.previous.template_data });
    assert.equal(restored.row.template_data.content.heading, '');
    const removed = await mutate({ expectedId: restored.row.id, revision: 3, action: 'delete', data: null });
    assert.equal(removed.row, null);
    const recreated = await mutate({ data: removed.previous.template_data });
    assert.notEqual(recreated.row.id, restored.row.id);
    await assert.rejects(mutate({ expectedId: restored.row.id, revision: 1, action: 'delete', data: null }), /REVISION_CONFLICT/);
    await assert.rejects(mutate({ expectedId: recreated.row.id, revision: 1, data: { ...envelope, content: { ...envelope.content, images: [{ ...envelope.content.images[0], asset: { kind: 'media', mediaId: otherActorId } }, envelope.content.images[1]] } } }), /ASSET_NOT_READY/);
    assert.equal((await db.query("select count(*) as n from overlay_clips where text = 'Existing manual overlay'")).rows[0].n, 1);
    await db.query('delete from scenes where id = $1', [sceneId]);
    assert.equal((await db.query("select count(*) as n from overlay_clips where kind = 'scene-template'")).rows[0].n, 0);
  } finally { await db.close(); }
});
