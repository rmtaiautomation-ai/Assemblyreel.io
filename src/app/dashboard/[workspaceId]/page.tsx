import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccount } from "@/server/auth/account";
import { workspaceDashboardReady } from "@/server/auth/policy";
import { getOwnedWorkspace, listOwnedProjects } from "@/server/access/workspaces";
import { AccessError } from "@/server/access/requests";
import { WorkspaceShell } from "@/features/workspaces/components/WorkspaceShell";
import { WorkspaceProjects } from "@/features/workspaces/components/WorkspaceProjects";

export const dynamic = "force-dynamic";
export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  await requireAccount();
  if (!workspaceDashboardReady()) redirect("/account");
  const { workspaceId } = await params;
  let details;
  try {
    const workspace = await getOwnedWorkspace(workspaceId);
    const projects = await listOwnedProjects(workspaceId);
    details = { workspace, projects };
  } catch (error) {
    if (error instanceof AccessError && [400, 404].includes(error.status)) notFound();
    return <WorkspaceShell title="Workspace unavailable"><p role="alert">Your workspace is temporarily unavailable. Refresh to retry.</p><Link href="/dashboard" className="mt-5 block text-[#13EF93]">Back to workspaces</Link></WorkspaceShell>;
  }
  return <WorkspaceShell title="Workspace"><Link href="/dashboard" className="mb-6 block text-sm text-[#13EF93]">← All workspaces</Link><WorkspaceProjects workspace={details.workspace} initialProjects={details.projects} /></WorkspaceShell>;
}
