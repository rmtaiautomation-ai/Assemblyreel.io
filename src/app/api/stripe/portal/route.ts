import { createCheckoutContext } from "@/server/billing/checkout-context";
import { handlePortalRequest } from "@/server/billing/request-handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePortalRequest(request, () => createCheckoutContext("portal"));
}
