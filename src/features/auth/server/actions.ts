"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authLaunchReady, registrationEnabled, loginSchema, signupSchema, emailSchema, siteOrigin, safeReturnPath, confirmedIdentity } from "@/server/auth/policy";
import { requireMutationOrigin, captchaOptions } from "@/server/auth/mutations";

export type AuthFormState = { error?: string; message?: string; passwordResetComplete?: boolean };

export async function login(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authLaunchReady()) return { error: "Account access is awaiting configuration." };
  const input = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: "Enter a valid email and password." };
  try {
    await requireMutationOrigin();
    const options = captchaOptions(form);
    siteOrigin();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ ...input.data, options });
    if (error?.status === 429) return { error: "Please wait before trying to log in again." };
    if (error?.code === "captcha_failed") return { error: "Complete the security challenge and try again." };
    if (error || !confirmedIdentity(data.user)) {
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      return { error: "Unable to sign in. Check your details and confirm your email." };
    }
  } catch (error) {
    return { error: error instanceof Error && error.message === "CAPTCHA_REQUIRED"
      ? "Complete the security challenge and try again." : "Sign-in is temporarily unavailable. Please try again." };
  }
  redirect(safeReturnPath(form.get("next")));
}

export async function signup(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!registrationEnabled()) return { error: "Registration is not open yet." };
  const input = signupSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: "Use a valid email and a password of 12–128 characters." };
  try {
    await requireMutationOrigin();
    const options = captchaOptions(form);
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ ...input.data, options: { ...options, emailRedirectTo: `${siteOrigin()}/auth/callback` } });
    // Auto-confirm is a configuration failure, never an account-access shortcut.
    if (data.session) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Registration requires email confirmation. Please contact support." };
    }
    if (error?.status === 429) return { error: "Please wait before trying to register again." };
    if (error?.code === "captcha_failed") return { error: "Complete the security challenge and try again." };
    if (error && !["user_already_exists", "email_exists"].includes(error.code ?? "")) {
      return { error: "Unable to register right now. Please try again later." };
    }
  } catch (error) {
    return { error: error instanceof Error && error.message === "CAPTCHA_REQUIRED"
      ? "Complete the security challenge and try again." : "Registration is temporarily unavailable." };
  }
  // Do not expose whether an address is already registered.
  redirect("/signup/confirm");
}

export async function resendConfirmation(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!registrationEnabled()) return { error: "Registration is not open yet." };
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    await requireMutationOrigin();
    const options = captchaOptions(form);
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: email.data, options: { ...options, emailRedirectTo: `${siteOrigin()}/auth/callback` } });
    if (error?.status === 429) return { error: "Please wait before requesting another email." };
    if (error?.code === "captcha_failed") return { error: "Complete the security challenge and try again." };
    // Eligibility and account existence are deliberately indistinguishable.
    if (error && error.status && error.status >= 500) return { error: "Email delivery is temporarily unavailable." };
  } catch (error) {
    return { error: error instanceof Error && error.message === "CAPTCHA_REQUIRED"
      ? "Complete the security challenge and try again." : "Email delivery is temporarily unavailable." };
  }
  return { message: "If this address is eligible, a confirmation email has been sent. Wait at least 60 seconds before trying again." };
}

export async function logout(): Promise<AuthFormState> {
  try {
    await requireMutationOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "Sign-out failed. Please try again." };
    return {};
  } catch { return { error: "Sign-out is temporarily unavailable." }; }
}
