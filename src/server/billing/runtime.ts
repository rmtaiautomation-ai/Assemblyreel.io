import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { APPROVED_BILLING_PLANS } from "@/features/billing/plans";
import { BillingError } from "./errors";
import { createBillingRepository } from "./supabase-repository";
import type { BillingDependencies } from "./authorization";

export function isBillingRuntimeEnabled(): boolean {
  // A flag alone cannot turn provisional offers into approved entitlements.
  return process.env.BILLING_ENABLED === "true" && APPROVED_BILLING_PLANS.length > 0;
}

export function createBillingAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /placeholder|dummy|your[_-]/i.test(key) || !adminKeyLooksValid(key)) {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))
      || parsed.username || parsed.password) throw new BillingError("BILLING_UNAVAILABLE");
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  } catch {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}

function adminKeyLooksValid(key: string): boolean {
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    // Format/placement check only. Supabase still verifies the credential.
    const payload: unknown = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "service_role";
  } catch { return false; }
}

export function createRequestDependencies(authClient: SupabaseClient): BillingDependencies {
  if (!isBillingRuntimeEnabled()) throw new BillingError("BILLING_DISABLED");
  return {
    enabled: true, approvedPlans: APPROVED_BILLING_PLANS, maxPending: 4,
    repository: createBillingRepository(createBillingAdminClient()),
    async verifyActor() {
      const { data, error } = await authClient.auth.getUser();
      if (error || !data.user || data.user.is_anonymous) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
  };
}
