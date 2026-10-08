export const BILLING_ERROR_CODES = [
  "BILLING_DISABLED", "AUTH_REQUIRED", "OWNERSHIP_REQUIRED", "SUBSCRIPTION_REQUIRED",
  "BILLING_SYNC_PENDING", "PLAN_NOT_CONFIGURED", "FEATURE_UNAVAILABLE", "LIMIT_REACHED",
  "CONCURRENCY_LIMIT", "INVALID_RESERVATION", "OPERATION_CONFLICT", "OPERATION_NOT_FOUND",
  "INVALID_TRANSITION", "USAGE_INVARIANT_BROKEN", "BILLING_UNAVAILABLE", "INVALID_REQUEST",
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

// Never forward raw Supabase/Stripe/provider errors or their request payloads.
export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode) {
    super(code);
    this.name = "BillingError";
  }
}

export function billingDatabaseError(error: { readonly code?: string; readonly message?: string }): BillingError {
  const known = error.code === "P0001" && BILLING_ERROR_CODES.find((code) => code === error.message);
  return new BillingError(known || "BILLING_UNAVAILABLE");
}
