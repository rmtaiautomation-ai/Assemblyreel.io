import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';

const { getComboConfigs, COMBO_PRESETS } = await loadSource(new URL('../../src/lib/combo-templates.ts', import.meta.url));

test('AI title and quote use the renderer contract, including top-level text', () => {
  for (const [combo, styleId] of [['title_reveal', 'cutout-hero'], ['quote', 'quote-card']]) {
    const card = getComboConfigs(combo, '  The ancient record  ').find(c => c.kind === 'title-cutout-card');
    assert.equal(card.text, 'The ancient record');
    assert.equal(card.templateData.styleId, styleId);
    assert.equal(card.templateData.style, undefined);
    assert.equal(card.templateData.text, undefined);
  }
});

test('AI checklist uses bullets and preserves a single point', () => {
  const card = text => getComboConfigs('checklist', text).find(c => c.kind === 'checklist-card');
  assert.deepEqual(card('First\nSecond').templateData.bullets, ['First', 'Second']);
  assert.deepEqual(card('First. Second.').templateData.bullets, ['First', 'Second']);
  assert.deepEqual(card('A single point').templateData.bullets, ['A single point']);
  assert.equal(card('First\nSecond').templateData.styleId, 'ledger-classic');
  assert.equal(card('First\nSecond').text, '');
});

test('text combos retain their text and clean adds no overlay', () => {
  for (const combo of ['motion_text', 'chapter_open', 'divine', 'archive']) {
    assert.equal(getComboConfigs(combo, 'A record').find(c => c.kind === 'text').text, 'A record');
  }
  assert.deepEqual(getComboConfigs('clean'), []);
  assert.equal(COMBO_PRESETS.length, 8);
});
