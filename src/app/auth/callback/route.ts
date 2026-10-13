import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registrationEnabled, siteOrigin, confirmationToken, confirmationCode, confirmedIdentity } from "@/server/auth/policy";

export async function GET(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch {
    return NextResponse.json({ error: "Account configuration is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const url = new URL(request.url);
  const token = confirmationToken(url.searchParams);
  const code = confirmationCode(url.searchParams);
  let valid = false;
  if (url.origin === origin && registrationEnabled() && (token || code)) {
    try {
      const supabase = await createClient();
      // PKCE exchanges require the verifier cookie from the signup browser.
      // Never combine a code exchange with token-hash verification.
      const { data, error } = token
        ? await supabase.auth.verifyOtp({ token_hash: token, type: "email" })
        : await supabase.auth.exchangeCodeForSession(code!);
      valid = !error && confirmedIdentity(data.user);
      if (valid && code) {
        const identity = await supabase.auth.getUser();
        valid = !identity.error && confirmedIdentity(identity.data.user);
      }
      if (!valid && data.session) await supabase.auth.signOut({ scope: "local" });
    } catch { valid = false; }
  }
  const response = NextResponse.redirect(`${origin}${valid ? "/account" : "/signup/confirm?error=invalid"}`, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
