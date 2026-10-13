import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

dotenv.config({path:[".env.local",".env"],quiet:true});
// GET/list/download operations only. Credentials never enter files or output.
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let validKey = key?.startsWith("sb_secret_") ?? false;
const projectRef = project.hostname.split(".")[0];
try {
  const claims = JSON.parse(Buffer.from(key?.split(".")[1] ?? "", "base64url").toString());
  validKey ||= claims.role === "service_role" && claims.ref === projectRef;
} catch { /* Modern secret keys are validated by the project's Auth admin API below. */ }
if (project.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(project.hostname) ||
    project.username || project.password || project.search || project.hash || project.pathname !== "/" ||
    !validKey) {
  throw new Error("Existing-project URL and server-only service key required for this read-only backup.");
}
const client = createClient(project.origin,key,{auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(60_000)})}});
const tables = ["users","workspaces","video_projects","scenes","media","timeline_items","overlay_clips","act_narrations","channel_facts"];
const buckets = ["character-references","project-media","renders"];
const root = resolve("scratch","account-backups");
await mkdir(root,{recursive:true});
const directory = await mkdtemp(resolve(root,"assemblyreels-"));
const manifest = {projectRef,startedAt:new Date().toISOString(),completedAt:null,
  scope:"Application rows and Storage bytes; not a full PostgreSQL/auth/platform backup",tables:[],objects:[],complete:false};
const hash = bytes=>createHash("sha256").update(bytes).digest("hex");
try {
  const identities = await client.auth.admin.listUsers({page:1,perPage:1});
  if (identities.error || identities.data.users.length) throw new Error("Expected no existing Auth accounts; refresh the preflight before proceeding.");
  for (const table of tables) {
    const rows = [];
    let expected = null;
    for (let offset=0;;offset+=500) {
      const page = await client.from(table).select("*",{count:"exact"}).order("id").range(offset,offset+499);
      if (page.error || (expected !== null && expected !== page.count)) throw new Error(`Read-only backup failed or rows changed: ${table}`);
      expected = page.count;
      rows.push(...page.data);
      if (page.data.length<500) break;
      if (offset>=100_000) throw new Error("Unexpected table size; backup stopped.");
    }
    if (rows.length !== expected) throw new Error(`Incomplete row export: ${table}`);
    const bytes = Buffer.from(JSON.stringify(rows));
    const file = `${table}.json`;
    await writeFile(resolve(directory,file),bytes,{flag:"wx"});
    if (hash(await readFile(resolve(directory,file))) !== hash(bytes)) throw new Error("Local row verification failed.");
    manifest.tables.push({name:table,rows:rows.length,file,sha256:hash(bytes)});
    console.log(`Backed up ${table}: ${rows.length} rows.`);
  }
  const listing = await client.storage.listBuckets();
  if (listing.error || listing.data.some(bucket=>!buckets.includes(bucket.id))) throw new Error("Storage inventory changed; review before backup.");
  await writeFile(resolve(directory,"buckets.json"),JSON.stringify(listing.data),{flag:"wx"});
  await mkdir(resolve(directory,"objects"));
  let totalBytes = 0;
  const visited = new Set();
  for (const bucket of listing.data) {
    const folders = [""];
    while (folders.length) {
      const prefix = folders.shift();
      const location = `${bucket.id}/${prefix}`;
      if (visited.has(location)) throw new Error("Unexpected repeated storage prefix.");
      visited.add(location);
      for (let offset=0;;offset+=1000) {
        const page = await client.storage.from(bucket.id).list(prefix,{limit:1000,offset,sortBy:{column:"name",order:"asc"}});
        if (page.error) throw new Error("Storage listing failed.");
        for (const object of page.data) {
          const name = prefix ? `${prefix}/${object.name}` : object.name;
          if (!object.id) { folders.push(name); continue; }
          const size = Number(object.metadata?.size);
          if (!Number.isSafeInteger(size) || size<0 || size>134_217_728 || totalBytes+size>536_870_912) {
            throw new Error("Storage backup exceeds reviewed local size bounds.");
          }
          if (manifest.objects.length>=5000) throw new Error("Unexpected object count; backup stopped.");
          const response = await client.storage.from(bucket.id).download(name);
          if (response.error) throw new Error("Private object download failed.");
          const bytes = Buffer.from(await response.data.arrayBuffer());
          if (bytes.length !== size) throw new Error("Storage size changed during backup.");
          const file = `objects/${hash(`${bucket.id}/${name}`)}.bin`;
          await writeFile(resolve(directory,file),bytes,{flag:"wx"});
          if (hash(await readFile(resolve(directory,file))) !== hash(bytes)) throw new Error("Local object verification failed.");
          manifest.objects.push({bucket:bucket.id,name,size,file,sha256:hash(bytes)});
          totalBytes += size;
        }
        if (page.data.length<1000) break;
        if (offset>=10_000 || visited.size>1000 || folders.length>1000) throw new Error("Unexpected storage tree size.");
      }
    }
    console.log(`Backed up bucket ${bucket.id}; cumulative objects: ${manifest.objects.length}.`);
  }
  // Detect changed row data, not merely changed counts, before calling this complete.
  for (const table of manifest.tables) {
    const rows=[];
    for(let offset=0;;offset+=500) {
      const page=await client.from(table.name).select("*").order("id").range(offset,offset+499);
      if(page.error)throw new Error("Final snapshot verification failed.");
      rows.push(...page.data);
      if(page.data.length<500)break;
      if(offset>=100_000)throw new Error("Final snapshot verification exceeded bounds.");
    }
    if(hash(Buffer.from(JSON.stringify(rows)))!==table.sha256)throw new Error("Rows changed during backup; rerun when existing writers are stopped.");
  }
  manifest.complete=true;
  manifest.completedAt=new Date().toISOString();
  console.log(`PASS: verified local application backup; ${manifest.objects.length} objects, ${totalBytes} bytes. No remote writes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Read-only backup could not finish.");
  process.exitCode=1;
} finally {
  await writeFile(resolve(directory,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log(`Private backup directory: ${directory}`);
}
