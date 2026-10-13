import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../../",import.meta.url));
const tables = ["users","workspaces","video_projects","scenes","media","timeline_items","overlay_clips","act_narrations","channel_facts"];
const literal = value=>`'${String(value).replaceAll("'","''")}'`;
const digest = value=>createHash("sha256").update(value).digest("hex");

export function parsePreflightCSV(source) {
  const text=source.replace(/^\uFEFF/,"");
  const newline=text.indexOf("\n");
  if(newline<0 || text.slice(0,newline).trim().replaceAll('"',"")!=="account_access_preflight")throw new Error("Unexpected preflight CSV header.");
  const cell=text.slice(newline+1).trim();
  if(!cell.startsWith('"') || !cell.endsWith('"'))throw new Error("Expected one quoted JSON report in the CSV.");
  return JSON.parse(cell.slice(1,-1).replaceAll('""','"'));
}

export async function createExistingAuthBundle(report,backup,receipt) {
  if(!backup.complete || !/^[0-9a-f]{64}$/.test(receipt) || backup.tables.length!==tables.length ||
    !tables.every(table=>backup.tables.some(item=>item.name===table && Number.isSafeInteger(item.rows) && item.rows>=0)) ||
    report.counts.auth_users!==0 || report.counts.profiles!==0)throw new Error("Reviewed zero-account preflight and completed backup required.");
  const schema=literal(JSON.stringify(report.columns));
  const triggers=literal(JSON.stringify(report.auth_triggers));
  const guard=`do $$begin
  if exists(select 1 from auth.users) or exists(select 1 from public.users) then raise exception 'ACCOUNT_STATE_CHANGED: refresh preflight and backup'; end if;
  if to_regnamespace('account_access_backup_20261013') is not null or to_regclass('public.marketing_leads') is not null then raise exception 'UPGRADE_ALREADY_STARTED: inspect before replay'; end if;
  if (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns
    where table_schema='public' order by table_name,ordinal_position) x) is distinct from ${schema}::jsonb then raise exception 'SCHEMA_DRIFT: refresh preflight'; end if;
  if (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select tgname,tgenabled,pg_get_triggerdef(oid) as definition from pg_trigger
    where tgrelid='auth.users'::regclass and not tgisinternal order by tgname) x) is distinct from ${triggers}::jsonb then raise exception 'AUTH_TRIGGER_DRIFT: inspect before replacing'; end if;
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'STORAGE_RLS_REQUIRED'; end if;
  ${backup.tables.map(table=>`if (select count(*) from public.${table.name})<>${table.rows} then raise exception 'DATA_COUNTS_CHANGED: ${table.name}'; end if;`).join("\n  ")}
end $$;
-- Additional SQL-time copy, isolated from browser/service roles. Local verified
-- row/object exports are the independent backup; this schema is not a substitute.
create schema account_access_backup_20261013;
revoke all on schema account_access_backup_20261013 from public,anon,authenticated,service_role;
create table account_access_backup_20261013.metadata(key text primary key,value jsonb not null);
alter table account_access_backup_20261013.metadata enable row level security;
insert into account_access_backup_20261013.metadata values('local_backup_receipt',jsonb_build_object('sha256',${literal(receipt)},'project_ref',${literal(backup.projectRef)},'completed_at',${literal(backup.completedAt)}));
insert into account_access_backup_20261013.metadata
  select 'function:'||p.oid::text,jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'config',p.proconfig)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
insert into account_access_backup_20261013.metadata values('preflight',${literal(JSON.stringify(report))}::jsonb);
${tables.map(table=>`create table account_access_backup_20261013.${table} as table public.${table};\nalter table account_access_backup_20261013.${table} enable row level security;`).join("\n")}
create table account_access_backup_20261013.storage_buckets as table storage.buckets;
alter table account_access_backup_20261013.storage_buckets enable row level security;
create table account_access_backup_20261013.storage_objects as table storage.objects;
alter table account_access_backup_20261013.storage_objects enable row level security;
revoke all on all tables in schema account_access_backup_20261013 from public,anon,authenticated,service_role;`;
  const sections=[];
  for(const file of ["001-auth-only-containment.sql","002-account-identities-and-leads.sql","003-confirmed-email-sync.sql"]) {
    let sql=await readFile(resolve(root,"db/auth",file),"utf8");
    if([...sql.matchAll(/^begin;\s*$/gim)].length!==1 || [...sql.matchAll(/^commit;\s*$/gim)].length!==1)throw new Error("Review migration transaction structure.");
    sql=sql.replace(/^begin;\s*$/gim,"").replace(/^commit;\s*$/gim,"");
    if(file.startsWith("001-")) {
      // Actual report confirms storage.objects RLS is already on. Avoid ALTER
      // ownership requirements on Supabase's managed table; guard above asserts it.
      const statement="alter table storage.objects enable row level security;";
      if(!sql.includes(statement))throw new Error("Review containment source before adapting.");
      sql=sql.replace(statement,"-- Existing managed storage.objects RLS verified by the precondition.");
    }
    sections.push(`-- Source: db/auth/${file}\n${sql.trim()}`);
  }
  const verification=await readFile(resolve(root,"db/auth/existing-project/verify-auth-upgrade.sql"),"utf8");
  return `-- Existing Assemblyreels: signup/login containment upgrade only.
-- Generated after a completed local row/object backup; keep this file private.
-- Preserves all legacy content, owners and column types. No new paid authority.
-- Backup receipt: ${receipt}
begin;
set local lock_timeout='5s';
lock table auth.users,${tables.map(table=>`public.${table}`).join(",")} in share row exclusive mode;
${guard}
${sections.join("\n\n")}
${verification}
commit;\n`;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const report=parsePreflightCSV(await readFile(resolve(root,"scratch/account-access-preflight.csv"),"utf8"));
  const directories=await readdir(resolve(root,"scratch/account-backups"),{withFileTypes:true});
  const candidates=[];
  for(const directory of directories.filter(item=>item.isDirectory() && item.name.startsWith("assemblyreels-"))) {
    const location=resolve(root,"scratch/account-backups",directory.name);
    const text=await readFile(resolve(location,"manifest.json"),"utf8").catch(()=>null);
    if(!text)continue;
    const backup=JSON.parse(text);
    if(backup.complete)candidates.push({location,backup,receipt:digest(text)});
  }
  const selected=candidates.sort((a,b)=>b.backup.completedAt.localeCompare(a.backup.completedAt))[0];
  if(!selected)throw new Error("Run npm run backup:account-existing first; completed backup missing.");
  dotenv.config({path:[".env.local",".env"],quiet:true});
  const configuredProject=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  if(configuredProject!==`${selected.backup.projectRef}.supabase.co`)throw new Error("Selected backup does not match the configured project.");
  for(const item of [...selected.backup.tables,...selected.backup.objects]) {
    if(!/^(?:[a-z_]+\.json|objects\/[0-9a-f]{64}\.bin)$/.test(item.file))throw new Error("Unexpected backup file path.");
    if(digest(await readFile(resolve(selected.location,item.file)))!==item.sha256)throw new Error("Backup file integrity check failed.");
  }
  const output=resolve(root,"scratch/account-existing-auth-upgrade.sql");
  await writeFile(output,await createExistingAuthBundle(report,selected.backup,selected.receipt));
  console.log(`Prepared existing-project auth upgrade: ${output}`);
  console.log("No SQL executed. Apply in Assemblyreels SQL Editor, then report the result before enabling local auth.");
}
