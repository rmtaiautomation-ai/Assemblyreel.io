/** Mutable transport state: animation frames update two transforms, never editor React state. */
export function createTimelineCursor() {
  const positionRef = { current: 0 };
  const lineRef: { current: HTMLDivElement | null } = { current: null };
  const handleRef: { current: HTMLDivElement | null } = { current: null };
  const syncRef: { current: ((position: number, explicitSeek: boolean) => void) | null } = { current: null };
  const paint = () => {
    const transform = `translateX(calc(${positionRef.current}px - 50%))`;
    if (lineRef.current) lineRef.current.style.transform = transform;
    if (handleRef.current) handleRef.current.style.transform = transform;
  };
  const update = (position: number, explicitSeek: boolean) => {
    positionRef.current = position;
    paint();
    syncRef.current?.(position, explicitSeek);
  };
  return { positionRef, lineRef, handleRef, syncRef, paint,
    bindLine: (element: HTMLDivElement | null) => { lineRef.current = element; paint(); },
    bindHandle: (element: HTMLDivElement | null) => { handleRef.current = element; paint(); },
    seek: (position: number) => update(position, true),
    advance: (position: number) => update(position, false) };
}

interface PlaybackOptions {
  positionRef: { current: number };
  scale: number;
  endSeconds: number;
  readMaster: (seconds: number) => HTMLMediaElement | null;
  advance: (position: number) => void;
  stop: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}

/** The native narration remains the clock; RAF time is only the existing fallback. */
export function startTimelinePlayback({ positionRef, scale, endSeconds, readMaster, advance, stop,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now(),
}: PlaybackOptions) {
  let previousTime = now();
  let frame: number;
  let cancelled = false;
  const animate = (time: number) => {
    if (cancelled) return;
    const delta = (time - previousTime) / 1000;
    previousTime = time;
    const master = readMaster(positionRef.current / scale);
    const position = master && !master.paused && !master.seeking && master.readyState >= 1
      ? (parseFloat(master.dataset.start || '0') + master.currentTime - parseFloat(master.dataset.trimStart || '0')) * scale
      : positionRef.current + delta * scale;
    const end = endSeconds * scale;
    advance(Math.min(position, end));
    if (position >= end) { stop(); return; }
    if (!cancelled) frame = requestFrame(animate);
  };
  frame = requestFrame(animate);
  return () => { cancelled = true; cancelFrame(frame); };
}
