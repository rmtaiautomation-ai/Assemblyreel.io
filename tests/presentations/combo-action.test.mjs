import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';

const ioUrl = `data:text/javascript,${encodeURIComponent(`
  export const inserted = [];
  export const deleted = [];
  export async function createOverlayClip(projectId, fields) {
    inserted.push({ projectId, fields });
    return { success: true, overlayClip: { id: String(inserted.length), text: fields.text, template_data: fields.templateData } };
  }
  export async function deleteOverlayClip(id) { deleted.push(id); return { success: true }; }
`)}`;
const io = await import(ioUrl);
const { applyComboToScene } = await loadSource(new URL('../../src/features/timeline-editor/server/combo-actions.ts', import.meta.url), {
  './overlay-clip-actions': ioUrl,
  '@/lib/ai/agents/edit-director': 'data:text/javascript,export async function directSceneEdits(){throw new Error("No provider call allowed in this test")}',
});

test('the real combo action persists title, quote, and bullets with existing timing and AI origin', async () => {
  for (const [combo, styleId, kind] of [['title_reveal', 'cutout-hero', 'title-cutout-card'], ['quote', 'quote-card', 'title-cutout-card'], ['checklist', 'ledger-classic', 'checklist-card']]) {
    io.inserted.length = 0;
    const result = await applyComboToScene('project', 'scene', combo, 'The record', 12.5, 4.25);
    assert.equal(result.success, true);
    const payload = io.inserted.find(entry => entry.fields.kind === kind);
    assert.equal(payload.projectId, 'project');
    assert.equal(payload.fields.templateData.styleId, styleId);
    assert.equal(payload.fields.text, combo === 'checklist' ? '' : 'The record');
    if (combo === 'checklist') assert.deepEqual(payload.fields.templateData.bullets, ['The record']);
    for (const { fields } of io.inserted) {
      assert.equal(fields.startTime, 12.5);
      assert.equal(fields.duration, 4.25);
      assert.equal(fields.origin, 'ai');
      if (fields.kind === 'dim-scrim' || fields.kind === 'light-sweep') assert.equal(fields.text, '');
    }
  }
});

test('clean still creates no overlays and only deletes explicitly supplied replacement IDs', async () => {
  io.inserted.length = 0;
  io.deleted.length = 0;
  const result = await applyComboToScene('project', 'scene', 'clean', undefined, 9, 3, ['old-ai-clip']);
  assert.equal(result.success, true);
  assert.deepEqual(io.inserted, []);
  assert.deepEqual(io.deleted, ['old-ai-clip']);
});
