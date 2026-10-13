import "server-only";
import { onboardingReady } from "@/server/auth/policy";
import { accessContext } from "./ownership";
import { AccessError, requireFeature } from "./requests";
import type { SetupState } from "@/features/onboarding/schema";

export const onboardingEnabled = onboardingReady;
export function requireOnboarding() {
  requireFeature("OWNED_CONTENT_ENABLED");
  if (!onboardingEnabled()) throw new AccessError(503, "FEATURE_UNAVAILABLE", "Setup is awaiting configuration.");
}
export async function readOnboarding() {
  requireOnboarding();
  const { client, user } = await accessContext();
  const { data, error } = await client.from("account_onboarding").select("revision,settings,workspace_id,project_id").eq("actor_id", user.id).maybeSingle();
  if (error) throw error;
  return data as SetupState | null;
}
