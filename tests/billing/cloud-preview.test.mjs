import assert from "node:assert/strict";
import test from "node:test";
import {loadSource} from "../presentations/load-source.mjs";
const moduleText=value=>`data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const cloud=await loadSource(new URL("../../src/server/generation/cloud-preview.ts",import.meta.url),{
  "server-only":moduleText("export{}"),
  "@remotion/lambda/client":moduleText("export async function renderMediaOnLambda(input){globalThis.__renderCalls.push(input);return {renderId:'fixture-render',bucketName:input.outName.bucketName};}export async function getRenderProgress(){return globalThis.__renderProgress;}"),
  "@aws-sdk/client-s3":moduleText("export class S3Client{async send(input){globalThis.__s3Calls.push(input);return globalThis.__s3Object;}destroy(){}}export class GetObjectCommand{constructor(input){this.input=input;}}"),
});
const environment={COSTLY_FEATURES_ENABLED:"true",CLOUD_PREVIEW_ENABLED:"true",CLOUD_PREVIEW_BOUNDS_ACCEPTED:"true",REMOTION_AWS_REGION:"us-east-1",REMOTION_FUNCTION_NAME:"remotion-fixture",REMOTION_S3_BUCKET_NAME:"fixture-bucket",REMOTION_AWS_ACCESS_KEY_ID:"fixture-key",REMOTION_AWS_SECRET_ACCESS_KEY:"fixture-secret",REMOTION_ACCOUNT_SERVE_URL:"https://fixture-bucket.s3.us-east-1.amazonaws.com/sites/account-preview-v1/index.html"};
const job={id:"10000000-0000-4000-8000-000000000001",actor_id:"10000000-0000-4000-8000-000000000002",project_id:"10000000-0000-4000-8000-000000000003",claim_token:"10000000-0000-4000-8000-000000000004",input:{topic:"History",version:"account-preview-v1"}};
function enable(){const previous=Object.fromEntries(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment);globalThis.__renderCalls=[];globalThis.__s3Calls=[];return()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.__renderCalls;delete globalThis.__s3Calls;delete globalThis.__s3Object;delete globalThis.__renderProgress;};}
test("cloud render uses the versioned five-second private preview with no local fallback",async()=>{
  const restore=enable();try{
    const handle=await cloud.startCloudPreview(job);const input=globalThis.__renderCalls[0];
    assert.equal(input.privacy,"private");assert.equal(input.maxRetries,0);assert.equal(input.forceDurationInFrames,150);assert.equal(input.forceFps,30);assert.equal(input.framesPerLambda,150);assert.equal(input.composition,"AccountPreviewV1");
    globalThis.__renderProgress={done:false,fatalErrorEncountered:false};assert.equal(await cloud.pollCloudPreview(handle,job.id),false);
    await assert.rejects(cloud.pollCloudPreview({...handle,objectKey:"other-owner.mp4"},job.id));
    process.env.COSTLY_FEATURES_ENABLED="false";assert.equal(cloud.cloudPreviewReady(),false);await assert.rejects(cloud.startCloudPreview(job));assert.equal(globalThis.__renderCalls.length,1);
    process.env.COSTLY_FEATURES_ENABLED="true";process.env.REMOTION_ACCOUNT_SERVE_URL="http://localhost/render";assert.equal(cloud.cloudPreviewReady(),false);await assert.rejects(cloud.startCloudPreview(job));assert.equal(globalThis.__renderCalls.length,1);
  }finally{restore();}
});
test("cloud output verifies IAM object and private stored bytes before atomic publication/settlement",async()=>{
  const restore=enable();try{
    const handle=await cloud.startCloudPreview(job),bytes=Buffer.from("0000ftyp000000000000");
    globalThis.__s3Object={ContentLength:bytes.length,Body:(async function*(){yield bytes;})()};
    const calls=[],admin={storage:{from(bucket){assert.equal(bucket,"renders");return {
      async upload(key,value,options){calls.push("upload");assert.equal(key,`${job.actor_id}/${job.project_id}/${job.id}`);assert.equal(options.upsert,false);assert.deepEqual(value,bytes);return {error:null};},
      async download(){calls.push("download");return {data:new Blob([bytes],{type:"video/mp4"}),error:null};},
    };}},async rpc(name,args){calls.push(name);assert.equal(args.p_size,bytes.length);return {error:null};}};
    await cloud.persistCloudPreview(admin,job,handle);assert.deepEqual(calls,["upload","download","finish_private_render_job"]);
    assert.deepEqual(globalThis.__s3Calls[0].input,{Bucket:"fixture-bucket",Key:`account-preview/${job.id}.mp4`});
    globalThis.__s3Object={ContentLength:3145729};calls.length=0;await assert.rejects(cloud.persistCloudPreview(admin,job,handle));assert.deepEqual(calls,[]);
  }finally{restore();}
});
