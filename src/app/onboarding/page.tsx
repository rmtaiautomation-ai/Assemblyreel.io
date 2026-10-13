import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/server/auth/account";
import { onboardingEnabled, readOnboarding } from "@/server/access/onboarding";
import { accessContext } from "@/server/access/ownership";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { SetupForm } from "@/features/onboarding/SetupForm";
import type { SetupState } from "@/features/onboarding/schema";

export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const user = await requireAccount();
  if (!onboardingEnabled()) redirect("/account");
  let state: SetupState | null = null;
  let workspaces: { id: string; name: string; content_theme: string }[] = [];
  let unavailable = false;
  try {
    state = await readOnboarding();
    const { client, user: actor } = await accessContext();
    const { data, error } = await client.from("workspaces").select("id,name,content_theme").eq("user_id", actor.id).order("created_at").limit(3);
    if (error) throw error;
    workspaces = data ?? [];
  } catch {
    unavailable = true;
  }
  if (state?.project_id) redirect(`/account/projects/${state.project_id}`);
  return <AuthCard title="Set up your workspace"><p className="text-sm break-all">Signed in as {user.email}</p>{unavailable
    ? <><p role="alert">Saved setup is temporarily unavailable. Refresh to retry.</p><Link href="/account?overview=1">Open account</Link></>
    : <SetupForm initial={state} workspaces={workspaces} />}</AuthCard>;
}
