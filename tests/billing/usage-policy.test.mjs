import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const { remainingUsage, evaluateUsageReservation, evaluateOperationOutcome } = await importTypeScript(new URL("../../src/server/billing/usage-policy.ts", import.meta.url));
const { OPERATION_STATES } = await importTypeScript(new URL("../../src/features/billing/types.ts", import.meta.url));

test("remaining allowance deducts committed and in-flight work", () => {
  assert.equal(remainingUsage({ limit: 10, used: 4, reserved: 3 }), 3);
  assert.equal(remainingUsage({ limit: 0, used: 0, reserved: 0 }), 0);
});

test("downgrades preserve over-limit usage without granting additional work", () => {
  const balance = Object.freeze({ limit: 3, used: 7, reserved: 2 });
  assert.equal(remainingUsage(balance), 0);
  assert.deepEqual(evaluateUsageReservation(balance, 1), { allowed: false, code: "LIMIT_REACHED" });
  assert.deepEqual(balance, { limit: 3, used: 7, reserved: 2 });
});

test("invalid counters and unsafe sums are rejected rather than rounded", () => {
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    for (const key of ["limit", "used", "reserved"]) {
      const balance = { limit: 10, used: 0, reserved: 0, [key]: value };
      assert.equal(remainingUsage(balance), null);
      assert.deepEqual(evaluateUsageReservation(balance, 1), { allowed: false, code: "INVALID_USAGE" });
    }
  }
  assert.equal(remainingUsage({ limit: Number.MAX_SAFE_INTEGER, used: Number.MAX_SAFE_INTEGER, reserved: 1 }), null);
});

test("reservations require positive exact quantities", () => {
  for (const quantity of [0, -1, 0.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(evaluateUsageReservation({ limit: 10, used: 0, reserved: 0 }, quantity), {
      allowed: false, code: "INVALID_QUANTITY",
    });
  }
});

test("reservation preview respects the final unit and does not mutate a balance", () => {
  const balance = Object.freeze({ limit: 10, used: 8, reserved: 1 });
  assert.deepEqual(evaluateUsageReservation(balance, 1), { allowed: true, remainingAfterReservation: 0 });
  assert.deepEqual(evaluateUsageReservation(balance, 2), { allowed: false, code: "LIMIT_REACHED" });
  assert.deepEqual(balance, { limit: 10, used: 8, reserved: 1 });
});

test("uncertain provider submission retains an unresolved operation", () => {
  assert.deepEqual(evaluateOperationOutcome("submitted", "submission_uncertain"), {
    allowed: true, state: "unknown", changed: true,
  });
  assert.deepEqual(evaluateOperationOutcome("unknown", "submission_uncertain"), {
    allowed: true, state: "unknown", changed: false,
  });
});

test("confirmed completion commits once and cannot become a release", () => {
  for (const state of ["reserved", "submitted", "unknown"]) {
    assert.deepEqual(evaluateOperationOutcome(state, "provider_completed"), {
      allowed: true, state: "committed", changed: true,
    });
  }
  assert.deepEqual(evaluateOperationOutcome("committed", "provider_completed"), {
    allowed: true, state: "committed", changed: false,
  });
  assert.deepEqual(evaluateOperationOutcome("committed", "no_work_confirmed"), {
    allowed: false, code: "INVALID_TRANSITION",
  });
});

test("only confirmed no-work releases; later work cannot reopen a terminal operation", () => {
  assert.deepEqual(evaluateOperationOutcome("unknown", "no_work_confirmed"), {
    allowed: true, state: "released", changed: true,
  });
  assert.deepEqual(evaluateOperationOutcome("released", "no_work_confirmed"), {
    allowed: true, state: "released", changed: false,
  });
  assert.deepEqual(evaluateOperationOutcome("released", "provider_accepted"), {
    allowed: false, code: "INVALID_TRANSITION",
  });
});

test("all state/outcome combinations retain terminal-state invariants", () => {
  const outcomes = {
    provider_accepted: "submitted", submission_uncertain: "unknown",
    provider_completed: "committed", no_work_confirmed: "released",
  };
  for (const state of OPERATION_STATES) {
    for (const [outcome, target] of Object.entries(outcomes)) {
      const decision = evaluateOperationOutcome(state, outcome);
      if (["committed", "released"].includes(state) && state !== target) {
        assert.equal(decision.allowed, false);
      } else {
        assert.deepEqual(decision, { allowed: true, state: target, changed: state !== target });
      }
    }
  }
});

test("unknown outcomes, prototype properties and states are rejected", () => {
  for (const outcome of ["timeout", "toString", "__proto__", undefined]) {
    assert.deepEqual(evaluateOperationOutcome("reserved", outcome), { allowed: false, code: "INVALID_TRANSITION" });
  }
  assert.deepEqual(evaluateOperationOutcome("invented", "provider_completed"), { allowed: false, code: "INVALID_TRANSITION" });
});
