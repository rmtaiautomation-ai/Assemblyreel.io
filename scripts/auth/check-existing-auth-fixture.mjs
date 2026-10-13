import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { parsePreflightCSV } from "./existing-account-bundle.mjs";

// Offline replay of the exported application schema/data. No SDK or network.
const report=parsePreflightCSV(await readFile("scratch/account-access-preflight.csv","utf8"));
const names=["users","workspaces","video_projects","scenes","media","timeline_items","overlay_clips","act_narrations","channel_facts"];
const candidates=[];
for(const directory of await readdir("scratch/account-backups",{withFileTypes:true})) {
  if(!directory.isDirectory() || !directory.name.startsWith("assemblyreels-"))continue;
  const path=resolve("scratch/account-backups",directory.name);
  const source=await readFile(resolve(path,"manifest.json"),"utf8").catch(()=>null);
  if(source) {const manifest=JSON.parse(source);if(manifest.complete)candidates.push({path,manifest});}
}
const backup=candidates.sort((a,b)=>b.manifest.completedAt.localeCompare(a.manifest.completedAt))[0];
if(!backup)throw new Error("Completed private backup required.");
const identifier=value=>{
  if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error("Review exported identifier before fixture replay.");
  return `"${value}"`;
};
const db=new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    grant usage on schema auth to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function public.uuid_generate_v4() returns uuid language sql as $$select pg_catalog.gen_random_uuid()$$;`);
  for(const name of names) {
    const columns=report.columns.filter(item=>item.table_name===name);
    await db.exec(`create table public.${identifier(name)}(${columns.map(column=>
      `${identifier(column.column_name)} ${column.data_type}${column.column_default ? ` default ${column.column_default}`:""}${column.is_nullable==="NO"?" not null":""}`).join(",")})`);
    const rows=JSON.parse(await readFile(resolve(backup.path,`${name}.json`),"utf8"));
    await db.query(`insert into public.${identifier(name)} select * from jsonb_populate_recordset(null::public.${identifier(name)},$1)`,[rows]);
  }
  // Referenced primary/unique keys must exist before adding foreign keys.
  const constraints=[...report.constraints].sort((a,b)=>Number(a.definition.startsWith("FOREIGN KEY"))-Number(b.definition.startsWith("FOREIGN KEY")));
  for(const constraint of constraints) {
    if(!names.includes(constraint.relation))throw new Error("Unexpected exported constraint relation.");
    await db.exec(`alter table public.${identifier(constraint.relation)} add constraint ${identifier(constraint.conname)} ${constraint.definition}`);
  }
  await db.exec(`create function public.handle_new_user() returns trigger language plpgsql security definer as $$begin insert into public.users(id,email) values(new.id,new.email);return new;end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
    grant usage on schema public,storage to anon,authenticated,service_role;
    grant all on all tables in schema public to anon,authenticated,service_role;
    grant all on storage.objects to anon,authenticated;
    create policy old_public_storage on storage.objects for all using(true) with check(true);`);
  await db.query("insert into storage.buckets select * from jsonb_populate_recordset(null::storage.buckets,$1)",[report.buckets]);
  const before={};
  for(const name of names)before[name]=(await db.query(`select to_jsonb(t) as row from public.${identifier(name)} t order by id`)).rows;
  await db.exec(await readFile("scratch/account-existing-auth-upgrade.sql","utf8"));
  for(const name of names) {
    const after=(await db.query(`select to_jsonb(t) as row from public.${identifier(name)} t order by id`)).rows;
    if(JSON.stringify(before[name])!==JSON.stringify(after))throw new Error(`Offline preservation check failed: ${name}`);
  }
  console.log("PASS: actual exported core columns, constraints and all backed-up application rows replay the generated auth upgrade with no content/type changes.");
} catch(error) {
  console.error(`Offline replay failed; code: ${error.code ?? "FIXTURE_CHECK_FAILED"}. No customer data printed.`);
  process.exitCode=1;
} finally {await db.close();}
