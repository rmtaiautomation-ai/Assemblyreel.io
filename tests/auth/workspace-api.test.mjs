import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
import { fixture } from './fixtures/owned-database.mjs';

const moduleText=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const stubs={'server-only':moduleText('export{}'),
  '@/lib/supabase/server':moduleText('export async function createClient(){globalThis.__ownedCalls++;return globalThis.__ownedClient}'),
  'next/headers':moduleText('export async function headers(){return new Headers(globalThis.__ownedHeaders)}')};
const workspaces=await loadSource(new URL('../../src/app/api/account/workspaces/route.ts',import.meta.url),stubs);
const projects=await loadSource(new URL('../../src/app/api/account/projects/route.ts',import.meta.url),stubs);
const resources=await loadSource(new URL('../../src/app/api/account/resources/route.ts',import.meta.url),stubs);
const workspaceDetail=await loadSource(new URL('../../src/app/api/account/workspaces/[workspaceId]/route.ts',import.meta.url),stubs);
const projectDetail=await loadSource(new URL('../../src/app/api/account/projects/[projectId]/route.ts',import.meta.url),stubs);
const actions=await loadSource(new URL('../../src/features/workspaces/server/owned-workspace-actions.ts',import.meta.url),stubs);
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const id=n=>`abcdef00-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='https://staging.example';
const request=(path,body,method='POST',headers={})=>new Request(`${origin}/api/account/${path}`,{method,
  headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const createWorkspace=(operation=id(10),workspace={name:'My channel',content_theme:'History'})=>workspaces.POST(request('workspaces',{operationId:operation,workspace}));
const createProject=(parent=id(10),operation=id(11))=>projects.POST(request('projects',{operationId:operation,project:{workspace_id:parent,topic:'Manual draft'}}));
const params=(key,value)=>({params:Promise.resolve({[key]:value})});

async function setup(){
  const db=await fixture();
  await db.exec("alter table public.workspaces add created_at timestamptz default now();alter table public.video_projects add created_at timestamptz default now()");
  await db.exec(await readFile(new URL('../../db/auth/existing-project/004-owned-records-text-projects.sql',import.meta.url),'utf8'));
  const env={AUTH_LAUNCH_READY:'true',APP_ACCESS_STAGE:'auth_only',OWNERSHIP_MIGRATION_READY:'true',OWNED_CONTENT_ENABLED:'true',NEXT_PUBLIC_SITE_URL:origin};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
  const state={user:null,rpcs:[],queries:[],error:null,invalidResult:false};
  globalThis.__ownedCalls=0;globalThis.__ownedHeaders={origin};
  const identifier=value=>{assert.match(value,/^[a-z_]+$/);return `"${value}"`;};
  globalThis.__ownedClient={auth:{async getUser(){return {data:{user:state.user},error:null};}},from(table){
    assert.ok(['users','workspaces','video_projects'].includes(table));
    const filters=[],orders=[];let fields=[],maximum=null;
    const query={select(value){fields=value.split(',');return this;},eq(key,value){filters.push([key,value]);return this;},
      order(key){orders.push(key);return this;},limit(value){maximum=value;return this;},
      async run(single=false){
        state.queries.push({table,fields,filters,maximum});
        const values=filters.map(pair=>pair[1]);
        const sql=`select ${fields.map(identifier).join(',')} from public.${identifier(table)}${filters.length?' where '+filters.map(([key],i)=>`${identifier(key)}=$${i+1}`).join(' and '):''}${orders.length?' order by '+orders.map(identifier).join(','):''}${maximum!==null?` limit ${Number(maximum)}`:''}`;
        try {const result=await db.query(sql,values);return {data:single?result.rows[0]??null:result.rows,error:null};}
        catch(error){return {data:null,error:{message:error.message}};}
      },maybeSingle(){return this.run(true);},then(resolve,reject){return this.run().then(resolve,reject);}};
    return query;
  },async rpc(name,input){
    state.rpcs.push({name,input});if(state.error)return {data:null,error:{message:state.error}};
    let sql,values;
    if(name==='create_owned_workspace'||name==='create_owned_project'){sql=`select public.${name}($1::jsonb,$2::uuid) data`;values=[input.payload,input.operation_id];}
    else {assert.equal(name,'rename_owned_resource');sql='select public.rename_owned_resource($1,$2::uuid,$3) data';values=[input.resource_type,input.resource_id,input.value];}
    try {const result=await db.query(sql,values);return {data:state.invalidResult?null:result.rows[0].data,error:null};}
    catch(error){return {data:null,error:{message:error.message}};}
  }};
  async function actor(userId=a,userOverrides={}){
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[userId,JSON.stringify({sub:userId,is_anonymous:false})]);
    await db.exec('set role authenticated');state.user={id:userId,email:'fixture@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false,...userOverrides};
  }
  await actor();
  return {db,state,actor,async close(){await db.close();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__ownedCalls;delete globalThis.__ownedClient;delete globalThis.__ownedHeaders;}};
}

test('workspace/project APIs create idempotently through real RPCs and count each mutation once',async()=>{
  const f=await setup();try{
    assert.equal((await createWorkspace(id(10).toUpperCase())).status,201);
    assert.equal((await createWorkspace()).status,201);
    assert.equal((await createProject()).status,201);
    assert.equal((await createProject()).status,201);
    assert.equal((await resources.PATCH(request('resources',{type:'workspace',id:id(10),value:' Renamed '},'PATCH'))).status,200);
    assert.deepEqual(f.state.rpcs.map(call=>call.name),['create_owned_workspace','create_owned_workspace','create_owned_project','create_owned_project','rename_owned_resource']);
    await f.db.exec('reset role');
    assert.equal((await f.db.query("select sum(hits)::integer n from public.account_request_limits where action='workspace'")).rows[0].n,2);
    assert.equal((await f.db.query("select sum(hits)::integer n from public.account_request_limits where action='rename'")).rows[0].n,1);
    assert.equal((await f.db.query('select count(*)::integer n from public.workspaces where user_id=$1',[a])).rows[0].n,1);
  }finally{await f.close();}
});

test('lists and details return minimal owned DTOs; foreign, unknown-owner and missing resources are indistinguishable',async()=>{
  const f=await setup();try{
    await createWorkspace();await createProject();
    const list=await workspaces.GET();assert.equal(list.status,200);assert.deepEqual(Object.keys((await list.json()).workspaces[0]).sort(),['content_theme','id','name']);
    const projectList=await projects.GET(new Request(`${origin}/api/account/projects?workspaceId=${id(10)}`));assert.equal(projectList.status,200);
    assert.equal((await projectDetail.GET(null,params('projectId',id(11)))).status,200);
    await f.actor(b);
    for(const response of [await workspaceDetail.GET(null,params('workspaceId',id(10))),await workspaceDetail.GET(null,params('workspaceId',id(99))),
      await workspaceDetail.GET(null,params('workspaceId','20000000-0000-4000-8000-000000000001')),await projectDetail.GET(null,params('projectId',id(11))),
      await projects.GET(new Request(`${origin}/api/account/projects?workspaceId=${id(10)}`)),await createProject(id(10),id(20)),
      await resources.PATCH(request('resources',{type:'project',id:id(11),value:'Forged'},'PATCH'))]){
      assert.equal(response.status,404);assert.equal((await response.json()).code,'RESOURCE_UNAVAILABLE');assert.match(response.headers.get('cache-control'),/no-store/);
    }
    assert.deepEqual((await (await workspaces.GET()).json()).workspaces,[]);
    assert.equal(f.state.rpcs.length,2);
    assert.ok(f.state.queries.some(query=>query.table==='workspaces'&&query.filters.some(([key,value])=>key==='user_id'&&value===b)));
  }finally{await f.close();}
});

test('invalid JSON, media types, oversized bodies, forged fields and foreign origins reject before authentication or RPCs',async()=>{
  const f=await setup();try{
    const checks=[await workspaces.POST(request('workspaces',{workspace:{name:'x',content_theme:'y',user_id:b},operationId:id(10)})),
      await projects.POST(request('projects',{project:{workspace_id:id(10),topic:'x',status:'Ready'},operationId:id(11)})),
      await resources.PATCH(request('resources',{type:'workspace',id:id(10),value:'x'.repeat(101)},'PATCH')),
      await workspaces.POST(request('workspaces',{},'POST',{origin:'https://evil.example'})),
      await workspaces.POST(request('workspaces',{},'POST',{'Content-Type':'text/plain'})),
      await workspaces.POST(new Request(`${origin}/api/account/workspaces`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{'})),
      await workspaces.POST(request('workspaces',{oversized:'x'.repeat(9000)})),
      await projects.GET(new Request(`${origin}/api/account/projects?workspaceId=${id(10)}&workspaceId=${id(20)}`)),
      await projectDetail.GET(null,params('projectId','../secret'))];
    assert.deepEqual(checks.map(response=>response.status),[400,400,400,403,415,400,413,400,400]);
    assert.equal(globalThis.__ownedCalls,0);assert.equal(f.state.rpcs.length,0);
    for(const response of checks){assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('pragma'),'no-cache');}
  }finally{await f.close();}
});

test('disabled, unconfirmed, anonymous, banned and missing-profile callers never mutate',async()=>{
  const f=await setup();try{
    process.env.OWNED_CONTENT_ENABLED='false';assert.equal((await createWorkspace()).status,503);assert.equal(globalThis.__ownedCalls,0);
    process.env.OWNED_CONTENT_ENABLED='true';
    for(const identity of [null,{...f.state.user,email_confirmed_at:null},{...f.state.user,is_anonymous:true},{...f.state.user,banned_until:'2999-01-01T00:00:00Z'}]){
      f.state.user=identity;assert.equal((await createWorkspace()).status,401);
    }
    await f.actor(id(88));assert.equal((await createWorkspace()).status,403);
    assert.equal(f.state.rpcs.length,0);
  }finally{await f.close();}
});

test('API errors safely distinguish conflicts, quotas and limits without leaking provider text or claiming an unconfirmed save',async()=>{
  const f=await setup();try{
    await createWorkspace();
    const conflict=await createWorkspace(id(10),{name:'Changed',content_theme:'History'});assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'OPERATION_REUSED');
    for(const [error,status,code]of [['REQUEST_RATE_LIMIT',429,'REQUEST_LIMIT'],['TEST_WORKSPACE_LIMIT',409,'WORKSPACE_LIMIT'],['TEST_PROJECT_LIMIT',409,'PROJECT_LIMIT'],['AUTH_REQUIRED',401,'AUTH_REQUIRED'],['private provider diagnostic',503,'SERVICE_UNAVAILABLE']]){
      f.state.error=error;const response=await createWorkspace(id(20));assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,code);assert.ok(!JSON.stringify(body).includes('private provider diagnostic'));
    }
    f.state.error=null;f.state.invalidResult=true;assert.equal((await createWorkspace(id(21))).status,503);
    f.state.invalidResult=false;assert.equal((await createWorkspace(id(21))).status,201);
  }finally{await f.close();}
});

test('server actions share origin, identity, ownership, validation and safe-error boundaries',async()=>{
  const f=await setup();try{
    const workspace=await actions.createWorkspace({name:'Action channel',content_theme:'History'},id(10));assert.equal(workspace.success,true);
    const project=await actions.createProject({workspace_id:id(10),topic:'Action project'},id(11));assert.equal(project.success,true);
    assert.equal((await actions.listWorkspaces()).workspaces.length,1);
    assert.equal((await actions.listProjects(id(10))).projects.length,1);
    globalThis.__ownedHeaders={origin:'https://evil.example'};
    assert.equal((await actions.renameResource({type:'workspace',id:id(10),value:'Forged'})).status,403);
    globalThis.__ownedHeaders={origin};await f.actor(b);
    assert.equal((await actions.renameResource({type:'project',id:id(11),value:'Forged'})).status,404);
    assert.equal((await actions.createWorkspace({name:'x',content_theme:'y',user_id:a},id(20))).status,400);
    assert.equal(f.state.rpcs.length,2);
  }finally{await f.close();}
});
