import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { familyFixture, assets, projectId } from './phase-2-fixtures.mjs';
const { presentationSchema } = await loadSource(new URL('../../src/lib/presentations/schema.ts', import.meta.url));
const { DOCUMENTARY_TEMPLATES: ALL_TEMPLATES, presentationCompositionId } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const DOCUMENTARY_TEMPLATES = ALL_TEMPLATES.slice(0, 10); // Keep the original Phase 2 compatibility gate.
const { resolvePresentation, presentationMediaIds, mapPresentationAssets } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { createPresentationDraft } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const { splitHighlights, historicalYearOrdinal } = await loadSource(new URL('../../src/lib/presentations/content.ts', import.meta.url));
const { defaultVisualSettings, applyVisualSettings, visualSettingsFromSnapshot } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
const resolve = envelope => resolvePresentation(envelope, { start_time: 0, duration: 20, duration_mode: 'scene-remainder' }, 20, 30, assets, projectId);
test('all ten families have distinct contracts, blank authoring drafts, and a versioned cloud boundary', () => {
  assert.equal(DOCUMENTARY_TEMPLATES.length, 10);
  for (const { id } of DOCUMENTARY_TEMPLATES) {
    assert.equal(presentationSchema.safeParse(createPresentationDraft(id)).success, false, id);
    const fixture = familyFixture(id);
    assert.equal(presentationSchema.safeParse(fixture).success, true, id);
    assert.deepEqual(resolve(fixture).issues, [], id);
    assert.equal(presentationCompositionId([{ presentation: { envelope: fixture } }]), 'MainVideo-Documentary-v2');
    assert.equal(presentationSchema.safeParse({ ...fixture, templateVersion: 9 }).success, false);
    assert.equal(presentationSchema.safeParse({ ...fixture, css: 'arbitrary' }).success, false);
  }
});
test('declared images in every family resolve only from owned ready media and are mapped immutably', async () => {
  for (const { id } of DOCUMENTARY_TEMPLATES) {
    const fixture = familyFixture(id), original = JSON.stringify(fixture), ids = presentationMediaIds(fixture), result = resolve(fixture);
    assert.equal(result.presentation.assets.length, ids.length);
    if (ids.length) assert.ok(resolvePresentation(fixture, { start_time: 0, duration: 20, duration_mode: 'fixed' }, 20, 30, [], projectId).issues.some(issue => issue.includes('ready project image')));
    const mapped = await mapPresentationAssets(result.presentation, async url => `https://owned.test${url}`);
    assert.equal(JSON.stringify(fixture), original); assert.ok(mapped.assets.every(asset => asset.url.startsWith('https://owned.test')));
  }
});
test('historical dates reject year zero and false proportional precision', () => {
  const fixture = familyFixture('historical-timeline'); fixture.content.spacing = 'proportional';
  assert.deepEqual(resolve(fixture).issues, []);
  fixture.content.events[0].date.year = 0; assert.ok(resolve(fixture).issues.some(issue => issue.includes('year zero')));
  fixture.content.events[0].date.year = -1; fixture.content.events[0].date.approximate = true;
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('false precision')));
  assert.equal(historicalYearOrdinal(1) - historicalYearOrdinal(-1), 1);
});
test('highlight offsets preserve repeated words, wrapping, and exact text; overlap cannot save', () => {
  assert.deepEqual(splitHighlights('same same', [{ start: 5, end: 9, cueSeconds: 1 }]).map(piece => piece.text), ['same ', 'same']);
  const fixture = familyFixture('archival-explainer'); fixture.content.highlights = [{ start: 4, end: 20, cueSeconds: 1 }, { start: 5, end: 8, cueSeconds: 1 }];
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('non-overlapping')));
});
test('exact source text retains leading/trailing whitespace so authored highlight offsets never shift',()=>{
 const fixture=familyFixture('archival-explainer');fixture.content.body='  same same  ';fixture.content.highlights=[{start:7,end:11,cueSeconds:1}];
 const resolved=resolve(fixture);assert.deepEqual(resolved.issues,[]);assert.equal(resolved.presentation.envelope.content.body,fixture.content.body);
 assert.deepEqual(splitHighlights(resolved.presentation.envelope.content.body,fixture.content.highlights).map(piece=>piece.text),['  same ','same','  ']);
});
test('source-normalized regions and map viewports cannot clip authored evidence silently', () => {
  const detail = familyFixture('detail-annotation'); detail.content.regions[0].x = .8;
  assert.ok(resolve(detail).issues.some(issue => issue.includes('original image')));
  const map = familyFixture('map-locator'); map.content.viewport.west = 50;
  assert.ok(resolve(map).issues.some(issue => issue.includes('outside')));
});
test('translations require credits, correct RTL direction, and a reviewed fallback', () => {
  const fixture = familyFixture('text-translation'); fixture.content.direction = 'ltr';
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('right-to-left')));
  fixture.content.script = 'transliteration-only'; assert.ok(resolve(fixture).issues.some(issue => issue.includes('explicitly review')));
  fixture.content.transliteration = 'Reviewed authored fixture'; fixture.content.fallbackReviewed = true; fixture.content.source.credit = '';
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('translator')));
});
test('graphs reject missing references, duplicates, disconnected nodes and uncredited edges', () => {
  const fixture = familyFixture('relationship-diagram'); fixture.content.edges[0].to = assets[0].id;
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('existing nodes')));
  fixture.content.edges[0].to = fixture.content.nodes[1].id; fixture.content.edges[0].source.credit = '';
  assert.ok(resolve(fixture).issues.some(issue => issue.includes('source/tradition')));
});
test('visual defaults are optional frozen settings and restyling is an explicit immutable operation', () => {
  const fixture = familyFixture('person-introduction'), before = JSON.stringify(fixture), defaults = defaultVisualSettings();
  assert.equal(visualSettingsFromSnapshot({ visual: {} }), undefined);
  assert.deepEqual(visualSettingsFromSnapshot({ visual: { presentation: defaults } }), defaults);
  const result = applyVisualSettings(fixture, { ...defaults, themeId: 'parchment-archive' });
  assert.equal(result.theme.id, 'parchment-archive'); assert.equal(JSON.stringify(fixture), before); assert.deepEqual(result.content, fixture.content);
});
test('combining marks cannot be split by a highlight, and unsupported scripts require a reviewed fallback', () => {
  const document = familyFixture('archival-explainer'); document.content.body='A cafe\u0301 in context.'; document.content.highlights=[{start:2,end:6,cueSeconds:1}];
  assert.ok(resolve(document).issues.some(issue=>issue.includes('combining-mark')));
  const original = familyFixture('text-translation'); original.content.script='latin';original.content.direction='ltr';original.content.original='古文';
  assert.ok(resolve(original).issues.some(issue=>issue.includes('outside the selected')));
});
test('reordering items preserves their IDs, sources, and authored cue times', async () => {
  const { moveItem } = await loadSource(new URL('../../src/lib/presentations/editing.ts',import.meta.url));
  const events=familyFixture('historical-timeline').content.events,before=JSON.stringify(events),moved=moveItem(events,0,1);
  assert.deepEqual(moved,[events[1],events[0]]);assert.equal(JSON.stringify(events),before);assert.equal(moved[0].cueSeconds,events[1].cueSeconds);
});
test('workspace visual overrides ride into a new format snapshot without changing prompt-format fields', async () => {
  const { resolveFormatProfile } = await loadSource(new URL('../../src/lib/ai/format-profile.ts',import.meta.url));
  const without=resolveFormatProfile({presetKey:'general'}),settings=defaultVisualSettings();
  const withVisuals=resolveFormatProfile({presetKey:'general',blueprintOverride:{visual:{presentation:settings}},version:4});
  assert.deepEqual(withVisuals.visual.presentation,settings);assert.deepEqual(withVisuals.content,without.content);assert.deepEqual(withVisuals.structure,without.structure);assert.equal(withVisuals.version,4);
});
