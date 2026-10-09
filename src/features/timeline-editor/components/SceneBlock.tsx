import React, { memo } from 'react';
import { Film, Image as ImageIcon, Volume2 } from 'lucide-react';
import { SceneClipLabel } from './SceneClipLabel';
import { TimelineThumbnail } from './TimelineThumbnail';
import type { ThumbnailCache } from '../thumbnail-cache';
import { CLIP_WAVEFORM_PATH } from '../waveform';

interface SceneBlockProps {
  track: 'V1' | 'A1'; number: number; width: number;
  mediaUrl?: string; mediaType?: string; thumbnailCache?: ThumbnailCache;
  pending?: boolean; awaitingVisuals?: boolean; hasAudio?: boolean;
}

// Only visual content is memoized. The owning hit target always receives fresh
// selection/gesture handlers; changing another selection cannot rebuild this strip.
export const SceneBlock = memo(function SceneBlock({ track, number, width, mediaUrl, mediaType,
  thumbnailCache, pending = false, awaitingVisuals = false, hasAudio = false,
}: SceneBlockProps) {
  return track === 'V1' ? <><div className="w-full h-full p-1.5 flex flex-col relative">
     <SceneClipLabel number={number} width={width}
       icon={mediaType === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
       hasMedia={Boolean(mediaUrl)} pending={pending} />
     {mediaUrl && (
        <div className="absolute inset-0 z-0 flex overflow-hidden rounded-md pointer-events-none">
           {mediaType !== 'video' && width >= 32 && thumbnailCache
             ? <TimelineThumbnail source={mediaUrl} cache={thumbnailCache} />
             : <div className="w-full h-full bg-ed-media/10" />}
        </div>
     )}
  </div>
  {/* Awaiting-visuals overlay — long-form only. `environment` is
      written exclusively by agents 4-7 (never by the Scene
      Slicer), so its absence means this scene's Act has not
      been visually approved yet. Every scene in an unapproved
      Act carries this, which is what turns the V1 track into a
      legible per-Act progress readout during the interleaved
      audio/visual workflow rather than a wall of empty-looking
      blocks with no explanation. pointer-events-none so it never
      steals the click/drag/resize handlers above. */}
  {awaitingVisuals && (
    <div
      className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-ed-text-faint/15"
      style={{
        // White-alpha hatching, not black. Black stripes at 6%
        // over a dark block are arithmetically invisible — the
        // "unapproved" state was reading as a plain empty block,
        // which is exactly the confusion this overlay exists to
        // prevent. The flat wash also dropped 25% → 15%: with a
        // hatch that actually shows, the wash only needs to tint.
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(237,237,239,0.10) 0px, rgba(237,237,239,0.10) 6px, transparent 6px, transparent 12px)',
      }}
    >
      {width > 120 && (
        <span className="text-[8px] font-bold text-ed-text bg-ed-surface/90 px-1 py-0.5 rounded-sm whitespace-nowrap">
          Awaiting visuals
        </span>
      )}
    </div>
  )}</> : <><SceneClipLabel number={number} width={width} icon={<Volume2 size={9} />} />
   {/* Waveform. The two strokes were hardcoded violets left
       over from the pre-token palette, then dimmed to 60% —
       so an A1 block read as neither an A1 colour nor a
       legible one. `ed-a1` is the track's own identity token,
       and the has-audio / no-audio distinction now rides on
       opacity instead of a second invented hex. */}
   <div aria-hidden="true" className="absolute inset-x-1 bottom-1 top-4 flex items-center overflow-hidden pointer-events-none">
     <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
       <path suppressHydrationWarning
         d={CLIP_WAVEFORM_PATH}
         stroke="var(--color-ed-a1)" strokeOpacity={hasAudio ? 0.95 : 0.45}
         strokeWidth="2.5" strokeLinecap="round"
       />
     </svg>
   </div></>;
});
