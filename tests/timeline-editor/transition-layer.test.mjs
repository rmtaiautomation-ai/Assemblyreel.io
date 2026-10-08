import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { loadComponent } from './load-component.mjs';
const { TransitionControl } = await loadComponent('TransitionControl');
const labels = await loadComponent('SceneClipLabel');
const { SceneBlock } = await loadComponent('SceneBlock', { './SceneClipLabel': labels });

const source = await readFile(new URL('../../src/features/timeline-editor/components/TimelineEditor.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('TimelineEditor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
function load(name, bindings) {
  const declaration = declarations.get(name);
  assert.ok(declaration, name + ' must exist');
  const code = declaration.startsWith('function ') ? declaration : 'const ' + name + ' = ' + declaration;
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), output + '; return ' + name + ';')(...Object.values(bindings));
}
const blockTransform = load('blockTransform', { SELECTED_BLOCK_SCALE: 1.07 });

function renderTimeline({ scale = 30, selectedIndex = 0, locked = false, track = 'V1' } = {}) {
  const scenes = [
    { id: 'one', video_duration: 3, sequence_number: 1 },
    { id: 'two', video_duration: 5, sequence_number: 2, transition_type: 'crossfade', transition_duration: 0.5 },
    { id: 'three', video_duration: 4, sequence_number: 3, transition_type: 'slide', transition_duration: 0.8 },
  ];
  const calls = [];
  const bindings = {
    SceneBlock, TransitionControl, sceneDetail: null, showSceneDetail() {}, setHoveredSceneDetail() {}, setFocusedSceneDetail() {},
    React, useMemo: fn => fn(), visibleSceneEntries: scenes.map((scene, idx) => ({ scene, idx })),
    trackStates: { V1: { locked }, A1: { locked } }, selectedSceneKeys: [], selectedScene: scenes[selectedIndex], selectedSceneTrack: track,
    frozenStrip: null, isReordering: false, draggingScene: null, draggingAsset: null, isResizing: false,
    transitionDragOverSceneId: null, transitionJustAppliedId: null, isLongForm: false, scale,
    scenePressRef: { current: null }, setDraggingScene: value => calls.push(['drag-scene', value]),
    pendingStockPick: null, pendingProjectPick: null, blockRefs: { current: {} },
    getSceneLeftPosition: (_track, index) => [0, 3, 8][index] * scale,
    getSceneDuration: scene => scene.video_duration, filmstripCount: () => 1, pendingPickFor: () => null,
    getSceneColor: () => '', getVisualSequenceNumber: (_track, index) => index + 1, blockTransform,
    Film: () => null, ImageIcon: () => null, Volume2: () => null, Layers: () => null, TRANSITION_ICONS: {}, REORDER_SLIDE: 'transform 120ms',
    handleSelectSceneBlock: (_event, scene, track, index) => calls.push(['select', scene.id, track, index]),
    setIsTransitionExpanded: value => calls.push(['expand', value]),
    setTransitionDragOverSceneId: value => calls.push(['drag-over', value]),
    applyTransitionToScene: (...args) => calls.push(['apply', ...args]),
    updateSceneDetails: (...args) => calls.push(['update', ...args]),
    maxTransitionSeconds: () => 2, remotionScenes: [], remotionFps: 30,
  };
  bindings.handleTransitionResizeStart = load('handleTransitionResizeStart', {
    ...bindings,
    beginPointerGesture: (press, move, finish) => {
      const target = press.currentTarget;
      let moved = false;
      target.onpointermove = pointer => { moved = true; move(pointer); };
      target.onpointerup = () => finish({ moved, cancelled: false });
    },
  });
  const eventBindings = { ...bindings, useCommittedEvent: fn => fn, sceneById: new Map(scenes.map(scene => [scene.id, scene])) };
  for (const name of ['selectTransition', 'resizeTransition', 'applyTransition']) bindings[name] = load(name, eventBindings);
  const rendered = load(track === 'A1' ? 'a1SceneBlocks' : 'v1SceneBlocks', bindings);
  return { scenes, calls, rendered, bindings };
}
function parts(fragment) {
  assert.equal(fragment.type, React.Fragment);
  const [block, transition] = React.Children.toArray(fragment.props.children);
  return { block, transition: transition ? TransitionControl.type(transition.props) : undefined };
}
function event(extra = {}) {
  return { stopPropagation() {}, preventDefault() {}, ...extra };
}

