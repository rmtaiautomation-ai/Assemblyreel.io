import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { openBrowser } from '@remotion/renderer';

const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Usage: node scripts/presentations/check-ui.mjs <new-label>');
const output = path.resolve('out/presentations-phase-1', label);
await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('tests/presentations/ui-entry.tsx')], bundle: true, platform: 'browser', format: 'iife', outfile: path.join(output, 'ui.js'), jsx: 'automatic' });
const cssPath = path.resolve('src/app/globals.css');
const css = await postcss([tailwind({ base: process.cwd() })]).process(await readFile(cssPath, 'utf8'), { from: cssPath });
await writeFile(path.join(output, 'ui.css'), css.css);
const files = new Map([
  ['/ui.js', [path.join(output, 'ui.js'), 'text/javascript']], ['/ui.css', [path.join(output, 'ui.css'), 'text/css']],
  ...['a', 'b'].map(id => [`/comparison-${id}.svg`, [path.resolve(`tests/presentations/assets/comparison-${id}.svg`), 'image/svg+xml']]),
]);
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/ui.js"></script></body></html>'); return; }
  const file = files.get(request.url);
  if (!file) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', file[1]); response.end(await readFile(file[0]));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
const expectedErrors = [];
let expectingLayoutFailure = false;
const browser = await openBrowser('chrome');
const page = await browser.newPage({ context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: log => { if (log.type === 'error') (expectingLayoutFailure && /Comparison text does not fit|ComparisonLayout.*ErrorBoundary/.test(log.text) ? expectedErrors : errors).push(log.text); }, onLog: () => {} });
async function until(predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await page.evaluate(predicate)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('UI condition timed out.');
}
async function click(text) { await page.evaluate(value => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === value)?.click(), text); }
async function change(selector, value, index = 0) {
  await page.evaluate((query, next, position) => {
    const element = document.querySelectorAll(query)[position];
    if (!element) throw new Error(`Missing ${query}`);
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, next);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, selector, value, index);
}
async function screenshot(name) {
  const { value: shot } = await page._client().send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
}
try {
  await page.setViewport({ width: 1365, height: 900, deviceScaleFactor: 1 });
  await page.goto({ url: origin, timeout: 30000 });
  await until(() => document.body.textContent.includes('Browse templates'));
  await click('Browse templates'); await until(() => Boolean(document.querySelector('[role="dialog"]')));
  await change('[aria-label="Image 1"]', '40000000-0000-4000-8000-000000000001');
  await change('[aria-label="Image 1 label"]', 'Mesopotamia: the city');
  await change('[aria-label="Image 2"]', '40000000-0000-4000-8000-000000000002');
  await change('[aria-label="Image 2 label"]', 'Enoch: the manuscript');
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Apply to scene' && !button.disabled));
  assert.equal(await page.evaluate(() => localStorage.getItem('isolated-presentation-fixture')), null);
  await until(() => document.querySelectorAll('[role="dialog"] img').length >= 2);
  await screenshot('landscape-editor');
  await change('[aria-label="Preview aspect ratio"]', '9:16');
  await until(() => document.querySelector('[aria-label="Preview aspect ratio"]').value === '9:16');
  await screenshot('portrait-editor');
  expectingLayoutFailure = true;
  await change('input[maxlength="100"]', 'W'.repeat(100));
  await change('[aria-label="Image 1 label"]', 'W'.repeat(60));
  await change('[aria-label="Image 2 label"]', 'W'.repeat(60));
  await click('Sources');
  await change('input[maxlength="90"]', 'W'.repeat(90));
  await change('input[maxlength="90"]', 'W'.repeat(90), 1);
  await change('select:has(option[value="reconstruction"])', 'reconstruction');
  await change('select:has(option[value="reconstruction"])', 'reconstruction', 1);
  await change('[aria-label="Preview aspect ratio"]', '1:1');
  await until(() => document.body.textContent.includes('Comparison text does not fit'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Apply to scene').disabled), true);
  await change('input[maxlength="90"]', ''); await change('input[maxlength="90"]', '', 1);
  await change('select:has(option[value="reconstruction"])', 'unknown');
  await change('select:has(option[value="reconstruction"])', 'unknown', 1);
  await click('Content'); await change('input[maxlength="100"]', '');
  await change('[aria-label="Image 1 label"]', 'Mesopotamia: the city');
  await change('[aria-label="Image 2 label"]', 'Enoch: the manuscript');
  await change('[aria-label="Preview aspect ratio"]', '16:9');
  await until(() => document.querySelectorAll('[data-comparison-card]').length === 2 && ![...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Apply to scene').disabled);
  expectingLayoutFailure = false;
  await click('Swap images and labels');
  assert.equal(await page.evaluate(() => document.querySelector('[aria-label="Image 1 label"]').value), 'Enoch: the manuscript');
  await click('Apply to scene');
  await until(() => !document.querySelector('[role="dialog"]'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('isolated-presentation-fixture')));
  assert.equal(saved.template_data.content.images[0].label, 'Enoch: the manuscript');
  await page.goto({ url: origin, timeout: 30000 });
  await until(() => document.body.textContent.includes('Edit / Preview'));
  await click('Remove'); await until(() => document.body.textContent.includes('Choose a presentation'));
  await click('Undo'); await until(() => document.body.textContent.includes('Image Comparison'));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await click('Edit / Preview'); await until(() => Boolean(document.querySelector('[role="dialog"]')));
  await screenshot('mobile-editor');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await until(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ checks: ['draft does not save', 'two image choices', 'labels', 'portrait preview', 'overflow blocks apply', 'shorter copy recovers preview', 'swap', 'apply', 'reload', 'remove', 'undo', 'mobile', 'escape'], expectedLayoutErrors: expectedErrors.length, errors }, null, 2));
  console.log('Presentation browser workflow passed; 3 screenshots captured.');
} finally { await browser.close({ silent: true }); await new Promise(resolve => server.close(resolve)); }
