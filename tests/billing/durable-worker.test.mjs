import assert from "node:assert/strict";
import test from "node:test";
import {importTypeScript} from "./import-typescript.mjs";
import {loadSource} from "../presentations/load-source.mjs";
const {executeGenerationJob}=await importTypeScript(new URL("../../src/server/generation/job-worker.ts",import.meta.url),{serverOnly:true});
const {generateHostedScript}=await importTypeScript(new URL("../../src/server/generation/script-provider.ts",import.meta.url),{serverOnly:true});
const job={id:"10000000-0000-4000-8000-000000000001",actor_id:"10000000-0000-4000-8000-000000000002",project_id:"10000000-0000-4000-8000-000000000003",
  kind:"mock_script",state:"claimed",claim_token:"10000000-0000-4000-8000-000000000004",account_id:null,billing_operation_id:null,input:{topic:"History",version:"short-script-v1"},output:null,provider_request_id:null};
test("worker has no request cookies and does not resubmit a claimed/completed job",async()=>{
  let providerCalls=0;const calls=[];const prior=process.env.MOCK_JOBS_ENABLED;process.env.MOCK_JOBS_ENABLED="true";
  try{
    const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==="claim_generation_job"?job:null,error:null};}};
    assert.equal((await executeGenerationJob(admin,job.id,async()=>{providerCalls++;})).state,"succeeded");
    assert.equal(providerCalls,0);assert.deepEqual(calls.map(call=>call.name),["claim_generation_job","begin_generation_submission","finish_generation_job"]);
    assert.match(calls[2].args.p_output,/No provider was called/);
    admin.rpc=async()=>({data:null,error:null});assert.equal((await executeGenerationJob(admin,job.id)).state,"unchanged");
  }finally{if(prior===undefined)delete process.env.MOCK_JOBS_ENABLED;else process.env.MOCK_JOBS_ENABLED=prior;}
});
test("worker distinguishes pre-submission no-work from uncertain persistence",async()=>{
  const prior=process.env.MOCK_JOBS_ENABLED;const outcomes=[];process.env.MOCK_JOBS_ENABLED="false";
  try{
    const admin={rpc:async(name,args)=>{if(name==="finish_generation_job")outcomes.push(args.p_outcome);return {data:name==="claim_generation_job"?job:null,error:null};}};
    assert.equal((await executeGenerationJob(admin,job.id)).state,"canceled");
    process.env.MOCK_JOBS_ENABLED="true";
    admin.rpc=async(name,args)=>{if(name==="finish_generation_job"){outcomes.push(args.p_outcome);return {data:null,error:args.p_outcome==="succeeded"?{}:null};}return {data:name==="claim_generation_job"?job:null,error:null};};
    assert.equal((await executeGenerationJob(admin,job.id)).state,"unknown");
    assert.deepEqual(outcomes,["canceled","succeeded","unknown"]);
  }finally{if(prior===undefined)delete process.env.MOCK_JOBS_ENABLED;else process.env.MOCK_JOBS_ENABLED=prior;}
});
test("hosted adapter uses fixed model and bounds, never tools or automatic network retry",async()=>{
  const values={COSTLY_FEATURES_ENABLED:"true",HOSTED_SCRIPT_ENABLED:"true",HOSTED_SCRIPT_BOUNDS_ACCEPTED:"true",OPENAI_API_KEY:"sk-syntheticOfflineFixture123456"};
  const prior=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);let calls=0;
  try{
    const fetcher=async(url,options)=>{calls++;assert.equal(url,"https://api.openai.com/v1/responses");const body=JSON.parse(options.body);
      assert.equal(body.model,"gpt-4.1-mini-2025-04-14");assert.equal(body.max_output_tokens,1024);assert.equal(body.store,false);assert.deepEqual(body.tools,[]);
      return Response.json({id:"resp_fixture",status:"completed",usage:{total_tokens:100},output:[{type:"message",content:[{type:"output_text",text:"Private script"}]}]});};
    assert.deepEqual(await generateHostedScript(job.input,fetcher),{output:"Private script",requestId:"resp_fixture"});
    await assert.rejects(generateHostedScript({...job.input,topic:"x".repeat(201)},fetcher));assert.equal(calls,1);
    await assert.rejects(generateHostedScript(job.input,async()=>{calls++;throw new Error("timeout");}));assert.equal(calls,2);
    process.env.COSTLY_FEATURES_ENABLED="false";await assert.rejects(generateHostedScript(job.input,fetcher));assert.equal(calls,2);
  }finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("accepted cloud work resumes polling after restart without another provider submission",async()=>{
  const moduleText=value=>`data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
  const worker=await loadSource(new URL("../../src/server/generation/job-worker.ts",import.meta.url),{
    "server-only":moduleText("export{}"),"@/server/billing/supabase-repository":moduleText(`export function createBillingRepository(){return {getResourceOwner:async()=>${JSON.stringify(job.actor_id)}}}`),
  });
  const render={...job,kind:"cloud_render",provider_handle:{renderId:"fixture",bucketName:"fixture-bucket",region:"us-east-1",functionName:"remotion-fixture",objectKey:`account-preview/${job.id}.mp4`}};
  let starts=0,polls=0,persists=0;const calls=[];
  const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==="claim_generation_job"?render:null,error:null};}};
  const cloud={start:async()=>{starts++;throw new Error("Should not submit");},poll:async()=>{polls++;return false;},persist:async()=>{persists++;}};
  assert.equal((await worker.executeGenerationJob(admin,job.id,undefined,cloud)).state,"awaiting_provider");
  assert.deepEqual(calls.map(call=>call.name),["claim_generation_job","accept_generation_render"]);
  cloud.poll=async()=>{polls++;return true;};assert.equal((await worker.executeGenerationJob(admin,job.id,undefined,cloud)).state,"succeeded");
  cloud.persist=async()=>{persists++;throw new Error("storage unavailable");};assert.equal((await worker.executeGenerationJob(admin,job.id,undefined,cloud)).state,"unknown");
  assert.equal(starts,0);assert.equal(polls,3);assert.equal(persists,2);
  assert.equal(calls.at(-1).args.p_outcome,"unknown");
});
