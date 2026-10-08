import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CheckoutRepository } from "./checkout-contracts";
import { BillingError, billingDatabaseError } from "./errors";
import { createBillingRepository } from "./supabase-repository";

const attemptSchema = z.object({ id: z.uuid(), state: z.enum(["pending", "ready", "unknown", "expired", "complete"]),
  created: z.boolean(), url: z.string().nullable(), expiresAt: z.string().nullable() });

export function createCheckoutRepository(admin: SupabaseClient): CheckoutRepository {
  return {
    getAccountForActor: createBillingRepository(admin).getAccountForActor,
    async begin(input) {
      const { data, error } = await admin.rpc("begin_billing_checkout", {
        p_account_id: input.accountId, p_actor_id: input.actorId, p_operation_key: input.operationKey,
        p_input_fingerprint: input.fingerprint, p_plan_id: input.offer.planId,
        p_catalog_version: input.offer.catalogVersion, p_interval: input.offer.interval,
        p_price_id: input.offer.priceId, p_amount: input.offer.amount, p_currency: input.offer.currency,
      });
      if (error) throw billingDatabaseError(error);
      const result = attemptSchema.safeParse(data);
      if (!result.success) throw new BillingError("BILLING_UNAVAILABLE");
      return result.data;
    },
    async bindCustomer(accountId, actorId, customerId) {
      const { error } = await admin.rpc("bind_billing_customer", {
        p_account_id: accountId, p_actor_id: actorId, p_customer_id: customerId,
      });
      if (error) throw billingDatabaseError(error);
    },
    async ready(accountId, attemptId, session) {
      const { data, error } = await admin.from("billing_checkout_attempts")
        .update({ state: "ready", stripe_session_id: session.id, checkout_url: session.url,
          expires_at: session.expiresAt, updated_at: new Date().toISOString() })
        .eq("id", attemptId).eq("account_id", accountId).eq("state", "pending").select("id").maybeSingle();
      if (error) throw billingDatabaseError(error);
      if (!data) throw new BillingError("BILLING_SYNC_PENDING");
    },
    async markUnknown(accountId, attemptId) {
      const { error } = await admin.from("billing_checkout_attempts")
        .update({ state: "unknown", updated_at: new Date().toISOString() })
        .eq("id", attemptId).eq("account_id", accountId).eq("state", "pending");
      if (error) throw billingDatabaseError(error);
      // A concurrently verified webhook may already have completed this attempt.
      // Do not downgrade a ready/terminal row just because a request lost its response.
    },
  };
}
