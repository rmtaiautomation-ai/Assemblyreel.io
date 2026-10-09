import React, { memo, useEffect, useState } from 'react';
import type { ThumbnailCache } from '../thumbnail-cache';

export const TimelineThumbnail = memo(function TimelineThumbnail({ source, cache }: {
  source: string; cache: ThumbnailCache;
}) {
  const [result, setResult] = useState<{ source: string; url: string | null } | null>(null);
  useEffect(() => cache.subscribe(source, thumbnail => setResult({ source, url: thumbnail?.url ?? null })), [source, cache]);
  // A replaced source cannot briefly display the previous scene's thumbnail.
  const url = result?.source === source ? result.url : null;
  return url ? <img data-timeline-thumbnail="true" src={url} alt="" draggable={false} decoding="async"
    className="h-full w-full object-cover pointer-events-none" />
    : <div data-timeline-thumbnail="true" aria-hidden="true" className="h-full w-full bg-ed-media/10" />;
});
