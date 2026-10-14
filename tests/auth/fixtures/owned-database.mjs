import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const unknown='20000000-0000-4000-8000-000000000001',legacyProject='30000000-0000-4000-8000-000000000001';
const id = n => `90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

export async function fixture() {
  const db = new PGlite();
  await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;create schema account_access_backup_20261013;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,email_confirmed_at timestamptz,banned_until timestamptz);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);
    create table public.workspaces(id uuid primary key,user_id uuid,name text not null,content_theme text not null,
      linked_accounts jsonb,narration_voice_id text,visual_aesthetic text,aspect_ratio text,video_language text,duration_pref text);
    create table public.video_projects(id uuid primary key,workspace_id uuid,topic text,status text default 'Drafting');
    create table public.media(id uuid primary key,project_id uuid,media_type text);
    create table public.scenes(id uuid primary key,project_id text,media_id uuid,content text);
    create table public.timeline_items(id uuid primary key,project_id uuid,media_id uuid);
    create table public.overlay_clips(id uuid primary key,project_id uuid);
    create table public.act_narrations(id uuid primary key,project_id uuid);
    create table public.channel_facts(id uuid primary key,workspace_id uuid);
    grant usage on schema auth,storage,public to anon,authenticated,service_role;
    grant select on storage.objects to anon,authenticated;
    insert into public.workspaces values('${unknown}',null,'Unknown legacy owner','Preserve',null,null,null,null,null,null);
    insert into public.video_projects values('${legacyProject}','${unknown}','Legacy topic','Drafting');
    insert into public.scenes values('${id(1)}','${legacyProject}',null,'Old scene'),('${id(2)}','${id(99)}',null,'Orphan'),('${id(3)}','malformed',null,'Malformed');
    insert into storage.buckets values('project-media','project-media',false,null,null);
    insert into storage.objects values('${id(1)}','project-media');
    create policy legacy_allow_all on public.act_narrations for all using(true) with check(true);`);
  for (const file of ['001-auth-only-containment.sql','002-account-identities-and-leads.sql','003-confirmed-email-sync.sql','006-account-request-limits.sql']) {
    await db.exec(await readFile(new URL(`../../../db/auth/${file}`,import.meta.url),'utf8'));
  }
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.invalid',now()),($2,'b@example.invalid',now())",[a,b]);
  return db;
}
