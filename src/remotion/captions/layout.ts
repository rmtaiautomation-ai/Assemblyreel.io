export const CAPTION_BOTTOM_PERCENT = 18;

/** Reserve the two-line caption page plus its entrance travel above the baseline. */
export function documentaryCaptionLayout(width: number, height: number) {
  const unit = Math.min(width, height) / 1080;
  const fontSize = 44 * unit;
  const bottom = height * CAPTION_BOTTOM_PERCENT / 100;
  return { fontSize, bottom, reserve: bottom + fontSize * 1.15 * 2 + 28 * unit };
}

export function presentationSafeBottom(width: number, height: number, captions: boolean): number {
  return captions ? documentaryCaptionLayout(width, height).reserve : height * 0.06;
}
