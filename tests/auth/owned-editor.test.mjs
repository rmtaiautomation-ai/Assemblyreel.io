import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
import { editorFixture,emptyDocument,editorId as id,editorActorA as a,editorActorB as b } from './fixtures/editor-database.mjs';

const scene=n=>({id:id(n),voice_over_beat:'Narration',final_video_prompt:'A quiet room',video_duration:5,trim_start:0});
const item=(n,media=id(5))=>({id:id(n),media_id:media,track_id:'A1',start_time:0,duration:5,trim_start:0});

test('editor snapshot saves canonical rows/settings, reorders, removes manual scenes and preserves unrelated data',async()=>{
  const f=await editorFixture();try {
    const initial=await f.read();assert.equal(initial.revision,0);assert.deepEqual(initial.document,emptyDocument());
    assert.deepEqual(Object.keys(initial.media[0]).sort(),['duration_seconds','id','media_type']);
    const document=emptyDocument();document.scenes=[scene(20),scene(21)];document.items=[item(22)];document.settings.captions_enabled=true;
    assert.deepEqual(await f.save(document),{operationId:id(10),revision:1});
    const saved=await f.read();assert.deepEqual(saved.document,document);assert.deepEqual(saved.removableSceneIds,[id(20),id(21)]);
    const reordered={...document,scenes:[{...scene(21),voice_over_beat:'Edited',video_duration:7},scene(20)],items:[]};
    await f.save(reordered,1,id(11));assert.deepEqual((await f.read()).document,reordered);
    await f.save({...reordered,scenes:[reordered.scenes[0]]},2,id(12));
    await f.db.exec('reset role');
    assert.equal((await f.db.query('select sequence_number from public.scenes where id=$1',[id(21)])).rows[0].sequence_number,1);
    assert.equal((await f.db.query('select count(*)::int n from public.scenes where id=$1',[id(20)])).rows[0].n,0);
    assert.equal((await f.db.query("select count(*)::int n from public.scenes where project_id in ('malformed','90000000-0000-4000-8000-000000000099')")).rows[0].n,2);
    assert.equal((await f.db.query('select topic from public.video_projects where id=$1',[id(4)])).rows[0].topic,'Draft B');
  }finally{await f.close();}
});

