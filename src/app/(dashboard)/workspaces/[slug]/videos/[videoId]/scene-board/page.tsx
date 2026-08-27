import React from "react";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { loadSceneBoard } from "@/app/actions/scene-board-actions";
import SceneBoard from "@/components/ui/SceneBoard";
import VideoTabs from "@/components/ui/VideoTabs";
import EditableProjectTitle from "@/components/ui/EditableProjectTitle";

/**
 * Home for a project's Scene Board — a real route, a sibling of the Timeline and
 * Thumbnails (implementation_plans/19-scene-board-workspace.md).
 *
 * This replaces two things at once: the `whiteboard/` route, which nothing in the app
 * ever linked to, and the modal inside `TimelineEditor` that shadowed it. Reviewing 150
 * scenes is a thirty-minute job on a wide monitor, which is exactly what a modal is
 * worst at — no deep link, no refresh, no second window, and a `max-w-4xl` column on a
 * 2560px display.
 */

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function SceneBoardPage({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug: workspaceId, videoId } = await params;

  const result = await loadSceneBoard(videoId);

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-ed-text mb-4">Project not found</h2>
        <Link href={`/workspaces/${workspaceId}`} className="text-ed-accent-text hover:underline">
          Return to Workspace
        </Link>
      </div>
    );
  }

  const board = result.data;

  // Runtime against the tier the project was created at. `targetSeconds` is null for a
  // duration string this build doesn't recognise, in which case the readout is simply
  // the recorded time with nothing to compare it to.
  const target = board.targetSeconds;
  const isOver = target !== null && board.recordedSeconds > target.max;
  const isUnder = target !== null && board.recordedSeconds > 0 && board.recordedSeconds < target.min;

  return (
    /* Escapes the dashboard shell's padded, sidebar-offset <main>, exactly as the
       Timeline editor does. The Scene Board is a full-viewport tool, not a document in
       a content column — inside the shell it would lose ~340px to the sidebar and
       padding, which is the space the third pane needs. */
    <div className="fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden bg-ed-base text-ed-text">
      <header className="flex items-center justify-between px-4 h-12 bg-ed-chrome border-b border-ed-border shrink-0">
        {/* flex-1: `justify-between` on the header only pushes this group and the tabs
            group apart — it does not stretch either one, so the title was previously
            sized to its own content (capped at max-w-md) with unclaimed space sitting
            unused between it and the tabs on any wide monitor. This group now grows to
            fill exactly that space, and the title takes all of it. */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="p-1.5 rounded-md text-ed-text-dim hover:text-ed-text hover:bg-ed-hover transition-colors shrink-0"
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="h-5 w-px bg-ed-border shrink-0" />
          <EditableProjectTitle projectId={videoId} initialTopic={board.topic} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`hidden lg:flex items-center gap-1.5 text-[11px] font-medium ${
              isOver ? "text-ed-warn" : isUnder ? "text-ed-text-faint" : "text-ed-text-dim"
            }`}
            title={
              target
                ? `Target for ${board.targetDuration}: ${formatClock(target.min)}–${formatClock(target.max)}`
                : undefined
            }
          >
            <Clock size={12} />
            {formatClock(board.recordedSeconds)}
            {target && <span className="text-ed-text-faint">/ ~{formatClock(target.max)}</span>}
          </span>
          <VideoTabs workspaceId={workspaceId} videoId={videoId} active="scene-board" />
        </div>
      </header>

      <SceneBoard data={board} />
    </div>
  );
}
