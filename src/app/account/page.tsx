import Link from "next/link";
import { redirect } from "next/navigation";
import { onboardingEnabled, readOnboarding } from "@/server/access/onboarding";
import { requireAccount } from "@/server/auth/account";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { RecoveryForm } from "@/features/auth/components/RecoveryForm";
import { recoveryEnabled } from "@/server/auth/mutations";
import { OwnedContentPanel } from "@/features/workspaces/components/OwnedContentPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ overview?: string }> }) {
  const user = await requireAccount();
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id,email").eq("id", user.id).maybeSingle();
  let projectId: string | null = null;
  let setupUnavailable = false;
  let incomplete = false;
  if (onboardingEnabled() && data && !error) {
    try { const state = await readOnboarding(); projectId = state?.project_id ?? null; incomplete = !projectId; }
    catch { setupUnavailable = true; }
  }
  if (incomplete && (await searchParams).overview !== "1") redirect("/onboarding");
  return <AuthCard title="Your account">
    <p className="text-sm break-all">Signed in as <strong>{user.email}</strong></p>
    <p className="text-sm text-[#B5BCC6]">Email confirmed.</p>
    {(error || !data) && <p role="alert" className="text-amber-200 text-sm">Your login is valid, but your application profile is awaiting setup. Try refreshing later or contact support.</p>}
    <p className="text-sm text-[#B5BCC6]">Account access is available for testing. Video generation and billing will open after their security checks are complete.</p>
    {onboardingEnabled() && <Link href={projectId ? `/account/projects/${projectId}` : "/onboarding"} className="text-[#13EF93] block">{projectId ? "Open your saved project" : "Resume workspace setup"}</Link>}
    <Link href="/account/billing" className="text-[#13EF93] block">Billing and allowances</Link>
    {setupUnavailable && <p role="alert" className="text-amber-200 text-sm">Saved setup is temporarily unavailable. Your account remains accessible.</p>}
    {process.env.OWNERSHIP_MIGRATION_READY==="true" && process.env.OWNED_CONTENT_ENABLED==="true" && !error && data && <OwnedContentPanel mediaEnabled={process.env.PRIVATE_MEDIA_ENABLED==="true"} />}
    {recoveryEnabled() && <><h2 className="font-semibold">Change password</h2><RecoveryForm mode="password" enabled />
      <h2 className="font-semibold">Change email</h2><RecoveryForm mode="email" enabled /></>}
    <LogoutButton /><Link href="/" className="text-sm text-[#13EF93] block">Back to the landing page</Link>
  </AuthCard>;
}