test('lost-response replay applies once; changed payload and stale tab cannot overwrite; concurrent same revision has one winner',async()=>{
  const f=await editorFixture();try {
    const document={...emptyDocument(),scenes:[scene(20)]};
    assert.deepEqual(await f.save(document),await f.save(document));
    await assert.rejects(f.save({...document,scenes:[scene(21)]}),/OPERATION_REUSED/);
    await assert.rejects(f.save(emptyDocument(),0,id(11)),/EDITOR_CONFLICT/);
    const results=await Promise.allSettled([f.save(document,1,id(12)),f.save(document,1,id(13))]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.match(results.find(result=>result.status==='rejected').reason.message,/EDITOR_CONFLICT/);
    await f.db.exec('reset role');
    assert.equal((await f.db.query('select count(*)::int n from public.account_editor_operations')).rows[0].n,2);
    assert.equal((await f.db.query("select hits from public.account_request_limits where actor_id=$1 and action='editor'",[a])).rows[0].hits,2);
  }finally{await f.close();}
});

test('database rejects foreign project, scene, timeline UUID and media references in both account directions',async()=>{
  const f=await editorFixture();try {
    await f.save({...emptyDocument(),scenes:[scene(20)],items:[item(22)]});
    await assert.rejects(f.read(id(4)),/RESOURCE_UNAVAILABLE/);
    await assert.rejects(f.save(emptyDocument(),0,id(11),id(4)),/RESOURCE_UNAVAILABLE/);
    await f.actor(b);
    await assert.rejects(f.read(),/RESOURCE_UNAVAILABLE/);
    await assert.rejects(f.save(emptyDocument()),/RESOURCE_UNAVAILABLE/);
    for(const document of [{...emptyDocument(),scenes:[scene(20)]},{...emptyDocument(),items:[item(23)]},
      {...emptyDocument(),items:[item(22,id(6))]}]) {
      await assert.rejects(f.save(document,0,id(11),id(4)),/RESOURCE_UNAVAILABLE/);
    }
    assert.equal((await f.read(id(4))).revision,0);
    await f.actor();assert.equal((await f.read()).document.scenes[0].voice_over_beat,'Narration');
  }finally{await f.close();}
});

test('direct RPC input validation, protected imported scenes, transactional rollback and direct-write denial',async()=>{
  const f=await editorFixture();try {
    const invalid=[null,[],{...emptyDocument(),owner:a},{...emptyDocument(),scenes:[{...scene(20),media_id:id(6)}]},
      {...emptyDocument(),scenes:[scene(20),scene(20)]},{...emptyDocument(),scenes:[{...scene(20),video_duration:-1}]},
      {...emptyDocument(),items:[{...item(22),track_id:'V1'}]},
      {...emptyDocument(),items:[{...item(22),trim_start:18}]},
      {...emptyDocument(),settings:{captions_enabled:true,track_states:{}}},
      {...emptyDocument(),scenes:[{...scene(20),voice_over_beat:null}]}];
    for(const value of invalid) await assert.rejects(f.save(value),/INVALID_EDITOR|RESOURCE_UNAVAILABLE/);
    assert.equal((await f.read()).revision,0);
    for(const table of ['scenes','timeline_items','video_projects','account_editor_operations']) await assert.rejects(f.db.query(`delete from public.${table} where false`),/permission denied/);
    await f.db.exec('reset role');
    await f.db.query('insert into public.scenes(id,project_id,voice_over_beat) values($1,$2,$3)',[id(24),id(2),'Imported']);
    await f.actor();
    await assert.rejects(f.save(emptyDocument()),/EDITOR_SCENE_PROTECTED/);
    const document=(await f.read()).document;document.scenes[0].voice_over_beat='Edited import';
    await f.save(document);
    assert.deepEqual((await f.read()).removableSceneIds,[]);
    // Fail after child deletion/upserts to prove all writes and the revision roll back.
    await f.db.exec(`reset role;create function public.fail_editor_save() returns trigger language plpgsql as $$begin raise exception 'INJECTED_FAILURE'; end$$;
      create trigger fail_editor before insert on public.account_editor_operations for each row execute function public.fail_editor_save();`);
    await f.actor();await assert.rejects(f.save({...document,scenes:[...document.scenes,scene(25)]},1,id(11)),/INJECTED_FAILURE/);
    assert.deepEqual((await f.read()).document,document);assert.equal((await f.read()).revision,1);
  }finally{await f.close();}
});

test('RPC rate ceiling, bounded snapshots, unconfirmed/banned/anonymous/signed-out identity and migration replay fail closed',async()=>{
  const f=await editorFixture();try {
    await f.db.exec('reset role');
    await f.db.query("insert into public.account_request_limits values($1,'editor',date_trunc('minute',now()),30)",[a]);
    await f.actor();await assert.rejects(f.save(emptyDocument()),/REQUEST_RATE_LIMIT/);assert.equal((await f.read()).revision,0);
    for(const change of ['email_confirmed_at=null',"email_confirmed_at=now(),banned_until=now()+interval '1 hour'",'banned_until=null,is_anonymous=true']) {
      await f.db.exec(`reset role;update auth.users set ${change} where id='${a}'`);await f.actor();
      await assert.rejects(f.read(),/AUTH_REQUIRED/);await assert.rejects(f.save(emptyDocument()),/AUTH_REQUIRED/);
    }
    await f.db.exec(`reset role;update auth.users set is_anonymous=false where id='${a}'`);await f.actor(a,true);await assert.rejects(f.read(),/AUTH_REQUIRED/);
    await f.db.exec('reset role;set role anon');await assert.rejects(f.read(),/permission denied/);
    await f.db.exec('reset role');
    await f.db.query("insert into public.scenes(id,project_id) select gen_random_uuid(),$1 from generate_series(1,201)",[id(2)]);
    await f.actor();await assert.rejects(f.read(),/EDITOR_LIMIT/);
    await f.db.exec('reset role');await assert.rejects(f.db.exec(await readFile(new URL('../../db/auth/existing-project/008-owned-draft-editor.sql',import.meta.url),'utf8')),/EDITOR_ALREADY_STARTED/);
    await f.db.exec('rollback');assert.equal((await f.db.query('select count(*)::int n from public.account_editor_operations')).rows[0].n,0);
  }finally{await f.close();}
});

const client=await loadSource(new URL('../../src/features/owned-editor/client.ts',import.meta.url));
test('client freezes request body, rejects invalid timing, retries uncertain responses and rejects incorrect acknowledgments',async()=>{
  const original=globalThis.fetch;
  try {
    const document={...emptyDocument(),scenes:[scene(20)]};
    const attempt=client.prepareEditorSave(0,document,id(10));document.scenes[0].voice_over_beat='Later edit';
    assert.equal(JSON.parse(attempt.body).document.scenes[0].voice_over_beat,'Narration');
    assert.throws(()=>client.prepareEditorSave(0,{...document,scenes:[{...scene(20),video_duration:NaN}]},id(10)),/Check/);
    let calls=0;const bodies=[];
    globalThis.fetch=async(_url,init)=>{bodies.push(init.body);if(calls++===0)throw Error('Lost response');return Response.json({operationId:id(10),revision:1});};
    await assert.rejects(client.sendEditorSave(id(2),attempt));await client.sendEditorSave(id(2),attempt);assert.equal(bodies[0],bodies[1]);
    globalThis.fetch=async()=>Response.json({operationId:id(11),revision:1});
    await assert.rejects(client.sendEditorSave(id(2),attempt),error=>client.retryEditorSave(error));
    for(const status of [400,401,404,409]) assert.equal(client.retryEditorSave(new client.EditorRequestError(status,'EDITOR_CONFLICT')),false);
    for(const status of [429,500,503]) assert.equal(client.retryEditorSave(new client.EditorRequestError(status,'')),true);
  }finally{globalThis.fetch=original;}
});
