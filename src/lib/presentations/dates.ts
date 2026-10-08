/** Signed historical years, not astronomical years. Never rewrites supplied labels. */
export function historicalDateLabel(year: number, endYear: number | null, convention: 'BCE/CE' | 'BC/AD') {
  const label = (value: number) => `${Math.abs(value)} ${convention === 'BCE/CE' ? value < 0 ? 'BCE' : 'CE' : value < 0 ? 'BC' : 'AD'}`;
  return endYear === null ? label(year) : `${label(year)}–${label(endYear)}`;
}
