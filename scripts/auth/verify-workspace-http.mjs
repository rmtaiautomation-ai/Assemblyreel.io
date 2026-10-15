// Actual Next.js + SSR SDK + local ownership SQL. Synthetic sessions only, no live I/O.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from '../../tests/auth/fixtures/owned-database.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';

const db=await fixture();
await db.exec("alter table public.workspaces add created_at timestamptz default now();alter table public.video_projects add created_at timestamptz default now()");
await db.exec(await readFile('db/auth/existing-project/004-owned-records-text-projects.sql','utf8'));
const directory=resolve('scratch/workspace-http-acceptance',new Date().toISOString().replaceAll(':','-'));await mkdir(directory,{recursive:true});
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const id=n=>`abcdef00-0000-4000-8000-${String(n).padStart(12,'0')}`;
const expiry=Math.floor(Date.now()/1000)+3600;
const tokens=new Map([a,b].map(actor=>[[{alg:'HS256',typ:'JWT'},{sub:actor,session_id:id(actor===a?1:2),exp:expiry}]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).concat('synthetic-signature').join('.'),actor]));
let rpcCalls=0;const fixtureErrors=[];
const identifier=value=>{assert.match(value,/^[a-z_]+$/);return `"${value}"`;};
const provider=createServer(async(request,response)=>{
  const json=(body,status=200)=>response.writeHead(status,{'Content-Type':'application/json','x-supabase-api-version':'2024-01-01'}).end(JSON.stringify(body));
  try{
    const url=new URL(request.url,'http://localhost'),actor=tokens.get(request.headers.authorization?.replace(/^Bearer /,''));
    if(!actor)return json({message:'Synthetic session unavailable',code:'bad_jwt'},401);
    if(url.pathname==='/auth/v1/user')return json({id:actor,email:'fixture@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,user_metadata:{}});
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[actor,JSON.stringify({sub:actor,is_anonymous:false})]);await db.exec('set role authenticated');
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      assert.equal(request.method,'POST');rpcCalls++;
      let bytes='';for await(const chunk of request)bytes+=chunk;
      const input=JSON.parse(bytes),name=url.pathname.split('/').at(-1);let sql,values;
      if(['create_owned_workspace','create_owned_project'].includes(name)){sql=`select public.${name}($1::jsonb,$2::uuid) value`;values=[input.payload,input.operation_id];}
      else{assert.equal(name,'rename_owned_resource');sql='select public.rename_owned_resource($1,$2::uuid,$3) value';values=[input.resource_type,input.resource_id,input.value];}
      try{return json((await db.query(sql,values)).rows[0].value);}catch(error){return json({message:error.message,code:error.code,details:null,hint:null},400);}
    }
    assert.equal(request.method,'GET');const table=url.pathname.split('/').at(-1);assert.ok(['users','workspaces','video_projects'].includes(table));
    const fields=url.searchParams.get('select').split(',').map(identifier),filters=[],values=[];
    for(const [key,value]of url.searchParams){if(['select','order','limit'].includes(key))continue;assert.ok(value.startsWith('eq.'));values.push(value.slice(3));filters.push(`${identifier(key)}=$${values.length}`);}
    const orders=url.searchParams.get('order')?.split(',').map(value=>{assert.ok(value.endsWith('.asc'));return identifier(value.slice(0,-4));});
    const limit=url.searchParams.get('limit');if(limit!==null)assert.ok(Number.isInteger(Number(limit))&&Number(limit)<=50);
    const sql=`select ${fields.join(',')} from public.${identifier(table)}${filters.length?' where '+filters.join(' and '):''}${orders?.length?' order by '+orders.join(','):''}${limit!==null?' limit '+Number(limit):''}`;
    json((await db.query(sql,values)).rows);
  }catch(error){fixtureErrors.push(error.message);json({message:'Synthetic fixture failed'},500);}
});
provider.listen(0,'127.0.0.1');await once(provider,'listening');
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const origin=`http://localhost:${port}`;
const template=await readFile('config/auth.env.example','utf8');
const disabled=Object.fromEntries([...template.matchAll(/^([A-Z_]+)=(?:false|true)\s*$/gm)].map(match=>[match[1],'false']));
const env={...process.env,...disabled,NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_synthetic_fixture',SUPABASE_SERVICE_ROLE_KEY:'',DATABASE_URL:'',
  AUTH_LAUNCH_READY:'true',APP_ACCESS_STAGE:'auth_only',OWNERSHIP_MIGRATION_READY:'true',OWNED_CONTENT_ENABLED:'true'};
