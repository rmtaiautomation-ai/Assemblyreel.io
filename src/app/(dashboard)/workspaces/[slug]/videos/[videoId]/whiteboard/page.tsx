import { redirect } from "next/navigation";

/**
 * The Scene Board moved to `scene-board/` (implementation_plans/19-scene-board-workspace.md).
 *
 * Kept as a redirect rather than deleted: "whiteboard" was this surface's name for its
 * whole life, so it is what any bookmark, open tab, or stale link points at.
 */
export default async function WhiteboardRedirect({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug, videoId } = await params;
  redirect(`/workspaces/${slug}/videos/${videoId}/scene-board`);
}
