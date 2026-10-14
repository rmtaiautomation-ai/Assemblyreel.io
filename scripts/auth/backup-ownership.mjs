import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditOwnership } from './ownership-audit.mjs';

const tableNames = ['users','workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts','marketing_leads'];
const expectedBuckets = ['character-references','project-media','renders'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value));

export async function exportRows(client, table) {
  const rows = [];
  let expected = null;
  for (let offset = 0; offset <= 100_000; offset += 500) {
    const page = await client.from(table).select('*',{count:'exact'}).order('id').range(offset,offset+499);
    if (page.error || !Number.isSafeInteger(page.count) || (expected !== null && expected !== page.count)) {
      throw new Error(`Row export failed or count changed: ${table}`);
    }
    expected = page.count;
    rows.push(...page.data);
    if (page.data.length < 500) {
      if (rows.length !== expected || new Set(rows.map(row => row.id)).size !== rows.length) {
        throw new Error(`Incomplete or duplicate row export: ${table}`);
      }
      return rows;
    }
  }
  throw new Error(`Row export exceeded bounds: ${table}`);
}

export function assertReadOnlyRequest(url, method, origin) {
  const parsed = new URL(url);
  if (parsed.origin !== origin || parsed.pathname.startsWith('/rest/v1/rpc/') || !(method === 'GET' ||
      (method === 'POST' && /^\/storage\/v1\/object\/list\/[a-z-]+$/.test(parsed.pathname)))) {
    throw new Error('Backup permits only project reads and Storage listing requests.');
  }
}

async function authInventory(client) {
  const users = [];
  for (let page = 1; page <= 100; page++) {
    const result = await client.auth.admin.listUsers({page,perPage:100});
    if (result.error) throw new Error('Auth inventory read failed.');
    users.push(...result.data.users.map(user => ({
      id:user.id,email:user.email ?? null,created_at:user.created_at,
      email_confirmed_at:user.email_confirmed_at ?? null,is_anonymous:user.is_anonymous ?? false,
    })));
    if (result.data.users.length < 100) return users.sort((a,b) => a.id.localeCompare(b.id));
  }
  throw new Error('Auth inventory exceeded bounds.');
}

async function storageInventory(client) {
  const result = await client.storage.listBuckets();
  if (result.error || result.data.length !== expectedBuckets.length || result.data.some(bucket => !expectedBuckets.includes(bucket.id))) {
    throw new Error('Unexpected bucket inventory.');
  }
  const buckets = result.data.map(({id,name,public:publicAccess,file_size_limit,allowed_mime_types}) =>
    ({id,name,public:publicAccess,file_size_limit,allowed_mime_types})).sort((a,b) => a.id.localeCompare(b.id));
  const objects = [];
  const visited = new Set();
  for (const bucket of buckets) {
    const folders = [''];
    while (folders.length) {
      const prefix = folders.shift();
      const location = `${bucket.id}/${prefix}`;
      if (visited.has(location) || visited.size >= 1000) throw new Error('Unexpected Storage tree.');
      visited.add(location);
      for (let offset = 0; offset <= 10_000; offset += 1000) {
        const page = await client.storage.from(bucket.id).list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
        if (page.error) throw new Error('Storage listing failed.');
        for (const object of page.data) {
          const name = prefix ? `${prefix}/${object.name}` : object.name;
          if (!object.id) { folders.push(name); continue; }
          objects.push({bucket:bucket.id,name,id:object.id,created_at:object.created_at,updated_at:object.updated_at,metadata:object.metadata});
          if (objects.length > 5000) throw new Error('Storage object inventory exceeded bounds.');
        }
        if (page.data.length < 1000) break;
        if (offset === 10_000) throw new Error('Storage folder exceeded bounds.');
      }
    }
  }
  objects.sort((a,b) => `${a.bucket}/${a.name}`.localeCompare(`${b.bucket}/${b.name}`));
  if (new Set(objects.map(object => `${object.bucket}/${object.name}`)).size !== objects.length) throw new Error('Duplicate Storage object.');
  return {buckets,objects};
}

export async function verifyFiles(directory, files) {
  for (const item of files) {
    if (!/^(?:[a-z-]+\.json|[a-z_]+\.json|objects\/[0-9a-f]{64}\.bin)$/.test(item.file)) throw new Error('Unexpected backup file path.');
    const bytes = await readFile(resolve(directory,item.file));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error('Local backup integrity check failed.');
  }
}

