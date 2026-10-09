/** Decorative audio pattern only; these samples are not measured amplitudes. */
function buildWaveform(kind: 'clip' | 'narration', actNumber = 0) {
  return Array.from({ length: 250 }, (_, i) => {
    const height = kind === 'clip'
      ? 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45
      : 8 + Math.abs(Math.sin((i + actNumber * 7) * 0.3) * Math.cos(i * 1.7)) * 40;
    return `M${i * 4 + 2},${50 - height} L${i * 4 + 2},${50 + height}`;
  }).join(' ');
}

export const CLIP_WAVEFORM_PATH = buildWaveform('clip');
export const NARRATION_WAVEFORM_PATH = buildWaveform('narration');
const actPaths = new Map<number, string>();
export const ACT_WAVEFORM_CACHE_LIMIT = 32;

export function actWaveformPath(actNumber: number) {
  let path = actPaths.get(actNumber);
  if (path === undefined) path = buildWaveform('narration', actNumber);
  actPaths.delete(actNumber);
  actPaths.set(actNumber, path);
  if (actPaths.size > ACT_WAVEFORM_CACHE_LIMIT) actPaths.delete(actPaths.keys().next().value!);
  return path;
}
