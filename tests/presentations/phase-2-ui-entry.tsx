// Real panel/settings UI, isolated persistence boundary; not an application route.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PresentationPanel } from '../../src/features/presentations/components/PresentationPanel';
import { VisualSettingsPanel } from '../../src/features/presentations/components/VisualSettingsPanel';
import { defaultVisualSettings } from '../../src/lib/presentations/visual-settings';
import type { PresentationRow, PresentationAsset } from '../../src/lib/presentations/schema';
const projectId='20000000-0000-4000-8000-000000000001',sceneId='30000000-0000-4000-8000-000000000001';
const assets: PresentationAsset[]=['a','b'].map((id,index)=>({ id:`40000000-0000-4000-8000-00000000000${index+1}`,projectId,name:`Authored image ${index+1}`,url:`${location.origin}/comparison-${id}.svg`,mediaType:'image',status:'ready' }));
const key='isolated-phase-2-row';
function Fixture() {
  const [row,setRow]=useState<PresentationRow|undefined>(()=>JSON.parse(localStorage.getItem(key)??'null')??undefined);
  const [undo,setUndo]=useState<{ before?:PresentationRow }|undefined>(),[settings,setSettings]=useState(defaultVisualSettings);
  const persist=(value?:PresentationRow)=>{setRow(value);localStorage.setItem(key,JSON.stringify(value??null));};
  return <main className="min-h-screen bg-ed-base p-6 text-ed-text"><h1 className="mb-4 text-xl">Isolated Phase 2 verification</h1><div className="grid gap-5 lg:grid-cols-2"><PresentationPanel key={row?.revision??0} projectId={projectId} sceneId={sceneId} sceneDuration={20} row={row} assets={assets} captions visualSettings={settings} unsupported={false} canUndo={Boolean(undo)}
    onSave={async(envelope,timing,locked)=>{setUndo({before:row});persist({id:row?.id??'60000000-0000-4000-8000-000000000001',project_id:projectId,scene_id:sceneId,kind:'scene-template',time_basis:'scene',...timing,revision:(row?.revision??0)+1,origin:'user',locked,template_data:envelope});return undefined;}}
    onRemove={async()=>{setUndo({before:row});persist(undefined);return undefined;}} onUndo={async()=>{persist(undo?.before);setUndo(undefined);return undefined;}} />
    <VisualSettingsPanel scope="workspace" id={projectId} onSaved={setSettings} /></div><button className="mt-5 rounded border p-2" onClick={()=>{const data=JSON.parse(localStorage.getItem('isolated-phase-2-settings')??'null');if(data)localStorage.setItem('isolated-phase-2-settings',JSON.stringify({...data,revision:data.revision+1}));}}>Simulate concurrent format save</button></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
