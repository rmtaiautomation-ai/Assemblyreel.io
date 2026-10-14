import { NextResponse } from "next/server";
import { resetPassword } from "@/features/auth/server/recovery-actions";
import { siteOrigin, authLaunchReady } from "@/server/auth/policy";
import { recoveryEnabled } from "@/server/auth/mutations";

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let origin: string;
  try { origin = siteOrigin(); } catch { return new Response(null, { status: 503, headers: privateHeaders }); }
  if (!authLaunchReady() || !recoveryEnabled()) return new Response(null, { status: 503, headers: privateHeaders });
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403, headers: privateHeaders });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415, headers: privateHeaders });
  }
  // This native form carries one bounded password field, never an email token.
  const body = await request.text();
  if (body.length > 2048) return new Response(null, { status: 413, headers: privateHeaders });
  const fields = new URLSearchParams(body);
  const passwords = fields.getAll("password");
  if (passwords.length !== 1) return new Response(null, { status: 400, headers: privateHeaders });
  const form = new FormData();
  form.set("password", passwords[0]);
  const result = await resetPassword({}, form);
  if (result.passwordResetComplete) {
    return NextResponse.redirect(`${origin}/login?notice=password-updated`, { status: 303, headers: privateHeaders });
  }
  if (result.message) {
    return new Response("Your password changed, but signing out could not be confirmed. Open /account, sign out, then log in with your new password.", {
      status: 502, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(`${origin}/reset-password?error=update-failed`, { status: 303, headers: privateHeaders });
}
