import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BillingError } from "./errors";
import { createRequestDependencies, isBillingRuntimeEnabled } from "./runtime";

export async function createRequestBillingContext() {
  if (!isBillingRuntimeEnabled()) throw new BillingError("BILLING_DISABLED");
  return createRequestDependencies(await createClient());
}
