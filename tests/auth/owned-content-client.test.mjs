import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';

const client=await loadSource(new URL('../../src/features/workspaces/owned-content-client.ts',import.meta.url));
const id='abcdef00-0000-4000-8000-000000000010';

test('an uncertain save retries the exact original payload and operation after fields change',async()=>{
  const previous=globalThis.fetch,requests=[];
  const fields={workspace_id:id,topic:'Original topic'};
  const save=client.prepareOwnedSave('project',fields,id);
  fields.topic='Edited after sending';
  globalThis.fetch=async(path,init)=>{
    requests.push({path,body:init.body,cache:init.cache});
    if(requests.length===1)throw new TypeError('connection lost after commit');
    return Response.json({id});
  };
  try {
    await assert.rejects(client.sendOwnedSave(save),error=>client.shouldRetryOwnedSave(error));
    assert.deepEqual(await client.sendOwnedSave(save),{id});
    assert.deepEqual(requests[0],requests[1]);
    assert.equal(JSON.parse(requests[1].body).project.topic,'Original topic');
    assert.equal(requests[1].path,'/api/account/projects');
    assert.equal(requests[1].cache,'no-store');
  } finally {globalThis.fetch=previous;}
});

test('quota and request-limit errors remain distinct and provider diagnostics stay private',async()=>{
  const previous=globalThis.fetch;
  try {
    for(const [status,code,retry,text]of [
      [409,'WORKSPACE_LIMIT',false,/three workspaces/],
      [409,'PROJECT_LIMIT',false,/ten projects/],
      [429,'REQUEST_LIMIT',true,/wait/],
      [401,'AUTH_REQUIRED',false,/Log in/],
      [403,'PROFILE_REQUIRED',false,/awaiting setup/],
      [503,'PRIVATE_PROVIDER_DIAGNOSTIC',true,/retry/],
    ]) {
      globalThis.fetch=async()=>Response.json({code,error:'private provider diagnostic'},{status});
      await assert.rejects(client.ownedJson('/api/account/workspaces'),error=>{
        assert.match(client.ownedErrorMessage(error),text);
        assert.ok(!error.message.includes('private provider diagnostic'));
        assert.equal(client.shouldRetryOwnedSave(error),retry);return true;
      });
    }
  } finally {globalThis.fetch=previous;}
});

test('malformed or mismatched successful save results never claim completion',async()=>{
  const previous=globalThis.fetch;
  const save=client.prepareOwnedSave('workspace',{name:'Fixture',content_theme:'History'},id);
  try {
    for(const response of [Response.json({id:'different'}),new Response('not json',{status:201})]) {
      globalThis.fetch=async()=>response;
      await assert.rejects(client.sendOwnedSave(save),error=>error.status===503&&client.shouldRetryOwnedSave(error));
    }
  } finally {globalThis.fetch=previous;}
});
