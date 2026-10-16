import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createEditorLoader } from '../timeline-editor/load-editor.mjs';
import { loadSource } from '../presentations/load-source.mjs';
import { emptyDocument,editorId as id } from './fixtures/editor-database.mjs';

const source=await readFile(new URL('../../src/features/owned-editor/OwnedDraftEditor.tsx',import.meta.url),'utf8');
const load=createEditorLoader(source.replace('export function OwnedDraftEditor','function OwnedDraftEditor'));
const client=await loadSource(new URL('../../src/features/owned-editor/client.ts',import.meta.url));
function harness() {
  const hooks=[];let cursor=0,tree;
  const state=initial=>{
    const index=cursor++;
    if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;
    return [hooks[index],next=>{hooks[index]=typeof next==='function'?next(hooks[index]):next;}];
  };
  const initial={project:{id:id(2),workspace_id:id(1),topic:'Manual draft'},revision:0,document:emptyDocument(),media:[],removableSceneIds:[]};
  const Component=load('OwnedDraftEditor',{
    React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},
    useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect(){},Link:'a',
    TRACK_IDS:['V1','A1','A2'],DEFAULT_TRACK_STATES:initial.document.settings.track_states,
    ...client,control:'control',button:'button',
  });
  function nodes(node=tree) {
    if(!node||typeof node!=='object')return [];
    if(Array.isArray(node))return node.flatMap(nodes);
    return [node,...nodes(node.props?.children)];
  }
  function text(node){if(node===null||node===undefined)return '';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node);}
  return {
    initial,render(){cursor=0;tree=Component({initial});return tree;},
    button(label){return nodes().find(node=>node.type==='button'&&text(node)===label);},
    textareas(){return nodes().filter(node=>node.type==='textarea');},
    content(){return text(tree);},
  };
}
const settle=()=>new Promise(done=>setImmediate(done));

test('rendered draft handlers preserve edits and freeze retries until an uncertain save is acknowledged',async()=>{
  const oldFetch=globalThis.fetch;const h=harness();
  try {
    h.render();assert.match(h.content(),/No scenes yet/);h.button('Add scene').props.onClick();h.render();
    h.textareas()[0].props.onChange({target:{value:'Keep this narration'}});h.render();
    const bodies=[];let calls=0;
    globalThis.fetch=async(_path,init)=>{bodies.push(init.body);if(calls++===0)throw Error('Lost response');const body=JSON.parse(init.body);return Response.json({operationId:body.operationId,revision:1});};
    h.button('Save draft').props.onClick();await settle();h.render();
    assert.match(h.content(),/Retry original save/);assert.equal(h.textareas()[0].props.value,'Keep this narration');
    h.textareas()[0].props.onChange({target:{value:'Must not replace frozen save'}});h.render();
    assert.equal(h.textareas()[0].props.value,'Keep this narration');
    h.button('Retry original save').props.onClick();await settle();h.render();
    assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.match(h.content(),/Draft saved/);
    assert.equal(h.button('Save draft').props.disabled,true);assert.equal(h.button('Retry original save'),undefined);
  }finally{globalThis.fetch=oldFetch;}
});

test('rendered conflict/reload handlers never overwrite local text on failed loads and resume only after an accepted reload',async()=>{
  const oldFetch=globalThis.fetch,oldWindow=globalThis.window;const h=harness();
  try {
    globalThis.window={confirm:()=>true};h.render();h.button('Add scene').props.onClick();h.render();
    h.textareas()[0].props.onChange({target:{value:'Unsaved local version'}});h.render();
    globalThis.fetch=async()=>Response.json({code:'EDITOR_CONFLICT'},{status:409});
    h.button('Save draft').props.onClick();await settle();h.render();
    assert.match(h.content(),/changed in another tab/);assert.equal(h.button('Save draft').props.disabled,true);
    globalThis.fetch=async()=>{throw Error('Read failed');};
    h.button('Reload saved draft').props.onClick();await settle();h.render();
    assert.equal(h.textareas()[0].props.value,'Unsaved local version');assert.match(h.content(),/current edits are still here/);
    const server={...h.initial,revision:2,document:{...emptyDocument(),scenes:[{id:id(20),voice_over_beat:'Saved other-tab version',final_video_prompt:'',video_duration:5,trim_start:0}]}};
    globalThis.fetch=async()=>Response.json(server);
    h.button('Reload saved draft').props.onClick();await settle();h.render();
    assert.equal(h.textareas()[0].props.value,'Saved other-tab version');assert.match(h.content(),/Saved draft loaded/);
    h.textareas()[0].props.onChange({target:{value:'Next revision'}});h.render();assert.equal(h.button('Save draft').props.disabled,false);
  }finally{globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
