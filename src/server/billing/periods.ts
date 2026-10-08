import type { BillingInterval } from "@/features/billing/types";
import { billingTimestampMillis } from "./timestamps";

export interface AllowanceWindow {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly index: number;
}

function anchoredMonth(anchor: number, offset: number): number {
  const date = new Date(anchor);
  const anchorDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const nextMonth = new Date(date);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  date.setUTCDate(Math.min(anchorDay, nextMonth.getUTCDate()));
  return date.getTime();
}

// Annual billing is NOT an annual quota bucket. Month boundaries always derive
// from the original UTC anchor, so Jan 31 -> Feb 28 -> Mar 31 doesn't drift.
// Returns null outside the verified paid period or for malformed inputs.
export function currentAllowanceWindow(input: {
  readonly interval: BillingInterval;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly now: number;
}): AllowanceWindow | null {
  const start = billingTimestampMillis(input.periodStart);
  const end = billingTimestampMillis(input.periodEnd);
  if (![start, end, input.now].every(Number.isFinite) || end <= start
    || input.now < start || input.now >= end || !["month", "year"].includes(input.interval)) return null;
  const count = input.interval === "year" ? 12 : 1;
  // Shortened periods are permitted; invented multi-year/monthly periods aren't.
  if (end > anchoredMonth(start, count)) return null;
  for (let index = 0; index < count; index++) {
    const windowStart = anchoredMonth(start, index);
    const windowEnd = Math.min(anchoredMonth(start, index + 1), end);
    if (input.now >= windowStart && input.now < windowEnd) {
      return { startsAt: new Date(windowStart).toISOString(), endsAt: new Date(windowEnd).toISOString(), index };
    }
  }
  return null;
}
