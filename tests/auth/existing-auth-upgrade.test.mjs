import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createExistingAuthBundle,parsePreflightCSV } from "../../scripts/auth/existing-account-bundle.mjs";

const tables=["users","workspaces","video_projects","scenes","media","timeline_items","overlay_clips","act_narrations","channel_facts"];
const a="10000000-0000-4000-8000-000000000001",b="10000000-0000-4000-8000-000000000002";
const reportSQL=await readFile(new URL("../../db/auth/existing-project/preflight.sql",import.meta.url),"utf8");
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth,public,storage to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,email_confirmed_at timestamptz);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,bucket_id text);
    alter table storage.objects enable row level security;
    create policy old_storage_public on storage.objects for all using(true) with check(true);
    grant all on storage.objects to anon,authenticated;
    create table users(id uuid primary key,email text unique not null,credits integer not null default 100,created_at timestamptz default now());
    create table workspaces(id uuid primary key,user_id uuid,name text);
    create table video_projects(id uuid primary key,workspace_id uuid,topic text);
    create table scenes(id uuid primary key,project_id text,content text);
    create table media(id uuid primary key,project_id uuid);
    create table timeline_items(id uuid primary key,project_id uuid);
    create table overlay_clips(id uuid primary key,project_id uuid);
    create table act_narrations(id uuid primary key,project_id uuid);
    create table channel_facts(id uuid primary key,workspace_id uuid);
    grant all on all tables in schema public to anon,authenticated,service_role;
    create function public.handle_new_user() returns trigger language plpgsql security definer as $$begin insert into public.users(id,email) values(new.id,new.email);return new;end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
    insert into workspaces values('${a}',null,'Preserve me');
    insert into video_projects values('${a}','${a}','Existing private project');
    insert into scenes values('${a}','${b}','Orphan scene content');
    insert into media values('${a}','${a}');
    insert into storage.buckets values('project-media','project-media',true,524288000,null);
    insert into storage.objects values('${a}','project-media');`);
  const report=(await db.query(reportSQL)).rows[0].account_access_preflight;
  const backup={complete:true,completedAt:"2026-10-13T00:00:00Z",projectRef:"fixture",tables:[]};
  for(const name of tables)backup.tables.push({name,rows:(await db.query(`select count(*)::int n from public.${name}`)).rows[0].n});
  return {db,report,backup};
}

test("existing auth upgrade preserves legacy rows/types/private copies and provisions isolated zero-credit accounts",async()=>{
  const {db,report,backup}=await fixture();
  try {
    const sql=await createExistingAuthBundle(report,backup,"a".repeat(64));
    await db.exec(sql);
    assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='account_access_backup_20261013' and c.relkind='r'")).rows[0].n,12);
    assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='account_access_backup_20261013' and c.relkind='r' and not c.relrowsecurity")).rows[0].n,0);
    assert.deepEqual((await db.query("select * from public.scenes")).rows,[{id:a,project_id:b,content:"Orphan scene content"}]);
    assert.deepEqual((await db.query("select * from account_access_backup_20261013.scenes")).rows,[{id:a,project_id:b,content:"Orphan scene content"}]);
    assert.equal((await db.query("select user_id from public.workspaces")).rows[0].user_id,null);
    assert.equal((await db.query("select data_type from information_schema.columns where table_name='scenes' and table_schema='public' and column_name='project_id'")).rows[0].data_type,"text");
    assert.equal((await db.query("select public from storage.buckets")).rows[0].public,false);
    assert.equal((await db.query("select count(*)::int n from storage.objects")).rows[0].n,1);
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.com',now()),($2,'b@example.com',now())",[a,b]);
    assert.deepEqual((await db.query("select credits from public.users order by id")).rows,[{credits:0},{credits:0}]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec("set role authenticated");
    assert.deepEqual((await db.query("select id,email from public.users")).rows,[{id:a,email:"a@example.com"}]);
    for(const query of ["select * from workspaces","select credits from users","update users set credits=99","select * from account_access_backup_20261013.scenes"])await assert.rejects(db.query(query),/permission denied/);
    assert.equal((await db.query("select count(*)::int n from storage.objects")).rows[0].n,0);
    await db.exec("reset role;set role anon");await assert.rejects(db.query("select id,email from public.users"),/permission denied/);
    await db.exec("reset role;set role service_role");await assert.rejects(db.query("select * from account_access_backup_20261013.scenes"),/permission denied/);
    await db.exec("reset role");
    const isolation=await readFile(new URL("../../db/auth/existing-project/test-auth-isolation.sql",import.meta.url),"utf8");
    await db.exec(isolation);
    assert.equal((await db.query("select count(*)::int n from auth.users")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int n from public.users")).rows[0].n,2);
  } finally {await db.close();}
});

test("existing auth upgrade refuses drift and rolls back partial permission changes",async()=>{
  const {db,report,backup}=await fixture();
  try {
    const sql=await createExistingAuthBundle(report,backup,"a".repeat(64));
    await db.exec("alter table scenes add column unexpected text");
    await assert.rejects(db.exec(sql),/SCHEMA_DRIFT/);await db.exec("rollback");
    assert.equal((await db.query("select to_regnamespace('account_access_backup_20261013') as name")).rows[0].name,null);
    await db.exec("alter table scenes drop column unexpected");
    const failing=sql.replace(/commit;\s*$/,()=>"do $$begin raise exception 'SIMULATED_FAILURE';end $$;commit;");
    await assert.rejects(db.exec(failing),/SIMULATED_FAILURE/);await db.exec("rollback");
    assert.equal((await db.query("select public from storage.buckets")).rows[0].public,true);
    assert.equal((await db.query("select to_regclass('public.marketing_leads') as name")).rows[0].name,null);
    assert.equal((await db.query("select has_table_privilege('anon','public.scenes','SELECT') as allowed")).rows[0].allowed,true);
    const missingRLS=sql.replace("-- Read-only checks within the upgrade transaction; raises rather than commits drift.",
      "alter table account_access_backup_20261013.metadata disable row level security;\n-- Verify deliberately broken fixture.");
    await assert.rejects(db.exec(missingRLS),/BACKUP_RLS_REQUIRED/);await db.exec("rollback");
    assert.equal((await db.query("select to_regnamespace('account_access_backup_20261013') as name")).rows[0].name,null);
    await assert.rejects(createExistingAuthBundle(report,{...backup,complete:false},"a".repeat(64)),/completed backup/);
  } finally {await db.close();}
});

test("single-column CSV export is parsed without interpreting metadata as instructions",()=>{
  const report={counts:{auth_users:0},columns:[{column_default:"'A \"quoted\" value'::text"}]};
  const csv='account_access_preflight\r\n"'+JSON.stringify(report).replaceAll('"','""')+'"\r\n';
  assert.deepEqual(parsePreflightCSV(csv),report);
  assert.throws(()=>parsePreflightCSV("wrong_header\n{}"),/header/);
});
