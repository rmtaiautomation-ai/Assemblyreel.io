import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../src/features/timeline-editor/components/TimelineEditor.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('TimelineEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let updater;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'updateSceneDetails') {
    updater = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(updater, 'The editor scene updater must exist');
const compiled = ts.transpileModule(
  'const updateSceneDetails = ' + updater.getText(sourceFile),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

// Execute the production updater with React state and persistence I/O replaced.
function createEditor(selected) {
  const state = {
    scenes: [
      { id: 'scene-1', sequence_number: 1, transition_duration: 0.3 },
      { id: 'scene-2', sequence_number: 2, transition_duration: 0.5 },
    ],
    selected,
    saves: [],
  };
  const update = new Function('setScenes', 'setSelectedScene', 'persistSceneFields', compiled + '; return updateSceneDetails;')(
    apply => { state.scenes = apply(state.scenes); },
    apply => { state.selected = apply(state.selected); },
    (...args) => { state.saves.push(args); },
  );
  return { state, update };
}

test('transition pointer release before scene selection keeps the selection empty', () => {
  const { state, update } = createEditor(null);
  update('scene-2', 'transition_duration', 0.8);
  assert.equal(state.selected, null);
  assert.equal(state.scenes[0].transition_duration, 0.3);
  assert.equal(state.scenes[1].transition_duration, 0.8);
  assert.deepEqual(state.saves, [['scene-2', { transition_duration: 0.8 }, false]]);
});

test('editing another scene transition leaves the selected scene unchanged', () => {
  const selected = { id: 'scene-1', sequence_number: 1, transition_duration: 0.3 };
  const { state, update } = createEditor(selected);
  update('scene-2', 'transition_type', 'crossfade');
  assert.equal(state.selected, selected);
  assert.equal(state.scenes[1].transition_type, 'crossfade');
  assert.deepEqual(state.saves, [['scene-2', { transition_type: 'crossfade' }, false]]);
});

test('editing the selected scene updates its inspector and preserves its identity', () => {
  const selected = { id: 'scene-2', sequence_number: 2, transition_duration: 0.5 };
  const { state, update } = createEditor(selected);
  update('scene-2', 'transition_duration', 0.8);
  assert.deepEqual(state.selected, { ...selected, transition_duration: 0.8 });
  assert.notEqual(state.selected, selected);
  assert.equal(state.selected.id.substring(0, 8), 'scene-2');
});
