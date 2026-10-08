import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { familyFixture, assets, projectId, sceneId } from './phase-4-fixtures.mjs';
const { presentationSchema } = await loadSource(new URL('../../src/lib/presentations/schema.ts', import.meta.url));
const { PHASE_4_FAMILIES, DOCUMENTARY_TEMPLATES, presentationCompositionId } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const { createPresentationDraft } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const { resolvePresentation, mapPresentationAssets, presentationMediaIds } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { measurementRatios, linearMetres } = await loadSource(new URL('../../src/lib/presentations/measurements.ts', import.meta.url));
const { defaultVisualSettings, visualSettingsFromSnapshot } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
const { sourceSlots, updatePresentationSource } = await loadSource(new URL('../../src/lib/presentations/editing.ts', import.meta.url));
const { candidatesForScene, validateDecision, evidenceIssues } = await loadSource(new URL('../../src/lib/presentations/suggestions.ts', import.meta.url));
const resolve = (value, seconds = 25, owned = assets) => resolvePresentation(value, { start_time: 0, duration: seconds, duration_mode: 'scene-remainder' }, seconds, 30, owned, projectId);

test('Phase 4 registers four strict families with invalid blank drafts and a distinct export boundary', () => {
  assert.equal(DOCUMENTARY_TEMPLATES.find(item => item.id === 'claim-evidence').code, 'D14');
  for (const id of PHASE_4_FAMILIES) {
    assert.equal(presentationSchema.safeParse(createPresentationDraft(id)).success, false);
    assert.deepEqual(resolve(familyFixture(id)).issues, [], id);
    assert.equal(presentationCompositionId([{ presentation: resolve(familyFixture(id)).presentation }]), 'MainVideo-Documentary-v3');
    assert.equal(presentationSchema.safeParse({ ...familyFixture(id), templateVersion: 2 }).success, false);
  }
  assert.equal(presentationCompositionId([{ presentation: resolve(familyFixture('historical-timeline')).presentation }]), 'MainVideo-Documentary-v2');
});
test('causation cannot be inferred from sequence or an illustration; order, links and cues are validated', () => {
  const draft = familyFixture('cause-effect'); draft.content.links[0].type = 'causal';
  assert.ok(resolve(draft).issues.some(issue => issue.includes('causal link')));
  draft.content.links[0].support = 'A creator-supplied causal explanation.'; draft.content.links[0].source.classification = 'historical';
  assert.deepEqual(resolve(draft).issues, []);
  draft.content.links = []; assert.ok(resolve(draft).issues.length);
  const order = familyFixture('cause-effect'); order.content.steps[0].cueSeconds = 2;
  assert.ok(resolve(order).issues.some(issue => issue.includes('authored order')));
  order.content.steps[1].cueSeconds = 24; assert.ok(resolve(order).issues.some(issue => issue.includes('1.5 seconds')));
});
test('linear unit conversions produce honest ratios; extremes require an explicit values-only fallback', () => {
  assert.equal(linearMetres(1, 'ft'), .3048); assert.ok(Math.abs(linearMetres(12, 'in') - .3048) < 1e-12);
  const draft = familyFixture('scale-comparison'); assert.deepEqual(measurementRatios(draft.content.items), [.5, 1]);
  draft.content.items[0].value = .001;
  assert.ok(resolve(draft).issues.some(issue => issue.includes('exaggerated')));
  draft.content.method = 'values-only'; assert.deepEqual(resolve(draft).issues, []);
  draft.content.items[0].value = 0; assert.ok(resolve(draft).issues.length);
  draft.content.items[0].value = 1; draft.content.items[0].unit = 'kg'; assert.equal(presentationSchema.safeParse(draft).success, false);
  draft.content.items[0].unit = 'm'; draft.content.referenceId = sceneId; assert.ok(resolve(draft).issues.some(issue => issue.includes('reference')));
});
test('fact dates, ranges and qualifiers retain exact supplied displays and have bounded reveal timing', () => {
  const draft = familyFixture('fact-reveal'); draft.content.kind = 'range'; draft.content.value = '12–18'; draft.content.qualifier = 'approximately';
  const result = resolve(draft); assert.deepEqual(result.issues, []); assert.deepEqual(result.presentation.envelope.content, draft.content);
  draft.content.cueSeconds = 24; assert.ok(resolve(draft).issues.some(issue => issue.includes('1.5 seconds')));
  draft.content.cueSeconds = 0; draft.content.source.credit = ''; assert.ok(resolve(draft).issues.some(issue => issue.includes('source credit')));
});
test('claim cards preserve exact passages and reject unsupported direct-evidence/fallback combinations', async () => {
  const draft = familyFixture('claim-evidence'); assert.equal(resolve(draft).presentation.envelope.content.evidence.passage, '  The text records a tradition.  ');
  draft.content.evidence.kind = 'object'; assert.ok(resolve(draft).issues.some(issue => issue.includes('supplied project image')));
  draft.content.evidence.image = familyFixture('image-comparison').content.images[0];
  assert.deepEqual(presentationMediaIds(draft), [assets[0].id]); const before = JSON.stringify(draft);
  const mapped = await mapPresentationAssets(resolve(draft).presentation, async () => '/prepared.svg');
  assert.equal(mapped.assets[0].url, '/prepared.svg'); assert.equal(JSON.stringify(draft), before); assert.ok(resolve(draft, 25, []).issues.length);
  draft.content.evidence.kind = 'attributed'; draft.content.scope = 'supports'; assert.ok(resolve(draft).issues.some(issue => issue.includes('context-only')));
  draft.content.scope = 'context-only'; draft.content.evidence.image = null; assert.deepEqual(resolve(draft).issues, []);
  draft.content.limitation = ''; assert.ok(resolve(draft).issues.length);
});
test('source editors are immutable and saved ten-family visual preferences are not expanded silently', () => {
  for (const id of PHASE_4_FAMILIES) {
    const draft = familyFixture(id), before = JSON.stringify(draft), slot = sourceSlots(draft)[0];
    const changed = updatePresentationSource(draft, slot.key, { ...slot.value, credit: 'Reviewed source' });
    assert.equal(sourceSlots(changed)[0].value.credit, 'Reviewed source'); assert.equal(JSON.stringify(draft), before);
  }
  const settings = { ...defaultVisualSettings(), allowedFamilies: DOCUMENTARY_TEMPLATES.slice(0, 10).map(item => item.id) };
  assert.deepEqual(visualSettingsFromSnapshot({ visual: { presentation: settings } }).allowedFamilies, settings.allowedFamilies);
});
test('new AI candidates copy approved typed facts, reject missing source content, and respect allowed families', () => {
  const scene = { id: sceneId, text: 'Read this source carefully.', duration: 25, sequence: 1, act: 1, mediaId: null, mediaUrl: '/source.svg', mediaType: 'image', words: [], row: null, unsupported: false };
  for (const id of PHASE_4_FAMILIES) {
    const envelope = familyFixture(id), packet = { id: assets[0].id, project_id: projectId, title: id, revision: 1, envelope };
    assert.deepEqual(evidenceIssues(envelope), []);
    const candidates = candidatesForScene(scene, [packet], defaultVisualSettings(), assets, projectId);
    const result = validateDecision({ sceneId, candidateId: packet.id, reason: 'Reviewed packet', alternatives: ['clean'], anchorPhrase: '', anchorOccurrence: 0 }, scene, candidates, assets, projectId);
    assert.equal(result.choices[0].status, 'ready'); assert.deepEqual(result.choices[0].envelope.content, envelope.content);
    const denied = candidatesForScene(scene, [packet], { ...defaultVisualSettings(), allowedFamilies: [] }, assets, projectId);
    assert.deepEqual(denied.map(choice => choice.family), ['clean']);
    const missing = candidatesForScene(scene, [], defaultVisualSettings(), assets, projectId).find(choice => choice.family === id);
    assert.equal(missing.status, 'needs-source-review'); assert.equal(missing.envelope, null);
  }
});

test('actual Lambda submission requires the Phase 4 composition for new families and mixed projects without a cloud call', async () => {
  const config = 'data:text/javascript,export function getLambdaConfig(){return {region:"us-east-1",functionName:"fixture-only",bucketName:"fixture-only",serveUrl:"https://fixture.example"}}';
  const boundary = `data:text/javascript,${encodeURIComponent('export const calls=[];export async function renderMediaOnLambda(args){calls.push(args);return {renderId:"fixture-only",bucketName:"fixture-only"}}export async function getRenderProgress(){throw Error("Not a progress test")}')}`;
  const io = await import(boundary);
  const { startLambdaRender } = await loadSource(new URL('../../src/server/rendering/lambda-render.ts', import.meta.url), { './lambda-config': config, '@remotion/lambda/client': boundary });
  for (const id of PHASE_4_FAMILIES) {
    await startLambdaRender({ scenes: [{ presentation: resolve(familyFixture('image-comparison')).presentation }, { presentation: resolve(familyFixture(id)).presentation }] });
    assert.equal(io.calls.at(-1).composition, 'MainVideo-Documentary-v3');
  }
});
