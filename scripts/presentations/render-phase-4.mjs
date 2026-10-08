import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { familyFixture, maximumFixture, assets, projectId } from '../../tests/presentations/phase-4-fixtures.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const label = process.argv[2]; if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('Provide a fresh lowercase artifact label.');
const output = path.resolve('out/presentations-phase-4', label); await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
const publicDir = path.join(output, 'empty-public'); await mkdir(publicDir);
const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.ts'), outDir: path.join(output, 'bundle'), publicDir });
const { resolvePresentation } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { PHASE_4_FAMILIES, presentationCompositionId } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const { presentationImages } = await loadSource(new URL('../../src/lib/presentations/content.ts', import.meta.url));
const svg = await Promise.all(['a', 'b'].map(async id => `data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../../tests/presentations/assets/comparison-${id}.svg`, import.meta.url))).toString('base64')}`));
const browser = await openBrowser('chrome'), captures = [], failures = [], errors = [], videos = [], expectedRejections = [];
const ratios = [['landscape', 1920, 1080], ['portrait', 1080, 1920], ['square', 1080, 1080]];
function propsFor(fixture, width, height, duration = 25) {
  const result = resolvePresentation(fixture, { start_time: 0, duration, duration_mode: 'scene-remainder' }, duration, 30, assets, projectId);
  if (!result.presentation) throw Error(result.issues.join(' '));
  const images = presentationImages(fixture);
  const presentation = { ...result.presentation, assets: result.presentation.assets.map(asset => ({ ...asset, url: svg[assets.findIndex(item => item.id === images.find(image => image.id === asset.itemId)?.asset.mediaId)] ?? svg[0] })) };
  return { fps: 30, width, height, scenes: [{ id: fixture.templateId, durationInSeconds: duration, trimStartInSeconds: 0, mediaType: 'image', mediaUrl: '', presentation }], showCaptions: true, captionWords: [{ text: 'Caption safe area', startMs: 0, endMs: duration * 1000 }] };
}
async function capture(fixture, theme, ratio, width, height, name, frames = [8, 90, 745], duration = 25) {
  fixture.theme.id = theme;
  const props = propsFor(fixture, width, height, duration), id = presentationCompositionId(props.scenes);
  assert.equal(id, 'MainVideo-Documentary-v3');
  const composition = await selectComposition({ serveUrl, id, inputProps: props, puppeteerInstance: browser });
  for (const frame of frames) { await renderStill({ serveUrl, composition, inputProps: props, puppeteerInstance: browser, frame, output: path.join(output, `${name}-${frame}.png`), scale: .4, onBrowserLog: log => { if (log.type === 'error') errors.push(`${name}: ${log.text}`); } }); captures.push(`${name}-${frame}`); }
  return { props, composition, ratio };
}
try {
  for (const id of PHASE_4_FAMILIES) for (const theme of ['dark-documentary', 'parchment-archive']) for (const [ratio, width, height] of ratios) {
    const name = `${id}-${theme}-${ratio}`;
    try {
      const { props, composition } = await capture(familyFixture(id), theme, ratio, width, height, name);
      if (theme === 'dark-documentary' && ratio === (id === 'cause-effect' || id === 'claim-evidence' ? 'portrait' : 'landscape')) { await renderMedia({ serveUrl, composition, inputProps: props, puppeteerInstance: browser, codec: 'h264', frameRange: [0, 179], outputLocation: path.join(output, `${name}.mp4`), scale: .4, concurrency: 2 }); videos.push(name); }
      console.log(`Verified ${name}`);
    } catch (error) { failures.push({ name, error: error.message }); console.log(`FAILED ${name}: ${error.message.split('\n')[0]}`); }
  }
  const variants = [
    ['four-steps', () => maximumFixture('cause-effect')],
    ['three-measurements', () => maximumFixture('scale-comparison')],
    ['causal-support', () => { const f = familyFixture('cause-effect'); f.content.links[0] = { ...f.content.links[0], type: 'causal', support: 'A supplied causal explanation.', source: { ...f.content.links[0].source, classification: 'historical' } }; return f; }],
    ['length-baseline', () => { const f = maximumFixture('scale-comparison'); f.content.dimension = 'length'; return f; }],
    ['values-only', () => { const f = maximumFixture('scale-comparison'); f.content.method = 'values-only'; f.content.items[0].value = .001; return f; }],
    ['approximate-range', () => { const f = familyFixture('fact-reveal'); f.content.kind = 'range'; f.content.value = '12–18'; f.content.unit = 'items'; f.content.qualifier = 'approximately'; f.content.context = 'A supplied range, not an exact count.'; return f; }],
    ['object-evidence', () => { const f = familyFixture('claim-evidence'); f.content.evidence.kind = 'object'; f.content.evidence.image = familyFixture('image-comparison').content.images[0]; f.content.evidence.passage = ''; return f; }],
    ['attributed-context', () => { const f = familyFixture('claim-evidence'); f.content.evidence.kind = 'attributed'; return f; }],
  ];
  for (const [name, fixture] of variants) for (const [ratio, width, height] of ratios) {
    try { await capture(fixture(), 'dark-documentary', ratio, width, height, `${name}-${ratio}`, [150]); }
    catch (error) { failures.push({ name: `${name}-${ratio}`, error: error.message }); }
  }
  // This dense copy fits tall portrait, but must fail closed in shorter ratios.
  for (const [ratio, width, height] of ratios) {
    const f = familyFixture('claim-evidence'); f.content.heading = 'A'.repeat(100); f.content.claim = 'A long claim '.repeat(12).slice(0, 150); f.content.evidence.passage = 'A supplied passage '.repeat(15).slice(0, 280); f.content.interpretation = 'A supplied interpretation '.repeat(8).slice(0, 180); f.content.limitation = 'A meaningful limitation '.repeat(7).slice(0, 140);
    try { await capture(f, 'dark-documentary', ratio, width, height, `dense-copy-${ratio}`, [90], 120); if (ratio !== 'portrait') failures.push({ name: `dense-copy-${ratio}`, error: 'Dense copy unexpectedly passed layout safety.' }); }
    catch (error) { if (/Documentary text does not fit/.test(error.message)) expectedRejections.push(`dense-copy-${ratio}`); else failures.push({ name: `dense-copy-${ratio}`, error: error.message }); }
  }
  // Preserved passage newlines can exceed any aspect ratio despite a low word count.
  for (const [ratio, width, height] of ratios) {
    const f = familyFixture('claim-evidence'); f.content.evidence.passage = 'Supplied passage\n' + '\n'.repeat(220) + 'End.';
    try { await capture(f, 'dark-documentary', ratio, width, height, `newline-overflow-${ratio}`, [90], 120); failures.push({ name: `newline-overflow-${ratio}`, error: 'Vertical overflow unexpectedly passed layout safety.' }); }
    catch (error) { if (/Documentary text does not fit/.test(error.message)) expectedRejections.push(`newline-overflow-${ratio}`); else failures.push({ name: `newline-overflow-${ratio}`, error: error.message }); }
  }
} finally { await browser.close({ silent: true }); await writeFile(path.join(output, 'report.json'), JSON.stringify({ captures, videos, expectedRejections, failures, errors }, null, 2)); }
console.log(JSON.stringify({ stills: captures.length, videos: videos.length, expectedRejections, failures, errors }));
if (failures.length || errors.length) process.exitCode = 1;
