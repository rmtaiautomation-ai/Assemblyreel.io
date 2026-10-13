import { apiResponse,requireOrigin } from "@/server/access/requests";
import { requireBillingLaunch } from "@/server/access/launch";
import { accessContext } from "@/server/access/ownership";
import { createBillingAdminClient } from "@/server/billing/runtime";
export async function POST(request:Request) { return apiResponse(async () => {
  requireBillingLaunch(); requireOrigin(request);
  const {user} = await accessContext();
  const {error} = await createBillingAdminClient().rpc("enroll_personal_billing",{p_actor_id:user.id});
  if (error) throw error;
  return Response.json({enrolled:true});
}); }
