// Offline only: replay the reviewed public schema and backed-up values in PGlite.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createOwnershipBundle, parseOwnershipCatalog } from './existing-ownership-bundle.mjs';
import { verifyFiles } from './backup-ownership.mjs';

const directory=resolve(process.argv[2] ?? '');
const within=relative(resolve('scratch/account-backups'),directory);
if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Choose a private account backup directory.');
const source=parseOwnershipCatalog(await readFile('scratch/ownership-catalog.csv','utf8'));
const manifestBytes=await readFile(resolve(directory,'manifest.json'));
const manifest=JSON.parse(manifestBytes);
await verifyFiles(directory,manifest.files);
const receipt=createHash('sha256').update(manifestBytes).digest('hex');
const names=manifest.tables.map(table=>table.name);
const tables=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await readFile(resolve(directory,`${name}.json`),'utf8'))])));
const identities=JSON.parse(await readFile(resolve(directory,'auth-inventory.json'),'utf8'));
const storage=JSON.parse(await readFile(resolve(directory,'storage-inventory.json'),'utf8'));
const identifier=name=>{
  if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('Unexpected exported identifier.');
  return `"${name}"`;
};
const allowedTypes=new Set(['uuid','text','integer','numeric','boolean','jsonb','timestamp with time zone']);
const db=new PGlite();
const checks=[];
const check=(name,passed)=>{checks.push({name,passed});console.log(`${passed?'PASS':'FAIL'}: ${name}`);if(!passed)throw new Error('Offline preservation check failed.');};
try {
  await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;create schema account_access_backup_20261013;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,email_confirmed_at timestamptz,banned_until timestamptz);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant select on storage.objects to anon,authenticated;
    create function public.uuid_generate_v4() returns uuid language sql as $$select pg_catalog.gen_random_uuid()$$;`);
  for(const user of identities)await db.query('insert into auth.users(id,email,is_anonymous,email_confirmed_at) values($1,$2,$3,$4)',[user.id,user.email,user.is_anonymous,user.email_confirmed_at]);
  for(const name of names){
    const columns=source.columns.filter(column=>column.table_name===name&&(!column.table_schema||column.table_schema==='public'));
    await db.exec(`create table public.${identifier(name)}(${columns.map(column=>{
      if(!allowedTypes.has(column.data_type))throw new Error('Unreviewed exported column type.');
      return `${identifier(column.column_name)} ${column.data_type}${column.column_default?` default ${column.column_default}`:''}${column.is_nullable==='NO'?' not null':''}`;
    }).join(',')})`);
    await db.query(`insert into public.${identifier(name)} select * from jsonb_populate_recordset(null::public.${identifier(name)},$1)`,[tables[name]]);
  }
  for(const constraint of [...source.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')))){
    if(!names.includes(constraint.relation))throw new Error('Unexpected constraint relation.');
    await db.exec(`alter table public.${identifier(constraint.relation)} add constraint ${identifier(constraint.conname)} ${constraint.definition}${constraint.convalidated?'':' not valid'}`);
  }
  for(const index of source.indexes.filter(index=>index.schemaname==='public')){
    if(!(await db.query('select to_regclass($1) as present',[`public.${index.indexname}`])).rows[0].present)await db.exec(index.indexdef);
  }
  const allowedFunctions=new Set(['handle_new_user','record_marketing_lead','set_scenes_last_update','set_updated_at','sync_account_email']);
  for(const fn of source.functions){if(!allowedFunctions.has(fn.proname))throw new Error('Unreviewed source function.');await db.exec(fn.definition);}
  for(const trigger of source.triggers)await db.exec(trigger.definition);
  await db.query('insert into storage.buckets select * from jsonb_populate_recordset(null::storage.buckets,$1)',[storage.buckets]);
  for(const object of storage.objects)await db.query('insert into storage.objects values($1,$2,$3)',[object.id,object.bucket,object.name]);
  await db.exec("revoke all on schema public from public,anon,authenticated;grant usage on schema public to authenticated;grant all on all tables in schema public to service_role;");
  for(const name of names)await db.exec(`alter table public.${identifier(name)} enable row level security`);
  for(const policy of source.policies){
    if(policy.schemaname!=='public'&&policy.tablename!=='objects')continue;
    const roles=policy.roles.map(role=>role==='public'?'public':identifier(role)).join(',');
    await db.exec(`create policy ${'"'+policy.policyname.replaceAll('"','""')+'"'} on ${identifier(policy.schemaname)}.${identifier(policy.tablename)} as ${policy.permissive} for ${policy.cmd} to ${roles}${policy.qual?` using(${policy.qual})`:''}${policy.with_check?` with check(${policy.with_check})`:''}`);
  }
  for(const grant of source.column_grants.filter(grant=>grant.table_schema==='public'&&['anon','authenticated'].includes(grant.grantee))){
    await db.exec(`grant ${grant.privilege_type}(${identifier(grant.column_name)}) on public.${identifier(grant.table_name)} to ${identifier(grant.grantee)}`);
  }
  const before={};for(const name of names)before[name]=(await db.query(`select to_jsonb(t) as row from public.${identifier(name)} t order by id`)).rows;
  const catalogResults=await db.exec(await readFile(new URL('../../db/auth/existing-project/ownership-catalog.sql',import.meta.url),'utf8'));
  const localCatalog=catalogResults.flatMap(result=>result.rows).find(row=>row.ownership_catalog).ownership_catalog;
  // Managed Storage/Auth metadata is represented minimally in this offline fixture.
  // Generate its guard from that actual local catalog; live bundle uses the live export.
  const bundle=await createOwnershipBundle(localCatalog,manifest,tables,receipt);
  await db.exec(bundle);
  for(const name of names){
    const rows=(await db.query(`select to_jsonb(t)${name==='scenes'?"-'account_project_id'":''} as row from public.${identifier(name)} t order by id`)).rows;
    check(`Original exported ${name} values preserved`,JSON.stringify(rows)===JSON.stringify(before[name]));
  }
  check('All seven unknown legacy owners remain NULL',(await db.query('select count(*)::integer n from public.workspaces where user_id is null')).rows[0].n===7);
  check('All 778 orphan scenes retained',(await db.query('select count(*)::integer n from public.scenes s left join public.video_projects p on p.id=s.account_project_id where p.id is null')).rows[0].n===778);
  check('Storage inventory remains intact',(await db.query('select count(*)::integer n from storage.objects')).rows[0].n===161);
  check('SQL-time backup contains thirteen protected tables',(await db.query("select count(*)::integer n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='account_ownership_backup_20261014' and c.relkind='r' and c.relrowsecurity")).rows[0].n===13);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[identities[0].id,JSON.stringify({sub:identities[0].id,is_anonymous:false})]);await db.exec('set role authenticated');
  check('Real account gains no legacy workspace access',(await db.query('select count(*)::integer n from public.workspaces')).rows[0].n===0);
  await db.exec('reset role');
  try {await db.exec(bundle);throw new Error('REPLAY_ALLOWED');}catch(error){if(!error.message.includes('OWNERSHIP_ALREADY_STARTED'))throw error;await db.exec('rollback');}
  check('Generated guarded bundle refuses replay',true);
  const countsBefore=(await db.query('select (select count(*) from auth.users)::integer identities,(select count(*) from public.workspaces)::integer workspaces')).rows[0];
  await db.exec(await readFile(new URL('../../db/auth/existing-project/test-owned-isolation.sql',import.meta.url),'utf8'));
  check('Live-style rollback role isolation script passes on exported public schema',true);
  const countsAfter=(await db.query('select (select count(*) from auth.users)::integer identities,(select count(*) from public.workspaces)::integer workspaces')).rows[0];
  check('Isolation script leaves no synthetic identities or workspaces',JSON.stringify(countsBefore)===JSON.stringify(countsAfter));
  if(process.argv.includes('--editor')) {
    await db.exec(await readFile(new URL('../../db/auth/existing-project/008-owned-draft-editor.sql',import.meta.url),'utf8'));
    for(const name of names) {
      const additions=name==='scenes'?"-'account_project_id'-'account_editor_created'":name==='video_projects'?"-'account_editor_revision'":'';
      const rows=(await db.query(`select to_jsonb(t)${additions} as row from public.${identifier(name)} t order by id`)).rows;
      check(`Editor upgrade preserves exported ${name} values`,JSON.stringify(rows)===JSON.stringify(before[name]));
    }
    await db.exec(await readFile(new URL('../../db/auth/existing-project/test-owned-editor.sql',import.meta.url),'utf8'));
    check('Editor rollback test passes against exported public columns, constraints and triggers',true);
    const afterEditor=(await db.query('select (select count(*) from auth.users)::integer identities,(select count(*) from public.workspaces)::integer workspaces')).rows[0];
    check('Editor acceptance leaves no synthetic identities or workspaces',JSON.stringify(countsAfter)===JSON.stringify(afterEditor));
  }
}catch(error){console.error(`Offline ownership replay failed: ${error.code??'FIXTURE_CHECK_FAILED'}. No private rows printed.`);process.exitCode=1;}
finally {
  await db.close();
  await writeFile(resolve(directory,process.argv.includes('--editor')?'editor-migration-replay.json':'ownership-migration-replay.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,
    scope:'Actual public columns/defaults/constraints/indexes/functions/triggers/policies and backed-up rows in PGlite; minimally modeled managed Auth/Storage, not live Supabase acceptance.'},null,2));
}
