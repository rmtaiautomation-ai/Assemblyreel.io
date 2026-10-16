import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
import { editorFixture,emptyDocument,editorId as id,editorActorA as a,editorActorB as b } from './fixtures/editor-database.mjs';

const moduleText=text=>`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const route=await loadSource(new URL('../../src/app/api/account/projects/[projectId]/editor/route.ts',import.meta.url),{
  'server-only':moduleText('export{}'),
  '@/lib/supabase/server':moduleText('export async function createClient(){globalThis.__editorAuthCalls++;return globalThis.__editorClient}'),
});
const origin='https://fixture.example';
const context=project=>({params:Promise.resolve({projectId:project})});
const request=(body,headers={})=>new Request(`${origin}/api/account/projects/${id(2)}/editor`,{
  method:'PUT',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body),
});
test('editor handlers gate before provider access, validate origin/body and map only safe SQL labels',async()=>{
  const f=await editorFixture();
  const flags={AUTH_LAUNCH_READY:'true',APP_ACCESS_STAGE:'auth_only',OWNERSHIP_MIGRATION_READY:'true',OWNED_CONTENT_ENABLED:'true',WORKSPACE_DASHBOARD_ENABLED:'true',EDITOR_MIGRATION_READY:'true',OWNED_EDITOR_ENABLED:'true',NEXT_PUBLIC_SITE_URL:origin};
  const previous=Object.fromEntries(Object.keys(flags).map(key=>[key,process.env[key]]));Object.assign(process.env,flags);
  let user={id:a,email:'a@example.invalid',email_confirmed_at:'2026-01-01',is_anonymous:false},sqlError=null,wrongResult=false,missingProfile=false;
  globalThis.__editorAuthCalls=0;
  globalThis.__editorClient={auth:{async getUser(){return {data:{user},error:null};}},from(table){
    assert.equal(table,'users');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:missingProfile?null:{id:user.id},error:null};}};
  },async rpc(name,args){
    if(sqlError)return {data:null,error:{message:sqlError}};
    try {
      const data=name==='read_owned_editor'?await f.read(args.p_project_id):await f.save(args.p_document,args.p_revision,args.p_operation_id,args.p_project_id);
      return {data:wrongResult?{...data,revision:99}:data,error:null};
    }catch(error){return {data:null,error:{message:error.message}};}
  }};
  const body={operationId:id(10),revision:0,document:emptyDocument()};
  try {
    for(const flag of Object.keys(flags).filter(key=>key!=='NEXT_PUBLIC_SITE_URL')) {
      process.env[flag]='false';assert.equal((await route.GET(null,context(id(2)))).status,503);process.env[flag]=flags[flag];
    }
    assert.equal(globalThis.__editorAuthCalls,0);
    for(const [input,headers,status]of [[body,{origin:'https://foreign.example'},403],[body,{'Content-Type':'text/plain'},415],
      [{...body,actor:a},{},400],[{...body,document:{...body.document,scenes:[{id:id(20),voice_over_beat:'',final_video_prompt:'',video_duration:-1,trim_start:0}]}},{},400]]) {
      assert.equal((await route.PUT(request(input,headers),context(id(2)))).status,status);
    }
    assert.equal(globalThis.__editorAuthCalls,0);
    assert.equal((await route.GET(null,context('../private'))).status,400);assert.equal(globalThis.__editorAuthCalls,0);
    user=null;assert.equal((await route.GET(null,context(id(2)))).status,401);
    user={id:a,email:'a@example.invalid',email_confirmed_at:'2026-01-01'};missingProfile=true;
    assert.equal((await route.GET(null,context(id(2)))).status,403);missingProfile=false;
    const good=await route.PUT(request(body),context(id(2)));assert.equal(good.status,200);assert.deepEqual(await good.json(),{operationId:id(10),revision:1});
    await f.actor(b);user={...user,id:b};assert.equal((await route.GET(null,context(id(2)))).status,404);
    await f.actor();user={...user,id:a};
    for(const [label,status,code]of [['EDITOR_CONFLICT',409,'EDITOR_CONFLICT'],['EDITOR_SCENE_PROTECTED',409,'EDITOR_SCENE_PROTECTED'],['EDITOR_LIMIT',409,'EDITOR_LIMIT'],['REQUEST_RATE_LIMIT',429,'REQUEST_LIMIT'],['Private provider diagnostic credential',503,'SERVICE_UNAVAILABLE']]) {
      sqlError=label;const response=await route.PUT(request(body),context(id(2)));assert.equal(response.status,status);
      const result=await response.json();assert.equal(result.code,code);assert.ok(!JSON.stringify(result).includes('credential'));
      assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('pragma'),'no-cache');
    }
    sqlError=null;wrongResult=true;assert.equal((await route.PUT(request(body),context(id(2)))).status,503);
    assert.equal((await route.GET(null,context(id(2)))).status,200); // 99 is a valid read revision, not a save acknowledgment.
  }finally{
    await f.close();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    delete globalThis.__editorClient;delete globalThis.__editorAuthCalls;
  }
});
