import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyFiles } from './backup-ownership.mjs';
import { parsePreflightCSV } from './existing-account-bundle.mjs';
import { fingerprintSQL, fingerprintJSON } from './ownership-fingerprint.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const literal = value => `'${String(value).replaceAll("'","''")}'`;
const names = ['users','workspaces','video_projects','scenes','media','timeline_items','overlay_clips','act_narrations','channel_facts','marketing_leads'];
const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Unexpected exported identifier.');
  return `"${name}"`;
};
export function parseOwnershipCatalog(source) {
  const csv = source.replace(/^\uFEFF/,'');
  const newline = csv.indexOf('\n');
  if (newline < 0 || csv.slice(0,newline).trim().replaceAll('"','') !== 'ownership_catalog') throw new Error('Unexpected catalog CSV header.');
  return parsePreflightCSV(`account_access_preflight\n${csv.slice(newline+1)}`);
}

export async function createOwnershipBundle(catalog,manifest,tables,receipt) {
  if (!manifest.complete || manifest.projectRef !== 'qgghjpfnbcktctbakuam' || !/^[a-f0-9]{64}$/.test(receipt) ||
      manifest.tables.length !== names.length || !names.every(name => manifest.tables.some(table => table.name === name) && Array.isArray(tables[name]))) {
    throw new Error('Complete reviewed backup of all ten application tables required.');
  }
  if (catalog.auth_users !== tables.users.length || catalog.profiles !== tables.users.length ||
      !catalog.relations || !catalog.functions || !catalog.triggers || !catalog.policies || !catalog.indexes || !catalog.default_grants) throw new Error('Fresh complete catalog required.');
  const catalogQuery = await readFile(new URL('../../db/auth/existing-project/ownership-catalog.sql',import.meta.url),'utf8');
  const query = catalogQuery.slice(catalogQuery.indexOf('select jsonb_build_object('),catalogQuery.lastIndexOf('\ncommit;')).trim().replace(/;$/,'');
  const reviewed = {
    columns:catalog.columns.filter(column => !column.table_schema || column.table_schema === 'public').map(column => ({
      table_name:column.table_name,column_name:column.column_name,data_type:column.data_type,
      udt_name:column.udt_name,is_nullable:column.is_nullable,column_default:column.column_default,
    })),
    relations:catalog.relations,constraints:catalog.constraints,indexes:catalog.indexes,policies:catalog.policies,
    functions:catalog.functions,triggers:catalog.triggers,column_grants:catalog.column_grants,
    default_grants:catalog.default_grants,buckets:catalog.buckets,
  };
  const flatten = source => {
    if ([...source.matchAll(/^begin;\s*$/gm)].length !== 1 || [...source.matchAll(/^commit;\s*$/gm)].length !== 1) throw new Error('Review migration transaction structure.');
    return source.replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'').trim();
  };
  const limits = flatten(await readFile(new URL('../../db/auth/006-account-request-limits.sql',import.meta.url),'utf8'));
  const migration = flatten(await readFile(new URL('../../db/auth/existing-project/004-owned-records-text-projects.sql',import.meta.url),'utf8'));
  const hashes = await fingerprintJSON({...reviewed,...Object.fromEntries(names.map(name=>[`data_${name}`,tables[name]]))});
  const dataGuards = names.map(name => `if (select pg_temp.ownership_fingerprint(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)) from public.${identifier(name)} t)
    is distinct from ${literal(hashes[`data_${name}`])} then raise exception 'OWNERSHIP_DATA_DRIFT: ${name}'; end if;`).join('\n  ');
  const copies = names.map(name => `create table account_ownership_backup_20261014.${identifier(name)} as table public.${identifier(name)};
alter table account_ownership_backup_20261014.${identifier(name)} enable row level security;`).join('\n');
  return `-- PRIVATE generated release candidate. Existing Assemblyreels only.
-- Preserves all legacy ownership. No private media delivery or paid-feature activation.
-- Contains request limits + schema-specific ownership, not generic 004/005/007.
-- Verified application backup receipt: ${receipt}
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local timezone='UTC';
lock table auth.users,${names.map(name => `public.${identifier(name)}`).join(',')},storage.buckets,storage.objects in share row exclusive mode;
${fingerprintSQL}
do $$declare actual jsonb; expected jsonb:=${literal(JSON.stringify(hashes))}::jsonb; section text; begin
  if current_user<>'postgres' then raise exception 'POSTGRES_OPERATOR_REQUIRED'; end if;
  if to_regnamespace('account_ownership_backup_20261014') is not null or to_regclass('public.account_request_limits') is not null then raise exception 'OWNERSHIP_ALREADY_STARTED'; end if;
  select ownership_catalog into actual from (${query}) q;
  if (select pg_temp.ownership_fingerprint(coalesce(jsonb_agg(jsonb_build_object('table_name',x.table_name,'column_name',x.column_name,'data_type',x.data_type,
    'udt_name',x.udt_name,'is_nullable',x.is_nullable,'column_default',x.column_default) order by x.table_name,x.ordinal_position),'[]'::jsonb))
    from information_schema.columns x where x.table_schema='public') is distinct from expected->>'columns' then raise exception 'OWNERSHIP_CATALOG_DRIFT: columns'; end if;
  foreach section in array array['relations','constraints','indexes','policies','functions','triggers','column_grants','default_grants','buckets'] loop
    if pg_temp.ownership_fingerprint(actual->section) is distinct from expected->>section then raise exception 'OWNERSHIP_CATALOG_DRIFT: %',section; end if;
  end loop;
  if (actual->>'auth_users')::bigint<>${catalog.auth_users} or (actual->>'profiles')::bigint<>${catalog.profiles} then raise exception 'ACCOUNT_STATE_CHANGED'; end if;
  ${dataGuards}
  insert into pg_temp.ownership_reviewed_catalog values(actual);
end $$;
create schema account_ownership_backup_20261014;
revoke all on schema account_ownership_backup_20261014 from public,anon,authenticated,service_role;
create table account_ownership_backup_20261014.metadata(key text primary key,value jsonb not null);
alter table account_ownership_backup_20261014.metadata enable row level security;
insert into account_ownership_backup_20261014.metadata select 'catalog',data from pg_temp.ownership_reviewed_catalog;
insert into account_ownership_backup_20261014.metadata values
  ('local_backup_receipt',jsonb_build_object('sha256',${literal(receipt)},'completed_at',${literal(manifest.completedAt)})),
  ('reviewed_fingerprints',${literal(JSON.stringify(hashes))}::jsonb);
${copies}
create table account_ownership_backup_20261014.storage_buckets as table storage.buckets;
alter table account_ownership_backup_20261014.storage_buckets enable row level security;
create table account_ownership_backup_20261014.storage_objects as table storage.objects;
alter table account_ownership_backup_20261014.storage_objects enable row level security;
revoke all on all tables in schema account_ownership_backup_20261014 from public,anon,authenticated,service_role;
${limits}
${migration}
do $$declare name text; current_rows jsonb; prior_rows jsonb; begin
  foreach name in array array[${names.map(literal).join(',')}] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)%s order by id),''[]''::jsonb) from public.%I t',
      case when name='scenes' then '-''account_project_id''' else '' end,name) into current_rows;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]''::jsonb) from account_ownership_backup_20261014.%I t',name) into prior_rows;
    if current_rows is distinct from prior_rows then raise exception 'OWNERSHIP_CONTENT_CHANGED: %',name; end if;
  end loop;
  if exists(select 1 from public.workspaces where user_id is not null and id in
    (select id from account_ownership_backup_20261014.workspaces where user_id is null)) then raise exception 'LEGACY_OWNER_ASSIGNED'; end if;
  if exists(select 1 from storage.buckets where public) then raise exception 'PRIVATE_STORAGE_REQUIRED'; end if;
end $$;
commit;
select 'PASS: ownership metadata isolation prepared; all original rows and owners preserved; Storage and paid features remain closed; live role testing required' as result;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory=resolve(process.argv[2] ?? '');
  const within=relative(resolve('scratch/account-backups'),directory);
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Choose a private account backup directory.');
  const bytes=await readFile(resolve(directory,'manifest.json'));
  const manifest=JSON.parse(bytes),receipt=digest(bytes);
  if ((await readFile(resolve(directory,'receipt.sha256'),'utf8')).split(/\s+/)[0]!==receipt) throw new Error('Backup receipt mismatch.');
  await verifyFiles(directory,manifest.files);
  const catalog=parseOwnershipCatalog(await readFile('scratch/ownership-catalog.csv','utf8'));
  const tables=Object.fromEntries(await Promise.all(names.map(async name => [name,JSON.parse(await readFile(resolve(directory,`${name}.json`),'utf8'))])));
  const sql=await createOwnershipBundle(catalog,manifest,tables,receipt);
  await writeFile('scratch/account-existing-ownership-upgrade.sql',sql);
  console.log('Prepared private guarded ownership release candidate. No SQL executed.');
}
