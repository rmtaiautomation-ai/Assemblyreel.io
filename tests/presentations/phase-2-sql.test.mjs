import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { familyFixture, actorId, otherActorId, projectId, sceneId, mediaIds } from './phase-2-fixtures.mjs';
import { loadSource } from './load-source.mjs';
const { defaultVisualSettings: currentVisualSettings } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
const { DOCUMENTARY_TEMPLATES: ALL_TEMPLATES } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const DOCUMENTARY_TEMPLATES = ALL_TEMPLATES.slice(0, 10);
const defaultVisualSettings = () => ({ ...currentVisualSettings(), allowedFamilies: DOCUMENTARY_TEMPLATES.map(item => item.id) });
test('Phase 2 migration supports all families, preserves CAS/retries/ownership, and protects independent Visuals saves', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
      create table workspaces(id uuid primary key,user_id uuid,format_blueprint jsonb,format_blueprint_version integer default 0,format_preset_key text);
      create table video_projects(id uuid primary key,workspace_id uuid references workspaces,format_blueprint_snapshot jsonb);
      create table scenes(id uuid primary key,project_id uuid references video_projects,voice_over_beat text,video_duration numeric);
      create table media(id uuid primary key,project_id uuid references video_projects,media_type text,status text,url text);`);
    for (const name of ['create-overlay-clips.sql','add-overlay-clip-templates.sql','add-overlay-ai-origin.sql','add-scene-template-presentations.sql','add-documentary-template-library.sql','add-documentary-template-library.sql']) await db.exec(await readFile(new URL(`../../db/${name}`,import.meta.url),'utf8'));
    await db.query("insert into workspaces values($1,$2,$3,0,'general')",[projectId,actorId,{ visual: { visualBias: 'Keep this' }, content: { sourcingRule: 'Keep sources' } }]);
    await db.query('insert into video_projects(id,workspace_id,format_blueprint_snapshot) values($1,$1,$2)',[projectId,{ visual: { presentation: defaultVisualSettings() } }]);
    await db.query("insert into scenes values($1,$2,'Actual script',20)",[sceneId,projectId]);
    for (const id of mediaIds) await db.query("insert into media values($1,$2,'image','ready','/source.svg')",[id,projectId]);
    await db.exec('grant usage on schema public,auth to authenticated,anon; grant select,update on workspaces,video_projects to authenticated; grant select,delete on scenes to authenticated; grant select,update on overlay_clips to authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actorId]); await db.exec('set role authenticated');
    let current = null, operation = 0;
    const mutate = async (envelope, extra = {}) => {
      const args = [projectId,sceneId,extra.expectedId ?? current?.id ?? null,extra.revision ?? current?.revision ?? 0,extra.operationId ?? `50000000-0000-4000-8000-${String(++operation).padStart(12,'0')}`,envelope,0,20,'scene-remainder',true,'save'];
      return (await db.query('select mutate_scene_presentation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',args)).rows[0].result;
    };
    for (const { id } of DOCUMENTARY_TEMPLATES) { const result = await mutate(familyFixture(id)); current = result.row; assert.equal(current.template_data.templateId,id); }
    const retry = { operationId: '50000000-0000-4000-8000-000000009999',revision: current.revision,expectedId: current.id };
    const once = await mutate(familyFixture('artifact-spotlight'),retry); assert.equal((await mutate(familyFixture('artifact-spotlight'),retry)).replayed,true); current = once.row;
    await assert.rejects(mutate(familyFixture('person-introduction'),retry),/OPERATION_REUSED/);
    await assert.rejects(mutate(familyFixture('map-locator'),{ revision: 1 }),/REVISION_CONFLICT/);
    const foreignImage = familyFixture('artifact-spotlight'); foreignImage.content.image.asset.mediaId = otherActorId;
    await assert.rejects(mutate(foreignImage),/ASSET_NOT_READY/);
    const unknown = familyFixture('person-introduction'); unknown.templateId = 'future-family'; await assert.rejects(mutate(unknown),/INVALID_PRESENTATION/);
    const legacyTheme = familyFixture('historical-timeline'); legacyTheme.theme.version=1; await assert.rejects(mutate(legacyTheme),/INVALID_PRESENTATION/);

    const saveVisual = async (scope,id,revision,settings) => (await db.query('select mutate_presentation_visuals($1,$2,$3,$4) as result',[scope,id,revision,settings])).rows[0].result;
    const dark = defaultVisualSettings(), parchment = { ...dark,themeId: 'parchment-archive' };
    assert.equal((await saveVisual('workspace',projectId,0,parchment)).revision,1);
    const workspace = (await db.query('select * from workspaces where id=$1',[projectId])).rows[0];
    assert.equal(workspace.format_blueprint.visual.visualBias,'Keep this'); assert.equal(workspace.format_blueprint.content.sourcingRule,'Keep sources');
    await assert.rejects(saveVisual('workspace',projectId,0,dark),/REVISION_CONFLICT/);
    await assert.rejects(db.query('select save_channel_format_cas($1,0,$2)',[projectId,{ format_blueprint: { content: { sourcingRule: 'New rule' } } }]),/REVISION_CONFLICT/);
    await db.query('select save_channel_format_cas($1,1,$2)',[projectId,{ format_blueprint: { content: { sourcingRule: 'New rule' },visual: { presentation: dark } } }]);
    assert.equal((await db.query('select format_blueprint from workspaces where id=$1',[projectId])).rows[0].format_blueprint.visual.presentation.themeId,'parchment-archive');
    assert.equal((await db.query('select format_blueprint_snapshot from video_projects where id=$1',[projectId])).rows[0].format_blueprint_snapshot.visual.presentation.themeId,'dark-documentary');
    assert.equal((await saveVisual('project',projectId,0,parchment)).revision,1);
    assert.equal((await db.query('select template_data from overlay_clips where id=$1',[current.id])).rows[0].template_data.theme.id,'dark-documentary');
    await assert.rejects(db.query('update workspaces set format_blueprint=$1 where id=$2',[{},projectId]),/USE_FORMAT_VISUAL_SERVICE/);
    await assert.rejects(db.query('update video_projects set presentation_visual_settings=$1 where id=$2',[dark,projectId]),/USE_FORMAT_VISUAL_SERVICE/);
    await assert.rejects(saveVisual('workspace',projectId,2,{ ...dark,allowedFamilies: ['unknown'] }),/INVALID_VISUALS/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherActorId]);
    await assert.rejects(saveVisual('workspace',projectId,2,dark),/OWNERSHIP_REQUIRED/); await assert.rejects(mutate(familyFixture('map-locator')),/OWNERSHIP_REQUIRED/);
    await db.query("select set_config('request.jwt.claim.sub','',false)"); await assert.rejects(saveVisual('project',projectId,1,dark),/AUTH_REQUIRED/);
  } finally { await db.close(); }
});
