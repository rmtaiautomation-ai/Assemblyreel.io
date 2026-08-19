/**
 * '#FFE1AA' -> '255,225,170', ready to interpolate into `rgba(${triple},${a})`.
 *
 * The atmospheric templates need the channels separately because they paint
 * the same tint at several different alphas within one gradient, which a plain
 * hex string can't express. They still STORE a hex in `overlay_clips.color`
 * like every other kind, so the editor's existing color swatch keeps working
 * and there's no second copy of the same value in `template_data`.
 *
 * Falls back to the supplied default on anything unparseable — `color` comes
 * from a DB column that predates these kinds, so it can hold arbitrary text.
 */
export const hexToRgbTriple = (hex: string | undefined, fallback = '255,225,170'): string => {
  if (!hex) return fallback;

  let value = hex.trim().replace(/^#/, '');

  // Expand the 3-digit shorthand ('fea' -> 'ffeeaa').
  if (/^[0-9a-f]{3}$/i.test(value)) {
    value = value.split('').map((c) => c + c).join('');
  }

  if (!/^[0-9a-f]{6}$/i.test(value)) return fallback;

  const int = parseInt(value, 16);
  return `${(int >> 16) & 255},${(int >> 8) & 255},${int & 255}`;
};
