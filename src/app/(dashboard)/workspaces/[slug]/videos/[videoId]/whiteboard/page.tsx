import React from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, MonitorPlay } from "lucide-react";
import { loadProjectForWhiteboard } from "@/app/actions/whiteboard-actions";
import Whiteboard from "@/components/ui/Whiteboard";

/**
 * Persistent home for a project's Story Whiteboard.
 *
 * Before this route existed, the Whiteboard was pure React state inside
 * `NewVideoForm` — leaving the page (a refresh, a wrong click, closing the tab) meant
 * losing the ability to see the act structure at all, even though every scene was
 * already safely in Supabase. This route reads that same data back via
 * `loadProjectForWhiteboard` and hands it to the same `<Whiteboard>` component, so a
 * generation started here or in `NewVideoForm` looks identical either way.
 */
export default async function WhiteboardPage({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug: workspaceId, videoId } = await params;

  const result = await loadProjectForWhiteboard(videoId);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Project not found</h2>
        <Link href={`/workspaces/${workspaceId}`} className="text-purple-600 hover:underline">
          Return to Workspace
        </Link>
      </div>
    );
  }

  const project = result.data;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between px-4 h-12 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="h-5 w-px bg-gray-200 shrink-0" />
          <h1 className="text-[13px] font-bold text-gray-900 truncate" title={project.topic}>
            {project.topic || "Untitled Video"}
          </h1>
        </div>

        {/* Same two-tab pattern as the link added to TimelineEditor's header, just
            mirrored — this tab is active here, Timeline is the link out. */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-purple-600 px-2.5 py-1 rounded-md">
            <Clapperboard size={13} />
            Whiteboard
          </span>
          <Link
            href={`/workspaces/${workspaceId}/videos/${videoId}`}
            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-gray-900 px-2.5 py-1 rounded-md transition-colors"
          >
            <MonitorPlay size={13} />
            Timeline
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <Whiteboard
          projectId={project.projectId}
          workspaceId={project.workspaceId}
          acts={project.acts.map((act) => act.outline)}
          workspaceTheme={project.workspaceTheme}
          topic={project.topic}
          narrativeArc={project.narrativeArc}
          scriptHook={project.scriptHook}
          visualAesthetic={project.visualAesthetic}
          targetDuration={project.targetDuration}
          isSinglePass={project.isSinglePass}
          resumedActs={project.acts}
        />
      </div>
    </div>
  );
}
