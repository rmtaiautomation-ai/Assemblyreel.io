import React, { useEffect, useRef, useState } from 'react';
import { Img, continueRender, delayRender } from 'remotion';
import type { ResolvedPresentation } from '../../lib/presentations/schema';

export type ImageSize = { width: number; height: number };
/** Uses durable resolved slots and real image dimensions, never browser-dependent crop guesses. */
export function PreparedImages({ presentation, children }: { presentation: ResolvedPresentation; children: (sizes: ImageSize[]) => React.ReactNode }) {
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({}), [error, setError] = useState('');
  const [handle] = useState(() => delayRender('Checking prepared documentary image dimensions'));
  const finished = useRef(false);
  const ready = presentation.assets.every(asset => Boolean(sizes[asset.itemId]));
  useEffect(() => { if (ready && !finished.current) { finished.current = true; continueRender(handle); } }, [ready, handle]);
  useEffect(() => () => { if (!finished.current) { finished.current = true; continueRender(handle); } }, [handle]);
  if (error) throw Error(error);
  return <>{presentation.assets.map(asset => <Img key={asset.itemId} src={asset.url} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onLoad={event => {
    const image = event.currentTarget;
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    setSizes(previous => ({ ...previous, [asset.itemId]: size }));
  }} onError={() => { setError('A prepared image could not be loaded. Repair the source asset before exporting.'); if (!finished.current) { finished.current = true; continueRender(handle); } }} />)}{ready && children(presentation.assets.map(asset => sizes[asset.itemId]))}</>;
}
