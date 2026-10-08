import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable event identity with the latest committed selection, locks and geometry.
 * Use for event handlers only, never for values needed during rendering.
 */
export function useCommittedEvent<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; }, [callback]);
  return useCallback((...args: Args) => latest.current(...args), []);
}
