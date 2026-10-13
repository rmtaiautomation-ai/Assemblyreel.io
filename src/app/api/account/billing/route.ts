import { apiResponse } from "@/server/access/requests";
import { requireBillingLaunch } from "@/server/access/launch";
import { readBillingAccount } from "@/server/billing/account-view";
export async function GET() { return apiResponse(async () => {
  requireBillingLaunch();
  return Response.json(await readBillingAccount());
}); }
