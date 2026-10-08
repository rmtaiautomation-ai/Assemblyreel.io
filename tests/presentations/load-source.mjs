import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the actual TypeScript without importing provider clients or a DB.
// Explicit stubs are used only by server-action tests for their I/O boundaries.
export async function loadSource(url, stubs = {}) {
  async function compile(sourceUrl) {
    const source = await readFile(sourceUrl, 'utf8');
    let output = ts.transpileModule(source, {
      fileName: sourceUrl.pathname,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [, quote, specifier] of [...output.matchAll(/(?:from\s+|import\s*)(["'])([^"']+)\1/g)]) {
      const dependency = stubs[specifier] ?? (specifier.startsWith('@/')
        ? await compile(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url))
        : specifier.startsWith('.')
          ? await compile(new URL(`${specifier}.ts`, sourceUrl))
          : import.meta.resolve(specifier));
      output = output.replaceAll(`${quote}${specifier}${quote}`, JSON.stringify(dependency));
    }
    return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  }
  return import(await compile(url));
}
