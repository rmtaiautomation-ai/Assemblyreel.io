import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';

const { normalizeLegacyCard, withCanonicalCardContent } = await loadSource(new URL('../../src/lib/presentations/legacy.ts', import.meta.url));
const { resolveCardStyle, CARD_STYLE_ORDER, CARD_STYLES } = await loadSource(new URL('../../src/remotion/templates/card-registry.ts', import.meta.url));
const card = (templateData, overrides = {}) => ({ kind: 'title-cutout-card', text: '', templateData, ...overrides });

test('legacy title and quote recover the intended style and nested text without mutating inputs', () => {
  for (const [style, styleId] of [['default', 'cutout-hero'], ['quote-card', 'quote-card']]) {
    const original = Object.freeze(card(Object.freeze({ style, text: 'Surviving record', scale: 0.8 }), { id: 'saved-row', startInSeconds: 12, durationInSeconds: 5 }));
    const result = normalizeLegacyCard(original);
    assert.equal(result.text, 'Surviving record');
    assert.equal(result.templateData.styleId, styleId);
    assert.equal(result.templateData.scale, 0.8);
    assert.equal(result.id, 'saved-row');
    assert.equal(result.startInSeconds, 12);
    assert.equal(result.durationInSeconds, 5);
    assert.equal(original.text, '');
    assert.equal(original.templateData.styleId, undefined);
    assert.strictEqual(normalizeLegacyCard(result), result);
  }
});

test('legacy checklist recovers bullets with or without a style alias', () => {
  for (const style of [undefined, 'default']) {
    const items = Object.freeze(['One', 'Two']);
    const original = card({ ...(style ? { style } : {}), items }, { kind: 'checklist-card' });
    const result = normalizeLegacyCard(original);
    assert.deepEqual(result.templateData.bullets, ['One', 'Two']);
    assert.notStrictEqual(result.templateData.bullets, items);
    assert.equal(resolveCardStyle(result.kind, result.templateData.styleId).id, 'ledger-classic');
  }
});

test('explicit canonical content wins, including empty text and empty bullets', () => {
  const canonical = card({ styleId: 'quote-card', style: 'default', text: 'Stale nested text' });
  assert.strictEqual(normalizeLegacyCard(canonical), canonical);
  const list = card({ styleId: 'ledger', bullets: [], items: ['Stale bullet'] }, { kind: 'checklist-card' });
  assert.strictEqual(normalizeLegacyCard(list), list);
  assert.equal(normalizeLegacyCard(card({ style: 'default', text: 'Old' }, { text: 'Edited' })).text, 'Edited');
});

test('all 12 manual styles, missing style IDs, and non-card overlays are unchanged', () => {
  for (const styleId of CARD_STYLE_ORDER) {
    const manual = card({ styleId, scale: 1.1 }, { kind: CARD_STYLES[styleId].kind, text: 'Manual content' });
    assert.strictEqual(normalizeLegacyCard(manual), manual);
  }
  for (const original of [card({}), card(undefined), card({ text: 'Not a known old combo' }), card({ style: 'default', text: 'Do not change' }, { kind: 'text' })]) {
    assert.strictEqual(normalizeLegacyCard(original), original);
  }
});

test('unknown and wrong-kind styles stay visibly unresolvable', () => {
  for (const styleId of ['future-style', 'ledger', '__proto__']) {
    const canonical = normalizeLegacyCard(card({ styleId, style: 'default' }));
    assert.equal(resolveCardStyle(canonical.kind, canonical.templateData.styleId), null);
    const legacy = normalizeLegacyCard(card({ style: styleId }));
    assert.equal(resolveCardStyle(legacy.kind, legacy.templateData.styleId), null);
  }
});

test('malformed data and items are not coerced into content', () => {
  for (const templateData of [null, [], 'invalid', 42, { items: ['One', 2] }, { items: 'One' }]) {
    const original = card(templateData, { kind: 'checklist-card' });
    assert.strictEqual(normalizeLegacyCard(original), original);
  }
});

test('clearing a recovered headline persists canonically and stays empty on reload', () => {
  const recovered = normalizeLegacyCard(card({ style: 'quote-card', text: 'Recovered' }));
  const patch = withCanonicalCardContent(recovered, { text: '' });
  const reloaded = normalizeLegacyCard(card(patch.template_data, { text: patch.text }));
  assert.equal(reloaded.text, '');
  assert.equal(reloaded.templateData.styleId, 'quote-card');
});

test('a style edit preserves recovered text and a bullet clear survives reload', () => {
  const recovered = normalizeLegacyCard(card({ style: 'default', text: 'Recovered' }));
  const patch = withCanonicalCardContent(recovered, { template_data: { ...recovered.templateData, styleId: 'quote-card' } });
  assert.equal(patch.text, 'Recovered');
  assert.equal(normalizeLegacyCard(card(patch.template_data, { text: patch.text })).text, 'Recovered');
  const list = normalizeLegacyCard(card({ style: 'default', items: ['Old'] }, { kind: 'checklist-card' }));
  const cleared = withCanonicalCardContent(list, { template_data: { ...list.templateData, bullets: [] } });
  assert.deepEqual(normalizeLegacyCard(card(cleared.template_data, { kind: 'checklist-card' })).templateData.bullets, []);
});

test('non-content edits and non-card writes are not expanded', () => {
  const fields = { x_percent: 25 };
  assert.strictEqual(withCanonicalCardContent(card({ style: 'default' }), fields), fields);
  const text = { text: 'New' };
  assert.strictEqual(withCanonicalCardContent(card({}, { kind: 'text' }), text), text);
});
