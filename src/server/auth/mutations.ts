import "server-only";
import { headers } from "next/headers";
import { siteOrigin } from "./policy";

export async function requireMutationOrigin() {
  if ((await headers()).get("origin") !== siteOrigin()) throw new Error("INVALID_ORIGIN");
}

export function captchaOptions(form: FormData): { captchaToken?: string } {
  if (process.env.AUTH_CAPTCHA_REQUIRED !== "true") return {};
  const token = form.get("cf-turnstile-response");
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) throw new Error("CAPTCHA_REQUIRED");
  // Supabase verifies this token. A nonempty string alone never proves a challenge.
  return { captchaToken: token };
}

export function recoveryEnabled() {
  return process.env.AUTH_RECOVERY_ENABLED === "true" && process.env.AUTH_ABUSE_CONTROLS_READY === "true" &&
    process.env.AUTH_CAPTCHA_REQUIRED === "true" && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
