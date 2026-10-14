import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertReadOnlyRequest, exportRows, verifyFiles } from '../../scripts/auth/backup-ownership.mjs';
import { auditOwnership } from '../../scripts/auth/ownership-audit.mjs';

test('backup network guard rejects mutations, RPCs and foreign destinations', () => {
  const origin = 'https://reviewed.supabase.co';
  assertReadOnlyRequest(`${origin}/rest/v1/scenes`, 'GET', origin);
  assertReadOnlyRequest(`${origin}/storage/v1/object/list/project-media`, 'POST', origin);
  for (const [url,method] of [[`${origin}/rest/v1/scenes`,'POST'],[`${origin}/rest/v1/rpc/assign_owner`,'POST'],
    [`${origin}/rest/v1/rpc/assign_owner`,'GET'],[`${origin}/auth/v1/admin/users/id`,'PUT'],[`${origin}/storage/v1/object/project-media/key`,'DELETE'],
    ['https://foreign.example/rest/v1/scenes','GET']]) {
    assert.throws(() => assertReadOnlyRequest(url,method,origin));
  }
});

function rowClient(pages) {
  return {from() { return {select() { return {order() { return {range() { return Promise.resolve(pages.shift()); } }; } }; } }; }};
}

test('row export rejects changing counts, missing rows and duplicate IDs', async () => {
  const first = Array.from({length:500},(_,i) => ({id:i}));
  await assert.rejects(exportRows(rowClient([{data:first,count:501},{data:[{id:500}],count:502}]),'scenes'),/count changed/);
  await assert.rejects(exportRows(rowClient([{data:[{id:1}],count:2}]),'scenes'),/Incomplete/);
  await assert.rejects(exportRows(rowClient([{data:[{id:1},{id:1}],count:2}]),'scenes'),/duplicate/);
  assert.equal((await exportRows(rowClient([{data:first,count:501},{data:[{id:500}],count:501}]),'scenes')).length,501);
});

test('saved backup verification rejects tampering and path traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(),'ownership-backup-test-'));
  try {
    const bytes = Buffer.from('[{"id":1}]');
    const item = {file:'scenes.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    await writeFile(join(directory,item.file),bytes);
    await verifyFiles(directory,[item]);
    await writeFile(join(directory,item.file),'[{"id":2}]');
    await assert.rejects(verifyFiles(directory,[item]),/integrity/);
    await assert.rejects(verifyFiles(directory,[{...item,file:'../scenes.json'}]),/file path/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('ownership audit preserves unassigned owners and detects mixed-type orphan and media links', () => {
  const id = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const tables = {
    users:[{id:id(1),email:'private@example.test'}],
    workspaces:[{id:id(2),user_id:null}],
    video_projects:[{id:id(3),workspace_id:id(2)},{id:id(4),workspace_id:id(2)}],
    scenes:[{id:id(5),project_id:` ${id(3).toUpperCase()} `,media_id:id(7)},
      {id:id(6),project_id:'malformed',media_id:null}],
    media:[{id:id(7),project_id:id(4),storage_path:'audio/test.wav',url:'/audio/test.wav'}],
    timeline_items:[],overlay_clips:[],act_narrations:[],channel_facts:[],marketing_leads:[],
  };
  const before = JSON.stringify(tables);
  const result = auditOwnership(tables,[{id:id(1),email:'private@example.test',email_confirmed_at:'now'}],[{bucket:'project-media',name:'audio/test.wav'}],{
    host:'reviewed.supabase.co',definitions:{scenes:{properties:{project_id:{format:'text'}}},video_projects:{properties:{id:{format:'uuid'}}}},
  });
  assert.equal(result.issues.ownerless_workspaces,1);
  assert.equal(result.issues.orphan_scenes,1);
  assert.equal(result.issues.malformed_scenes_project_id,1);
  assert.equal(result.issues.noncanonical_scenes_project_id,1);
  assert.equal(result.issues.scenes_cross_project_media,1);
  assert.equal(result.ownershipMapping[0].currentOwnerId,null);
  assert.equal(result.ownershipMapping[0].disposition,'quarantined_pending_explicit_owner');
  assert.equal(result.storageReferenceSummary.storagePathsMatched,1);
  assert.equal(result.storageReferenceSummary.localPathsWithStorageMatch,1);
  assert.equal(result.storageReferenceSummary.objectsWithoutRecognizedUrlReference,0);
  assert.equal(JSON.stringify(tables),before);
});

test('fresh catalog query executes inside a read-only transaction and captures actual text schema', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create schema storage;
      create table auth.users(id uuid); create table public.users(id uuid);
      create table public.scenes(id uuid primary key,project_id text);
      create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into public.scenes values('aaaaaaaa-0000-4000-8000-000000000001','malformed');`);
    const query = await readFile(new URL('../../db/auth/existing-project/ownership-catalog.sql',import.meta.url),'utf8');
    const results = await db.exec(query);
    const catalog = results.flatMap(result => result.rows).find(row => row.ownership_catalog)?.ownership_catalog;
    assert.equal(catalog.columns.find(column => column.table_name === 'scenes' && column.column_name === 'project_id').data_type,'text');
    assert.ok(catalog.indexes.some(item => item.indexname === 'scenes_pkey'));
    assert.equal((await db.query('select count(*)::integer as count from public.scenes')).rows[0].count,1);
    assert.match(query,/repeatable read read only/);
  } finally { await db.close(); }
});
