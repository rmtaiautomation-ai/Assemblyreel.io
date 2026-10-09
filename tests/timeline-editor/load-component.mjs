import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);

export async function loadComponent(name, stubs = {}) {
  const compiled = new Map();
  function load(path) {
    if (compiled.has(path)) return compiled.get(path);
    const source = readFileSync(path, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    const exports = {};
    compiled.set(path, exports);
    new Function('require', 'exports', code)(specifier => {
      if (stubs[specifier]) return stubs[specifier];
      if (!specifier.startsWith('.')) return require(specifier);
      const target = resolve(dirname(path), specifier);
      return load(existsSync(target + '.tsx') ? target + '.tsx' : target + '.ts');
    }, exports);
    return exports;
  }
  return load(fileURLToPath(new URL('../../src/features/timeline-editor/components/' + name + '.tsx', import.meta.url)));
}
