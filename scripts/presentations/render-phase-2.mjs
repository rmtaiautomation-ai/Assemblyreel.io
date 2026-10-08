import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { familyFixture, assets, projectId } from '../../tests/presentations/phase-2-fixtures.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Provide a new lowercase artifact label.');
const output = path.resolve('out/presentations-phase-2', label); await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
const publicDir = path.join(output, 'empty-public'); await mkdir(publicDir);
const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.ts'), outDir: path.join(output, 'bundle'), publicDir });
const { resolvePresentation } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { DOCUMENTARY_TEMPLATES } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const svg = await Promise.all(['a','b'].map(async id => `data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../../tests/presentations/assets/comparison-${id}.svg`, import.meta.url))).toString('base64')}`));
const browser = await openBrowser('chrome'), captures = [], failures = [], errors = [], videos = [];
try {
  for (const { id } of DOCUMENTARY_TEMPLATES.slice(0, 10)) for (const theme of ['dark-documentary','parchment-archive']) for (const [ratio,width,height] of [['landscape',1920,1080],['portrait',1080,1920],['square',1080,1080]]) {
    const name = `${id}-${theme}-${ratio}`;
    const fixture = familyFixture(id); fixture.theme.id = theme;
    const result = resolvePresentation(fixture,{ start_time: 0,duration: 20,duration_mode: 'scene-remainder' },20,30,assets,projectId);
    if (!result.presentation) throw new Error(result.issues.join(' '));
    const presentation = { ...result.presentation, assets: result.presentation.assets.map(asset => ({ ...asset,url: svg[assets.findIndex(item => item.id === fixtureAssetId(asset.itemId,fixture))] ?? svg[0] })) };
    const props = { fps: 30,width,height,scenes: [{ id,durationInSeconds: 20,trimStartInSeconds: 0,mediaType: 'image',mediaUrl: '',presentation }],showCaptions: true,captionWords: [{ text: 'Caption safe area',startMs: 0,endMs: 20000 }] };
    try {
      const composition = await selectComposition({ serveUrl,id: 'MainVideo-Documentary-v2',inputProps: props,puppeteerInstance: browser });
      for (const frame of [8,75,596]) { await renderStill({ serveUrl,composition,inputProps: props,puppeteerInstance: browser,frame,output: path.join(output,`${name}-${frame}.png`),scale: .4,onBrowserLog: log => { if (log.type==='error') errors.push(`${name}: ${log.text}`); } }); captures.push(`${name}-${frame}`); }
      if (theme==='dark-documentary' && ((id==='historical-timeline' && ratio==='portrait') || (id==='detail-annotation' && ratio==='landscape') || (id==='text-translation' && ratio==='square'))) { await renderMedia({ serveUrl,composition,inputProps: props,puppeteerInstance: browser,codec: 'h264',frameRange: [0,239],outputLocation: path.join(output,`${name}.mp4`),scale: .4,concurrency: 2 }); videos.push(name); }
      console.log(`Verified ${name}`);
    } catch (error) { failures.push({ name,error: error.message }); console.log(`FAILED ${name}: ${error.message.split('\n')[0]}`); }
  }
} finally { await browser.close({ silent: true }); }
await writeFile(path.join(output,'report.json'),JSON.stringify({ captures,videos,failures,errors },null,2));
console.log(JSON.stringify({ stills: captures.length,videos: videos.length,failures,errors }));
if (failures.length || errors.length) process.exitCode=1;
function fixtureAssetId(itemId,fixture) {
  const content = fixture.content;
  const images = content.images ?? (content.image ? [content.image] : content.portrait ? [content.portrait] : []);
  return images.find(image => image.id===itemId)?.asset.mediaId;
}
