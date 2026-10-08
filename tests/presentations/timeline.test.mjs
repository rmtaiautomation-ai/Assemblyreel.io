import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';

const { layoutScenes } = await loadSource(new URL('../../src/remotion/timeline.ts', import.meta.url));

test('all six existing transition modes preserve nominal scene and narration boundaries', () => {
  for (const type of ['none', 'crossfade', 'slide', 'zoom', 'glitch', 'light-leak']) {
    const { segments, totalDurationInFrames } = layoutScenes([
      { id: 'one', durationInSeconds: 2 },
      { id: 'two', durationInSeconds: 2, transition: { type, durationInSeconds: 0.5 } },
    ], 30);
    assert.equal(totalDurationInFrames, 120);
    assert.equal(segments[1].from, 60);
    assert.equal(segments[1].renderFrom + segments[1].renderDurationInFrames, 120);
    assert.equal(segments[1].transitionInFrames, type === 'none' ? 0 : 15);
  }
});

test('long timelines use per-scene rounding and transitions cannot consume a short neighbour', () => {
  const long = layoutScenes(Array.from({ length: 200 }, (_, i) => ({ id: String(i), durationInSeconds: 2.345 })), 30);
  assert.equal(long.totalDurationInFrames, 200 * Math.round(2.345 * 30));
  const short = layoutScenes([{ durationInSeconds: 1 / 30 }, { durationInSeconds: 3, transition: { type: 'crossfade', durationInSeconds: 5 } }], 30);
  assert.equal(short.segments[1].transitionInFrames, 0);
});