test('transition controls are siblings above both scenes, including selected scene resize handles', () => {
  for (const selectedIndex of [0, 1]) {
    const { rendered } = renderTimeline({ selectedIndex });
    const previous = parts(rendered[0]).block;
    const { block, transition } = parts(rendered[1]);
    assert.ok(transition.props.className.includes('z-40'));
    for (const sceneBlock of [previous, block]) {
      const zIndex = Number(sceneBlock.props.className.match(/z-(\d+)/)[1]);
      assert.ok(zIndex < 40);
      assert.equal(React.Children.toArray(sceneBlock.props.children).some(child => child.props?.title?.startsWith('Transition in:')), false);
    }
    assert.equal(transition.props.draggable, false);
    assert.equal(parts(rendered[0]).transition, undefined);
  }
});

test('transition centers stay on the exact scene timestamps at different zoom levels and selections', () => {
  for (const scale of [10, 30, 100]) for (const selectedIndex of [0, 1]) {
    const { rendered, scenes } = renderTimeline({ scale, selectedIndex });
    for (const index of [1, 2]) {
      const { block, transition } = parts(rendered[index]);
      const boundary = [0, 3, 8][index] * scale;
      assert.equal(block.props.style.width, scenes[index].video_duration * scale + 'px');
      assert.equal(block.props.style.transform, blockTransform(boundary, index === selectedIndex));
      assert.equal(transition.props.style.transform, blockTransform(boundary, false));
      assert.equal(parseFloat(transition.props.style.left) + parseFloat(transition.props.style.width) / 2, 0);
      assert.equal(transition.props.style.top, undefined);
      assert.ok(transition.props.className.includes('top-[10%] bottom-[10%]'));
    }
  }
});

test('clicking the transition opens its incoming scene transition controls and obeys the track lock', () => {
  const { rendered, calls } = renderTimeline();
  parts(rendered[1]).transition.props.onClick(event());
  assert.deepEqual(calls, [['select', 'two', 'V1', 1], ['expand', true]]);
  const locked = renderTimeline({ locked: true });
  parts(locked.rendered[1]).transition.props.onClick(event());
  assert.deepEqual(locked.calls, []);
});

test('dropping a transition on either half of its control targets the incoming scene', () => {
  const { rendered, calls } = renderTimeline();
  let stopped = false;
  parts(rendered[1]).transition.props.onDrop(event({
    stopPropagation() { stopped = true; },
    dataTransfer: { getData: () => JSON.stringify({ type: 'transition', transitionType: 'glitch' }) },
  }));
  assert.equal(stopped, true);
  assert.deepEqual(calls, [['drag-over', null], ['apply', 'two', 'glitch']]);
});

test('transition resizing keeps its center fixed and updates only transition duration', () => {
  const { rendered, calls } = renderTimeline();
  const transition = parts(rendered[1]).transition;
  const handle = React.Children.toArray(transition.props.children).find(child => child.props?.onPointerDown);
  const target = { dataset: {}, parentElement: { style: {} }, setPointerCapture() {}, releasePointerCapture() {} };
  handle.props.onPointerDown(event({ currentTarget: target, pointerId: 1, clientX: 100 }));
  target.onpointermove({ clientX: 97 });
  assert.equal(target.parentElement.style.width, '21px');
  assert.equal(target.parentElement.style.left, '-10.5px');
  target.onpointerup({ pointerId: 1 });
  assert.deepEqual(calls, [['update', 'two', 'transition_duration', 0.7]]);
});

