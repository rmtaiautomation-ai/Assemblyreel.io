import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { familyFixture, assets, actorId, otherActorId, projectId, sceneId, priorSceneIds } from './phase-5-fixtures.mjs';
import { phase5ShapeContract } from '../../scripts/presentations/phase-5-shape-contract.mjs';
import { loadSource } from './load-source.mjs';
const { PHASE_5_FAMILIES, DOCUMENTARY_TEMPLATES } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const { defaultVisualSettings } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));

test('actual Phase 5 SQL preserves ownership, CAS, private helpers, shape parity, recap references, source packets, AI locking and registry staleness', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
      create table workspaces(id uuid primary key,user_id uuid,format_blueprint jsonb,format_blueprint_version integer default 0,format_preset_key text);
      create table video_projects(id uuid primary key,workspace_id uuid references workspaces,format_blueprint_snapshot jsonb);
      create table scenes(id uuid primary key,project_id uuid references video_projects,voice_over_beat text,video_duration numeric,sequence_number integer,act_number integer,media_id uuid);
      create table media(id uuid primary key,project_id uuid references video_projects,media_type text,status text,url text);`);
    for(const name of ['create-overlay-clips.sql','add-overlay-clip-templates.sql','add-overlay-ai-origin.sql','add-scene-template-presentations.sql','add-documentary-template-library.sql','add-presentation-suggestions.sql','add-documentary-phase-4.sql'])await db.exec(await readFile(new URL(`../../db/${name}`,import.meta.url),'utf8'));
    await db.query("insert into workspaces values($1,$2,'{}',0,'general')",[projectId,actorId]);await db.query('insert into video_projects(id,workspace_id) values($1,$1)',[projectId]);
    await db.query("insert into scenes values($1,$2,'Recap script',120,3,1,null),($3,$2,'Earlier source',120,1,1,$5),($4,$2,'Later source',120,2,1,$6)",[sceneId,projectId,...priorSceneIds,assets[0].id,assets[1].id]);
    for(const asset of assets)await db.query("insert into media values($1,$2,'image','ready',$3)",[asset.id,projectId,asset.url]);
    await db.exec('grant usage on schema public,auth to authenticated,anon;grant select,update on workspaces,video_projects,scenes,media to authenticated;grant select on overlay_clips to authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actorId]);
    const snapshot=async()=>(await db.query('select presentation_suggestion_snapshot($1) as result',[projectId])).rows[0].result, old=await snapshot();
    for(let i=0;i<2;i++)await db.exec(await readFile(new URL('../../db/add-documentary-phase-5.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('select phase5_shape_contract() as result')).rows[0].result,phase5ShapeContract);
    await db.exec('set role authenticated');const upgraded=await snapshot();assert.equal(upgraded.inputs.registryVersion,3);assert.notEqual(upgraded.inputHash,old.inputHash);
    for(const name of ['documentary_image_slots_phase4','phase5_shape_contract'])await assert.rejects(db.query(`select ${name}(${name.includes('slots')?'$1':''})`,name.includes('slots')?[familyFixture('fact-reveal')]:[]),/permission denied/);
    let row=null,operation=0;
    const mutate=async(envelope,revision=row?.revision??0)=>(await db.query('select mutate_scene_presentation($1,$2,$3,$4,$5,$6,0,120,$7,true,$8) as result',[projectId,sceneId,row?.id??null,revision,`90000000-0000-4000-8000-${String(++operation).padStart(12,'0')}`,envelope,'scene-remainder','save'])).rows[0].result;
    for(const id of [...PHASE_5_FAMILIES,'fact-reveal','image-comparison']){row=(await mutate(familyFixture(id))).row;assert.equal(row.template_data.templateId,id);assert.equal(row.origin,'user');}
    await assert.rejects(mutate(familyFixture('animated-chart'),1),/REVISION_CONFLICT/);
    for(const id of PHASE_5_FAMILIES){const f=familyFixture(id);f.content.untrustedHtml='<script>';await assert.rejects(mutate(f),/INVALID_PRESENTATION/);}
    const malformed=familyFixture('journey-map');malformed.content.stops[0].point=[35];await assert.rejects(mutate(malformed),/INVALID_PRESENTATION/);
    const territory=familyFixture('territory-change');territory.content.states[0].polygons=[[[34,28],[43,35],[43,28],[34,35]]];await assert.rejects(mutate(territory),/INVALID_PRESENTATION/);
    territory.content.states[0].polygons=[[[34,28],[43,28],[43,35],[34,35]],[[35,29],[40,29],[40,32],[35,32]]];await assert.rejects(mutate(territory),/INVALID_PRESENTATION/);
    const chart=familyFixture('animated-chart');chart.content.points[0].low=11;chart.content.points[0].high=15;await assert.rejects(mutate(chart),/INVALID_PRESENTATION/);
    const wipe=familyFixture('then-now');wipe.content.alignmentReviewed=false;await assert.rejects(mutate(wipe),/INVALID_PRESENTATION/);wipe.content.method='side-by-side';row=(await mutate(wipe)).row;
    const parallax=familyFixture('layered-parallax');parallax.content.layers[1].image.asset.mediaId=otherActorId;await assert.rejects(mutate(parallax),/ASSET_NOT_READY/);
    const recap=familyFixture('chapter-recap');row=(await mutate(recap)).row;
    await db.query('update scenes set sequence_number=4 where id=$1',[priorSceneIds[0]]);await assert.rejects(mutate(recap),/RECAP_REFERENCE_INVALID/);await db.query('update scenes set sequence_number=1 where id=$1',[priorSceneIds[0]]);
    await db.query('update scenes set media_id=$1 where id=$2',[assets[2].id,priorSceneIds[0]]);await assert.rejects(mutate(recap),/RECAP_REFERENCE_INVALID/);await db.query('update scenes set media_id=$1 where id=$2',[assets[0].id,priorSceneIds[0]]);
    recap.content.items[0].sceneId=otherActorId;await assert.rejects(mutate(recap),/RECAP_REFERENCE_INVALID/);
    const visuals={...defaultVisualSettings(),allowedFamilies:DOCUMENTARY_TEMPLATES.map(item=>item.id)};await db.query('select mutate_presentation_visuals($1,$2,0,$3)',['project',projectId,visuals]);assert.equal((await snapshot()).inputs.project.visuals.allowedFamilies.length,24);
    await assert.rejects(db.query('select mutate_presentation_visuals($1,$2,1,$3)',['project',projectId,{...visuals,allowedFamilies:['journey-map','journey-map']}]),/INVALID_VISUALS/);
    for(const [i,id]of PHASE_5_FAMILIES.entries()){const packet=(await db.query('select mutate_presentation_evidence($1,$2,0,$3,$4,false) as result',[projectId,`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,id,familyFixture(id)])).rows[0].result;assert.deepEqual(packet.envelope.content,familyFixture(id).content);}
    const unknown=familyFixture('journey-map');unknown.content.source.classification='unknown';await assert.rejects(db.query('select mutate_presentation_evidence($1,$2,0,$3,$4,false) as result',[projectId,'70000000-0000-4000-8000-000000000011','Unreviewed source',unknown]),/INVALID_EVIDENCE/);
    // Test untouched AI Apply path using a genuinely stored advanced choice, then its replay.
    const target='30000000-0000-4000-8000-000000000010',runId='80000000-0000-4000-8000-000000000001',packetId='70000000-0000-4000-8000-000000000008';
    await db.exec('reset role');await db.query("insert into scenes values($1,$2,'Chart script',120,10,1,null)",[target,projectId]);const hash=(await snapshot()).inputHash;
    const result=inputHash=>({version:1,inputHash,scenes:[{sceneId:target,expectedId:null,expectedRevision:0,chosenId:packetId,choices:[{id:packetId,status:'ready',envelope:familyFixture('animated-chart'),timing:{start_time:0,duration:120,duration_mode:'scene-remainder'}}]}]});
    await db.query("insert into presentation_suggestion_runs(id,project_id,requested_by,target_scene_ids,input_hash,state,result) values($1,$2,$3,$4,$5,'complete',$6)",[runId,projectId,actorId,[target],old.inputHash,result(old.inputHash)]);await db.exec('set role authenticated');
    const apply=async()=>(await db.query('select apply_presentation_suggestion($1,$2,$3,$4,$5,false,null,null) as result',[projectId,target,runId,packetId,'90000000-0000-4000-8000-000000010000'])).rows[0].result;
    await assert.rejects(apply(),/STALE_SUGGESTION/);await db.exec('reset role');await db.query('update presentation_suggestion_runs set input_hash=$1,result=$2 where id=$3',[hash,result(hash),runId]);await db.exec('set role authenticated');
    const applied=await apply();assert.equal(applied.row.origin,'ai');assert.equal(applied.row.locked,true);assert.equal((await apply()).replayed,true);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherActorId]);await assert.rejects(mutate(familyFixture('journey-map')),/OWNERSHIP_REQUIRED/);await assert.rejects(snapshot(),/OWNERSHIP_REQUIRED/);
    await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(snapshot(),/AUTH_REQUIRED/);
  }finally{await db.close();}
});
