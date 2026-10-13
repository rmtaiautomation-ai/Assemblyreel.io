import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin, authLaunchReady } from "@/server/auth/policy";
import { recoveryEnabled } from "@/server/auth/mutations";

export async function GET(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch { return new Response(null, { status: 503 }); }
  const url = new URL(request.url), hash = url.searchParams.get("token_hash");
  let accepted = false;
  if (authLaunchReady() && recoveryEnabled() && url.origin === origin && url.searchParams.get("type") === "email_change" &&
      url.searchParams.getAll("type").length === 1 && url.searchParams.getAll("token_hash").length === 1 &&
      !url.searchParams.has("code") && hash && /^[a-f0-9]{32,128}$/i.test(hash)) {
    try {
      const { error } = await (await createClient()).auth.verifyOtp({ token_hash: hash, type: "email_change" });
      accepted = !error;
    } catch { accepted = false; }
  }
  return NextResponse.redirect(`${origin}/login?notice=${accepted ? "email-confirmation-processed" : "invalid-email-link"}`, {
    status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
