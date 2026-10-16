import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/server/auth/account";
import { requireFeature, AccessError } from "@/server/access/requests";
import { accessContext, requireOwnedProject, requireOwnedWorkspace } from "@/server/access/ownership";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { AccountJobPanel } from "@/features/videos/components/AccountJobPanel";
import { scriptProviderReady } from "@/server/generation/job-policy";
import {cloudPreviewReady} from "@/server/generation/cloud-preview";
import { workspaceDashboardReady, ownedEditorReady } from "@/server/auth/policy";

export const dynamic = "force-dynamic";
export default async function DraftPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireAccount();
  let details: { id: string; workspaceId: string; name: string; topic: string } | null = null;
  try {
    requireFeature("OWNED_CONTENT_ENABLED");
    const { client, user: actor } = await accessContext();
    const project = await requireOwnedProject(client, actor.id, (await params).projectId);
    const workspace = await requireOwnedWorkspace(client, actor.id, project.workspace_id);
    details = { id:project.id,workspaceId:workspace.id,name: workspace.name, topic: project.topic };
  } catch (error) {
    if (error instanceof AccessError && [400,404].includes(error.status)) notFound();
  }
  return <AuthCard title="Your project"><p className="text-sm break-all">Signed in as {user.email}</p>{details
    ? <><p>Workspace: <strong>{details.name}</strong></p><p>Saved topic: <strong>{details.topic}</strong></p>
      <p className="text-sm text-[#B5BCC6]">Saved project metadata. Accepted background features appear below when configured; the full video editor remains unavailable.</p>
      {ownedEditorReady() && <Link href={`/account/projects/${details.id}/edit`} className="text-[#13EF93] block">Edit draft scenes and timing →</Link>}</>
    : <p role="alert">Your project is temporarily unavailable. Refresh to retry.</p>}
    {details && process.env.DURABLE_JOBS_ENABLED === "true" && process.env.JOBS_MIGRATION_READY === "true" &&
      <AccountJobPanel projectId={details.id} mockEnabled={process.env.MOCK_JOBS_ENABLED === "true"} scriptEnabled={scriptProviderReady()} renderEnabled={cloudPreviewReady()} />}
    <Link href="/account/billing" className="text-[#13EF93] block">Billing and allowances</Link>
    <Link href={workspaceDashboardReady() ? (details ? `/dashboard/${details.workspaceId}` : "/dashboard") : "/account?overview=1"} className="text-[#13EF93]">{workspaceDashboardReady() ? "Back to workspace" : "Back to account and workspaces"}</Link></AuthCard>;
}
