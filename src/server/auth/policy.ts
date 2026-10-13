import { z } from "zod";

// Auth-only is the only supported launch stage until ownership and cost controls ship.
export function safeReturnPath(value: unknown): string {
  return value === "/account" ? value : "/account";
}

export function siteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value) throw new Error("Configure NEXT_PUBLIC_SITE_URL before enabling accounts.");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("Site URL must be an HTTPS origin (HTTP loopback is allowed locally).");
  }
  return url.origin;
}

export function authLaunchReady(): boolean {
  return process.env.AUTH_LAUNCH_READY === "true" &&
    process.env.APP_ACCESS_STAGE === "auth_only";
}

export function registrationEnabled(): boolean {
  return authLaunchReady() && process.env.AUTH_REGISTRATION_ENABLED === "true";
}

export function confirmedIdentity(user: { email?: string; email_confirmed_at?: string; is_anonymous?: boolean; banned_until?: string } | null): boolean {
  return Boolean(user?.email && user.email_confirmed_at && !user.is_anonymous &&
    (!user.banned_until || Date.parse(user.banned_until)<=Date.now()));
}

export function legacyServiceEnabled(): boolean { return false; }

export const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const signupSchema = z.object({ email: emailSchema, password: z.string().min(12).max(128) });

export function confirmationToken(params: URLSearchParams): string | null {
  const token = params.get("token_hash");
  if (params.getAll("token_hash").length !== 1 || params.getAll("type").length !== 1 ||
      params.get("type") !== "email" || params.has("code") || !token ||
      !/^[a-f0-9]{32,128}$/i.test(token)) return null;
  return token;
}

export function confirmationCode(params: URLSearchParams): string | null {
  const code = params.get("code");
  if (params.getAll("code").length !== 1 || params.has("token_hash") || params.has("type") ||
      params.has("error") || params.has("error_code") || !code ||
      !/^[a-z0-9_-]{16,512}$/i.test(code)) return null;
  return code;
}
export function onboardingReady() {
  return authLaunchReady() && process.env.OWNERSHIP_MIGRATION_READY === "true"
    && process.env.OWNED_CONTENT_ENABLED === "true" && process.env.ONBOARDING_ENABLED === "true";
}
