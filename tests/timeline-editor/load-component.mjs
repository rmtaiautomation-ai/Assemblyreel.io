import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);

export async function loadComponent(name, stubs = {}) {
  const source = await readFile(new URL('../../src/features/timeline-editor/components/' + name + '.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(specifier => stubs[specifier] ?? require(specifier), exports);
  return exports;
}
