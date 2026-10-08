import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { openBrowser } from '@remotion/renderer';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const label = process.argv[2]; if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('Provide a fresh lowercase artifact label.');
const output = path.resolve('out/presentations-phase-4', label); await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
const { defaultVisualSettings } = await loadSource(new URL('../../src/lib/presentations/visual-settings.ts', import.meta.url));
// Reuse the real manual panel/settings harness; stub only server-action persistence.
const boundary = `const key='isolated-phase-2-settings'; const read=()=>JSON.parse(localStorage.getItem(key)||'null')||{settings:${JSON.stringify(defaultVisualSettings())},revision:0};export async function getPresentationVisualSettings(){return {success:true,...read()};}export async function savePresentationVisualSettings(scope,id,revision,settings){const current=read();if(current.revision!==revision)return {success:false,error:'Stale settings'};const next={settings,revision:revision+1};localStorage.setItem(key,JSON.stringify(next));return {success:true,...next};}`;
await build({ absWorkingDir: process.cwd(), entryPoints: [path.resolve('tests/presentations/phase-2-ui-entry.tsx')], bundle: true, platform: 'browser', format: 'iife', outfile: path.join(output, 'ui.js'), jsx: 'automatic', plugins: [{ name: 'isolated-server-boundary', setup(build) { build.onLoad({ filter: /features[\\/]presentations[\\/]server[\\/]context\.ts$/ }, () => ({ contents: boundary, loader: 'js' })); } }] });
const cssPath = path.resolve('src/app/globals.css'), css = await postcss([tailwind({ base: process.cwd() })]).process(await readFile(cssPath, 'utf8'), { from: cssPath }); await writeFile(path.join(output, 'ui.css'), css.css);
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/ui.js"></script></body></html>'); return; }
  const name = req.url === '/ui.js' ? 'ui.js' : req.url === '/ui.css' ? 'ui.css' : null, fixture = /^\/comparison-([ab])\.svg$/.exec(req.url);
  if (!name && !fixture) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name === 'ui.js' ? 'text/javascript' : name === 'ui.css' ? 'text/css' : 'image/svg+xml'); res.end(await readFile(name ? path.join(output, name) : path.resolve(`tests/presentations/assets/comparison-${fixture[1]}.svg`)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`, browser = await openBrowser('chrome'), errors = [], checks = [];
const page = await browser.newPage({ context: () => null, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: log => { if (log.type === 'error') errors.push(log.text); }, onLog: () => {} });
async function until(predicate) { const end = Date.now() + 30000; while (Date.now() < end) { if (await page.evaluate(predicate)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`UI timeout: ${await page.evaluate(() => document.body.textContent.slice(-2000))}`); }
async function click(text) { await page.evaluate(value => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === value); if (!button || button.disabled) throw Error(`Missing or disabled button: ${value}`); button.click(); }, text); }
async function change(label, value, index = 0) { await page.evaluate((label, value, index) => { const element = document.querySelectorAll(`[aria-label="${label}"]`)[index]; if (!element) throw Error(`Missing ${label}`); const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, label, value, index); }
async function family(name) { await page.evaluate(name => { const button = [...document.querySelectorAll('[aria-label="Template families"] button')].find(node => node.textContent.includes(name)); if (!button) throw Error(`Missing ${name}`); button.click(); }, name); }
async function credits(classification = 'illustration') { await click('Sources'); const count = await page.evaluate(() => document.querySelectorAll('[aria-label="Credit"]').length); for (let i = 0; i < count; i++) { await change('Credit', 'Authored layout fixture', i); await change('Source type', classification, i); } await click('Content'); }
async function ready() { await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Apply to scene' && !button.disabled)); await new Promise(resolve => setTimeout(resolve, 800)); assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply to scene').disabled), false); }
async function blocked() { assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply to scene').disabled), true); }
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 }); await page.goto({ url: origin, timeout: 30000 }); await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Save visual defaults' && !button.disabled));
  const cases = [
    ['Cause and Effect', 'cause-effect', async () => {
      await change('Step 1', 'Earlier source'); await change('Step 2', 'Later copy'); await change('Link 1 label', 'Copied later'); await credits(); await ready();
      await change('Link 1 meaning', 'causal'); await blocked(); await change('Link 1 support', 'A supplied causal explanation.'); await credits('historical'); await ready(); checks.push('causal support gate and explicit sequential distinction');
      await click('Add step (up to 4)'); await blocked(); await change('Step 3', 'Later reading'); await change('Link 2 label', 'Then'); await credits('historical'); await ready();
    }],
    ['Scale Comparison', 'scale-comparison', async () => {
      await change('Object 1', 'Reference A'); await change('Object 2', 'Reference B'); await change('Measurement 1', 1); await change('Measurement 2', 200); await change('Unit 2', 'cm'); await credits(); await ready();
      const ratio = await page.evaluate(() => { const bars = [...document.querySelectorAll('[data-measurement]')]; return bars[0].getBoundingClientRect().height / bars[1].getBoundingClientRect().height; }); assert.ok(Math.abs(ratio - .5) < .01); checks.push('real Player heights use converted 1:2 ratios');
      await change('Measurement 1', .001); await blocked(); await change('Scale method', 'values-only'); await ready(); assert.ok(await page.evaluate(() => document.body.textContent.includes('VALUES ONLY · NOT TO SCALE'))); checks.push('extreme scale rejected; explicit not-to-scale fallback');
    }],
    ['Fact Reveal', 'fact-reveal', async () => {
      await change('Fact kind', 'range'); await change('Exact displayed value', '12–18'); await change('Qualifier (for example: approximately)', 'approximately'); await change('Fact context', 'A supplied range, not an exact count.'); await credits(); await ready(); checks.push('exact range and uncertainty retained');
    }],
    ['Claim and Evidence', 'claim-evidence', async () => {
      await change('Claim', 'A text preserves a tradition.'); await change('Specific evidence / attribution', 'Supplied source'); await change('Exact supplied passage / explanation', '  The text records an account.  '); await change('What the evidence establishes', 'This provides context.'); await change('Limits / what remains uncertain', 'This is not archaeological proof.'); await credits(); await ready();
      await change('Evidence kind', 'object'); await blocked(); await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('Include a source image')).querySelector('input').click()); await change('Image 1', '40000000-0000-4000-8000-000000000001'); await change('Image 1 label', 'Supplied object'); await credits(); await ready();
      await change('Evidence kind', 'attributed'); await blocked(); await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('Include a source image')).querySelector('input').click()); await ready(); checks.push('object ownership slot and attributed context fallback');
    }],
  ];
  for (const [name, id, fill] of cases) {
    await click('Browse templates'); await until(() => Boolean(document.querySelector('[role="dialog"]'))); await family(name); await fill();
    for (const ratio of ['9:16', '1:1', '16:9']) { await change('Preview aspect ratio', ratio); await ready(); }
    await click('Apply to scene'); await until(() => !document.querySelector('[role="dialog"]')); const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('isolated-phase-2-row'))); assert.equal(saved.template_data.templateId, id); assert.equal(saved.locked, true);
    if (id === 'fact-reveal') assert.equal(saved.template_data.content.value, '12–18');
    if (id === 'claim-evidence') assert.equal(saved.template_data.content.evidence.passage, '  The text records an account.  ');
    await click('Undo'); await until(() => document.body.textContent.includes('Choose a presentation')); checks.push(`${id}: actual edit, three ratios, Apply and Undo`);
  }
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Channel visuals"] label')].find(label => label.textContent === 'D13 · Fact Reveal').querySelector('input').click()); await click('Save visual defaults'); await until(() => document.body.textContent.includes('Saved. Existing scene presentations are unchanged.')); await click('Browse templates'); await until(() => Boolean(document.querySelector('[role="dialog"]'))); assert.equal(await page.evaluate(() => [...document.querySelectorAll('[aria-label="Template families"] button')].some(button => button.textContent.includes('Fact Reveal'))), false); await click('Close'); checks.push('new family opt-out saved without mutating scenes');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await click('Browse templates'); await until(() => Boolean(document.querySelector('[role="dialog"]'))); await family('Claim and Evidence'); assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]').scrollWidth <= document.querySelector('[role="dialog"]').clientWidth), true); const { value: shot } = await page._client().send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(output, 'mobile-phase-4.png'), Buffer.from(shot.data, 'base64')); await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await until(() => !document.querySelector('[role="dialog"]')); checks.push('mobile fit and Escape dismissal');
  assert.deepEqual(errors, []);
} finally { await browser.close({ silent: true }); await new Promise(resolve => server.close(resolve)); await writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2)); }
console.log(JSON.stringify({ checks, errors }));
