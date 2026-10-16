import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccount } from "@/server/auth/account";
import { workspaceDashboardReady } from "@/server/auth/policy";
import { dashboardDestination } from "@/server/access/workspace-dashboard";
import { WorkspaceShell } from "@/features/workspaces/components/WorkspaceShell";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  await requireAccount();
  if (!workspaceDashboardReady()) redirect("/account");
  let destination;
  try { destination = await dashboardDestination(); }
  catch { return <WorkspaceShell title="Your workspaces"><p role="alert">Workspaces are temporarily unavailable. Refresh to retry.</p><Link href="/account?overview=1" className="mt-5 block text-[#13EF93]">Open account settings</Link></WorkspaceShell>; }
  if (destination.needsSetup) redirect("/onboarding");
  return <WorkspaceShell title="Your workspaces">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><p className="text-[#B5BCC6]">Choose a channel to view its projects.</p>
      <Link href="/onboarding?new=1" className="rounded-lg bg-[#13EF93] px-5 py-3 font-semibold text-black">Create workspace</Link></div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{destination.workspaces.map(workspace =>
      <Link key={workspace.id} href={`/dashboard/${workspace.id}`} className="rounded-xl border border-[#353B44] bg-[#15181C] p-6 hover:border-[#13EF93] focus-visible:outline-2 focus-visible:outline-[#13EF93]">
        <h2 className="text-xl font-semibold break-words">{workspace.name}</h2><p className="mt-3 text-sm text-[#B5BCC6] break-words">{workspace.content_theme}</p><span className="mt-7 block text-sm text-[#13EF93]">Open workspace →</span>
      </Link>)}</div>
  </WorkspaceShell>;
}
