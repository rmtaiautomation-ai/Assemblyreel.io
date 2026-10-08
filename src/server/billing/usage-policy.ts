import type {
  OperationOutcome, OperationState, UsageBalance,
} from "@/features/billing/types";
import { OPERATION_STATES } from "@/features/billing/types";

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function remainingUsage(balance: UsageBalance): number | null {
  if (![balance.limit, balance.used, balance.reserved].every(validQuantity)
    || !Number.isSafeInteger(balance.used + balance.reserved)) return null;
  // Downgrades may leave usage above the new limit. Preserve it; grant no more.
  return Math.max(0, balance.limit - balance.used - balance.reserved);
}

export type ReservationDecision =
  | { readonly allowed: true; readonly remainingAfterReservation: number }
  | { readonly allowed: false; readonly code: "INVALID_USAGE" | "INVALID_QUANTITY" | "LIMIT_REACHED" };

// Preview/checking arithmetic only. Actual reservations must be atomic SQL;
// calling this function then incrementing a counter is NOT concurrency-safe.
export function evaluateUsageReservation(balance: UsageBalance, quantity: number): ReservationDecision {
  const remaining = remainingUsage(balance);
  if (remaining === null) return { allowed: false, code: "INVALID_USAGE" };
  if (!validQuantity(quantity) || quantity === 0) return { allowed: false, code: "INVALID_QUANTITY" };
  if (quantity > remaining) return { allowed: false, code: "LIMIT_REACHED" };
  return { allowed: true, remainingAfterReservation: remaining - quantity };
}

export type TransitionDecision =
  | { readonly allowed: true; readonly state: OperationState; readonly changed: boolean }
  | { readonly allowed: false; readonly code: "INVALID_TRANSITION" };

// Outcomes must come from trusted provider/reconciliation evidence. A timeout
// is not "no_work_confirmed" and cannot authorize a refund/free resubmission.
export function evaluateOperationOutcome(state: OperationState, outcome: OperationOutcome): TransitionDecision {
  const target: Record<OperationOutcome, OperationState> = {
    provider_accepted: "submitted", submission_uncertain: "unknown",
    provider_completed: "committed", no_work_confirmed: "released",
  };
  const next = target[outcome];
  if (!Object.hasOwn(target, outcome) || !OPERATION_STATES.includes(state)) {
    return { allowed: false, code: "INVALID_TRANSITION" };
  }
  if (state === "committed" || state === "released") {
    return next === state
      ? { allowed: true, state, changed: false }
      : { allowed: false, code: "INVALID_TRANSITION" };
  }
  return { allowed: true, state: next, changed: state !== next };
}
