import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { familyFixture, actorId, projectId, sceneId, assets } from './phase-2-fixtures.mjs';
const empty='data:text/javascript,export{}';
const { planPresentations }=await loadSource(new URL('../../src/features/presentations/server/suggestion-service.ts',import.meta.url),{'server-only':empty});
const { defaultVisualSettings }=await loadSource(new URL('../../src/lib/presentations/visual-settings.ts',import.meta.url));
const requestId='80000000-0000-4000-8000-000000000001',hash='a'.repeat(32);
function fixture(count=1,changes={}){
 const context={inputHash:hash,project:{id:projectId,topic:'Authored documentary',format:{content:{rule:'Never claim proof'}},facts:[],ratio:'16:9'},settings:defaultVisualSettings(),assets,evidence:[{id:'70000000-0000-4000-8000-000000000001',project_id:projectId,title:'Supplied archival explanation',revision:1,envelope:familyFixture('archival-explainer')}],scenes:Array.from({length:count},(_,index)=>({id:index===0?sceneId:`30000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,text:'This is NOT proof of a spacecraft. Read the source as tradition.',duration:20,sequence:index+1,act:1,mediaId:assets[0].id,mediaUrl:null,mediaType:null,words:[],row:null,unsupported:false,...changes}))};
 const operations=new Map(),settlements=[],providerPrompts=[];let run=null;
 const billing={enabled:true,maxPending:4,approvedPlans:[{id:'creator',version:'fixture',approved:true,workspaceLimit:1,features:['generation'],limits:Object.fromEntries(['projects','images','video_seconds','narration_characters','transcription_seconds','llm_tokens','render_seconds','storage_bytes'].map(key=>[key,1000000]))}],verifyActor:async()=>({id:actorId}),repository:{getAccountForActor:async()=>({id:projectId,ownerId:actorId,enabled:true}),getResourceOwner:async()=>actorId,getCurrentSubscription:async()=>({accountId:projectId,ownerId:actorId,accountEnabled:true,isCurrent:true,status:'active',planId:'creator',catalogVersion:'fixture',verifiedAt:new Date(Date.now()-10000).toISOString(),accessStartsAt:new Date(Date.now()-20000).toISOString(),accessExpiresAt:new Date(Date.now()+60000).toISOString(),pauseCollection:false}),reserve:async value=>{const exists=operations.get(value.operationKey);if(exists)return {...exists,created:false};const operation={id:`90000000-0000-4000-8000-${String(operations.size+1).padStart(12,'0')}`,state:'reserved',created:true};operations.set(value.operationKey,{...operation,input:value});return operation;},settle:async value=>{settlements.push(value);return {id:value.operationId,state:value.outcome==='provider_completed'?'committed':'unknown',changed:true};}}};
 const store={claim:async input=>{if(run)return {created:false,run};run=input;return {created:true,run};},update:async(_id,patch)=>{run={...run,...patch};}};
 const direct=async prompt=>{providerPrompts.push(prompt);const parsed=JSON.parse(prompt);return {decisions:parsed.scenes.toReversed().map(scene=>({sceneId:scene.id,candidateId:context.evidence[0].id,reason:'Explain the supplied source without asserting the negated claim.',alternatives:['clean'],anchorPhrase:'',anchorOccurrence:0})),requestId:'fixture-provider-id'};};
 return {context,options:{context,targetIds:context.scenes.map(scene=>scene.id),actorId,requestId,billing,store,direct},operations,settlements,providerPrompts,getRun:()=>run};
}
test('real shared service meters bounded windows, preserves negations and returns scene-keyed results',async()=>{
 const f=fixture(10),result=await planPresentations(f.options);assert.equal(result.scenes.length,10);assert.equal(f.providerPrompts.length,2);assert.equal(f.operations.size,2);
 assert.match(f.providerPrompts[0],/NOT proof/);assert.equal(JSON.parse(f.providerPrompts[1]).recentFamilies.length,3);assert.equal(JSON.parse(f.providerPrompts[0]).scenes.length,8);
 assert.equal(JSON.parse(f.providerPrompts[0]).sourceCatalog.length,1);assert.ok(!Object.hasOwn(JSON.parse(f.providerPrompts[0]).scenes[0].candidates[0],'content'));
 assert.ok([...f.operations.values()].every(value=>value.input.items.llm_tokens>2600));assert.equal(f.settlements.filter(item=>item.outcome==='provider_completed').length,2);assert.equal(f.getRun().state,'complete');
 const replay=await planPresentations(f.options);assert.deepEqual(replay,result);assert.equal(f.providerPrompts.length,2);
 await assert.rejects(planPresentations({...f.options,context:{...f.context,inputHash:'b'.repeat(32)}}),/Inputs changed/);
});
test('uncertain provider and malformed scene-keyed responses preserve reservations and cannot silently retry',async()=>{
 for(const direct of [async()=>{throw Error('timeout');},async()=>({decisions:[{sceneId:projectId,candidateId:'clean'}],requestId:'fixture'})]){
 const f=fixture();await assert.rejects(planPresentations({...f.options,direct}));assert.equal(f.getRun().state,'unknown');assert.equal(f.settlements.length,1);assert.equal(f.settlements[0].outcome,'submission_uncertain');
 await assert.rejects(planPresentations(f.options),/pending or failed/);assert.equal(f.providerPrompts.length,0);
 }
});
test('billing-disabled, signed-out and locked targets never invoke a provider',async()=>{
 const disabled=fixture();await assert.rejects(planPresentations({...disabled.options,billing:{...disabled.options.billing,enabled:false}}),/BILLING_DISABLED/);assert.equal(disabled.providerPrompts.length,0);
 const signedOut=fixture();await assert.rejects(planPresentations({...signedOut.options,billing:{...signedOut.options.billing,verifyActor:async()=>null}}),/AUTH_REQUIRED/);assert.equal(signedOut.providerPrompts.length,0);
 const locked=fixture(1,{row:{id:projectId,locked:true,revision:1,origin:'user',template_data:familyFixture('archival-explainer')}});await assert.rejects(planPresentations(locked.options),/no provider call/);assert.equal(locked.operations.size,0);
 const manual=fixture(1,{row:{id:projectId,locked:false,revision:1,origin:'user',template_data:familyFixture('archival-explainer')}});await assert.rejects(planPresentations(manual.options),/manually protected/);assert.equal(manual.operations.size,0);assert.equal((await planPresentations({...manual.options,includeManual:true})).scenes.length,1);
});
