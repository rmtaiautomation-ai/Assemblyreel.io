/** Inputs and dialogs own their shortcuts; transport keys belong to the editor. */
export function shouldHandleTimelineShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || !(event.target instanceof Element)) return false;
  const target = event.target;
  if (!target.closest('[data-timeline-editor]')) return false;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog')) return false;
  if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return false;
  if (event.code === 'Space' && target.closest('button, a, [role="button"]')) return false;
  return true;
}

/** Opt-in development trace: IDs and event ownership only, never narration or URLs. */
export function traceTimelineInteraction(event: { type: string; target: EventTarget | null }, selection: string | null, gesture: string | null): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem('timeline:debug-navigation') !== '1') return;
    const target = event.target instanceof Element ? event.target : null;
    const clip = target?.closest('[data-timeline-scene], [data-timeline-transition]');
    console.debug('[timeline navigation]', { event: event.type, target: target?.tagName,
      scene: clip?.getAttribute('data-timeline-scene'), transition: clip?.getAttribute('data-timeline-transition'),
      selection, gesture, time: performance.now() });
  } catch { /* Diagnostic storage can be disabled by browser privacy settings. */ }
}
