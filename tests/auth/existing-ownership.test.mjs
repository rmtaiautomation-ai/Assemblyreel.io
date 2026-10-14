import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fixture } from './fixtures/owned-database.mjs';
import { createOwnershipBundle, parseOwnershipCatalog } from '../../scripts/auth/existing-ownership-bundle.mjs';

const migration = await readFile(new URL('../../db/auth/existing-project/004-owned-records-text-projects.sql',import.meta.url),'utf8');
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const unknown='20000000-0000-4000-8000-000000000001',legacyProject='30000000-0000-4000-8000-000000000001';
const id = n => `90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function actor(db,user,anonymous=false) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,is_anonymous:anonymous})]);
  await db.exec('set role authenticated');
}
const workspace = (db,operation,payload={name:'Test',content_theme:'History'}) => db.query('select public.create_owned_workspace($1,$2) id',[payload,operation]);
const project = (db,operation,parent,topic='Manual topic') => db.query('select public.create_owned_project($1,$2) id',[{workspace_id:parent,topic},operation]);

test('text-reference migration preserves all legacy values and quarantines unknown/orphan rows',async () => {
  const db = await fixture();
  try {
    const before = (await db.query('select * from public.scenes order by id')).rows;
    await db.exec(migration);
    const after = (await db.query('select id,project_id,media_id,content from public.scenes order by id')).rows;
    assert.deepEqual(after,before);
    assert.equal((await db.query('select user_id from public.workspaces where id=$1',[unknown])).rows[0].user_id,null);
    assert.equal((await db.query("select data_type from information_schema.columns where table_name='scenes' and column_name='project_id'")).rows[0].data_type,'text');
    assert.equal((await db.query('select account_project_id from public.scenes where id=$1',[id(3)])).rows[0].account_project_id,null);
    await actor(db,a);
    for (const table of ['workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts']) {
      assert.equal((await db.query(`select count(*)::integer n from public.${table}`)).rows[0].n,0);
    }
    await assert.rejects(workspace(db,unknown),/OPERATION_REUSED/);
    await assert.rejects(project(db,id(10),unknown),/RESOURCE_UNAVAILABLE/);
    await assert.rejects(db.query('update public.workspaces set user_id=$1',[a]),/permission denied/);
    await assert.rejects(db.query('select credits from public.users'),/permission denied/);
    await assert.rejects(db.query('select * from public.marketing_leads'),/permission denied/);
    assert.equal((await db.query('select count(*)::integer n from storage.objects')).rows[0].n,0);
  } finally { await db.close(); }
});

test('owned RPCs derive actor, validate inputs, enforce limits and reject cross-account access',async () => {
  const db = await fixture();
  try {
    await db.exec(migration);await actor(db,a);
    for (const payload of [null,{},[],{name:null,content_theme:'x'},{name:'x',content_theme:'y',user_id:b},
      {name:'x',content_theme:'y',linked_accounts:null},{name:'x',content_theme:'y',aspect_ratio:null}]) {
      await assert.rejects(workspace(db,id(10),payload),/INVALID/);
    }
    assert.equal((await workspace(db,id(10))).rows[0].id,id(10));
    assert.equal((await workspace(db,id(10))).rows[0].id,id(10));
    await assert.rejects(workspace(db,id(10),{name:'Changed',content_theme:'History'}),/OPERATION_REUSED/);
    assert.equal((await project(db,id(11),id(10))).rows[0].id,id(11));
    assert.equal((await project(db,id(11),id(10))).rows[0].id,id(11));
    await db.query("select public.rename_owned_resource('project',$1,'Renamed')",[id(11)]);
    await actor(db,b);
    assert.equal((await db.query('select count(*)::integer n from public.video_projects')).rows[0].n,0);
    await assert.rejects(project(db,id(12),id(10)),/RESOURCE_UNAVAILABLE/);
    await assert.rejects(db.query("select public.rename_owned_resource('project',$1,'Forged')",[id(11)]),/RESOURCE_UNAVAILABLE/);
    await assert.rejects(workspace(db,id(10)),/OPERATION_REUSED/);
    await workspace(db,id(13));await project(db,id(14),id(13));
    await actor(db,a);
    assert.equal((await db.query('select topic from public.video_projects')).rows[0].topic,'Renamed');
    await workspace(db,id(15));await workspace(db,id(16));
    await assert.rejects(workspace(db,id(17)),/TEST_WORKSPACE_LIMIT/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::integer n from public.workspaces where user_id=$1',[a])).rows[0].n,3);
    assert.equal((await db.query('select count(*)::integer n from public.account_workspace_operations where actor_id=$1',[a])).rows[0].n,3);
  } finally { await db.close(); }
});

test('new scene references enforce canonical project and same-project media even for privileged writes',async () => {
  const db = await fixture();
  try {
    await db.exec(migration);await actor(db,a);await workspace(db,id(10));await project(db,id(11),id(10));await project(db,id(12),id(10));
    await db.exec('reset role');
    await db.query('insert into public.media values($1,$2,$3)',[id(13),id(12),'video']);
    await assert.rejects(db.query('insert into public.scenes(id,project_id,media_id) values($1,$2,$3)',[id(14),id(11),id(13)]),/scenes_media_same_project/);
    await assert.rejects(db.query('insert into public.scenes(id,project_id) values($1,$2)',[id(14),'malformed']),/scenes_account_project_required/);
    await assert.rejects(db.query('insert into public.scenes(id,project_id) values($1,$2)',[id(14),id(99)]),/scenes_account_project_fk/);
    await assert.rejects(db.query('insert into public.scenes(id,project_id,account_project_id) values($1,$2,$3)',[id(14),id(11),id(12)]),error => error.code==='428C9');
    await db.query('insert into public.scenes(id,project_id,media_id) values($1,$2,$3)',[id(14),id(12),id(13)]);
    await actor(db,a);
    assert.equal((await db.query('select id from public.scenes')).rows[0].id,id(14));
    await actor(db,b);
    assert.equal((await db.query('select count(*)::integer n from public.scenes')).rows[0].n,0);
  } finally { await db.close(); }
});

test('unconfirmed, banned, anonymous and signed-out actors cannot read or invoke owned mutations',async () => {
  const db = await fixture();
  try {
    await db.exec(migration);await actor(db,a);await workspace(db,id(10));
    for (const change of ["email_confirmed_at=null","email_confirmed_at=now(),banned_until=now()+interval '1 hour'","banned_until=null,is_anonymous=true"]) {
      await db.exec('reset role');await db.exec(`update auth.users set ${change} where id='${a}'`);await actor(db,a);
      assert.equal((await db.query('select count(*)::integer n from public.workspaces')).rows[0].n,0);
      await assert.rejects(workspace(db,id(11)),/AUTH_REQUIRED/);
    }
    await db.exec(`reset role;update auth.users set is_anonymous=false where id='${a}'`);await actor(db,a,true);
    await assert.rejects(workspace(db,id(11)),/AUTH_REQUIRED/);
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select * from public.workspaces'),/permission denied/);
    await assert.rejects(workspace(db,id(11)),/permission denied/);
  } finally { await db.close(); }
});

test('partial migration failure and replay leave no partially enabled ownership',async () => {
  const db = await fixture();
  try {
    const broken = migration.replace(/commit;\s*$/, () => "do $$begin raise exception 'SIMULATED_FAILURE';end $$;commit;");
    await assert.rejects(db.exec(broken),/SIMULATED_FAILURE/);await db.exec('rollback');
    assert.equal((await db.query("select to_regclass('public.account_workspace_operations') value")).rows[0].value,null);
    assert.equal((await db.query("select count(*)::integer n from information_schema.columns where table_name='scenes' and column_name='account_project_id'")).rows[0].n,0);
    await actor(db,a);await assert.rejects(db.query('select * from public.workspaces'),/permission denied/);await db.exec('reset role');
    await db.exec(migration);
    await assert.rejects(db.exec(migration),/OWNERSHIP_ALREADY_STARTED/);await db.exec('rollback');
  } finally { await db.close(); }
});

test('restrictive ownership survives permissive policy additions and rejects reparenting',async () => {
  const db=await fixture();
  try {
    await db.exec(migration);await actor(db,a);await workspace(db,id(10));await project(db,id(11),id(10));
    await actor(db,b);await workspace(db,id(12));await project(db,id(13),id(12));
    await db.exec(`reset role;grant all on public.workspaces,public.video_projects to authenticated;
      create policy future_allow_all on public.workspaces for all to authenticated using(true) with check(true);
      create policy future_allow_all on public.video_projects for all to authenticated using(true) with check(true);`);
    await actor(db,b);
    assert.equal((await db.query('select id from public.workspaces')).rows[0].id,id(12));
    assert.equal((await db.query('update public.video_projects set topic=$1 where id=$2 returning id',['Forged',id(11)])).rows.length,0);
    assert.equal((await db.query('delete from public.workspaces where id=$1 returning id',[id(10)])).rows.length,0);
    await assert.rejects(db.query('update public.video_projects set workspace_id=$1 where id=$2',[id(10),id(13)]),/row-level security/);
    await assert.rejects(db.query('update public.workspaces set user_id=$1 where id=$2',[a,id(12)]),/row-level security/);
    await assert.rejects(db.query('insert into public.workspaces(id,user_id,name,content_theme) values($1,$2,$3,$4)',[id(99),a,'Forged','Theme']),/row-level security/);
  } finally {await db.close();}
});

test('recorded legitimate legacy ownership and existing content remain accessible only to that owner',async () => {
  const db=await fixture();
  try {
    await db.query('insert into public.workspaces(id,user_id,name,content_theme) values($1,$2,$3,$4)',[id(80),a,'Existing owned','Preserve']);
    await db.query('insert into public.video_projects values($1,$2,$3,$4)',[id(81),id(80),'Existing topic','Drafting']);
    await db.query('insert into public.scenes(id,project_id,content) values($1,$2,$3)',[id(82),id(81),'Existing private content']);
    await db.exec(migration);await actor(db,a);
    assert.equal((await db.query('select name from public.workspaces')).rows[0].name,'Existing owned');
    assert.equal((await db.query('select content from public.scenes')).rows[0].content,'Existing private content');
    await actor(db,b);
    assert.equal((await db.query('select count(*)::integer n from public.scenes')).rows[0].n,0);
    await db.exec('reset role');
    assert.equal((await db.query('select user_id from public.workspaces where id=$1',[id(80)])).rows[0].user_id,a);
  } finally {await db.close();}
});

test('direct project creation quota and rename rate limits are enforced inside RPCs',async () => {
  const db=await fixture();
  try {
    await db.exec(migration);await actor(db,a);await workspace(db,id(10));
    for(let n=20;n<30;n++) {
      await db.exec('reset role;delete from public.account_request_limits');await actor(db,a);
      await project(db,id(n),id(10));
    }
    await assert.rejects(project(db,id(30),id(10)),/TEST_PROJECT_LIMIT/);
    for(let n=0;n<30;n++)await db.query("select public.rename_owned_resource('workspace',$1,$2)",[id(10),`Name ${n}`]);
    await assert.rejects(db.query("select public.rename_owned_resource('workspace',$1,'Too many')",[id(10)]),/REQUEST_RATE_LIMIT/);
  } finally {await db.close();}
});

test('generated release stops schema and same-count data drift before any backup or permission mutation',async () => {
  const db=await fixture();
  try {
    await db.exec('drop function public.admit_account_request(text);drop table public.account_request_limits');
    const catalogSQL=await readFile(new URL('../../db/auth/existing-project/ownership-catalog.sql',import.meta.url),'utf8');
    const results=await db.exec(catalogSQL);
    const catalog=results.flatMap(result=>result.rows).find(row=>row.ownership_catalog).ownership_catalog;
    const names=catalog.relations.filter(relation=>relation.schema==='public').map(relation=>relation.relname);
    const tables={};for(const name of names)tables[name]=(await db.query(`select to_jsonb(t) row from public.${name} t order by id`)).rows.map(result=>result.row);
    const manifest={complete:true,projectRef:'qgghjpfnbcktctbakuam',completedAt:'2026-10-14T00:00:00Z',tables:names.map(name=>({name,rows:tables[name].length}))};
    const sql=await createOwnershipBundle(catalog,manifest,tables,'a'.repeat(64));
    assert.ok(Buffer.byteLength(sql,'utf8')<64_000,'Migration should fit a small SQL Editor request');
    assert.ok(!sql.includes('Old scene'),'Migration must contain fingerprints rather than backed-up scene bodies');
    await db.exec('alter table public.scenes add column unexpected text');
    await assert.rejects(db.exec(sql),/OWNERSHIP_CATALOG_DRIFT: columns/);await db.exec('rollback');
    assert.equal((await db.query("select to_regnamespace('account_ownership_backup_20261014') value")).rows[0].value,null);
    await db.exec("alter table public.scenes drop column unexpected;update public.scenes set content='Same count, changed value';set timezone='Asia/Manila'");
    await assert.rejects(db.exec(sql),/OWNERSHIP_DATA_DRIFT: scenes/);await db.exec('rollback');
    assert.equal((await db.query("select to_regclass('public.account_request_limits') value")).rows[0].value,null);
    await assert.rejects(createOwnershipBundle(catalog,{...manifest,complete:false},tables,'a'.repeat(64)),/Complete reviewed backup/);
    const csv=`"ownership_catalog"\n"${JSON.stringify(catalog).replaceAll('"','""')}"\n`;
    assert.deepEqual(parseOwnershipCatalog(csv),catalog);
    assert.throws(()=>parseOwnershipCatalog('unexpected\n"{}"'),/Unexpected catalog/);
  } finally {await db.close();}
});
