import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../presentations/load-source.mjs';
const { layoutScenes } = await loadSource(new URL('../../src/remotion/timeline.ts', import.meta.url));
export function fixture(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'fixture-' + index, durationInSeconds: 2 + (index % 7) * 0.125,
    transition: { type: index % 3 === 0 ? 'crossfade' : 'none', durationInSeconds: 0.5 },
  }));
}
for (const count of [25, 100, 250, 500]) {
  test(count + '-scene timing fixture preserves nominal frame boundaries and input payload', () => {
    const scenes = fixture(count);
    const payload = JSON.stringify(scenes);
    const layout = layoutScenes(scenes, 30);
    let boundary = 0;
    for (const [index, segment] of layout.segments.entries()) {
      assert.equal(segment.from, boundary);
      boundary += Math.round(scenes[index].durationInSeconds * 30);
    }
    assert.equal(layout.totalDurationInFrames, boundary);
    assert.equal(JSON.stringify(scenes), payload);
  });
}
