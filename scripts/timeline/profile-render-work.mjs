// Source-level operation counts, not a browser frame-time or React Profiler benchmark.
// Optional argument: a pre-Phase-5 TimelineEditor.tsx snapshot for before/after comparison.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const currentUrl = new URL('../../src/features/timeline-editor/components/TimelineEditor.tsx', import.meta.url);
const current = await readFile(currentUrl, 'utf8');
const baseline = process.argv[2] ? await readFile(process.argv[2], 'utf8') : null;
const { createTimelineCursor, startTimelinePlayback } = await loadSource(new URL('../../src/features/timeline-editor/playback.ts', import.meta.url));
function declaration(source, name) {
  const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!result) throw new Error('Missing declaration: ' + name);
  return result;
}
function evaluate(code, bindings) {
  const compiled = ts.transpileModule('const value = ' + code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), compiled + '; return value;')(...Object.values(bindings));
}
function presentationWork(source, count) {
  let rowReads = 0; let referenceRows = 0; let referenceArrays = 0;
  const scenes = Array.from({ length: count }, (_, index) => ({ id: 'scene-' + index, sequence_number: index + 1, video_duration: 5 }));
  const presentationRows = scenes.map(scene => ({ get scene_id() { rowReads++; return scene.id; }, template_data: {} }));
  const map = scenes.map.bind(scenes);
  scenes.map = callback => {
    const result = map(callback);
    if (result[0] && 'sequence' in result[0]) { referenceRows += result.length; referenceArrays++; }
    return result;
  };
  const bindings = { scenes, presentationRows, useMemo: fn => fn(), pendingPickFor: () => null,
    pendingStockPick: null, pendingProjectPick: null, remotionFps: 30, presentationAssets: [], initialProject: { id: 'project' },
    unsupportedPresentationScenes: [], resolvePresentation: () => ({ presentation: undefined, issues: [] }) };
  if (source.includes('const presentationBySceneId')) {
    for (const name of ['sceneById', 'presentationBySceneId', 'sceneReferences']) bindings[name] = evaluate(declaration(source, name), bindings);
  }
  const composition = evaluate(declaration(source, 'remotionScenes'), bindings);
  evaluate(declaration(source, 'presentationIssues'), bindings);
  return { sceneCount: composition.length, presentationRowIdReads: rowReads, referenceArrays, referenceRows };
}
function playbackWork(source) {
  let pending; let nextId = 0; let stateUpdates = 0; let syncCalls = 0;
  const requestAnimationFrame = callback => { pending = callback; return ++nextId; };
  const cancelAnimationFrame = () => { pending = null; };
  if (source) {
    const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('const animate =')) effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    evaluate(effect, { isPlaying: true, previewFailed: false, animationRef: { current: null }, lastTimeRef: { current: 0 },
      performance: { now: () => 0 }, playbackEndDuration: 100, scale: 30, getMasterAudioKey: () => null,
      cursorPositionRef: { current: 0 }, mediaRefs: { current: {} }, requestAnimationFrame, cancelAnimationFrame,
      setCursorPosition: () => stateUpdates++, setIsPlaying: () => stateUpdates++ })();
  } else {
    const cursor = createTimelineCursor();
    cursor.syncRef.current = () => syncCalls++;
    startTimelinePlayback({ positionRef: cursor.positionRef, scale: 30, endSeconds: 100, readMaster: () => null,
      advance: cursor.advance, stop: () => stateUpdates++, requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame, now: () => 0 });
  }
  for (let i = 1; i <= 600; i++) { const callback = pending; pending = null; callback(i * 1000 / 60); }
  return { syntheticFrames: 600, editorStateUpdateCalls: stateUpdates, directSyncCalls: syncCalls };
}
console.log(JSON.stringify({ note: 'Operation counts from actual extracted source; excludes React commits, layout, decoding and browser latency.',
  playback: { ...(baseline ? { before: playbackWork(baseline) } : {}), after: playbackWork(null) },
  presentations: [25, 100, 250, 500].map(count => ({ ...(baseline ? { before: presentationWork(baseline, count) } : {}), after: presentationWork(current, count) })),
}, null, 2));
