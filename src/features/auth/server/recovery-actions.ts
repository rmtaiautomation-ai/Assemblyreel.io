"use server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/server/auth/account";
import { authLaunchReady, emailSchema, signupSchema, siteOrigin, confirmedIdentity } from "@/server/auth/policy";
import { requireMutationOrigin, captchaOptions, recoveryEnabled, emailChangeEnabled } from "@/server/auth/mutations";
import { RECOVERY_COOKIE, validRecoveryProof } from "@/server/auth/recovery-proof";
import type { AuthFormState } from "./actions";

export async function forgotPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authLaunchReady() || !recoveryEnabled()) return { error: "Password recovery is not available yet." };
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    await requireMutationOrigin();
    const options = captchaOptions(form);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { ...options, redirectTo: `${siteOrigin()}/auth/recovery` });
    if (error?.status === 429) return { error: "Please wait before requesting another email." };
    if (error && error.code !== "user_not_found") return { error: "Unable to request recovery. Check the security challenge or try again later." };
    return { message: "If this address is registered, a password recovery email has been sent." };
  } catch { return { error: "Unable to request recovery. Check the security challenge or try again later." }; }
}

export async function resetPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authLaunchReady() || !recoveryEnabled()) return { error: "Password recovery is not available yet." };
  const password = signupSchema.shape.password.safeParse(form.get("password"));
  if (!password.success) return { error: "Use a password of 12–128 characters." };
  try {
    await requireMutationOrigin();
    const supabase = await createClient();
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    const { data: verified, error: claimsError } = await supabase.auth.getClaims();
    const session = verified?.claims.session_id;
    const store = await cookies();
    if (identityError || claimsError || !confirmedIdentity(identity.user) || typeof session !== "string" ||
        !validRecoveryProof(store.get(RECOVERY_COOKIE)?.value, identity.user!.id, session)) {
      return { error: "Recovery authorization expired. Request a new recovery email." };
    }
    const { error } = await supabase.auth.updateUser({ password: password.data });
    if (error) return { error: "Unable to update the password. Request a new link or try a stronger password." };
    store.delete(RECOVERY_COOKIE);
    const { error: logoutError } = await supabase.auth.signOut({ scope: "global" });
    if (logoutError) return { message: "Your password changed. Sign out and log in again; session revocation could not be confirmed." };
  } catch { return { error: "Password recovery is temporarily unavailable." }; }
  return { message: "Password updated. Sign in with your new password.", passwordResetComplete: true };
}

export async function changePassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!recoveryEnabled()) return { error: "Account changes are not available yet." };
  const user = await requireAccount();
  const password = signupSchema.shape.password.safeParse(form.get("password"));
  const current = form.get("currentPassword");
  if (!password.success || typeof current !== "string" || !current || current.length > 128) return { error: "Check the current and new passwords." };
  try {
    await requireMutationOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: password.data, current_password: current });
    if (error) return { error: "Unable to change the password. Verify the current password or use password recovery." };
    // Preserve only this session; revocation of others is verified during provider acceptance.
    const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });
    return { message: revokeError ? "Password changed; other-session revocation could not be confirmed." : `Password updated for ${user.email}. Other refresh sessions were signed out.` };
  } catch { return { error: "Account changes are temporarily unavailable." }; }
}

export async function changeEmail(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!emailChangeEnabled()) return { error: "Email changes are not available yet." };
  await requireAccount();
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    await requireMutationOrigin();
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ email: email.data }, { emailRedirectTo: `${siteOrigin()}/auth/email-change` });
    if (error) return { error: "Unable to request an email change. Please try again later." };
    return { message: "Check both your current and new email inboxes to confirm the change. Your identity changes only after confirmation." };
  } catch { return { error: "Account changes are temporarily unavailable." }; }
}