const child=spawn(process.execPath,['--use-system-ca','node_modules/next/dist/bin/next','dev','--hostname','localhost','--port',String(port)],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let log='',failure;child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
const closed=new Promise(done=>child.on('close',done));const checks=[];
const cookie=actor=>{
  const access=[...tokens].find(([,value])=>value===actor)[0];
  return 'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:access,refresh_token:'synthetic-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user:{id:actor}})).toString('base64url');
};
const request=(path,actor=a,body,method=body===undefined?'GET':'POST',trustedOrigin=origin)=>fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),
  headers:{...(actor?{cookie:cookie(actor)}:{}),origin:trustedOrigin,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const pass=name=>{checks.push({name,passed:true});console.log(`PASS: ${name}`);};
try{
  let ready=false;for(let attempt=0;attempt<90;attempt++){if(child.exitCode!==null)throw new Error('Local Next server exited');try{if((await request('/api/auth/navigation',null)).status===200){ready=true;break;}}catch{/*startup*/}await new Promise(done=>setTimeout(done,500));}assert.ok(ready);
  assert.equal((await request('/api/account/workspaces',null)).status,401);pass('Missing session rejected by actual SSR client');
  const workspace={operationId:id(10),workspace:{name:'HTTP channel',content_theme:'History'}};
  assert.equal((await request('/api/account/workspaces',a,workspace)).status,201);
  assert.equal((await request('/api/account/workspaces',a,workspace)).status,201);pass('Actual HTTP workspace creation and retry persist one record');
  const project={operationId:id(11),project:{workspace_id:id(10),topic:'HTTP draft'}};
  assert.equal((await request('/api/account/projects',a,project)).status,201);
  assert.equal((await request('/api/account/projects',a,project)).status,201);pass('Actual HTTP project creation and retry persist one record');
  const list=await request('/api/account/workspaces');assert.equal(list.status,200);assert.match(list.headers.get('cache-control'),/no-store/);assert.equal(list.headers.get('pragma'),'no-cache');assert.equal((await list.json()).workspaces.length,1);
  assert.equal((await request(`/api/account/workspaces/${id(10)}`)).status,200);
  assert.equal((await request(`/api/account/projects?workspaceId=${id(10)}`)).status,200);
  assert.equal((await request(`/api/account/projects/${id(11)}`)).status,200);pass('Lists and dynamic details return owned metadata with private headers');
  const before=rpcCalls;
  assert.equal((await request(`/api/account/workspaces/${id(10)}`,b)).status,404);
  assert.equal((await request(`/api/account/projects/${id(11)}`,b)).status,404);
  assert.equal((await request('/api/account/projects',b,{...project,operationId:id(20)})).status,404);
  assert.equal((await request('/api/account/resources',b,{type:'project',id:id(11),value:'Forged'},'PATCH')).status,404);assert.equal(rpcCalls,before);pass('Account B cannot read or mutate A records; no rejected mutation reaches RPC');
  assert.equal((await request('/api/account/resources',a,{type:'project',id:id(11),value:'Renamed'},'PATCH')).status,200);pass('Owned HTTP rename reaches the bounded database RPC');
  assert.equal((await request('/api/account/workspaces',a,workspace,'POST','https://evil.example')).status,403);
  assert.equal((await request('/api/account/workspaces',a,{...workspace,workspace:{...workspace.workspace,user_id:b}})).status,400);
  assert.equal((await request('/api/account/projects?workspaceId=../secret')).status,400);pass('Origin, forged-owner payload and invalid IDs rejected before mutation');
  await db.exec('reset role');assert.equal((await db.query("select sum(hits)::integer n from account_request_limits where action='workspace'")).rows[0].n,2);assert.equal((await db.query("select sum(hits)::integer n from account_request_limits where action='rename'")).rows[0].n,1);pass('Actual HTTP retries do not duplicate records or double-count limits');
  const browserClient=await loadSource(new URL('../../src/features/workspaces/owned-content-client.ts',import.meta.url));
  const originalFetch=globalThis.fetch;let dropped=false;const sent=[];
  const fields={workspace_id:id(10),topic:'Original retry topic'};
  const attempt=browserClient.prepareOwnedSave('project',fields,id(40));fields.topic='Edited after send';
  globalThis.fetch=async(path,init)=>{
    sent.push(init.body);
    const response=await originalFetch(origin+path,{...init,headers:{...init.headers,cookie:cookie(a),origin}});
    if(!dropped){dropped=true;await response.text();throw new TypeError('Synthetic lost response after committed save');}
    return response;
  };
  try {
    await assert.rejects(browserClient.sendOwnedSave(attempt),error=>browserClient.shouldRetryOwnedSave(error));
    assert.equal((await browserClient.sendOwnedSave(attempt)).id,id(40));assert.equal(sent[0],sent[1]);
  }finally{globalThis.fetch=originalFetch;}
  const saved=await (await request(`/api/account/projects/${id(40)}`)).json();assert.equal(saved.project.topic,'Original retry topic');
  await db.exec('reset role');assert.equal((await db.query("select sum(hits)::integer n from account_request_limits where action='workspace'")).rows[0].n,3);
  pass('Browser save client retries a lost HTTP response without changing details or duplicating its save');
  // Seed only this isolated fixture at its thresholds; never flood the hosted service to test limits.
  await db.query("insert into account_request_limits select $1,'rename',date_trunc('minute',now())+n*interval '1 minute',30 from generate_series(0,1) n on conflict(actor_id,action,window_start) do update set hits=30",[a]);
  const limited=await request('/api/account/resources',a,{type:'project',id:id(11),value:'Must not save'},'PATCH');
  assert.equal(limited.status,429);assert.equal((await limited.json()).code,'REQUEST_LIMIT');
  assert.equal((await (await request(`/api/account/projects/${id(11)}`)).json()).project.topic,'Renamed');
  await db.exec('reset role');
  await db.query("insert into workspaces(id,user_id,name,content_theme) values($1,$3,'Quota fixture','Rollback only'),($2,$3,'Quota fixture','Rollback only')",[id(50),id(51),a]);
  const quota=await request('/api/account/workspaces',a,{...workspace,operationId:id(52)});
  assert.equal(quota.status,409);assert.equal((await quota.json()).code,'WORKSPACE_LIMIT');
  pass('Real SQL rate and quota thresholds become safe HTTP 429/409 without saving rejected changes');
  assert.deepEqual(fixtureErrors,[]);
}catch(error){failure=error;process.exitCode=1;}
finally{
  child.kill();await closed;provider.closeAllConnections();await new Promise(done=>provider.close(done));await db.close();
  await writeFile(resolve(directory,'server.log'),log);
  await writeFile(resolve(directory,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed:!failure,checks,scope:'Local actual Next.js/SSR SDK and PGlite RLS/RPCs with synthetic Auth sessions; no live provider or customer records.'},null,2));
  console.log(`Evidence: ${directory}`);
}
if(failure)throw failure;
