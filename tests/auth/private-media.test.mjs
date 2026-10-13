import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";
const text=source=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const stubs={"server-only":text("export{}"),"@/lib/supabase/server":text("export async function createClient(){return globalThis.__privateClient}"),"@supabase/supabase-js":text("export function createClient(){globalThis.__adminCreates++;return globalThis.__privateAdmin}")};
const service=await loadSource(new URL("../../src/server/media/private-media.ts",import.meta.url),stubs);
const imports=await loadSource(new URL("../../src/server/media/import-media.ts",import.meta.url),stubs);
const requestHelpers=await loadSource(new URL("../../src/server/access/requests.ts",import.meta.url),stubs);
const a="10000000-0000-4000-8000-000000000001",b="10000000-0000-4000-8000-000000000002",project="20000000-0000-4000-8000-000000000001",workspace="30000000-0000-4000-8000-000000000001",id="40000000-0000-4000-8000-000000000001";
const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(12)]);
function fixture(){
  const keys=["AUTH_LAUNCH_READY","APP_ACCESS_STAGE","OWNERSHIP_MIGRATION_READY","PRIVATE_MEDIA_ENABLED","SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL"];
  const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{AUTH_LAUNCH_READY:"true",APP_ACCESS_STAGE:"auth_only",OWNERSHIP_MIGRATION_READY:"true",PRIVATE_MEDIA_ENABLED:"true",SUPABASE_SERVICE_ROLE_KEY:"synthetic-server-key",NEXT_PUBLIC_SUPABASE_URL:"https://fixture.supabase.co"});
  const state={owner:a,user:{id:a,email:"a@example.com",email_confirmed_at:"now"},asset:null,blob:null,rpc:[],storage:[],failUpload:false,failFinish:false};
  globalThis.__adminCreates=0;
  globalThis.__privateClient={auth:{async getUser(){return {data:{user:state.user},error:null}}},from(table){
    const filters=[];return {select(){return this},eq(...value){filters.push(value);return this},async maybeSingle(){
      const row=table==="users"?{id:a}:table==="workspaces"?{id:workspace,user_id:state.owner}:table==="video_projects"?{id:project,workspace_id:workspace}:state.asset;
      return {data:row && filters.every(([field,value])=>row[field]===value)?row:null,error:null};
    }};
  },async rpc(name,input){
    state.rpc.push(name);
    if(name==="reserve_private_media")state.asset??={id:input.p_id,project_id:input.p_project,actor_id:a,media_id:input.p_id,bucket:"project-media",object_key:`${a}/${project}/${id}`,mime_type:input.p_mime,content_hash:input.p_hash,state:"pending"};
    return {data:id,error:null};
  }};
  globalThis.__privateAdmin={storage:{from(){return {
    async upload(key,data,options){state.storage.push("upload");if(state.failUpload || state.blob)return {error:{message:"upload failed or duplicate"}};state.blob=new Blob([data],{type:options.contentType});return {error:null};},
    async download(){state.storage.push("download");return {data:state.blob,error:state.blob?null:{message:"not found"}};},
    async createSignedUrl(key,expires){state.storage.push("sign");assert.equal(expires,60);return {data:{signedUrl:"https://fixture.supabase.co/storage/private?token=synthetic"},error:null};}
  }}},async rpc(name,input){state.rpc.push(name);if(state.failFinish)return {error:{message:"database unavailable"}};state.asset.state=input.p_ready?"ready":"failed";return {error:null};}};
  return {state,restore(){for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}delete globalThis.__privateClient;delete globalThis.__privateAdmin;delete globalThis.__adminCreates;}};
}
test("foreign, invalid and anonymous uploads have zero storage or reservation side effects",async()=>{
  for(const kind of ["foreign","anonymous","invalid"]){const f=fixture();try{
    if(kind==="foreign")f.state.owner=b;if(kind==="anonymous")f.state.user=null;
    await assert.rejects(service.uploadPrivateMedia(kind==="invalid"?"../path":project,id,bytes,"image/png","image.png"));
    assert.deepEqual(f.state.rpc,[]);assert.deepEqual(f.state.storage,[]);assert.equal(globalThis.__adminCreates,0);
  }finally{f.restore();}}
});
test("uploads await and verify private storage; failed persistence never becomes ready",async()=>{
  const f=fixture();try{
    f.state.failUpload=true;await assert.rejects(service.uploadPrivateMedia(project,id,bytes,"image/png","image.png"),/not persisted/);
    assert.equal(f.state.asset.state,"failed");assert.equal(f.state.storage.includes("sign"),false);
    f.state.failUpload=false;const result=await service.uploadPrivateMedia(project,id,bytes,"image/png","image.png");
    assert.equal(result.url,`/api/media/${id}/content`);assert.equal(f.state.asset.state,"ready");
  }finally{f.restore();}
});
test("persisted-but-unfinalized retries reuse the same key and reject different bytes",async()=>{
  const f=fixture();try{
    f.state.failFinish=true;await assert.rejects(service.uploadPrivateMedia(project,id,bytes,"image/png","image.png"),/confirmation failed/);
    assert.equal(f.state.asset.state,"pending");assert.ok(f.state.blob);
    f.state.failFinish=false;await service.uploadPrivateMedia(project,id,bytes,"image/png","image.png");
    assert.equal(f.state.asset.state,"ready");assert.equal(f.state.storage.filter(value=>value==="upload").length,2);
    f.state.asset.state="pending";f.state.blob=new Blob([Buffer.alloc(20)],{type:"image/png"});
    await assert.rejects(service.uploadPrivateMedia(project,id,bytes,"image/png","image.png"),/not persisted/);
  }finally{f.restore();}
});
test("signing checks current project ownership, asset state and server-derived keys",async()=>{
  const f=fixture();try{
    await service.uploadPrivateMedia(project,id,bytes,"image/png","image.png");
    f.state.storage=[];f.state.owner=b;
    await assert.rejects(service.privateAssetUrl(id));assert.deepEqual(f.state.storage,[]);
    f.state.owner=a;f.state.asset.object_key="../another-owner/private";
    await assert.rejects(service.privateAssetUrl(id));assert.deepEqual(f.state.storage,[]);
    f.state.asset.object_key=`${a}/${project}/${id}`;
    const url=await service.privateAssetUrl(id);assert.match(url,/synthetic/);assert.deepEqual(f.state.storage,["sign"]);
    await assert.rejects(service.privateAssetUrl(id,true),/Export is unavailable/);
  }finally{f.restore();}
});
test("import origins and pinned addresses reject credentials, redirects-to-other-origins and private networks",()=>{
  assert.equal(imports.approvedImportUrl("https://media.example/path.mp4","https://media.example").hostname,"media.example");
  for(const url of ["http://media.example/path","https://user:secret@media.example/a","https://media.example.evil/a","https://localhost/a","https://media.example:444/a","https://media.example/a#x"]){assert.throws(()=>imports.approvedImportUrl(url,"https://media.example"));}
  for(const ip of ["127.0.0.1","10.0.0.1","169.254.169.254","172.16.0.1","192.168.1.1","100.64.0.1","0.0.0.0","::1","198.18.0.1","224.0.0.1"]){assert.equal(imports.isPublicIpv4(ip),false,ip);}
  assert.equal(imports.isPublicIpv4("8.8.8.8"),true);
});
test("bounded streaming and file signatures reject oversized or active content",async()=>{
  assert.throws(()=>service.validateMediaBytes(Buffer.from("<svg>active content</svg>"),"image/svg+xml"));
  assert.throws(()=>service.validateMediaBytes(Buffer.alloc(100),"image/png"));
  await assert.rejects(requestHelpers.readBytes(new Request("https://fixture.example",{method:"POST",body:"x".repeat(100)}),50),/too large/);
  const redirect=await requestHelpers.apiResponse(async()=>Response.redirect("https://fixture.example/private",302));
  assert.equal(redirect.status,302);assert.match(redirect.headers.get("cache-control"),/no-store/);
});
