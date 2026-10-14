// Live read-only verification after the guarded migration and rollback isolation test.
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { exportRows, assertReadOnlyRequest } from './backup-ownership.mjs';

dotenv.config({path:['.env.local','.env'],quiet:true});
const directory=resolve(process.argv[2] ?? '');
const within=relative(resolve('scratch/account-backups'),directory);
if(!within||within.startsWith('..')||isAbsolute(within))throw new Error('Choose a private backup directory.');
const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
if(url.href!=='https://qgghjpfnbcktctbakuam.supabase.co/')throw new Error('Unexpected project.');
const readFetch=(input,options={})=>{
  assertReadOnlyRequest(typeof input==='string'?input:input.url??input.href,options.method??'GET',url.origin);
  return fetch(input,{...options,signal:AbortSignal.timeout(30_000)});
};
const client=createClient(url.origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:readFetch}});
const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
if(!manifest.complete||manifest.projectRef!=='qgghjpfnbcktctbakuam')throw new Error('Matching completed backup required.');
const hash=value=>createHash('sha256').update(value).digest('hex');
const report={checkedAt:new Date().toISOString(),checks:[],scope:'Read-only original-row/identity/Storage inventory and anonymous-access checks; not live SQL catalog or signed-in A/B browser acceptance.'};
const check=(name,passed)=>{report.checks.push({name,passed:Boolean(passed)});console.log(`${passed?'PASS':'FAIL'}: ${name}`);};
const identities=await client.auth.admin.listUsers({page:1,perPage:100});
if(identities.error)throw new Error('Auth inventory read failed.');
const priorIdentities=JSON.parse(await readFile(resolve(directory,'auth-inventory.json'),'utf8'));
check('Original confirmed account retained; no synthetic identities',identities.data.users.length===priorIdentities.length&&identities.data.users.every(user=>priorIdentities.some(prior=>prior.id===user.id&&prior.email===user.email)&&user.email_confirmed_at));
const rows={};
for(const table of manifest.tables){
  rows[table.name]=await exportRows(client,table.name);
  const original=table.name==='scenes'?rows.scenes.map(({account_project_id,...value})=>{void account_project_id;return value;}):rows[table.name];
  check(`Original ${table.name} rows preserved`,hash(JSON.stringify(original))===table.sha256);
}
check('All seven legacy workspaces remain unassigned',rows.workspaces.length===7&&rows.workspaces.every(row=>row.user_id===null));
const projects=new Set(rows.video_projects.map(row=>row.id));
check('Generated UUIDs correspond to original scene references',rows.scenes.every(row=>row.account_project_id===row.project_id));
check('All 778 orphan scenes remain preserved',rows.scenes.filter(row=>!projects.has(row.account_project_id)).length===778);
for(const table of ['account_workspace_operations','account_project_operations']){
  check(`No retained test rows in ${table}`,(await exportRows(client,table)).length===0);
}
// This counter table has a composite primary key and no id column.
const limits=await client.from('account_request_limits').select('actor_id',{count:'exact'}).limit(1);
check('No retained test rows in account_request_limits',!limits.error&&limits.count===0);
const buckets=await client.storage.listBuckets();
if(buckets.error)throw new Error('Bucket inventory read failed.');
check('All three Storage buckets remain private',buckets.data.length===3&&buckets.data.every(bucket=>!bucket.public));
const objects=[];
for(const bucket of buckets.data){
  const folders=[''];let visited=0;
  while(folders.length){
    if(++visited>1000)throw new Error('Storage tree exceeded verification bounds.');
    const prefix=folders.shift();
    for(let offset=0;offset<=10_000;offset+=1000){
      const page=await client.storage.from(bucket.id).list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
      if(page.error)throw new Error('Storage inventory read failed.');
      for(const item of page.data){const name=prefix?`${prefix}/${item.name}`:item.name;if(!item.id)folders.push(name);else objects.push({bucket:bucket.id,name,size:Number(item.metadata?.size),id:item.id});}
      if(page.data.length<1000)break;
      if(offset===10_000)throw new Error('Storage folder exceeded bounds.');
    }
  }
}
const key=object=>`${object.bucket}/${object.name}`;
const current=new Map(objects.map(object=>[key(object),object]));
check('All 161 stored files retain their keys and sizes',objects.length===manifest.objects.length&&manifest.objects.every(object=>current.get(key(object))?.size===object.size));
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for(const table of [...manifest.tables.map(table=>table.name),'account_workspace_operations','account_project_operations','account_request_limits']){
  const response=await readFetch(`${url.origin}/rest/v1/${table}?select=${table==='users'?'id,email':'*'}&limit=1`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}});
  const body=await response.json();
  check(`Anonymous ${table} read denied`,!response.ok&&(body.code==='42501'||[401,403].includes(response.status)));
}
const sample=manifest.objects[0];
const response=await readFetch(`${url.origin}/storage/v1/object/public/${sample.bucket}/${sample.name}`,{headers:{Range:'bytes=0-0'}});
await response.body?.cancel();
check('Sample old public Storage URL remains unavailable',!response.ok);
await writeFile(resolve(directory,'live-ownership-verification.json'),JSON.stringify(report,null,2));
process.exitCode=report.checks.every(item=>item.passed)?0:1;
