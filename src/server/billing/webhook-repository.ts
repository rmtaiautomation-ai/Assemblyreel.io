import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { WebhookRepository } from "./webhook-handler";
import { BillingError, billingDatabaseError } from "./errors";

const accountSchema = z.object({ id: z.uuid(), user_id: z.uuid().nullable(), enabled: z.boolean(),
  stripe_mode: z.enum(["test", "live"]), stripe_customer_id: z.string().min(1) });
const claimSchema = z.discriminatedUnion("claimed", [
  z.object({ claimed: z.literal(true), status: z.literal("processing"), token: z.uuid() }),
  z.object({ claimed: z.literal(false), status: z.enum(["busy", "processed", "ignored"]), token: z.null() }),
]);

export function createWebhookRepository(admin: SupabaseClient): WebhookRepository {
  return {
    async record(event) {
      const { error } = await admin.rpc("record_billing_webhook", {
        p_mode: event.mode, p_event_id: event.id, p_type: event.type, p_object_id: event.objectId,
      });
      if (error) throw billingDatabaseError(error);
    },
    async findAccount(mode, customerId) {
      const { data, error } = await admin.from("billing_accounts")
        .select("id,user_id,enabled,stripe_mode,stripe_customer_id").eq("stripe_mode", mode)
        .eq("stripe_customer_id", customerId).maybeSingle();
      if (error) throw billingDatabaseError(error);
      if (!data) return null;
      const result = accountSchema.safeParse(data);
      if (!result.success) throw new BillingError("BILLING_UNAVAILABLE");
      const row = result.data;
      return { id: row.id, ownerId: row.user_id, enabled: row.enabled,
        stripeMode: row.stripe_mode, stripeCustomerId: row.stripe_customer_id };
    },
    async claim(accountId, event) {
      const { data, error } = await admin.rpc("claim_billing_webhook", {
        p_account_id: accountId, p_mode: event.mode, p_event_id: event.id,
      });
      if (error) throw billingDatabaseError(error);
      const result = claimSchema.safeParse(data);
      if (!result.success) throw new BillingError("BILLING_UNAVAILABLE");
      return result.data;
    },
    async apply(accountId, event, token, state) {
      const { data, error } = await admin.rpc("apply_billing_subscription", {
        p_account_id: accountId, p_mode: event.mode, p_event_id: event.id, p_token: token,
        p_projection: state.projection, p_limits: state.limits,
        p_window_start: state.window?.startsAt ?? null, p_window_end: state.window?.endsAt ?? null,
      });
      if (error) throw billingDatabaseError(error);
      if (!z.object({ subscriptionId: z.uuid(), isCurrent: z.boolean() }).safeParse(data).success) {
        throw new BillingError("BILLING_UNAVAILABLE");
      }
    },
    async fail(accountId, event, token, code) {
      const { error } = await admin.rpc("fail_billing_webhook", {
        p_account_id: accountId, p_mode: event.mode, p_event_id: event.id, p_token: token, p_error_code: code,
      });
      if (error) throw billingDatabaseError(error);
    },
  };
}
