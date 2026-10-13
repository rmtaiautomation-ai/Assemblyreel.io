import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin, authLaunchReady, emailToken } from "@/server/auth/policy";
import { emailChangeEnabled } from "@/server/auth/mutations";

export async function GET(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch { return new Response(null, { status: 503 }); }
  const url = new URL(request.url), hash = emailToken(url.searchParams, "email_change");
  let accepted = false;
  if (authLaunchReady() && emailChangeEnabled() && url.origin === origin && hash) {
    try {
      const { error } = await (await createClient()).auth.verifyOtp({ token_hash: hash, type: "email_change" });
      accepted = !error;
    } catch { accepted = false; }
  }
  return NextResponse.redirect(`${origin}/login?notice=${accepted ? "email-confirmation-processed" : "invalid-email-link"}`, {
    status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
