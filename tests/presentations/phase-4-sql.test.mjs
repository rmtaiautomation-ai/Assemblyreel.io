import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { familyFixture, actorId, otherActorId, projectId, sceneId, mediaIds } from './phase-4-fixtures.mjs';
import { loadSource } from './load-source.mjs';
const { PHASE_4_FAMILIES } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const { defaultVisualSettings } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
const secondScene = '30000000-0000-4000-8000-000000000002', runId = '80000000-0000-4000-8000-000000000001';
test('Phase 4 SQL is additive/idempotent and preserves private services, source ownership, CAS, AI locks and registry staleness', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
      create table workspaces(id uuid primary key,user_id uuid,format_blueprint jsonb,format_blueprint_version integer default 0,format_preset_key text);
      create table video_projects(id uuid primary key,workspace_id uuid references workspaces,format_blueprint_snapshot jsonb);
      create table scenes(id uuid primary key,project_id uuid references video_projects,voice_over_beat text,video_duration numeric,sequence_number integer,act_number integer);
      create table media(id uuid primary key,project_id uuid references video_projects,media_type text,status text,url text);`);
    for (const name of ['create-overlay-clips.sql', 'add-overlay-clip-templates.sql', 'add-overlay-ai-origin.sql', 'add-scene-template-presentations.sql', 'add-documentary-template-library.sql', 'add-presentation-suggestions.sql']) await db.exec(await readFile(new URL(`../../db/${name}`, import.meta.url), 'utf8'));
    await db.query("insert into workspaces values($1,$2,'{}',0,'general')", [projectId, actorId]);
    await db.query('insert into video_projects(id,workspace_id) values($1,$1)', [projectId]);
    await db.query("insert into scenes values($1,$2,'Source script',25,1,1),($3,$2,'Another script',25,2,1)", [sceneId, projectId, secondScene]);
    for (const id of mediaIds) await db.query("insert into media values($1,$2,'image','ready','/source.svg')", [id, projectId]);
    await db.exec('grant usage on schema public,auth to authenticated,anon; grant select,update on workspaces,video_projects,scenes,media to authenticated; grant select on overlay_clips to authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
    const snapshot = async () => (await db.query('select presentation_suggestion_snapshot($1) as result', [projectId])).rows[0].result;
    const legacy = await snapshot();
    for (let i = 0; i < 2; i++) await db.exec(await readFile(new URL('../../db/add-documentary-phase-4.sql', import.meta.url), 'utf8'));
    await db.exec('set role authenticated');
    const upgraded = await snapshot(); assert.equal(upgraded.inputs.registryVersion, 2); assert.notEqual(upgraded.inputHash, legacy.inputHash);
    assert.equal((await snapshot()).inputHash, upgraded.inputHash);
    await assert.rejects(db.query('select documentary_image_slots_phase2($1)', [familyFixture('archival-explainer')]), /permission denied/);
    await assert.rejects(db.query('select presentation_suggestion_snapshot_phase3($1)', [projectId]), /permission denied/);
    let row = null, operation = 0;
    const mutate = async (envelope, revision = row?.revision ?? 0) => (await db.query('select mutate_scene_presentation($1,$2,$3,$4,$5,$6,0,25,$7,true,$8) as result', [projectId, sceneId, row?.id ?? null, revision, `90000000-0000-4000-8000-${String(++operation).padStart(12, '0')}`, envelope, 'scene-remainder', 'save'])).rows[0].result;
    for (const id of [...PHASE_4_FAMILIES, 'image-comparison']) { row = (await mutate(familyFixture(id))).row; assert.equal(row.template_data.templateId, id); assert.equal(row.origin, 'user'); }
    const uppercaseSource = familyFixture('fact-reveal'); uppercaseSource.content.source.url = 'HTTPS://example.test/source';
    row = (await mutate(uppercaseSource)).row; assert.equal(row.template_data.content.source.url, uppercaseSource.content.source.url);
    await assert.rejects(mutate(familyFixture('fact-reveal'), 1), /REVISION_CONFLICT/);
    const badCause = familyFixture('cause-effect'); badCause.content.links[0].type = 'causal'; await assert.rejects(mutate(badCause), /INVALID_PRESENTATION/);
    const badScale = familyFixture('scale-comparison'); badScale.content.items[0].value = .001; await assert.rejects(mutate(badScale), /INVALID_PRESENTATION/);
    badScale.content.method = 'values-only'; row = (await mutate(badScale)).row;
    const badClaim = familyFixture('claim-evidence'); badClaim.content.evidence.kind = 'attributed'; badClaim.content.scope = 'supports'; await assert.rejects(mutate(badClaim), /INVALID_PRESENTATION/);
    const object = familyFixture('claim-evidence'); object.content.evidence.kind = 'object'; object.content.evidence.image = familyFixture('image-comparison').content.images[0];
    object.content.evidence.image.asset.mediaId = otherActorId; await assert.rejects(mutate(object), /ASSET_NOT_READY/);
    await db.query('select mutate_presentation_visuals($1,$2,0,$3)', ['project', projectId, defaultVisualSettings()]);
    assert.equal((await snapshot()).inputs.project.visuals.allowedFamilies.length, 14);
    await assert.rejects(db.query('select mutate_presentation_visuals($1,$2,1,$3)', ['project', projectId, { ...defaultVisualSettings(), allowedFamilies: ['fact-reveal', 'fact-reveal'] }]), /INVALID_VISUALS/);
    for (const [index, id] of PHASE_4_FAMILIES.entries()) {
      const packet = (await db.query('select mutate_presentation_evidence($1,$2,0,$3,$4,false) as result', [projectId, `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, id, familyFixture(id)])).rows[0].result;
      assert.deepEqual(packet.envelope.content, familyFixture(id).content);
    }
    const packetId = '70000000-0000-4000-8000-000000000004', hash = (await snapshot()).inputHash;
    const result = inputHash => ({ version: 1, inputHash, scenes: [{ sceneId: secondScene, expectedId: null, expectedRevision: 0, chosenId: packetId, choices: [{ id: packetId, status: 'ready', envelope: familyFixture('claim-evidence'), timing: { start_time: 0, duration: 25, duration_mode: 'scene-remainder' } }] }] });
    await db.exec('reset role'); await db.query("insert into presentation_suggestion_runs(id,project_id,requested_by,target_scene_ids,input_hash,state,result) values($1,$2,$3,$4,$5,'complete',$6)", [runId, projectId, actorId, [secondScene], legacy.inputHash, result(legacy.inputHash)]); await db.exec('set role authenticated');
    const apply = async () => (await db.query('select apply_presentation_suggestion($1,$2,$3,$4,$5,false,null,null) as result', [projectId, secondScene, runId, packetId, '90000000-0000-4000-8000-000000001000'])).rows[0].result;
    await assert.rejects(apply(), /STALE_SUGGESTION/);
    await db.exec('reset role'); await db.query('update presentation_suggestion_runs set input_hash=$1,result=$2 where id=$3', [hash, result(hash), runId]); await db.exec('set role authenticated');
    const applied = await apply(); assert.equal(applied.row.origin, 'ai'); assert.equal(applied.row.locked, true); assert.equal((await apply()).replayed, true);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [otherActorId]); await assert.rejects(snapshot(), /OWNERSHIP_REQUIRED/); await assert.rejects(mutate(familyFixture('fact-reveal')), /OWNERSHIP_REQUIRED/);
    await db.query("select set_config('request.jwt.claim.sub','',false)"); await assert.rejects(snapshot(), /AUTH_REQUIRED/);
  } finally { await db.close(); }
});
