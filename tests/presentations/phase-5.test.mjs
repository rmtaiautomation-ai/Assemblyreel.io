import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
import { familyFixture, maximumFixture, assets, projectId, sceneId, references } from './phase-5-fixtures.mjs';
const { presentationSchema } = await loadSource(new URL('../../src/lib/presentations/schema.ts', import.meta.url));
const { PHASE_5_FAMILIES, DOCUMENTARY_TEMPLATES, presentationCompositionId } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const { createPresentationDraft } = await loadSource(new URL('../../src/lib/presentations/drafts.ts', import.meta.url));
const { resolvePresentation, presentationMediaIds, mapPresentationAssets } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { sourceSlots, updatePresentationSource, updatePresentationImage } = await loadSource(new URL('../../src/lib/presentations/editing.ts', import.meta.url));
const { defaultVisualSettings, visualSettingsSchema, visualSettingsFromSnapshot } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
const { candidatesForScene, validateDecision } = await loadSource(new URL('../../src/lib/presentations/suggestions.ts', import.meta.url));
const resolve = (envelope, seconds = 120, owned = assets, refs = references) => resolvePresentation(envelope, { start_time: 0, duration: seconds, duration_mode: 'scene-remainder' }, seconds, 30, owned, projectId, { sceneId, scenes: refs });

