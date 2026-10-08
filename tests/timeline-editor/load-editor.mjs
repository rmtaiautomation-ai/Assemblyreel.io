import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../../src/features/timeline-editor/components/TimelineEditor.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('TimelineEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
export function loadEditor(name, bindings = {}) {
  const declaration = declarations.get(name);
  assert.ok(declaration, name + ' must exist');
  const code = declaration.startsWith('function ') ? declaration : 'const ' + name + ' = ' + declaration;
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), output + '; return ' + name + ';')(...Object.values(bindings));
}
