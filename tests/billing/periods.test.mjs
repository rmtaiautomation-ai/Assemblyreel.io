import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const { currentAllowanceWindow } = await importTypeScript(new URL("../../src/server/billing/periods.ts", import.meta.url));
const annual = { interval: "year", periodStart: "2025-01-31T12:30:00Z", periodEnd: "2026-01-31T12:30:00Z" };
const windowAt = (now, overrides = {}) => currentAllowanceWindow({ ...annual, ...overrides, now: Date.parse(now) });

test("annual allowances clamp February but return to the original month-end anchor", () => {
  assert.deepEqual(windowAt("2025-02-28T12:30:00Z"), {
    startsAt: "2025-02-28T12:30:00.000Z", endsAt: "2025-03-31T12:30:00.000Z", index: 1,
  });
  assert.deepEqual(windowAt("2025-03-31T12:30:00Z"), {
    startsAt: "2025-03-31T12:30:00.000Z", endsAt: "2025-04-30T12:30:00.000Z", index: 2,
  });
});

test("leap-year anchors clamp without drifting subsequent windows", () => {
  assert.deepEqual(windowAt("2025-01-29T00:00:00Z", {
    periodStart: "2024-02-29T00:00:00Z", periodEnd: "2025-02-28T00:00:00Z",
  }), { startsAt: "2025-01-29T00:00:00.000Z", endsAt: "2025-02-28T00:00:00.000Z", index: 11 });
});

test("start is inclusive and paid-through expiry exclusive", () => {
  assert.equal(windowAt(annual.periodStart).index, 0);
  assert.equal(windowAt(annual.periodEnd), null);
  assert.equal(windowAt("2025-01-31T12:29:59Z"), null);
  assert.equal(windowAt("2026-01-31T12:30:01Z"), null);
});

test("monthly subscriptions use only their verified cycle and shortened annual periods clamp", () => {
  assert.deepEqual(windowAt("2025-02-01T12:30:00Z", { interval: "month", periodEnd: "2025-02-28T12:30:00Z" }), {
    startsAt: "2025-01-31T12:30:00.000Z", endsAt: "2025-02-28T12:30:00.000Z", index: 0,
  });
  assert.equal(windowAt("2025-03-02T12:30:00Z", { periodEnd: "2025-03-10T12:30:00Z" }).endsAt, "2025-03-10T12:30:00.000Z");
});

test("explicit offsets are converted to UTC before anchoring", () => {
  assert.equal(windowAt("2025-01-31T12:30:00Z", { periodStart: "2025-01-31T20:30:00+08:00" }).startsAt,
    "2025-01-31T12:30:00.000Z");
});

test("invalid dates, intervals, oversized cycles and nonfinite time fail closed", () => {
  for (const input of [{ periodStart: "2025-02-30T12:30:00Z" }, { periodEnd: "2025-01-01T12:30:00Z" },
    { interval: "week" }, { periodEnd: "2027-01-31T12:30:00Z" }, { interval: "month" },
    { periodStart: "2025-01-31T12:30:00" }, { now: NaN }]) {
    assert.equal(currentAllowanceWindow({ ...annual, now: Date.parse("2025-02-01T12:30:00Z"), ...input }), null);
  }
});