test('stale transition dataset and bare clicks cannot write duration', () => {
  const { rendered, calls } = renderTimeline();
  const handles = React.Children.toArray(parts(rendered[1]).transition.props.children).filter(child => child.props?.onPointerDown);
  for (const handle of handles) {
    const target = { dataset: { newDuration: '0.1' }, parentElement: { style: { width: '15px', left: '-7.5px' } } };
    handle.props.onPointerDown(event({ currentTarget: target, pointerId: 1, clientX: 100 }));
    target.onpointerup();
    assert.deepEqual(target.dataset, {});
    assert.deepEqual(target.parentElement.style, { width: '15px', left: '-7.5px' });
  }
  assert.deepEqual(calls, []);
});

function target(baseLeftPx, width, resizeWidth) {
  return {
    baseLeftPx, scaled: false, resizeWidth,
    initialTransform: blockTransform(baseLeftPx, false), initialWidth: width,
    node: { style: { transform: blockTransform(baseLeftPx, false), width, removeProperty() {} } },
  };
}
test('scene trim moves transition boundaries with scenes without changing transition widths', () => {
  for (const edge of ['left', 'right']) {
    const scene = target(90, '150px', true);
    const incoming = target(90, '15px', false);
    const following = target(240, '24px', false);
    const snapshot = { kind: 'scene', edge, scale: 30, startClientX: 100, initialDuration: 5, initialTrimStart: 0,
      resizeTargets: [scene, incoming], shiftTargets: [following] };
    const apply = load('applyGestureToDom', {
      gestureRef: { current: snapshot }, gesturePointerXRef: { current: 130 }, lastResizeValuesRef: { current: null },
      computeSceneResize: () => ({ duration: 6, trimStart: 0 }), blockTransform,
    });
    apply();
    assert.equal(incoming.node.style.width, '15px');
    assert.equal(incoming.node.style.transform, blockTransform(edge === 'left' ? 60 : 90, false));
    assert.equal(following.node.style.transform, blockTransform(edge === 'right' ? 270 : 240, false));
    load('clearGestureDom', {})(snapshot);
    assert.equal(incoming.node.style.transform, incoming.initialTransform);
    assert.equal(following.node.style.transform, following.initialTransform);
  }
});

test('scene resize captures the incoming control and all downstream transition controls', () => {
  const current = target(90, '150px');
  const incoming = target(90, '15px');
  const following = target(240, '24px');
  const byKey = { two_V1: current, two_transition: incoming, three_transition: following };
  const gestureRef = { current: null };
  const begin = load('handleResizeStart', {
    scenes: [{ id: 'one' }, { id: 'two' }, { id: 'three' }], trackStates: {},
    readTarget: key => byKey[key] ?? null, gestureRef, scale: 30,
    gesturePointerXRef: { current: 0 }, gestureMovedRef: { current: false }, setIsResizing() {},
  });
  begin(event({ clientX: 100 }), 'two', 'V1', 'right', 5);
  assert.equal(gestureRef.current.resizeTargets[1].node, incoming.node);
  assert.equal(gestureRef.current.resizeTargets[1].resizeWidth, false);
  assert.equal(gestureRef.current.shiftTargets[0].node, following.node);
});

test('scene reorder requires intentional motion and retains the original reorder payload', () => {
  const { rendered, calls } = renderTimeline();
  const block = parts(rendered[1]).block;
  const payloads = []; let prevented = false;
  const drag = x => event({ clientX: x, clientY: 0, preventDefault() { prevented = true; }, dataTransfer: { setData: (...args) => payloads.push(args) } });
  block.props.onPointerDown(event({ clientX: 100, clientY: 0 }));
  block.props.onDragStart(drag(102));
  assert.equal(prevented, true);
  assert.deepEqual(calls, []);
  assert.deepEqual(payloads, []);
  block.props.onDragStart(drag(110));
  assert.deepEqual(JSON.parse(payloads[0][1]), { type: 'reorder', track: 'V1', sceneId: 'two', index: 1 });
  assert.deepEqual(calls, [['drag-scene', { id: 'two', track: 'V1', duration: 5 }]]);
});

