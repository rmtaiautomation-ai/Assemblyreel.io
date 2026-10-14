import { cookies } from "next/headers";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { requireAccount } from "@/server/auth/account";
import { createClient } from "@/lib/supabase/server";
import { validRecoveryProof, RECOVERY_COOKIE } from "@/server/auth/recovery-proof";
import { recoveryEnabled } from "@/server/auth/mutations";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireAccount();
  const { data, error } = await (await createClient()).auth.getClaims();
  const session = data?.claims.session_id;
  if (error || typeof session !== "string" || !validRecoveryProof((await cookies()).get(RECOVERY_COOKIE)?.value, user.id, session)) redirect("/forgot-password?error=invalid-link");
  const enabled = recoveryEnabled();
  const { error: formError } = await searchParams;
  return <AuthCard title="Set a new password">
    {/* Native POST applies session-cookie deletion before the next document loads. */}
    <form method="post" action="/api/auth/reset-password" className="space-y-4">
      <label className="block text-sm">New password
        <input className="w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] px-4 py-3" type="password" name="password"
          required minLength={12} maxLength={128} autoComplete="new-password" disabled={!enabled} />
      </label>
      {formError === "update-failed" && <p role="alert" className="text-red-300 text-sm">Unable to update the password. Use a different password of 12–128 characters or request a new recovery link.</p>}
      <button type="submit" disabled={!enabled} className="mkt-btn-primary px-4 py-3 disabled:opacity-50">Update password</button>
    </form>
  </AuthCard>;
}
