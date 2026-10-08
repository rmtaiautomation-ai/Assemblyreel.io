import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { familyFixture, projectId, sceneId, assets } from './phase-2-fixtures.mjs';
const { candidatesForScene, validateDecision, anchorTiming, paceSuggestions, evidenceIssues, suggestionCanApply } = await loadSource(new URL('../../src/lib/presentations/suggestions.ts',import.meta.url));
const { defaultVisualSettings } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts',import.meta.url));
const scene = { id:sceneId,text:'Not proof. The source says this. The source says this.',duration:20,sequence:1,act:1,mediaId:assets[0].id,mediaUrl:null,mediaType:null,words:[],row:null,unsupported:false };
const packet = (id='archival-explainer') => ({ id:'70000000-0000-4000-8000-000000000001',project_id:projectId,title:'Authored test source',revision:1,envelope:familyFixture(id) });
const decision = (candidateId, extras={}) => ({ sceneId,candidateId,reason:'Explain the supplied source without claiming proof.',alternatives:['clean'],anchorPhrase:'',anchorOccurrence:0,...extras });

test('AI candidates reuse exact approved content; image availability never fabricates source-sensitive content',()=>{
 const candidates=candidatesForScene(scene,[packet('text-translation')],defaultVisualSettings(),assets,projectId);
 assert.deepEqual(candidates.find(item=>item.id===packet().id).envelope.content,packet('text-translation').envelope.content);
 assert.equal(candidates.find(item=>item.id==='missing:map-locator').status,'needs-source-review');
 assert.equal(candidates.find(item=>item.id==='missing:manuscript-highlight').envelope,null);
 assert.ok(candidates.every(item=>!Object.hasOwn(item,'confidence')));
 const hidden=candidatesForScene(scene,[],{...defaultVisualSettings(),allowedFamilies:[]},assets,projectId);assert.deepEqual(hidden.map(item=>item.family),['clean']);
 const foreign=candidatesForScene(scene,[{...packet('artifact-spotlight'),project_id:sceneId}],defaultVisualSettings(),assets,projectId);assert.ok(!foreign.some(item=>item.id===packet().id));
});
test('missing assets and insufficient or estimated narration timing remain non-ready',()=>{
 const short=candidatesForScene({...scene,duration:2},[packet('artifact-spotlight')],defaultVisualSettings(),assets,projectId);assert.equal(short.find(item=>item.id===packet().id).status,'needs-timing-review');
 const estimated=candidatesForScene({...scene,timingVerified:false},[packet('archival-explainer')],defaultVisualSettings(),assets,projectId);assert.equal(estimated.find(item=>item.id===packet().id).status,'needs-timing-review');
 const missing=candidatesForScene({...scene,mediaId:null},[packet('artifact-spotlight')],defaultVisualSettings(),[],projectId);assert.equal(missing[0].status,'needs-assets');assert.equal(missing.find(item=>item.id===packet().id).status,'needs-assets');
});
test('only explicit source approval with credit and classification qualifies as evidence',()=>{
 const supplied=familyFixture('archival-explainer');assert.deepEqual(evidenceIssues(supplied),[]);
 assert.ok(evidenceIssues({...supplied,content:{...supplied.content,source:{credit:'',url:'',classification:'unknown'}}}).length);
 const unreviewed={...packet(),envelope:{...supplied,content:{...supplied.content,source:{credit:'',url:'',classification:'unknown'}}}};
 assert.equal(candidatesForScene(scene,[unreviewed],defaultVisualSettings(),assets,projectId).find(candidate=>candidate.id===unreviewed.id).status,'needs-source-review');
 assert.ok(evidenceIssues({...supplied,templateId:'clean',content:{}}).length);
});
test('exact cue occurrences use measured whole-scene alignment or require timing review',()=>{
 const text='The source says this. The source says this.',words=text.split(' ').map((text,index)=>({text,startMs:index*500,endMs:index*500+400}));
 assert.deepEqual(anchorTiming({...scene,text,words},'The source',1),{start:2,estimated:false});
 assert.deepEqual(anchorTiming({...scene,text,words:[]},'The source',1),{start:0,estimated:true});
 assert.throws(()=>anchorTiming(scene,'The source',8),/exact occurrence/);
 assert.throws(()=>anchorTiming(scene,'the Source',0),/exact occurrence/);
 assert.throws(()=>anchorTiming(scene,'The source',-1),/exact occurrence/);
 const candidates=candidatesForScene(scene,[packet('archival-explainer')],defaultVisualSettings(),assets,projectId);
 const result=validateDecision(decision(packet().id,{anchorPhrase:'The source',anchorOccurrence:1}),scene,candidates,assets,projectId);assert.equal(result.choices[0].status,'needs-timing-review');
});
test('director choices reject unknown, duplicate and out-of-scope alternative IDs',()=>{
 const candidates=candidatesForScene(scene,[packet('archival-explainer')],defaultVisualSettings(),assets,projectId);
 for(const value of [decision('untrusted'),decision(packet().id,{alternatives:[packet().id]}),decision(packet().id,{alternatives:['clean','missing:future']})])assert.throws(()=>validateDecision(value,scene,candidates,assets,projectId),/unknown or repeated/);
});
test('locks/manual edits and unmet requirements cannot enter default apply; pacing uses only validated alternatives',()=>{
 const candidates=candidatesForScene(scene,[packet('archival-explainer')],defaultVisualSettings(),assets,projectId),one=validateDecision(decision(packet().id),scene,candidates,assets,projectId);
 assert.equal(suggestionCanApply(one,packet().id,false),true);
 const manual={...one,skipped:'Manual presentation: replacement requires explicit approval.'};assert.equal(suggestionCanApply(manual,packet().id,false),false);assert.equal(suggestionCanApply(manual,packet().id,true),true);
 assert.equal(suggestionCanApply({...one,skipped:'Keep my edits is on.'},packet().id,true),false);
 const repeated=paceSuggestions([one,{...one,sceneId:projectId,sequence:2}],'balanced');assert.equal(repeated[1].chosenId,'clean');
 assert.equal(paceSuggestions([{...one,choices:[one.choices[0]]},{...one,choices:[one.choices[0]]}],'balanced')[1].chosenId,packet().id);
 assert.equal(paceSuggestions([one,one],'graphics-rich')[1].chosenId,packet().id);
});
