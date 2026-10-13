import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const query = await readFile(new URL("../../db/auth/existing-project/preflight.sql", import.meta.url), "utf8");

test("existing-project preflight reads mixed UUID/text keys and malformed legacy references without changing data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;create schema storage;
      create table auth.users(id uuid);
      create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.users(id uuid);
      create table public.workspaces(id uuid,user_id text);
      create table public.video_projects(id uuid,workspace_id text);
      create table public.scenes(id integer,project_id text);
      create table public.media(id integer,project_id text);
      insert into public.users values('aaaaaaaa-0000-4000-8000-000000000001');
      insert into public.workspaces values
        ('bbbbbbbb-0000-4000-8000-000000000001',' AAAAAAAA-0000-4000-8000-000000000001 '),
        ('bbbbbbbb-0000-4000-8000-000000000002','legacy-user'),
        ('bbbbbbbb-0000-4000-8000-000000000003',null);
      insert into public.video_projects values
        ('cccccccc-0000-4000-8000-000000000001','BBBBBBBB-0000-4000-8000-000000000001'),
        ('cccccccc-0000-4000-8000-000000000002','missing-workspace');
      insert into public.scenes values(1,'CCCCCCCC-0000-4000-8000-000000000001'),(2,'manual-project'),(3,null);
      insert into public.media values(1,'cccccccc-0000-4000-8000-000000000001'),
        (2,'cccccccc-0000-4000-8000-000000000003'),(3,'malformed');
    `);
    const before = (await db.query("select * from public.scenes order by id")).rows;
    await db.exec("begin read only");
    const result = await db.query(query);
    await db.exec("commit");
    assert.equal(result.rows.length, 1);
    const report = result.rows[0].account_access_preflight;
    assert.deepEqual(report.counts, {
      auth_users: 0, profiles: 1, workspaces: 3, ownerless_workspaces: 1,
      workspaces_missing_profile: 1, projects: 2, orphan_projects: 1,
      scenes: 3, orphan_scenes: 2, non_uuid_scene_project_references: 1,
      media: 3, orphan_media: 2, non_uuid_media_project_references: 1, public_buckets: 0,
    });
    assert.equal(report.columns.find(column => column.table_name === "scenes" && column.column_name === "project_id").data_type, "text");
    assert.deepEqual((await db.query("select * from public.scenes order by id")).rows, before);
  } finally { await db.close(); }
});
