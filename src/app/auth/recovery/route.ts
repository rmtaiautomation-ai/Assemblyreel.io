import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authLaunchReady, siteOrigin, confirmedIdentity, emailToken } from "@/server/auth/policy";
import { recoveryEnabled } from "@/server/auth/mutations";
import { issueRecoveryProof, RECOVERY_COOKIE } from "@/server/auth/recovery-proof";

export async function GET(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch { return new Response(null, { status: 503 }); }
  const url = new URL(request.url), hash = emailToken(url.searchParams, "recovery");
  let valid = false;
  const store = await cookies();
  store.delete(RECOVERY_COOKIE);
  if (authLaunchReady() && recoveryEnabled() && url.origin === origin && hash) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: hash, type: "recovery" });
      try {
        if (!error && data.session && confirmedIdentity(data.user)) {
          const { data: verified, error: claimsError } = await supabase.auth.getClaims();
          const session = verified?.claims.session_id;
          if (!claimsError && verified?.claims.sub === data.user!.id && typeof session === "string" && session) {
            store.set(RECOVERY_COOKIE, issueRecoveryProof(data.user!.id, session), {
              httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 600,
            });
            valid = true;
          }
        }
      } finally {
        if (!valid && data.session) await supabase.auth.signOut({ scope: "local" });
      }
    } catch { valid = false; }
  }
  return NextResponse.redirect(`${origin}${valid ? "/reset-password" : "/forgot-password?error=invalid-link"}`, {
    status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
