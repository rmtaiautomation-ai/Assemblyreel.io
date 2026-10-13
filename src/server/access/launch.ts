import "server-only";
import { authLaunchReady } from "@/server/auth/policy";
import { AccessError, requireFeature } from "./requests";

export function billingLaunchReady() {
  return authLaunchReady() && process.env.BILLING_MIGRATION_READY === "true"
    && process.env.BILLING_STRIPE_MODE === "test";
}
export function requireBillingLaunch() {
  if (!billingLaunchReady()) throw new AccessError(503, "FEATURE_UNAVAILABLE", "Sandbox billing is awaiting configuration.");
}
export function requireJobs() {
  requireFeature("OWNED_CONTENT_ENABLED");
  if (process.env.DURABLE_JOBS_ENABLED !== "true" || process.env.JOBS_MIGRATION_READY !== "true") {
    throw new AccessError(503, "FEATURE_UNAVAILABLE", "Background jobs are awaiting configuration.");
  }
}
