export const USAGE_METRICS = [
  "projects", "images", "video_seconds", "narration_characters",
  "transcription_seconds", "llm_tokens", "render_seconds", "storage_bytes",
] as const;

export const SUBSCRIPTION_STATUSES = [
  "trialing", "active", "incomplete", "incomplete_expired",
  "past_due", "canceled", "unpaid", "paused",
] as const;

export const OPERATION_STATES = [
  "reserved", "submitted", "unknown", "committed", "released",
] as const;

export type PlanId = "creator" | "pro" | "studio";
export type BillingInterval = "month" | "year";
export type StripeMode = "test" | "live";
export type UsageMetric = (typeof USAGE_METRICS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type OperationState = (typeof OPERATION_STATES)[number];
export type BillableFeature = "generation" | "cloud_render";

export interface BillingPlan {
  readonly id: PlanId;
  readonly version: string;
  readonly approved: boolean;
  readonly workspaceLimit: number;
  readonly limits: Readonly<Record<UsageMetric, number>>;
  readonly features: readonly BillableFeature[];
}

// Server-derived projection, never an authorization payload from a browser.
export interface SubscriptionSnapshot {
  readonly accountId: string;
  readonly ownerId: string | null;
  readonly accountEnabled: boolean;
  readonly status: string;
  readonly planId: string | null;
  readonly catalogVersion: string | null;
  readonly isCurrent: boolean;
  readonly verifiedAt: string | null;
  readonly accessStartsAt: string | null;
  readonly accessExpiresAt: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly pauseCollection: boolean;
}

export type AccessErrorCode =
  | "BILLING_DISABLED" | "AUTH_REQUIRED" | "OWNERSHIP_REQUIRED"
  | "SUBSCRIPTION_REQUIRED" | "BILLING_SYNC_PENDING"
  | "PLAN_NOT_CONFIGURED" | "FEATURE_UNAVAILABLE";

export type AccessDecision =
  | { readonly allowed: true; readonly accountId: string; readonly plan: BillingPlan }
  | { readonly allowed: false; readonly code: AccessErrorCode };

export interface UsageBalance {
  readonly limit: number;
  readonly used: number;
  readonly reserved: number;
}

export type OperationOutcome =
  | "provider_accepted" | "submission_uncertain"
  | "provider_completed" | "no_work_confirmed";
