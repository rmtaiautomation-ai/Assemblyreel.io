import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';
import { createEditorLoader } from '../../tests/timeline-editor/load-editor.mjs';
import { buildExport, exportFixture, digest } from '../../tests/timeline-editor/export-fixture.mjs';

// Intentionally prints to stdout only. Updating the checked-in reference requires
// an explicit review; normal tests never regenerate their own expected results.
const run = promisify(execFile);
const revision = process.argv[2] ?? '5c9753c';
const paths = ['src/features/timeline-editor/components/TimelineEditor.tsx', 'src/remotion/timeline.ts', 'src/server/rendering/render-payload.ts'];
const results = await Promise.allSettled(paths.map(path => run('git', ['show', `${revision}:${path}`], { maxBuffer: 2_000_000 })));
const source = results.map(result => { if (result.status === 'rejected') throw result.reason; return result.value.stdout; });
const load = createEditorLoader(source[0]);
function compile(text) {
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { layoutScenes } = await compile(source[1]);
const { prepareRenderPayload } = await compile(source[2]);
const cases = [];
for (const count of [25, 100, 250, 500]) for (const fps of [24, 30, 60]) for (const longForm of [false, true]) {
  const result = buildExport(load, exportFixture(count, fps, longForm), layoutScenes, prepareRenderPayload);
  cases.push({ count, fps, longForm, payloadSha256: digest(result.payload), layoutSha256: digest(result.layout), durationInFrames: result.payload.durationInFrames });
}
console.log(JSON.stringify({ baselineRevision: revision, note: 'Synthetic Phase 0 duration fixtures, extended with export fields. Not captured production requests or browser measurements.', cases }, null, 2));
