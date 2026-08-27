import React from "react";
import Link from "next/link";
import fs from "fs/promises";
import path from "path";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listThumbnails } from "@/app/actions/thumbnail-actions";
import ThumbnailPanel from "@/components/ui/ThumbnailPanel";
import VideoTabs from "@/components/ui/VideoTabs";

/**
 * Per-video home for the thumbnail generator — a sibling to `whiteboard/`, not a tab on
 * the workspace settings page. A thumbnail is produced per rendered video, not per
 * channel, so it belongs alongside the Timeline/Scene Board routes rather than in
 * `SettingsTabs.tsx` (channel-level config only).
 */
export default async function ThumbnailsPage({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>;
}) {
  const { slug: workspaceId, videoId } = await params;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("video_projects")
    .select("id, topic")
    .eq("id", videoId)
    .single();

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-ed-text mb-4">Project not found</h2>
        <Link href={`/workspaces/${workspaceId}`} className="text-ed-accent-text hover:underline">
          Return to Workspace
        </Link>
      </div>
    );
  }

  const [thumbnailsResult, hasFinalExport] = await Promise.all([
    listThumbnails(videoId),
    fs
      .access(path.join(process.cwd(), "public", "media", "final_exports", `${videoId}.mp4`))
      .then(() => true)
      .catch(() => false),
  ]);

  return (
    <div className="min-h-screen bg-ed-base text-ed-text">
      <header className="flex items-center justify-between px-4 h-12 bg-ed-chrome border-b border-ed-border shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="p-1.5 rounded-md text-ed-text-dim hover:text-ed-text hover:bg-ed-raised transition-colors shrink-0"
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="h-5 w-px bg-ed-hover shrink-0" />
          <h1 className="text-[13px] font-bold text-ed-text truncate" title={project.topic}>
            {project.topic || "Untitled Video"}
          </h1>
        </div>

        <VideoTabs workspaceId={workspaceId} videoId={videoId} active="thumbnails" />
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <ThumbnailPanel
          projectId={videoId}
          initialThumbnails={thumbnailsResult.thumbnails ?? []}
          initialError={thumbnailsResult.success ? undefined : thumbnailsResult.error}
          hasFinalExport={hasFinalExport}
        />
      </div>
    </div>
  );
}
