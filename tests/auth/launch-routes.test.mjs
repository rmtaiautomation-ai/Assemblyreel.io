import assert from "node:assert/strict";
import test from "node:test";
import {loadSource} from "../presentations/load-source.mjs";
const moduleText=value=>`data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const stubs={"server-only":moduleText("export{}"),"@/lib/supabase/server":moduleText("export async function createClient(){globalThis.__launchAuthCalls++;return globalThis.__launchAuth;}"),
  "@/server/billing/runtime":moduleText("export function createBillingAdminClient(){globalThis.__launchAdminCalls++;return globalThis.__launchAdmin;}export function createRequestDependencies(){throw new Error('BILLING_DISABLED')}"),
};
const enroll=await loadSource(new URL("../../src/app/api/account/billing/enroll/route.ts",import.meta.url),stubs);
const jobs=await loadSource(new URL("../../src/app/api/account/jobs/route.ts",import.meta.url),stubs);
const details=await loadSource(new URL("../../src/app/api/account/jobs/[jobId]/route.ts",import.meta.url),stubs);
const a="10000000-0000-4000-8000-000000000001",project="20000000-0000-4000-8000-000000000001",workspace="30000000-0000-4000-8000-000000000001",operation="40000000-0000-4000-8000-000000000001";
function enable(){const values={AUTH_LAUNCH_READY:"true",APP_ACCESS_STAGE:"auth_only",OWNERSHIP_MIGRATION_READY:"true",OWNED_CONTENT_ENABLED:"true",DURABLE_JOBS_ENABLED:"true",JOBS_MIGRATION_READY:"true",MOCK_JOBS_ENABLED:"true",BILLING_MIGRATION_READY:"true",BILLING_STRIPE_MODE:"test",NEXT_PUBLIC_SITE_URL:"https://staging.example"};
  const old=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);globalThis.__launchAuthCalls=0;globalThis.__launchAdminCalls=0;
  return()=>{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}for(const key of ["__launchAuthCalls","__launchAdminCalls","__launchAuth","__launchAdmin"])delete globalThis[key];};
}
function client(foreign=false,user={id:a,email:"a@example.com",email_confirmed_at:"now",is_anonymous:false}) {
  return {auth:{getUser:async()=>({data:{user},error:null})},from(table){const filters={};return {select(){return this;},eq(key,value){filters[key]=value;return this;},async maybeSingle(){
    if(table==="users"){assert.equal(filters.id,a);return {data:{id:a},error:null};}
    if(table==="video_projects")return {data:{id:project,workspace_id:workspace,topic:"Manual topic"},error:null};
    if(table==="workspaces"){assert.equal(filters.user_id,a);return {data:foreign?null:{id:workspace,user_id:a,name:"A",content_theme:"History"},error:null};}
    if(table==="generation_jobs"){assert.equal(filters.actor_id,a);return {data:foreign?null:{id:operation,project_id:project,state:"succeeded",output:"Private"},error:null};}
    throw new Error("Unexpected table");
  }};}};
}
const request=(body,origin="https://staging.example")=>new Request("https://staging.example/api/account/jobs",{method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(body)});
test("sandbox enrollment derives confirmed actor and rejects wrong mode/origin before privileged work",async()=>{
  const restore=enable();const calls=[];
  try{globalThis.__launchAuth=client();globalThis.__launchAdmin={rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
    assert.equal((await enroll.POST(request({userId:"foreign"}))).status,200);assert.deepEqual(calls,[{name:"enroll_personal_billing",args:{p_actor_id:a}}]);
    assert.equal((await enroll.POST(request({},"https://evil.example"))).status,403);
    process.env.BILLING_STRIPE_MODE="live";assert.equal((await enroll.POST(request({}))).status,503);
    assert.equal(calls.length,1);process.env.BILLING_STRIPE_MODE="test";globalThis.__launchAuth=client(false,null);
    assert.equal((await enroll.POST(request({}))).status,401);assert.equal(calls.length,1);
  }finally{restore();}
});
test("job submission rejects client quantities and foreign projects before admin queue access",async()=>{
  const restore=enable();const calls=[];
  try{globalThis.__launchAuth=client();globalThis.__launchAdmin={rpc:async(name,args)=>{calls.push({name,args});return {data:operation,error:null};}};
    const input={kind:"mock_script",projectId:project,operationId:operation};
    assert.equal((await jobs.POST(request({...input,tokens:1,userId:a}))).status,400);
    assert.equal(globalThis.__launchAdminCalls,0);
    globalThis.__launchAuth=client(true);assert.equal((await jobs.POST(request(input))).status,404);assert.equal(globalThis.__launchAdminCalls,0);
    globalThis.__launchAuth=client();assert.equal((await jobs.POST(request(input))).status,202);
    assert.equal(calls[0].name,"enqueue_generation_job");assert.equal(calls[0].args.p_actor_id,a);assert.equal(calls[0].args.p_input.topic,"Manual topic");
    assert.equal(calls[0].args.p_account_id,null);assert.match(calls[0].args.p_fingerprint,/^[a-f0-9]{64}$/);
    globalThis.__launchAuth=client(true);const context={params:Promise.resolve({jobId:operation})};
    assert.equal((await details.GET(new Request("https://staging.example"),context)).status,404);
    assert.equal(calls.length,1);
  }finally{restore();}
});
