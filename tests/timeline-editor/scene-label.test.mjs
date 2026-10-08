import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const source = await readFile(new URL('../../src/features/timeline-editor/components/SceneClipLabel.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const exports = {};
new Function('require', 'exports', compiled)(name => { assert.equal(name, 'react'); return React; }, exports);
const label = props => renderToStaticMarkup(React.createElement(exports.SceneClipLabel, { icon: React.createElement('i', { 'data-icon': 'media' }), ...props }));
test('wide labels show compact identity and retain no narration text', () => {
  const props = { number: 7, width: 200, hasMedia: true, pending: true, narration: 'Full narration belongs in the inspector' };
  const before = JSON.stringify(props);
  const html = label(props);
  assert.match(html, />S7</);
  assert.ok(!html.includes(props.narration));
  assert.match(html, /pointer-events-none/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(JSON.stringify(props), before);
});
test('narrow clips show a centered marker and omit crowded icons/labels', () => {
  for (const width of [3, 10, 25]) {
    const html = label({ number: 500, width });
    assert.ok(!html.includes('S500'));
    assert.ok(!html.includes('data-icon'));
    assert.match(html, /mx-auto/);
    assert.ok(!html.includes('px-1.5'));
  }
  assert.ok(!label({ number: 7, width: 40 }).includes('data-icon'));
  assert.match(label({ number: 500, width: 80 }), />S500</);
});
