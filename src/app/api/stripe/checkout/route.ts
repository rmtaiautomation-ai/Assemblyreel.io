import { createCheckoutContext } from "@/server/billing/checkout-context";
import { handleCheckoutRequest } from "@/server/billing/request-handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCheckoutRequest(request, () => createCheckoutContext("checkout"));
}
