import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { OPERATION_STATES } from "@/features/billing/types";
import { BillingError, billingDatabaseError } from "./errors";
import type { BillingAccount, BillingRepository, BillingResource } from "./repository";

const accountSchema = z.object({
  id: z.uuid(), user_id: z.uuid().nullable(), enabled: z.boolean(),
  stripe_mode: z.enum(["test", "live"]), stripe_customer_id: z.string().min(1).nullable(),
});
const subscriptionSchema = z.object({
  account_id: z.uuid(), status: z.string(), plan_id: z.string().nullable(),
  catalog_version: z.string().nullable(), is_current: z.boolean(), verified_at: z.string().nullable(),
  access_starts_at: z.string().nullable(), access_expires_at: z.string().nullable(),
  cancel_at_period_end: z.boolean(), pause_collection: z.boolean(),
});
const reservationSchema = z.object({ id: z.uuid(), state: z.enum(OPERATION_STATES), created: z.boolean() });
const settlementSchema = z.object({ id: z.uuid(), state: z.enum(OPERATION_STATES), changed: z.boolean() });

function parseRow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BillingError("BILLING_UNAVAILABLE");
  return result.data;
}

// Only pass a server-created admin client. The adapter checks every DB result;
// query errors are not interpreted as "no account" or permission to proceed.
export function createBillingRepository(admin: SupabaseClient): BillingRepository {
  async function workspaceOwner(id: string): Promise<string | null> {
    const { data, error } = await admin.from("workspaces").select("user_id").eq("id", id).maybeSingle();
    if (error) throw billingDatabaseError(error);
    return data === null ? null : parseRow(z.object({ user_id: z.uuid() }), data).user_id;
  }

  async function projectOwner(id: string): Promise<string | null> {
    const { data, error } = await admin.from("video_projects").select("workspace_id").eq("id", id).maybeSingle();
    if (error) throw billingDatabaseError(error);
    return data === null ? null : workspaceOwner(parseRow(z.object({ workspace_id: z.uuid() }), data).workspace_id);
  }

  async function resourceOwner(resource: BillingResource): Promise<string | null> {
    if (resource.kind === "workspace") return workspaceOwner(resource.id);
    if (resource.kind === "project") return projectOwner(resource.id);
    const { data, error } = await admin.from(resource.kind === "scene" ? "scenes" : "media")
      .select("project_id").eq("id", resource.id).maybeSingle();
    if (error) throw billingDatabaseError(error);
    return data === null ? null : projectOwner(parseRow(z.object({ project_id: z.uuid() }), data).project_id);
  }

  return {
    async getAccountForActor(actorId) {
      const { data, error } = await admin.from("billing_accounts")
        .select("id,user_id,enabled,stripe_mode,stripe_customer_id").eq("user_id", actorId).maybeSingle();
      if (error) throw billingDatabaseError(error);
      if (data === null) return null;
      const row = parseRow(accountSchema, data);
      return { id: row.id, ownerId: row.user_id, enabled: row.enabled,
        stripeMode: row.stripe_mode, stripeCustomerId: row.stripe_customer_id };
    },
    async getCurrentSubscription(account: BillingAccount) {
      const { data, error } = await admin.from("billing_subscriptions")
        .select("account_id,status,plan_id,catalog_version,is_current,verified_at,access_starts_at,access_expires_at,cancel_at_period_end,pause_collection")
        .eq("account_id", account.id).eq("stripe_mode", account.stripeMode).eq("is_current", true).maybeSingle();
      if (error) throw billingDatabaseError(error);
      if (data === null) return null;
      const row = parseRow(subscriptionSchema, data);
      if (row.account_id !== account.id) throw new BillingError("BILLING_UNAVAILABLE");
      return { accountId: row.account_id, ownerId: account.ownerId, accountEnabled: account.enabled,
        status: row.status, planId: row.plan_id, catalogVersion: row.catalog_version,
        isCurrent: row.is_current, verifiedAt: row.verified_at, accessStartsAt: row.access_starts_at,
        accessExpiresAt: row.access_expires_at, cancelAtPeriodEnd: row.cancel_at_period_end,
        pauseCollection: row.pause_collection };
    },
    getResourceOwner: resourceOwner,
    async reserve(input) {
      const { data, error } = await admin.rpc("reserve_billing_operation", {
        p_account_id: input.accountId, p_actor_id: input.actorId, p_resource_id: input.resourceId,
        p_operation_key: input.operationKey, p_input_fingerprint: input.fingerprint,
        p_catalog_version: input.catalogVersion, p_items: input.items, p_max_pending: input.maxPending,
      });
      if (error) throw billingDatabaseError(error);
      return parseRow(reservationSchema, data);
    },
    async settle(input) {
      const { data, error } = await admin.rpc("settle_billing_operation", {
        p_account_id: input.accountId, p_operation_id: input.operationId, p_outcome: input.outcome,
        p_provider: input.provider ?? null, p_provider_request_id: input.providerRequestId ?? null,
        p_error_code: input.errorCode ?? null,
      });
      if (error) throw billingDatabaseError(error);
      return parseRow(settlementSchema, data);
    },
  };
}