test('Phase 5 adds ten strict, opt-in families and a v4 boundary without changing saved defaults or old composition IDs', () => {
  assert.equal(DOCUMENTARY_TEMPLATES.length, 24); assert.equal(defaultVisualSettings().allowedFamilies.length, 14);
  for (const id of PHASE_5_FAMILIES) {
    assert.ok(resolve(createPresentationDraft(id)).issues.length, id);
    assert.deepEqual(resolve(familyFixture(id)).issues, [], id);
    assert.equal(presentationCompositionId([{ presentation: resolve(familyFixture(id)).presentation }]), 'MainVideo-Documentary-v4');
    assert.equal(presentationSchema.safeParse({ ...familyFixture(id), templateVersion: 2 }).success, false);
    assert.equal(presentationSchema.safeParse({ ...familyFixture(id), content: { ...familyFixture(id).content, inventedField: true } }).success, false);
    assert.ok(resolve(familyFixture(id), 1).issues.length);
  }
  for (const [id, version] of [['image-comparison','v2'],['fact-reveal','v3']]) assert.equal(presentationCompositionId([{ presentation: resolve(familyFixture(id)).presentation }]), `MainVideo-Documentary-${version}`);
  const saved = { ...defaultVisualSettings(), allowedFamilies: ['map-locator'] }; assert.deepEqual(visualSettingsFromSnapshot({ visual: { presentation: saved } }), saved);
  assert.equal(visualSettingsSchema.safeParse({ ...saved, allowedFamilies: DOCUMENTARY_TEMPLATES.map(item => item.id) }).success, true);
});
test('journeys preserve explicit route vertices, schematic distinctions, viewport and stop order', () => {
  const f = familyFixture('journey-map'); f.content.mode = 'supplied-route'; assert.ok(resolve(f).issues.length);
  f.content.route = [f.content.stops[0].point,[44,33],f.content.stops[1].point]; assert.deepEqual(resolve(f).issues, []);
  f.content.stops.reverse(); assert.ok(resolve(f).issues.some(issue => /authored order/.test(issue)));
  const schematic = familyFixture('journey-map'); schematic.content.route = [[35,30],[50,38]]; assert.ok(resolve(schematic).issues.some(issue => /Schematic mode/.test(issue)));
  schematic.content.route = []; schematic.content.viewport.east = 40; assert.ok(resolve(schematic).issues.some(issue => /inside/.test(issue)));
});
test('territory snapshots reject invented date order, self-crossing/degenerate/overlapping/closed rings and unsupported datasets', () => {
  assert.deepEqual(resolve(maximumFixture('territory-change')).issues, []);
  for (const polygons of [[[[34,28],[43,35],[43,28],[34,35]]], [[[34,28],[35,29],[36,30]]], [[[34,28],[43,28],[43,35],[34,35],[34,28]]], [[[34,28],[43,28],[43,35],[34,35]],[[35,29],[40,29],[40,32],[35,32]]]]) {
    const f = familyFixture('territory-change'); f.content.states[0].polygons = polygons; assert.ok(resolve(f).issues.length);
  }
  const f = familyFixture('territory-change'); f.content.states[1].year = 0; assert.ok(resolve(f).issues.length); f.content.states[1].year = 1; assert.ok(resolve(f).issues.length);
  f.content.states[1].year = 2; f.content.states[1].cueSeconds = 1; assert.ok(resolve(f).issues.length);
  f.content.states[1].cueSeconds = 2; f.content.states[0].source.classification = 'illustration'; assert.ok(resolve(f).issues.length);
});
test('prepared imagery requires explicit alignment, full-size registered layers and reviewed diagram regions', async () => {
  const wipe = familyFixture('then-now'); wipe.content.alignmentReviewed = false; assert.ok(resolve(wipe).issues.length); wipe.content.method = 'side-by-side'; assert.deepEqual(resolve(wipe).issues, []);
  wipe.content.crops[0].x = .8; assert.ok(resolve(wipe).issues.length);
  const parallax = familyFixture('layered-parallax'); parallax.content.layers[1].depth = 0; assert.ok(resolve(parallax).issues.length); parallax.content.layers[1].depth = 1; parallax.content.preparedReviewed = false; assert.ok(resolve(parallax).issues.length);
  const cutaway = familyFixture('structure-cutaway'); cutaway.content.sections[0].width = .9; assert.ok(resolve(cutaway).issues.length);
  for (const id of ['then-now','layered-parallax','structure-cutaway','chapter-recap']) {
    const f = familyFixture(id); assert.ok(presentationMediaIds(f).length); assert.ok(resolve(f,120,[]).issues.length);
    const mapped = await mapPresentationAssets(resolve(f).presentation, async () => '/prepared-local.svg'); assert.ok(mapped.assets.every(asset => asset.url === '/prepared-local.svg'));
    const before = JSON.stringify(f), imageId = resolve(f).presentation.assets[0].itemId;
    const changed = updatePresentationImage(f,imageId,{ label: 'Reviewed image' }); assert.equal(JSON.stringify(f),before); assert.equal(sourceSlots(changed)[0].label,'Reviewed image');
    if (id === 'then-now') assert.equal(changed.content.alignmentReviewed,false);
    if (id === 'layered-parallax') assert.equal(changed.content.preparedReviewed,false);
    if (id === 'structure-cutaway') assert.equal(changed.content.diagramReviewed,false);
  }
});
test('manuscript comparison retains exact whitespace and validates both scripts and grapheme-safe mappings', () => {
  const f = familyFixture('manuscript-comparison'); assert.equal(resolve(f).presentation.envelope.content.passages[0].text,'  An earlier reading.  ');
  f.content.mappings[0].rightEnd = 999; assert.ok(resolve(f).issues.length);
  f.content.mappings = []; f.content.passages[0].text = 'שָׁלוֹם'; f.content.passages[0].script = 'hebrew'; f.content.passages[0].direction = 'rtl'; assert.deepEqual(resolve(f).issues, []);
  f.content.mappings = [{ id: assets[0].id,label:'Whole glyph',leftStart:0,leftEnd:1,rightStart:2,rightEnd:3,cueSeconds:0 }]; assert.ok(resolve(f).issues.some(issue => /graphemes/.test(issue)));
  f.content.mappings=[]; f.content.passages[0].direction='ltr'; assert.ok(resolve(f).issues.length);
  f.content.passages[0].script='transliteration-only'; f.content.passages[0].transliteration='shalom'; assert.ok(resolve(f).issues.length); f.content.passages[0].fallbackReviewed=true; assert.deepEqual(resolve(f).issues, []);
});
test('evidence boards require explained connected relationships; competing explanations keep attribution and limitations', () => {
  assert.deepEqual(resolve(maximumFixture('evidence-board')).issues, []);
  const board=familyFixture('evidence-board'); board.content.links[1].to=sceneId; assert.ok(resolve(board).issues.length);
  board.content.links[1].to=board.content.links[0].to; board.content.links[1].from=board.content.links[0].from; assert.ok(resolve(board).issues.length);
  const explanations=familyFixture('competing-explanations'); explanations.content.explanations[0].limitation=''; assert.ok(resolve(explanations).issues.length);
});
test('charts preserve missing values and uncertainty while rejecting negative data, fabricated bounds and distorted x order', () => {
  assert.deepEqual(resolve(maximumFixture('animated-chart')).issues, []);
  const f=familyFixture('animated-chart'); f.content.points[0].value=-1; assert.ok(resolve(f).issues.length);
  f.content.points[0].value=null; f.content.points[0].low=0; f.content.points[0].high=1; assert.ok(resolve(f).issues.length);
  f.content.points[0].value=10; f.content.points[0].low=11; assert.ok(resolve(f).issues.length);
  f.content.points[0].low=null; f.content.points[0].high=null; f.content.kind='line'; f.content.points[1].x=f.content.points[0].x; assert.ok(resolve(f).issues.length);
});
test('recaps reject deleted, reordered, foreign and relinked scenes rather than silently replacing images', () => {
  const f=familyFixture('chapter-recap'); assert.deepEqual(resolve(f).issues, []);
  assert.ok(resolve(f,120,assets,[]).issues.length);
  assert.ok(resolve(f,120,assets,references.map(scene=>scene.id===sceneId?{...scene,sequence:1}:scene)).issues.length);
  assert.ok(resolve(f,120,assets,references.map((scene,i)=>i===0?{...scene,mediaId:assets[2].id}:scene)).issues.length);
  const packet=resolvePresentation(f,{start_time:0,duration:120,duration_mode:'scene-remainder'},120,30,assets,projectId,{scenes:references,sourcePacket:true}); assert.deepEqual(packet.issues, []);
});
test('all advanced source slots edit immutably and AI selects only enabled approved packets without changing authored data', () => {
  const settings={...defaultVisualSettings(),allowedFamilies:DOCUMENTARY_TEMPLATES.map(item=>item.id)};
  const scene={id:sceneId,text:'Read this source.',duration:120,sequence:3,act:1,mediaId:null,mediaUrl:'/source.svg',mediaType:'image',words:[],row:null,unsupported:false};
  for (const id of PHASE_5_FAMILIES) {
    const envelope=familyFixture(id), before=JSON.stringify(envelope);
    for(const slot of sourceSlots(envelope)) { const changed=updatePresentationSource(envelope,slot.key,{...slot.value,credit:'Reviewed source'}); assert.equal(sourceSlots(changed).find(item=>item.key===slot.key).value.credit,'Reviewed source'); assert.equal(JSON.stringify(envelope),before); }
    const packet={id:assets[0].id,project_id:projectId,title:id,revision:1,envelope};
    const candidates=candidatesForScene(scene,[packet],settings,assets,projectId,references), choice=candidates.find(item=>item.id===packet.id); assert.equal(choice.status,'ready',id);
    const result=validateDecision({sceneId,candidateId:packet.id,reason:'Approved source packet',alternatives:['clean'],anchorPhrase:'',anchorOccurrence:0},scene,candidates,assets,projectId,references); assert.deepEqual(result.choices[0].envelope.content,envelope.content);
    assert.equal(candidatesForScene(scene,[packet],defaultVisualSettings(),assets,projectId,references).some(item=>item.id===packet.id),false);
  }
});
test('actual Lambda submission selects v4 for advanced/mixed projects without a real cloud call', async () => {
  const config='data:text/javascript,export function getLambdaConfig(){return {region:"us-east-1",functionName:"fixture-only",bucketName:"fixture-only",serveUrl:"https://fixture.example"}}';
  const boundary=`data:text/javascript,${encodeURIComponent('export const calls=[];export async function renderMediaOnLambda(args){calls.push(args);return {renderId:"fixture-only",bucketName:"fixture-only"}}export async function getRenderProgress(){throw Error("Not a progress test")}')}`;
  const io=await import(boundary), {startLambdaRender}=await loadSource(new URL('../../src/server/rendering/lambda-render.ts',import.meta.url),{'./lambda-config':config,'@remotion/lambda/client':boundary});
  for(const id of PHASE_5_FAMILIES) { await startLambdaRender({scenes:[{presentation:resolve(familyFixture('fact-reveal')).presentation},{presentation:resolve(familyFixture(id)).presentation}]}); assert.equal(io.calls.at(-1).composition,'MainVideo-Documentary-v4'); }
});
