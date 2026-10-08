// Isolated real editor harness. Fixture loading and persistence are test boundaries, not app UI.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PresentationPanel } from '../../src/features/presentations/components/PresentationPanel';
import { VisualSettingsPanel } from '../../src/features/presentations/components/VisualSettingsPanel';
import { defaultVisualSettings } from '../../src/lib/presentations/visual-settings';
import type { PresentationEnvelope, PresentationRow, PresentationAsset } from '../../src/lib/presentations/schema';
import type { PresentationSceneReference } from '../../src/lib/presentations/phase-5-validation';
declare global { interface Window { phase5Fixtures: { envelopes: Record<string,PresentationEnvelope>; assets: PresentationAsset[]; references: PresentationSceneReference[]; projectId: string; sceneId: string } } }
const fixture=window.phase5Fixtures,key='isolated-phase-5-row';
function Fixture(){
  const [row,setRow]=useState<PresentationRow|undefined>(),[undo,setUndo]=useState<{before?:PresentationRow}>(),[settings,setSettings]=useState(defaultVisualSettings);
  const [seed,setSeed]=useState<PresentationEnvelope>(),[revision,setRevision]=useState(0),[references,setReferences]=useState(fixture.references);
  const persist=(value?:PresentationRow)=>{setRow(value);localStorage.setItem(key,JSON.stringify(value??null));};
  return <main className="min-h-screen bg-ed-base p-5 text-ed-text"><h1>Isolated Phase 5 acceptance</h1><div className="my-3 flex flex-wrap gap-2">{Object.entries(fixture.envelopes).map(([id,envelope])=><button key={id} className="rounded border p-2 text-xs" onClick={()=>{setSeed(envelope);setRevision(previous=>previous+1);setReferences(fixture.references);}}>Load fixture {id}</button>)}<button className="rounded border p-2 text-xs" onClick={()=>setReferences([])}>Simulate deleted source scenes</button></div><div className="grid gap-5 lg:grid-cols-2"><PresentationPanel key={`${revision}:${row?.revision??0}`} projectId={fixture.projectId} sceneId={fixture.sceneId} sceneDuration={40} row={row} assets={fixture.assets} sceneReferences={references} initialDraft={seed?{envelope:seed,timing:{start_time:0,duration:40,duration_mode:'scene-remainder'}}:undefined} captions visualSettings={settings} unsupported={false} canUndo={Boolean(undo)}
    onSave={async(envelope,timing,locked)=>{setUndo({before:row});persist({id:'60000000-0000-4000-8000-000000000001',project_id:fixture.projectId,scene_id:fixture.sceneId,kind:'scene-template',time_basis:'scene',...timing,revision:(row?.revision??0)+1,origin:'user',locked,template_data:envelope});setSeed(undefined);return undefined;}}
    onRemove={async()=>{setUndo({before:row});persist(undefined);return undefined;}} onUndo={async()=>{persist(undo?.before);setUndo(undefined);return undefined;}}/>
    <VisualSettingsPanel scope="workspace" id={fixture.projectId} onSaved={setSettings}/></div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
