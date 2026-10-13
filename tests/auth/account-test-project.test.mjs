import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAccountTestBundle } from "../../scripts/auth/account-test-bundle.mjs";

async function emptySupabaseFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,bucket_id text);
    grant usage on schema public,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  return db;
}

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const settings = { workspaceId: null, name: "A workspace", content_theme: "History",
  visual_aesthetic: "Cinematic", aspect_ratio: "Horizontal 16:9", video_language: "English",
  duration_pref: "60-90s", topic: "A test topic" };

test("fresh account test bundle installs atomic security, zero-credit provisioning and isolated resumable setup", async () => {
  const db = await emptySupabaseFixture();
  try {
    await db.exec(await createAccountTestBundle());
    // Actual signup trigger and RPCs; auth schema is a fixture, not a real email service.
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.com',now()),($2,'b@example.com',now())", [a,b]);
    assert.deepEqual((await db.query("select credits from public.users order by id")).rows, [{ credits: 0 }, { credits: 0 }]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec("set role authenticated");
    assert.deepEqual((await db.query("select id,email from public.users")).rows, [{ id: a, email: "a@example.com" }]);
    await db.query("select public.save_account_onboarding(0,$1)", [settings]);
    const first = (await db.query("select public.complete_account_onboarding(1) as result")).rows[0].result;
    assert.deepEqual((await db.query("select public.complete_account_onboarding(1) as result")).rows[0].result, first);
    assert.equal((await db.query("select count(*)::int n from public.workspaces")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from public.video_projects")).rows[0].n, 1);
    await assert.rejects(db.query("update public.users set credits=100"), /permission denied/);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select count(*)::int n from public.account_onboarding")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.video_projects")).rows[0].n, 0);
    await assert.rejects(db.query("select public.save_account_onboarding(0,$1)", [{...settings,workspaceId:first.workspace_id}]), /RESOURCE_UNAVAILABLE/);
    await db.query("select public.save_account_onboarding(0,$1)", [{...settings,name:"B workspace"}]);
    const second = (await db.query("select public.complete_account_onboarding(1) as result")).rows[0].result;
    assert.notEqual(second.project_id, first.project_id);
    assert.equal((await db.query("select count(*)::int n from public.video_projects")).rows[0].n, 1);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select id,email from public.users"), /permission denied/);
    await assert.rejects(db.query("select public.complete_account_onboarding(1)"), /permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int n from storage.buckets where public")).rows[0].n, 0);
    assert.equal((await db.query("select to_regclass('public.billing_subscriptions') as table_name")).rows[0].table_name, null);
  } finally { await db.close(); }
});

test("fresh bootstrap refuses existing tables/accounts and failed setup rolls back rather than partially activating", async () => {
  for (const occupied of ["create table public.existing_content(id int);insert into public.existing_content values(17)",
    `insert into auth.users(id,email) values('${a}','existing@example.com')`]) {
    const db = await emptySupabaseFixture();
    try {
      await db.exec(occupied);
      await assert.rejects(db.exec(await createAccountTestBundle()), /EMPTY_TEST_PROJECT_REQUIRED/);
      await db.exec("rollback");
      assert.equal((await db.query("select to_regclass('public.workspaces') as table_name")).rows[0].table_name, null);
      if (occupied.startsWith("create table")) assert.deepEqual((await db.query("select * from public.existing_content")).rows, [{id:17}]);
      else assert.equal((await db.query("select count(*)::int n from auth.users")).rows[0].n, 1);
    } finally { await db.close(); }
  }
  const db = await emptySupabaseFixture();
  try {
    const sql = (await createAccountTestBundle()).replace(/commit;\s*$/, () => "do $$begin raise exception 'SIMULATED_FAILURE';end $$;\ncommit;");
    await assert.rejects(db.exec(sql), /SIMULATED_FAILURE/);
    await db.exec("rollback");
    assert.equal((await db.query("select to_regclass('public.users') as table_name")).rows[0].table_name, null);
    assert.equal((await db.query("select count(*)::int n from storage.buckets")).rows[0].n, 0);
  } finally { await db.close(); }
});
