export const TIMELINE_OVERSCAN_PX = 1600;

export interface PixelRange { start: number; end: number }

/** Filter visual nodes only. Playback, selection and lane packing use full data. */
export function intersectsViewport(start: number, duration: number, scale: number, range: PixelRange) {
  return (start + duration) * scale >= range.start - TIMELINE_OVERSCAN_PX
    && start * scale <= range.end + TIMELINE_OVERSCAN_PX;
}

export function visibleClips<T extends { id: string; startTime: number; duration: number }>(
  clips: readonly T[], scale: number, range: PixelRange, activeId: string | null = null,
) {
  return clips.filter(clip => clip.id === activeId || intersectsViewport(clip.startTime, clip.duration, scale, range));
}
