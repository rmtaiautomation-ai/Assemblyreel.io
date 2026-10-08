import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { renderFixtures } from '../../tests/presentations/render-fixtures.mjs';

const [label, compareLabel] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label) || (compareLabel && !/^[a-z0-9-]+$/.test(compareLabel))) {
  throw new Error('Usage: node scripts/presentations/render-baseline.mjs <new-label> [compare-label]');
}
const root = path.resolve('out/presentations-phase-0');
await mkdir(root, { recursive: true });
const output = path.join(root, label);
await mkdir(output); // Refuse to overwrite a previous capture.
const emptyPublic = path.join(output, 'empty-public');
await mkdir(emptyPublic);
console.log('Bundling the actual MainVideo composition (no project media copied).');
const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.ts'), outDir: path.join(output, 'bundle'), publicDir: emptyPublic });
const browser = await openBrowser('chrome', { chromiumOptions: { headless: true } });
const captures = [];
const browserErrors = [];
try {
  for (const fixture of renderFixtures) {
    const onBrowserLog = log => { if (log.type === 'error') browserErrors.push(`${fixture.name}: ${log.text}`); };
    const composition = await selectComposition({ serveUrl, id: 'MainVideo', inputProps: fixture.props, puppeteerInstance: browser, onBrowserLog });
    const file = path.join(output, `${fixture.name}.png`);
    await renderStill({ serveUrl, composition, inputProps: fixture.props, puppeteerInstance: browser, output: file, frame: fixture.frame, imageFormat: 'png', scale: 0.5, onBrowserLog });
    const sha256 = createHash('sha256').update(await readFile(file)).digest('hex');
    captures.push({ name: fixture.name, frame: fixture.frame, unchanged: fixture.unchanged, sha256, durationInFrames: composition.durationInFrames, width: composition.width, height: composition.height });
    console.log(`Captured ${fixture.name}`);
  }
} finally {
  await browser.close({ silent: true });
}
const previous = compareLabel ? JSON.parse(await readFile(path.join(root, compareLabel, 'report.json'), 'utf8')) : undefined;
const differences = previous ? captures.filter(capture => previous.captures.find(item => item.name === capture.name)?.sha256 !== capture.sha256).map(capture => ({ name: capture.name, expected: !capture.unchanged })) : [];
const report = { label, compareLabel, capturedAt: new Date().toISOString(), captures, differences, browserErrors };
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ captures: captures.length, differences, browserErrors }, null, 2));
if (differences.some(diff => !diff.expected) || browserErrors.length > 0) process.exitCode = 1;
