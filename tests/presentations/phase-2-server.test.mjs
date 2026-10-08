import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { actorId,otherActorId,projectId,sceneId,assets,familyFixture } from './phase-4-fixtures.mjs';
const ioUrl=`data:text/javascript,${encodeURIComponent('let client;export function useClient(value){client=value;}export async function createClient(){return client;}')}`,io=await import(ioUrl);
const stubs={'@/lib/supabase/server':ioUrl};
const { loadPresentationContext,getPresentationVisualSettings,savePresentationVisualSettings }=await loadSource(new URL('../../src/features/presentations/server/context.ts',import.meta.url),stubs);
const { saveScenePresentation }=await loadSource(new URL('../../src/features/presentations/server/actions.ts',import.meta.url),stubs);
const { prepareProjectPresentations }=await loadSource(new URL('../../src/features/presentations/server/export.ts',import.meta.url));
const { DOCUMENTARY_TEMPLATES }=await loadSource(new URL('../../src/lib/presentations/registry.ts',import.meta.url));
const { defaultVisualSettings }=await loadSource(new URL('../../src/lib/presentations/visual-settings.ts',import.meta.url));
function fixture(overrides={}){
 const calls=[],rows=[{id:'60000000-0000-4000-8000-000000000001',project_id:projectId,scene_id:sceneId,kind:'scene-template',time_basis:'scene',start_time:0,duration:20,duration_mode:'scene-remainder',revision:1,locked:true,origin:'user',template_data:overrides.envelope??familyFixture('manuscript-highlight')}];
 const client={calls,auth:{async getUser(){return {data:{user:overrides.signedOut?null:{id:actorId}},error:null};}},from(table){
  const filters=[];const result=()=>({data:table==='video_projects'?{id:projectId,workspace_id:projectId,format_blueprint_snapshot:{visual:{presentation:{...defaultVisualSettings(),themeId:'parchment-archive'}}},presentation_visual_settings:overrides.settings,presentation_visual_revision:3}:table==='workspaces'?{user_id:overrides.ownerId??actorId,format_blueprint:{content:{sourcingRule:'Retain'},visual:{presentation:defaultVisualSettings()}},format_blueprint_version:2}:table==='scenes'?[{id:sceneId,video_duration:20}]:table==='overlay_clips'?overrides.rows??rows:assets.map(asset=>({id:asset.id,project_id:asset.projectId,media_type:asset.mediaType,status:asset.status,url:asset.url,original_filename:asset.name})),error:overrides[`${table}Error`]??null});
  return {select(){return this;},eq(...args){filters.push(args);return this;},in(...args){filters.push(args);return this;},async single(){calls.push({table,filters});return result();},async maybeSingle(){calls.push({table,filters});const r=result();return {...r,data:table==='scenes'?r.data[0]:r.data};},then(resolve){calls.push({table,filters});return Promise.resolve(result()).then(resolve);}};
 },async rpc(name,args){calls.push({name,args});return {data:name==='mutate_presentation_visuals'?{settings:args.p_settings,revision:4}:{row:{...rows[0],template_data:args.p_envelope},previous:null,replayed:false},error:overrides.rpcError??null};}};
 return client;
}
test('actual owned context uses frozen defaults, project overrides, and retains unsupported rows as blockers',async()=>{
 io.useClient(fixture());let result=await loadPresentationContext(projectId);assert.equal(result.success,true);assert.equal(result.settings.themeId,'parchment-archive');assert.equal(result.rows[0].template_data.templateId,'manuscript-highlight');assert.equal(result.assets.length,2);
 io.useClient(fixture({settings:defaultVisualSettings()}));result=await loadPresentationContext(projectId);assert.equal(result.settings.themeId,'dark-documentary');
 io.useClient(fixture({rows:[{scene_id:sceneId,kind:'scene-template',template_data:{templateVersion:99}}]}));result=await loadPresentationContext(projectId);assert.deepEqual(result.unsupportedSceneIds,[sceneId]);assert.deepEqual(result.rows,[]);
 for(const overrides of [{signedOut:true},{ownerId:otherActorId},{mediaError:{message:'unavailable'}},{settings:{version:99}}]){io.useClient(fixture(overrides));assert.equal((await loadPresentationContext(projectId)).success,false);}
});
test('actual visual actions narrowly address the CAS RPC, validate input, and return conflicts without overwriting',async()=>{
 const client=fixture();io.useClient(client);assert.equal((await getPresentationVisualSettings('workspace',projectId)).revision,2);
 let result=await savePresentationVisualSettings('workspace',projectId,2,defaultVisualSettings());assert.equal(result.success,true);const rpc=client.calls.find(call=>call.name);assert.equal(rpc.name,'mutate_presentation_visuals');assert.equal(rpc.args.p_expected_revision,2);assert.equal(rpc.args.p_scope,'workspace');assert.equal(Object.hasOwn(rpc.args,'format_blueprint'),false);
 io.useClient(fixture({rpcError:{message:'REVISION_CONFLICT'}}));result=await savePresentationVisualSettings('project',projectId,3,defaultVisualSettings());assert.match(result.error,/another tab/);
 io.useClient(fixture({rpcError:{message:'PGRST202 mutate_presentation_visuals'}}));assert.match((await savePresentationVisualSettings('project',projectId,3,defaultVisualSettings())).error,/Phase 2/);
 const invalid=fixture();io.useClient(invalid);assert.equal((await savePresentationVisualSettings('project',projectId,3,{version:99})).success,false);assert.deepEqual(invalid.calls,[]);
});
test('actual save and authoritative export support every family without trusting supplied image URLs',async()=>{
 for(const {id}of DOCUMENTARY_TEMPLATES.slice(0,14)){const envelope=familyFixture(id),client=fixture({envelope});io.useClient(client);const result=await saveScenePresentation({projectId,sceneId,operationId:'50000000-0000-4000-8000-000000000001',expectedId:null,expectedRevision:0,action:'save',envelope,timing:{start_time:0,duration:20,duration_mode:'scene-remainder'},locked:true});assert.equal(result.success,true,id);assert.equal(client.calls.find(call=>call.name).args.p_envelope.templateId,id);
 const payload={projectId,fps:30,scenes:[{id:sceneId,durationInSeconds:20,presentation:{envelope,assets:[{url:'https://untrusted.test/forged'}]}}]};const prepared=await prepareProjectPresentations(client,payload);assert.equal(prepared.scenes[0].presentation.envelope.templateId,id);assert.ok(prepared.scenes[0].presentation.assets.every(asset=>asset.url!=='https://untrusted.test/forged'));
 }
});
