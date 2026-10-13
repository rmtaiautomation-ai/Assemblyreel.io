import { apiResponse, requireFeature, requireOrigin, readJson, AccessError } from "@/server/access/requests";
import { accessContext } from "@/server/access/ownership";
import { requireOnboarding, readOnboarding } from "@/server/access/onboarding";
import { onboardingCommand } from "@/features/onboarding/schema";

export async function GET() { return apiResponse(async () => {
  requireFeature("OWNED_CONTENT_ENABLED");
  return Response.json({ state: await readOnboarding() });
}); }

export async function POST(request: Request) { return apiResponse(async () => {
  requireFeature("OWNED_CONTENT_ENABLED"); requireOnboarding(); requireOrigin(request);
  const command = await readJson(request, onboardingCommand);
  const { client } = await accessContext();
  const { data, error } = command.action === "save"
    ? await client.rpc("save_account_onboarding", { expected_revision: command.revision, settings: command.settings })
    : await client.rpc("complete_account_onboarding", { expected_revision: command.revision });
  if (error) {
    if (error.message.includes("REQUEST_RATE_LIMIT")) throw new AccessError(429, "REQUEST_LIMIT", "Too many saves. Wait a minute and retry.");
    if (error.message.includes("STALE_SETUP")) throw new AccessError(409, "STALE_SETUP", "Setup changed in another tab. Reload to resume the latest saved steps.");
    if (error.message.includes("SETUP_COMPLETE")) throw new AccessError(409, "SETUP_COMPLETE", "Setup is already complete. Reload to open your saved project.");
    throw new AccessError(400, "SETUP_UNAVAILABLE", "Unable to save setup. Check your choices, saved topic, and three-workspace test limit.");
  }
  return Response.json({ state: data });
}); }
