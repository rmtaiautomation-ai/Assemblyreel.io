import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authLaunchReady, siteOrigin, confirmedIdentity } from "@/server/auth/policy";
import { recoveryEnabled } from "@/server/auth/mutations";
import { issueRecoveryProof, RECOVERY_COOKIE } from "@/server/auth/recovery-proof";

export async function GET(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch { return new Response(null, { status: 503 }); }
  const url = new URL(request.url), hash = url.searchParams.get("token_hash");
  let valid = false;
  const store = await cookies();
  store.delete(RECOVERY_COOKIE);
  if (authLaunchReady() && recoveryEnabled() && url.origin === origin && url.searchParams.get("type") === "recovery" &&
      url.searchParams.getAll("type").length === 1 && url.searchParams.getAll("token_hash").length === 1 &&
      !url.searchParams.has("code") && hash && /^[a-f0-9]{32,128}$/i.test(hash)) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: hash, type: "recovery" });
      const { data: verified, error: claimsError } = await supabase.auth.getClaims();
      const session = verified?.claims.session_id;
      if (!error && !claimsError && confirmedIdentity(data.user) && typeof session === "string") {
        store.set(RECOVERY_COOKIE, issueRecoveryProof(data.user!.id, session), {
          httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600,
        });
        valid = true;
      }
    } catch { valid = false; }
  }
  return NextResponse.redirect(`${origin}${valid ? "/reset-password" : "/forgot-password?error=invalid-link"}`, {
    status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
