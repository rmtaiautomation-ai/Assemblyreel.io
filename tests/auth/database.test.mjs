import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const anonymous = "10000000-0000-4000-8000-000000000003";

test("actual migrations quarantine legacy grants/RPCs/storage and provision private zero-credit identities", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,raw_user_meta_data jsonb);
      create table public.users(id uuid primary key references auth.users(id),email text unique not null,credits integer not null default 100,created_at timestamptz default now());
      create table public.workspaces(id uuid primary key,user_id uuid,name text);
      create view public.legacy_view as select name from public.workspaces;
      create function public.legacy_rpc() returns text language sql security definer as $$ select 'private content' $$;
      grant usage on schema public,storage to public;
      grant select on public.workspaces to public;
      grant select(name) on public.workspaces to anon;
      grant select on public.legacy_view to authenticated;
      grant update(credits) on public.users to authenticated;
      create table storage.buckets(id text primary key,public boolean);
      create table storage.objects(id uuid,bucket_id text);
      grant select,insert on storage.objects to anon,authenticated;
      alter table storage.objects enable row level security;
      create policy old_permissive on storage.objects for all to public using(true) with check(true);
      insert into storage.buckets values('project-media',true),('renders',false);
      insert into storage.objects values('${owner}','project-media');
      insert into auth.users(id,email) values('${owner}','owner@example.com');
      insert into public.users(id,email,credits) values('${owner}','owner@example.com',17);
      insert into workspaces values('${owner}',null,'preserve me');
    `);
    const containment = await readFile(new URL("../../db/auth/001-auth-only-containment.sql", import.meta.url), "utf8");
    const identities = await readFile(new URL("../../db/auth/002-account-identities-and-leads.sql", import.meta.url), "utf8");
    await db.exec(containment);
    await db.exec(identities);
    await db.exec(identities); // Reapplying is safe and does not reset existing data.
    assert.equal((await db.query("select credits from public.users where id=$1", [owner])).rows[0].credits, 17);
    assert.equal((await db.query("select count(*)::int as n from public.workspaces")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from storage.buckets where public")).rows[0].n, 0);
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [other, "other@example.com", { credits: 99999, tier: "enterprise" }]);
    await db.query("insert into auth.users(id,email,is_anonymous) values($1,$2,true)", [anonymous, "anon@example.com"]);
    assert.equal((await db.query("select credits from users where id=$1", [other])).rows[0].credits, 0);
    assert.equal((await db.query("select count(*)::int as n from users where id=$1", [anonymous])).rows[0].n, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    assert.deepEqual((await db.query("select id,email from public.users")).rows, [{ id: owner, email: "owner@example.com" }]);
    for (const sql of ["select * from public.workspaces", "select * from public.legacy_view", "select public.legacy_rpc()", "update public.users set credits=999", "select credits from public.users", "select * from marketing_leads", "select record_marketing_lead('{}')"]) {
      await assert.rejects(db.query(sql), /permission denied/);
    }
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(db.query(`insert into storage.objects values('${other}','project-media')`), /row-level security/);
    await db.query("select set_config('request.jwt.claims','{\"is_anonymous\":true}',false)");
    assert.equal((await db.query("select id,email from users")).rows.length, 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select id,email from public.users"), /permission denied/);
    await assert.rejects(db.query("select public.legacy_rpc()"), /permission denied/);
    await db.exec("reset role; set role service_role");
    const payload = { email: "lead@example.com", requestType: "demo", videoLength: "10-20m", updatesConsent: true };
    await db.query("select public.record_marketing_lead($1)", [payload]);
    await assert.rejects(db.query("select public.record_marketing_lead($1)", [payload]), /LEAD_RATE_LIMIT/);
    await db.exec("reset role");
    const lead = (await db.query("select email,updates_consent,consent_version from marketing_leads")).rows[0];
    assert.deepEqual(lead, { email: "lead@example.com", updates_consent: true, consent_version: "2026-10-12" });
    // Provisioning conflicts fail the auth insert atomically; do not silently attach an identity.
    await assert.rejects(db.query("insert into auth.users(id,email) values($1,$2)", ["10000000-0000-4000-8000-000000000004", "owner@example.com"]), /duplicate key/);
    assert.equal((await db.query("select count(*)::int as n from auth.users")).rows[0].n, 3);
  } finally { await db.close(); }
});
