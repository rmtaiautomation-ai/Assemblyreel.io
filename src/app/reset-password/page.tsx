import { cookies } from "next/headers";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { RecoveryForm } from "@/features/auth/components/RecoveryForm";
import { requireAccount } from "@/server/auth/account";
import { createClient } from "@/lib/supabase/server";
import { validRecoveryProof, RECOVERY_COOKIE } from "@/server/auth/recovery-proof";
import { recoveryEnabled } from "@/server/auth/mutations";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ResetPage() {
  const user = await requireAccount();
  const { data, error } = await (await createClient()).auth.getClaims();
  const session = data?.claims.session_id;
  if (error || typeof session !== "string" || !validRecoveryProof((await cookies()).get(RECOVERY_COOKIE)?.value, user.id, session)) redirect("/forgot-password?error=invalid-link");
  return <AuthCard title="Set a new password"><RecoveryForm mode="reset" enabled={recoveryEnabled()} /></AuthCard>;
}
