import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('read-only inventory identifies affected rows without returning content and tolerates a pre-template schema', async () => {
  const db = new PGlite();
  const sql = await readFile(new URL('../../db/audit-documentary-overlays.sql', import.meta.url), 'utf8');
  try {
    await db.exec('create table public.overlay_clips (id text, project_id text, kind text, text text, template_data jsonb, origin text)');
    const fixtures = [
      ['old-title', 'title-cutout-card', { style: 'default', text: 'Private headline' }],
      ['old-list', 'checklist-card', { items: ['Private bullet'] }],
      ['canonical', 'title-cutout-card', { styleId: 'quote-card', style: 'default', text: 'Stale text' }],
      ['empty-list', 'checklist-card', { bullets: [], items: ['Stale bullet'] }],
      ['malformed-list', 'checklist-card', { items: ['Text', 4] }],
    ];
    for (const [id, kind, data] of fixtures) {
      await db.query('insert into public.overlay_clips values ($1, $2, $3, $4, $5, $6)', [id, 'project', kind, '', JSON.stringify(data), 'ai']);
    }
    const results = await db.exec(sql);
    const rows = results[3].rows;
    assert.deepEqual(rows.map(row => row.clip_id).sort(), ['old-list', 'old-title']);
    assert.equal(rows.find(row => row.clip_id === 'old-title').recovers_nested_text, true);
    assert.equal(rows.find(row => row.clip_id === 'old-list').uses_legacy_items, true);
    assert.equal(JSON.stringify(rows).includes('Private'), false);
    assert.equal((await db.query('select count(*) as count from public.overlay_clips')).rows[0].count, 5);

    await db.exec('drop table public.overlay_clips; create table public.overlay_clips (id text, project_id text, text text)');
    await db.exec("insert into public.overlay_clips values ('pre-template', 'project', 'Original')");
    const legacySchema = await db.exec(sql);
    assert.deepEqual(legacySchema[3].rows, []);
    assert.equal(legacySchema[1].rows.length, 3);
    assert.equal((await db.query('select text from public.overlay_clips')).rows[0].text, 'Original');
  } finally {
    await db.close();
  }
});
