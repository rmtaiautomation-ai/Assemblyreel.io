/** Supported linear units only: never mix length with area, mass or volume. */
export const LINEAR_UNITS = ['mm', 'cm', 'm', 'km', 'in', 'ft'] as const;
export type LinearUnit = (typeof LINEAR_UNITS)[number];
const METRES_PER_UNIT: Record<LinearUnit, number> = { mm: .001, cm: .01, m: 1, km: 1000, in: .0254, ft: .3048 };
export const MIN_READABLE_SCALE_RATIO = .06;
export function linearMetres(value: number, unit: LinearUnit): number { return value * METRES_PER_UNIT[unit]; }
export function measurementRatios(items: readonly { value: number; unit: LinearUnit }[]): number[] {
  const values = items.map(item => linearMetres(item.value, item.unit));
  const maximum = Math.max(...values);
  return values.map(value => value / maximum);
}