test('scene focus and keyboard activation expose identity and preserve lock and timing contracts', () => {
  for (const locked of [false, true]) {
    const { rendered, calls, scenes } = renderTimeline({ locked });
    const before = JSON.stringify(scenes);
    const block = parts(rendered[1]).block;
    assert.equal(block.props.role, 'button');
    assert.equal(block.props.tabIndex, 0);
    assert.equal(block.props['aria-disabled'], locked);
    assert.match(block.props['aria-label'], /Scene 2, video/);
    if (locked) assert.match(block.props['aria-label'], /track locked/);
    for (const key of ['Enter', 'Space']) block.props.onKeyDown(event({ key, code: key, target: block, currentTarget: block }));
    assert.deepEqual(calls, locked ? [] : [['select', 'two', 'V1', 1], ['select', 'two', 'V1', 1]]);
    assert.equal(JSON.stringify(scenes), before);
  }
});

test('A1 scene labels keep narration timing and provide keyboard access on locked and unlocked tracks', () => {
  for (const locked of [false, true]) {
    const { rendered, calls } = renderTimeline({ locked, track: 'A1' });
    const block = rendered[1];
    assert.equal(block.props.style.width, '150px');
    assert.equal(block.props.style.transform, blockTransform(90, false));
    assert.match(block.props['aria-label'], /Scene 2, narration/);
    block.props.onKeyDown(event({ key: 'Enter', target: block, currentTarget: block }));
    assert.deepEqual(calls, locked ? [] : [['select', 'two', 'A1', 1]]);
    const visual = React.Children.toArray(block.props.children)[0];
    assert.equal(visual.props.number, 2);
    assert.equal(visual.props.width, 150);
    assert.equal(visual.props.narration, undefined);
  }
});

// Compare the actual props crossing React.memo boundaries; this does not simulate a browser commit.
test('changing scene selection leaves other clip visuals and transition props shallow-equal', () => {
  const { bindings, rendered, scenes } = renderTimeline();
  bindings.selectedScene = scenes[1];
  bindings.selectedSceneKeys = ['two_V1'];
  const next = load('v1SceneBlocks', bindings);
  for (const index of [0, 1, 2]) {
    const previousChildren = React.Children.toArray(rendered[index].props.children);
    const nextChildren = React.Children.toArray(next[index].props.children);
    const visual = React.Children.toArray(previousChildren[0].props.children)[0];
    const nextVisual = React.Children.toArray(nextChildren[0].props.children)[0];
    assert.equal(visual.type, SceneBlock);
    assert.equal(SceneBlock.$$typeof, Symbol.for('react.memo'));
    for (const key of Object.keys(visual.props)) assert.ok(Object.is(visual.props[key], nextVisual.props[key]), key);
    if (index > 0) {
      assert.equal(previousChildren[1].type, TransitionControl);
      assert.equal(TransitionControl.$$typeof, Symbol.for('react.memo'));
      for (const key of Object.keys(previousChildren[1].props)) assert.ok(Object.is(previousChildren[1].props[key], nextChildren[1].props[key]), key);
    }
  }
});

test('track render takes current reorder geometry and lock handlers', () => {
  const { bindings } = renderTimeline();
  bindings.getSceneLeftPosition = (_track, index) => [0, 180, 330][index];
  bindings.trackStates = { V1: { locked: true }, A1: { locked: false } };
  const next = load('v1SceneBlocks', bindings);
  assert.equal(parts(next[1]).block.props.style.transform, blockTransform(180, false));
  assert.equal(parts(next[1]).transition.props.style.transform, blockTransform(180, false));
  assert.equal(parts(next[1]).block.props.draggable, false);
});
