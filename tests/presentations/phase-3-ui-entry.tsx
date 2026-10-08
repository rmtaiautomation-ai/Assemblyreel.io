import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SuggestionReview } from '../../src/features/presentations/components/SuggestionReview';
import type { PresentationRow } from '../../src/lib/presentations/schema';
const projectId='20000000-0000-4000-8000-000000000001';
const sceneIds=[1,2,3,4].map(index=>`30000000-0000-4000-8000-${String(index).padStart(12,'0')}`);
function Fixture(){
 const [rows,setRows]=useState<PresentationRow[]>([]);
 return <main className="min-h-screen bg-ed-base p-6 text-ed-text"><h1 className="mb-5 text-xl">Isolated Phase 3 verification</h1><SuggestionReview projectId={projectId} sceneIds={sceneIds} label="Suggest presentations" onApplied={result=>setRows(previous=>[...previous.filter(row=>row.scene_id!==result.row.scene_id),result.row])} /><p aria-label="Applied count">{rows.length} applied</p><button className="m-3 border p-2" onClick={()=>localStorage.setItem('phase-3-ui-stale','true')}>Simulate stale inputs</button><button className="m-3 border p-2" onClick={()=>localStorage.setItem('phase-3-ui-fail','true')}>Simulate provider interruption</button></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
