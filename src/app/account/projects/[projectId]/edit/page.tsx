import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/server/auth/account";
import { readOwnedEditor } from "@/server/access/owned-editor";
import { AccessError } from "@/server/access/requests";
import { WorkspaceShell } from "@/features/workspaces/components/WorkspaceShell";
import { OwnedDraftEditor } from "@/features/owned-editor/OwnedDraftEditor";

export const dynamic = "force-dynamic";
export default async function EditPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAccount();
  const { projectId } = await params;
  let snapshot;
  try { snapshot = await readOwnedEditor(projectId); }
  catch (error) {
    if (error instanceof AccessError && [400, 404].includes(error.status)) notFound();
    return <WorkspaceShell title="Draft editor unavailable"><p role="alert">Draft editing is temporarily unavailable. Your saved project is unchanged.</p><Link href={`/account/projects/${encodeURIComponent(projectId)}`} className="mt-5 block text-[#13EF93]">Back to project</Link></WorkspaceShell>;
  }
  return <WorkspaceShell title="Edit draft"><OwnedDraftEditor initial={snapshot} /></WorkspaceShell>;
}