async function runBackup() {
  dotenv.config({path:['.env.local','.env'],quiet:true});
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (project.href !== 'https://qgghjpfnbcktctbakuam.supabase.co/') throw new Error('Unexpected project URL.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Server-only service key is required.');
  const readFetch = (url,options = {}) => {
    assertReadOnlyRequest(typeof url === 'string' ? url : url.url ?? url.href,options.method ?? 'GET',project.origin);
    return fetch(url,{...options,signal:AbortSignal.timeout(60_000)});
  };
  const client = createClient(project.origin,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:readFetch}});
  const fetchSchema = async () => {
    const result = await readFetch(`${project.origin}/rest/v1/`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/openapi+json'}});
    if (!result.ok) throw new Error('API schema read failed.');
    const schema = await result.json();
    const exposed = Object.keys(schema.paths).filter(path => path !== '/' && !path.startsWith('/rpc/')).map(path => path.slice(1)).sort();
    if (JSON.stringify(exposed) !== JSON.stringify([...tableNames].sort())) throw new Error('Exposed table inventory changed; review scope.');
    return schema;
  };
  const root = resolve('scratch/account-backups');
  await mkdir(root,{recursive:true});
  const directory = await mkdtemp(resolve(root,`ownership-${new Date().toISOString().slice(0,10)}-`));
  const manifest = {
    version:1,projectRef:'qgghjpfnbcktctbakuam',startedAt:new Date().toISOString(),completedAt:null,complete:false,
    scope:'All ten API-exposed public application tables and Storage object bytes, API schema, limited Auth identity inventory and ownership audit.',
    exclusions:['Auth password hashes, identities, sessions, tokens and full Auth restore','PostgreSQL catalog/DDL/roles and platform configuration','External URL and legacy local-path media bytes'],
    consistency:'Paginated API export, followed by full row/schema/identity/bucket/object-inventory re-reads and a second hash-checked download of each object; not a transactional database snapshot.',
    catalogStatus:'Pending fresh ownership-catalog.sql export; not ready to authorize a migration.',
    files:[],tables:[],objects:[],remoteWrites:0,
  };
  async function save(file, bytes) {
    await writeFile(resolve(directory,file),bytes,{flag:'wx'});
    manifest.files.push({file,bytes:bytes.length,sha256:digest(bytes)});
  }
  try {
    const schema = await fetchSchema();
    await save('api-schema.json',encoded(schema));
    const identities = await authInventory(client);
    await save('auth-inventory.json',encoded(identities));
    const tables = {};
    for (const name of tableNames) {
      tables[name] = await exportRows(client,name);
      const bytes = encoded(tables[name]);
      await save(`${name}.json`,bytes);
      manifest.tables.push({name,rows:tables[name].length,sha256:digest(bytes)});
      console.log(`Exported ${name}: ${tables[name].length} rows.`);
    }
    const storage = await storageInventory(client);
    await save('storage-inventory.json',encoded(storage));
    await mkdir(resolve(directory,'objects'));
    let totalBytes = 0;
    for (const object of storage.objects) {
      const size = Number(object.metadata?.size);
      if (!Number.isSafeInteger(size) || size < 0 || size > 134_217_728 || totalBytes+size > 536_870_912) throw new Error('Storage backup exceeded reviewed size bounds.');
      const result = await client.storage.from(object.bucket).download(object.name);
      if (result.error) throw new Error('Storage download failed.');
      const bytes = Buffer.from(await result.data.arrayBuffer());
      if (bytes.length !== size) throw new Error('Storage object size changed.');
      const file = `objects/${digest(`${object.bucket}/${object.name}`)}.bin`;
      await save(file,bytes);
      manifest.objects.push({bucket:object.bucket,name:object.name,size,file,sha256:digest(bytes)});
      totalBytes += size;
      if (manifest.objects.length % 25 === 0) console.log(`Downloaded ${manifest.objects.length}/${storage.objects.length} objects.`);
    }
    console.log('Verifying fresh rows, schema and Storage bytes against the saved copy.');
    for (const table of manifest.tables) {
      if (digest(encoded(await exportRows(client,table.name))) !== table.sha256) throw new Error(`Rows changed during backup: ${table.name}`);
    }
    if (digest(encoded(await fetchSchema())) !== digest(encoded(schema)) ||
        digest(encoded(await authInventory(client))) !== digest(encoded(identities)) ||
        digest(encoded(await storageInventory(client))) !== digest(encoded(storage))) throw new Error('Metadata or inventory changed during backup.');
    for (const [i,object] of manifest.objects.entries()) {
      const result = await client.storage.from(object.bucket).download(object.name);
      if (result.error || digest(Buffer.from(await result.data.arrayBuffer())) !== object.sha256) throw new Error('Storage bytes changed during backup.');
      if ((i+1) % 50 === 0) console.log(`Verified ${i+1}/${manifest.objects.length} remote objects.`);
    }
    if (digest(encoded(await storageInventory(client))) !== digest(encoded(storage))) throw new Error('Storage inventory changed during final verification.');
    const audit = auditOwnership(tables,identities,storage.objects,schema);
    await save('ownership-audit.json',encoded(audit));
    await verifyFiles(directory,manifest.files);
    manifest.totalObjectBytes = totalBytes;
    manifest.complete = true;
    manifest.completedAt = new Date().toISOString();
  } catch (error) {
    manifest.failure = error instanceof Error ? error.message : 'Backup failed.';
    process.exitCode = 1;
    console.error('Backup incomplete; no completed backup receipt issued.');
  } finally {
    const bytes = Buffer.from(JSON.stringify(manifest,null,2));
    await writeFile(resolve(directory,'manifest.json'),bytes,{flag:'wx'});
    if (manifest.complete) {
      await writeFile(resolve(directory,'receipt.sha256'),`${digest(bytes)}  manifest.json\n`,{flag:'wx'});
      console.log(`PASS: ten tables, ${manifest.objects.length} objects, ${manifest.totalObjectBytes} bytes; all local hashes and remote re-reads passed.`);
    }
    console.log(`Private backup directory: ${directory}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runBackup();
}
