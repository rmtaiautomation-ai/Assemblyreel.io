export function billingTimestampMillis(value: string | null): number {
  if (typeof value !== "string") return NaN;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const millis = Date.parse(value);
  if (!match || !Number.isFinite(millis)) return NaN;
  const zone = match[2];
  const offsetMinutes = zone === "Z" ? 0
    : (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) * (zone[0] === "+" ? 1 : -1);
  // Reject Date.parse's normalization of impossible calendar dates.
  const wallTime = new Date(millis + offsetMinutes * 60_000).toISOString().slice(0, 19);
  return wallTime === match[1] ? millis : NaN;
}
