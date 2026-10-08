// Isolated browser fixture: real panel/Player/CSS, simulated save boundary.
// It has no app route, Supabase client, provider client, or production data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PresentationPanel } from '../../src/features/presentations/components/PresentationPanel';
import type { PresentationRow, PresentationAsset } from '../../src/lib/presentations/schema';

const projectId = '20000000-0000-4000-8000-000000000001';
const sceneId = '30000000-0000-4000-8000-000000000001';
const assets: PresentationAsset[] = ['a', 'b'].map((id, i) => ({ id: `40000000-0000-4000-8000-00000000000${i + 1}`, projectId, name: i === 0 ? 'City fixture' : 'Manuscript fixture', url: `${location.origin}/comparison-${id}.svg`, mediaType: 'image', status: 'ready' }));
const storageKey = 'isolated-presentation-fixture';

function Fixture() {
  const [row, setRow] = useState<PresentationRow | undefined>(() => JSON.parse(localStorage.getItem(storageKey) ?? 'null') ?? undefined);
  const [undo, setUndo] = useState<{ before?: PresentationRow } | undefined>();
  const persist = (value?: PresentationRow) => { setRow(value); localStorage.setItem(storageKey, JSON.stringify(value ?? null)); };
  return <main className="min-h-screen bg-ed-base p-8 text-ed-text"><h1 className="mb-5 text-lg font-bold">Isolated Presentation editor verification</h1><div className="max-w-sm"><PresentationPanel key={row?.revision ?? 0} projectId={projectId} sceneId={sceneId} sceneDuration={6} row={row} assets={assets} captions canUndo={Boolean(undo)} unsupported={false}
    onSave={async (envelope, timing, locked) => { setUndo({ before: row }); persist({ id: row?.id ?? '60000000-0000-4000-8000-000000000001', project_id: projectId, scene_id: sceneId, kind: 'scene-template', time_basis: 'scene', ...timing, revision: (row?.revision ?? 0) + 1, origin: 'user', locked, template_data: envelope }); return undefined; }}
    onRemove={async () => { setUndo({ before: row }); persist(undefined); return undefined; }}
    onUndo={async () => { persist(undo?.before); setUndo(undefined); return undefined; }}
  /></div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
