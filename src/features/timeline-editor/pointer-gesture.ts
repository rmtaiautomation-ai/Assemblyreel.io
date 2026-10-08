export interface PointerGestureOptions {
  event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;
  target: HTMLElement;
  onMove: (event: PointerEvent) => void;
  onFinish: (result: { cancelled: boolean; moved: boolean }) => void;
  onError: (error: unknown) => void;
}

/** One owned pointer, one finish, complete cleanup even after interruption. */
export function startPointerGesture({ event, target, onMove, onFinish, onError }: PointerGestureOptions): () => void {
  let active = true;
  let moved = false;
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('scroll', cancel, true);
    window.removeEventListener('resize', cancel);
    window.removeEventListener('keydown', keyDown);
    target.removeEventListener('lostpointercapture', cancelPointer);
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  const finish = (cancelled: boolean) => {
    if (!active) return;
    active = false;
    cleanup();
    if (moved && !cancelled) {
      // A completed drag must not also select/seek the item behind its release point.
      const suppressClick = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation(); };
      window.addEventListener('click', suppressClick, true);
      setTimeout(() => window.removeEventListener('click', suppressClick, true), 0);
    }
    try { onFinish({ cancelled, moved }); } catch (error) { onError(error); }
  };
  const cancel = () => finish(true);
  const cancelPointer = (pointer: PointerEvent) => { if (pointer.pointerId === event.pointerId) cancel(); };
  const keyDown = (key: KeyboardEvent) => { if (key.key === 'Escape') cancel(); };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== event.pointerId) return;
    if (!moved && Math.max(Math.abs(pointer.clientX - event.clientX), Math.abs(pointer.clientY - event.clientY)) < 3) return;
    moved = true;
    try { onMove(pointer); } catch (error) { cancel(); onError(error); }
  };
  const up = (pointer: PointerEvent) => {
    if (pointer.pointerId !== event.pointerId) return;
    // Apply the final release coordinate, even if the last move wasn't delivered.
    move(pointer);
    finish(false);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cancel);
  window.addEventListener('scroll', cancel, true);
  window.addEventListener('resize', cancel);
  window.addEventListener('keydown', keyDown);
  target.addEventListener('lostpointercapture', cancelPointer);
  try { target.setPointerCapture?.(event.pointerId); } catch { /* Capture can be unavailable after a detached target. */ }
  return cancel;
}
