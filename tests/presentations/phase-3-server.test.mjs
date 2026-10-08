import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { actorId,otherActorId,projectId,sceneId,assets,familyFixture } from './phase-2-fixtures.mjs';
const ioUrl=`data:text/javascript,${encodeURIComponent('let client;export function useClient(value){client=value;}export async function createClient(){return client;}')}`,io=await import(ioUrl);
const billingUrl=`data:text/javascript,${encodeURIComponent('export function createRequestDependencies(){throw Error("BILLING_DISABLED");}export function createBillingAdminClient(){throw Error("must not create admin");}')}`;
const { defaultVisualSettings }=await loadSource(new URL('../../src/lib/presentations/visual-settings.ts',import.meta.url));
const stubs={'server-only':'data:text/javascript,export{}','@/lib/supabase/server':ioUrl,'@/server/billing/runtime':billingUrl};
const { getPresentationSuggestionWorkspace,savePresentationEvidence,suggestPresentations,applyPresentationSuggestion }=await loadSource(new URL('../../src/features/presentations/server/suggestion-actions.ts',import.meta.url),stubs);
const packetId='70000000-0000-4000-8000-000000000001',requestId='80000000-0000-4000-8000-000000000001',operationId='90000000-0000-4000-8000-000000000001',hash='a'.repeat(32),envelope=familyFixture('archival-explainer');
const proposal={sceneId,sequence:1,expectedId:null,expectedRevision:0,previousFamily:null,skipped:null,chosenId:packetId,reason:'Supplied source',notes:[],choices:[{id:packetId,family:'archival-explainer',title:'Reviewed',status:'ready',requirements:[],evidenceIds:[packetId],envelope,timing:{start_time:0,duration:20,duration_mode:'scene-remainder'},anchor:null}]};
const result={version:1,inputHash:hash,scenes:[proposal]};
function fixture(overrides={}){
 const calls=[],snapshot={inputHash:hash,presentations:[],inputs:{project:{id:projectId,topic:'Test source',format:{visual:{presentation:defaultVisualSettings()}},facts:[{id:sceneId,label:'Approved anchor',verified:true},{id:projectId,label:'Unreviewed',verified:false}],visuals:null,words:null,audio:'/narration.wav',ratio:'16:9'},narrations:[],scenes:[{id:sceneId,text:'Supplied narration',duration:20,sequence:1,act:1,mediaId:assets[0].id,mediaUrl:null,mediaType:null}],assets,evidence:[{id:packetId,project_id:projectId,title:'Reviewed',revision:1,envelope}]}};
 const client={calls,auth:{getUser:async()=>({data:{user:overrides.signedOut?null:{id:actorId}},error:null})},from(table){const filters=[];const respond=()=>({data:table==='video_projects'?{id:projectId,workspace_id:projectId}:table==='workspaces'?{user_id:overrides.foreign?otherActorId:actorId}:overrides.list?[]:{result,state:'complete',input_hash:hash},error:null});return {select(){return this;},eq(...value){filters.push(value);return this;},order(){return this;},limit(){return this;},async single(){calls.push({table,filters});return respond();},async maybeSingle(){calls.push({table,filters});return respond();},then(resolve){calls.push({table,filters});return Promise.resolve(respond()).then(resolve);}};},async rpc(name,args){calls.push({name,args});return {data:name==='presentation_suggestion_snapshot'?snapshot:name==='mutate_presentation_evidence'?{id:args.p_id,project_id:projectId,title:args.p_title,revision:1,envelope:args.p_envelope,reviewed_by:actorId,reviewed_at:new Date().toISOString()}:{row:{id:requestId,project_id:projectId,scene_id:sceneId,kind:'scene-template',time_basis:'scene',start_time:0,duration:20,duration_mode:'scene-remainder',revision:1,locked:true,origin:'ai',template_data:envelope},previous:null,replayed:false},error:overrides.rpcError&&name==='apply_presentation_suggestion'?{message:overrides.rpcError}:null};}};return client;
}
test('actual suggestion workspace/source actions require owned access and explicit source approval',async()=>{
 io.useClient(fixture({list:true}));assert.equal((await getPresentationSuggestionWorkspace(projectId)).success,true);
 for(const input of [{signedOut:true},{foreign:true}]){const c=fixture(input);io.useClient(c);assert.equal((await getPresentationSuggestionWorkspace(projectId)).success,false);assert.ok(!c.calls.some(call=>call.name));}
 const client=fixture();io.useClient(client);assert.equal((await savePresentationEvidence({projectId,id:packetId,expectedRevision:0,title:'Reviewed',envelope,reviewed:true})).success,true);assert.equal(client.calls.find(call=>call.name==='mutate_presentation_evidence').args.p_revision,0);
 assert.equal((await savePresentationEvidence({projectId,id:packetId,expectedRevision:0,title:'Reviewed',envelope,reviewed:false})).success,false);
 const uncredited={...envelope,content:{...envelope.content,source:{credit:'',url:'',classification:'unknown'}}};assert.match((await savePresentationEvidence({projectId,id:packetId,expectedRevision:0,title:'Reviewed',envelope:uncredited,reviewed:true})).error,/Credit and classify/);
});
test('actual provider request remains fail-closed when activation or approved billing is unavailable',async()=>{
 const oldFlag=process.env.PRESENTATION_AI_ENABLED,oldKey=process.env.OPENAI_API_KEY;
 try{io.useClient(fixture());delete process.env.PRESENTATION_AI_ENABLED;assert.match((await suggestPresentations({projectId,requestId,sceneIds:[sceneId]})).error,/activation is off/);
 process.env.PRESENTATION_AI_ENABLED='true';process.env.OPENAI_API_KEY='fixture-not-a-real-key';assert.match((await suggestPresentations({projectId,requestId,sceneIds:[sceneId]})).error,/billing\/generation setup/);
 }finally{if(oldFlag===undefined)delete process.env.PRESENTATION_AI_ENABLED;else process.env.PRESENTATION_AI_ENABLED=oldFlag;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('actual apply uses trusted saved choice IDs, rejects forged readiness/content and exposes safe stale/lock conflicts',async()=>{
 const input={projectId,sceneId,runId:requestId,candidateId:packetId,operationId,allowManual:false};
 const client=fixture();io.useClient(client);assert.equal((await applyPresentationSuggestion(input)).success,true);const rpc=client.calls.find(call=>call.name==='apply_presentation_suggestion');assert.equal(rpc.args.p_draft,null);assert.equal(rpc.args.p_candidate,packetId);
 assert.equal((await applyPresentationSuggestion({...input,envelope,ready:true})).success,false);
 for(const [error,pattern]of [['STALE_SUGGESTION',/Inputs changed/],['PRESENTATION_LOCKED',/Keep my edits/],['REVISION_CONFLICT',/changed elsewhere/]]){io.useClient(fixture({rpcError:error}));assert.match((await applyPresentationSuggestion(input)).error,pattern);}
 io.useClient(fixture());assert.equal((await applyPresentationSuggestion({...input,draft:{envelope,timing:proposal.choices[0].timing,reviewed:true}})).success,true);
});
