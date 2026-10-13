import { verifiedAccount } from "@/server/auth/account";
import { registrationEnabled } from "@/server/auth/policy";

export async function GET() {
  return Response.json({ signedIn: Boolean(await verifiedAccount()), registrationEnabled: registrationEnabled() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
