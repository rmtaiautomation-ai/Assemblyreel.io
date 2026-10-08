import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { envelope, assets, projectId } from '../../tests/presentations/phase-1-fixtures.mjs';
import { loadSource } from '../../tests/presentations/load-source.mjs';
import assert from 'node:assert/strict';

const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Usage: node scripts/presentations/render-phase-1.mjs <new-label>');
const output = path.resolve('out/presentations-phase-1', label);
await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
const publicDir = path.join(output, 'empty-public'); await mkdir(publicDir);
const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.ts'), outDir: path.join(output, 'bundle'), publicDir });
const { resolvePresentation } = await loadSource(new URL('../../src/lib/presentations/compiler.ts', import.meta.url));
const { DOCUMENTARY_COMPOSITION_ID } = await loadSource(new URL('../../src/lib/presentations/registry.ts', import.meta.url));
const svg = await Promise.all(['a', 'b'].map(async id => `data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../../tests/presentations/assets/comparison-${id}.svg`, import.meta.url))).toString('base64')}`));
const browser = await openBrowser('chrome');
const errors = []; const captures = []; const expectedRejections = [];
const onBrowserLog = log => { if (log.type === 'error') errors.push(log.text); };
try {
  for (const theme of ['dark-documentary', 'parchment-archive']) {
    for (const [ratio, width, height] of [['landscape', 1920, 1080], ['portrait', 1080, 1920], ['square', 1080, 1080]]) {
      for (const captions of [false, true]) {
        const data = { ...envelope, theme: { ...envelope.theme, id: theme }, content: { ...envelope.content,
          heading: 'Two sources, different contexts', images: envelope.content.images.map((image, index) => ({ ...image,
            label: index === 0 ? 'Mesopotamia: the city' : 'Enoch: the manuscript', fit: index === 1 ? 'contain' : 'cover',
            source: { credit: 'Authored verification fixture', url: '', classification: index === 0 ? 'reconstruction' : 'illustration' },
          })) } };
        const result = resolvePresentation(data, { start_time: 0, duration: 6, duration_mode: 'scene-remainder' }, 6, 30, assets, projectId);
        if (!result.presentation) throw new Error(result.issues.join(' '));
        const presentation = { ...result.presentation, assets: result.presentation.assets.map((asset, index) => ({ ...asset, url: svg[index] })) };
        const props = { fps: 30, width, height, scenes: [{ id: 'comparison', durationInSeconds: 6, trimStartInSeconds: 0, mediaType: 'image', mediaUrl: '', presentation }],
          showCaptions: captions, captionWords: captions ? [{ text: 'A source comparison', startMs: 0, endMs: 6000 }] : [] };
        const composition = await selectComposition({ serveUrl, id: DOCUMENTARY_COMPOSITION_ID, inputProps: props, puppeteerInstance: browser, onBrowserLog });
        const name = `${theme}-${ratio}-${captions ? 'captions' : 'clean'}`;
        for (const frame of [8, 50, 176]) {
          await renderStill({ serveUrl, composition, inputProps: props, puppeteerInstance: browser, frame, output: path.join(output, `${name}-${frame}.png`), scale: 0.5, onBrowserLog });
          captures.push(`${name}-${frame}`);
        }
        if (theme === 'dark-documentary' && captions) {
          await renderMedia({ serveUrl, composition, inputProps: props, puppeteerInstance: browser, codec: 'h264', outputLocation: path.join(output, `${name}.mp4`), scale: 0.5, concurrency: 2, onBrowserLog });
        }
        console.log(`Verified ${name}`);
      }
      const maximum = { ...envelope, theme: { ...envelope.theme, id: theme }, content: { ...envelope.content,
        heading: 'Comparing ancient cities and manuscript traditions across different archaeological contexts and eras.'.slice(0, 100),
        images: envelope.content.images.map(image => ({ ...image,
          label: 'Archaeological context: walls, temples, and ancient records.'.padEnd(60, '.').slice(0, 60),
          source: { credit: 'Author-created verification image; no historical claim. Review the source and usage rights.'.padEnd(90, '.').slice(0, 90), url: '', classification: 'reconstruction' },
        })) } };
      const maximumResult = resolvePresentation(maximum, { start_time: 0, duration: 20, duration_mode: 'scene-remainder' }, 20, 30, assets, projectId);
      assert.ok(maximumResult.presentation, maximumResult.issues.join(' '));
      const maximumPresentation = { ...maximumResult.presentation, assets: maximumResult.presentation.assets.map((asset, index) => ({ ...asset, url: svg[index] })) };
      const maximumProps = { fps: 30, width, height, scenes: [{ id: 'maximum', durationInSeconds: 20, trimStartInSeconds: 0, mediaType: 'image', mediaUrl: '', presentation: maximumPresentation }], showCaptions: true, captionWords: [{ text: 'Read sources in their own context', startMs: 0, endMs: 20000 }] };
      const maximumComposition = await selectComposition({ serveUrl, id: DOCUMENTARY_COMPOSITION_ID, inputProps: maximumProps, puppeteerInstance: browser, onBrowserLog });
      const maximumName = `${theme}-${ratio}-maximum-content`;
      if (ratio === 'square') {
        await assert.rejects(renderStill({ serveUrl, composition: maximumComposition, inputProps: maximumProps, puppeteerInstance: browser, frame: 50, output: path.join(output, `${maximumName}-must-not-overflow.png`), scale: 0.5 }), /Comparison text does not fit/);
        expectedRejections.push(`${maximumName}: shorten copy instead of reducing font/image size`);
        const shortened = { ...maximumProps, scenes: [{ ...maximumProps.scenes[0], presentation: { ...maximumPresentation, envelope: { ...maximum, content: { ...maximum.content, heading: 'Two ancient sources, different contexts', images: maximum.content.images.map(image => ({ ...image, label: 'Cities, temples, and records', source: { ...image.source, credit: 'Authored verification fixture; not historical evidence.' } })) } } } }] };
        const shortenedComposition = await selectComposition({ serveUrl, id: DOCUMENTARY_COMPOSITION_ID, inputProps: shortened, puppeteerInstance: browser, onBrowserLog });
        const shortenedName = `${theme}-${ratio}-shortened-content`;
        await renderStill({ serveUrl, composition: shortenedComposition, inputProps: shortened, puppeteerInstance: browser, frame: 50, output: path.join(output, `${shortenedName}.png`), scale: 0.5, onBrowserLog });
        captures.push(shortenedName);
      } else {
        await renderStill({ serveUrl, composition: maximumComposition, inputProps: maximumProps, puppeteerInstance: browser, frame: 50, output: path.join(output, `${maximumName}.png`), scale: 0.5, onBrowserLog });
        captures.push(maximumName);
      }
    }
  }
  // Glyph-heavy copy can satisfy character limits but still fail actual font fit.
  const excessive = { ...envelope, content: { ...envelope.content, heading: 'W'.repeat(100), images: envelope.content.images.map(image => ({ ...image, label: 'W'.repeat(60), source: { credit: 'W'.repeat(90), url: '', classification: 'reconstruction' } })) } };
  const rejectedPresentation = resolvePresentation(excessive, { start_time: 0, duration: 6, duration_mode: 'scene-remainder' }, 6, 30, assets, projectId).presentation;
  assert.ok(rejectedPresentation);
  const rejectedProps = { fps: 30, width: 1080, height: 1080, scenes: [{ id: 'excessive', durationInSeconds: 6, trimStartInSeconds: 0, mediaType: 'image', mediaUrl: '', presentation: { ...rejectedPresentation, assets: rejectedPresentation.assets.map((asset, index) => ({ ...asset, url: svg[index] })) } }], showCaptions: true, captionWords: [{ text: 'Safe caption', startMs: 0, endMs: 6000 }] };
  const rejectedComposition = await selectComposition({ serveUrl, id: DOCUMENTARY_COMPOSITION_ID, inputProps: rejectedProps, puppeteerInstance: browser });
  await assert.rejects(renderStill({ serveUrl, composition: rejectedComposition, inputProps: rejectedProps, puppeteerInstance: browser, frame: 50, output: path.join(output, 'must-not-export-overflow.png'), scale: 0.5 }), /Comparison text does not fit/);
  expectedRejections.push('glyph-heavy square copy rejected rather than clipped');
  const presentation = resolvePresentation(envelope, { start_time: 0.5, duration: 5.5, duration_mode: 'scene-remainder' }, 6, 30, assets, projectId).presentation;
  presentation.assets = presentation.assets.map((asset, index) => ({ ...asset, url: svg[index] }));
  const props = { fps: 30, width: 1920, height: 1080, scenes: [{ id: 'before', durationInSeconds: 2, mediaType: 'image', mediaUrl: svg[0], trimStartInSeconds: 0 }, { id: 'comparison', durationInSeconds: 6, mediaType: 'image', mediaUrl: '', trimStartInSeconds: 0, transition: { type: 'crossfade', durationInSeconds: 0.5 }, presentation }] };
  const composition = await selectComposition({ serveUrl, id: 'MainVideo', inputProps: props, puppeteerInstance: browser, onBrowserLog });
  for (const frame of [48, 60, 80, 100]) {
    await renderStill({ serveUrl, composition, inputProps: props, puppeteerInstance: browser, frame, output: path.join(output, `attached-transition-${frame}.png`), scale: 0.5, onBrowserLog });
    captures.push(`attached-transition-${frame}`);
  }
} finally { await browser.close({ silent: true }); }
await writeFile(path.join(output, 'report.json'), JSON.stringify({ captures, videos: 3, expectedRejections, errors }, null, 2));
console.log(JSON.stringify({ stills: captures.length, videos: 3, expectedRejections, errors }));
if (errors.length) process.exitCode = 1;
