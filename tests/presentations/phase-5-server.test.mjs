import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { assets,references,projectId,sceneId,actorId,familyFixture } from './phase-5-fixtures.mjs';
const boundary=`data:text/javascript,${encodeURIComponent('let client;export function useClient(value){client=value;}export async function createClient(){return client;}')}`,io=await import(boundary);
const {saveScenePresentation}=await loadSource(new URL('../../src/features/presentations/server/actions.ts',import.meta.url),{'@/lib/supabase/server':boundary});
const {prepareProjectPresentations}=await loadSource(new URL('../../src/features/presentations/server/export.ts',import.meta.url));
const {PHASE_5_FAMILIES}=await loadSource(new URL('../../src/lib/presentations/registry.ts',import.meta.url));
function clientFixture(envelope,refs=references){
  const calls=[],row={id:'60000000-0000-4000-8000-000000000001',project_id:projectId,scene_id:sceneId,kind:'scene-template',time_basis:'scene',start_time:0,duration:120,duration_mode:'scene-remainder',revision:1,locked:true,origin:'user',template_data:envelope};
  const scenes=refs.map(scene=>({id:scene.id,project_id:projectId,sequence_number:scene.sequence,media_id:scene.mediaId,video_duration:120}));
  return {calls,auth:{async getUser(){return {data:{user:{id:actorId}},error:null};}},from(table){const filters=[];const result=()=>{
    let data=table==='video_projects'?{id:projectId,workspace_id:projectId}:table==='workspaces'?{user_id:actorId}:table==='scenes'?scenes:table==='overlay_clips'?[row]:assets.map(asset=>({id:asset.id,project_id:asset.projectId,media_type:asset.mediaType,status:asset.status,url:asset.url,original_filename:asset.name}));
    if(Array.isArray(data))for(const [op,key,value]of filters)if(op==='in')data=data.filter(item=>value.includes(item[key]));else data=data.filter(item=>item[key]===value);
    return {data,error:null};};
    return {select(){return this;},eq(key,value){filters.push(['eq',key,value]);return this;},in(key,value){filters.push(['in',key,value]);return this;},async single(){calls.push({table,filters});return result();},async maybeSingle(){calls.push({table,filters});const response=result();return {...response,data:Array.isArray(response.data)?response.data[0]:response.data};},then(resolve){calls.push({table,filters});return Promise.resolve(result()).then(resolve);}};
  },async rpc(name,args){calls.push({name,args});return {data:{row:{...row,template_data:args.p_envelope},previous:null,replayed:false},error:null};}};
}
test('actual manual save and authoritative export accept all ten advanced contracts and resolve durable image slots',async()=>{
  for(const id of PHASE_5_FAMILIES){const envelope=familyFixture(id),client=clientFixture(envelope);io.useClient(client);
    const saved=await saveScenePresentation({projectId,sceneId,operationId:assets[0].id,expectedId:null,expectedRevision:0,action:'save',envelope,timing:{start_time:0,duration:120,duration_mode:'scene-remainder'},locked:true});assert.equal(saved.success,true,`${id}: ${saved.error}`);assert.equal(client.calls.find(call=>call.name).args.p_envelope.templateId,id);
    const payload={projectId,fps:30,scenes:references.map(scene=>({id:scene.id,durationInSeconds:120,presentation:scene.id===sceneId?{envelope,assets:[{url:'https://forged.example/private'}]}:undefined}))};
    const prepared=await prepareProjectPresentations(client,payload),render=prepared.scenes.find(scene=>scene.id===sceneId).presentation;assert.equal(render.envelope.templateId,id);assert.ok(render.assets.every(asset=>asset.url!=='https://forged.example/private'));
  }
});
test('actual save and export recheck recap scene deletion, relinking and reordering instead of trusting preview state',async()=>{
  for(const refs of [references.filter(scene=>scene.id!==references[0].id),references.map((scene,i)=>i===0?{...scene,sequence:4}:scene),references.map((scene,i)=>i===0?{...scene,mediaId:assets[2].id}:scene)]){
    const envelope=familyFixture('chapter-recap'),client=clientFixture(envelope,refs);io.useClient(client);
    const saved=await saveScenePresentation({projectId,sceneId,operationId:assets[0].id,expectedId:null,expectedRevision:0,action:'save',envelope,timing:{start_time:0,duration:120,duration_mode:'scene-remainder'},locked:true});assert.equal(saved.success,false);assert.match(saved.error,/recap image|Repair/);assert.equal(client.calls.some(call=>call.name),false);
    await assert.rejects(prepareProjectPresentations(client,{projectId,fps:30,scenes:references.map(scene=>({id:scene.id,durationInSeconds:120}))}),/belong|recap image|Repair/);
  }
});
