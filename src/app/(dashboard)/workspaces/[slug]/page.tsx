import React from "react";
import Link from "next/link";
import { Settings, Mic, Palette, MonitorPlay, Activity, CheckCircle2, Ratio, Clock3, Edit3, Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import NewVideoForm from "@/components/ui/NewVideoForm";
import DeleteProjectButton from "@/components/ui/DeleteProjectButton";

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function prettify(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Single source of truth for how a project status is presented.
 *
 * This branching used to be copy-pasted across the snapshot counts, the activity
 * feed and the project cards. When `completed` was renamed to `exported`, the
 * three sites drifted and any unrecognised status fell through to the "drafting"
 * styling while printing its raw DB value as the badge label.
 *
 * `completed` is kept as a legacy alias on purpose: it is the pre-rename value
 * still sitting in existing rows, and migrate-project-status.sql is applied by
 * hand, so the UI must read correctly both before and after it runs.
 */
function statusView(raw: string | null | undefined) {
  switch (raw) {
    case 'exported':
    case 'completed': // legacy, pre-rename
      return {
        kind: 'exported' as const,
        label: 'Exported',
        activity: 'Video Exported',
        bar: 'bg-ed-ok',
        chip: 'bg-ed-ok-soft text-ed-ok',
        dot: 'bg-ed-ok-soft',
      };
    case 'rendering':
      return {
        kind: 'rendering' as const,
        label: 'Rendering',
        activity: 'Rendering In Progress',
        bar: 'bg-ed-info animate-pulse',
        chip: 'bg-ed-info-soft text-ed-info',
        dot: 'bg-ed-info-soft',
      };
    case 'approved':
      return {
        kind: 'approved' as const,
        label: 'Ready To Render',
        activity: 'Script & Visuals Approved',
        bar: 'bg-ed-ok',
        chip: 'bg-ed-ok-soft text-ed-ok',
        dot: 'bg-ed-ok-soft',
      };
    // Long-form only: every Act's script exists and the project's one shared cast is
    // locked, but no Act has audio or visuals yet — those now happen per-Act, in
    // whatever order, from the Timeline Editor rather than as one bulk step here.
    case 'scripted':
      return {
        kind: 'scripted' as const,
        label: 'Ready To Narrate',
        activity: 'Script Approved — Cast Locked',
        bar: 'bg-ed-accent',
        chip: 'bg-ed-accent-soft text-ed-accent-text',
        dot: 'bg-ed-accent-soft',
      };
    // Short/mid-form only now: single-pass projects still narrate the whole project
    // in one action. Given its own badge because the whole point of the phase is that
    // the user can tell they are in it.
    case 'narrated':
      return {
        kind: 'narrated' as const,
        label: 'Review Audio',
        activity: 'Narration Ready For Review',
        bar: 'bg-ed-accent',
        chip: 'bg-ed-accent-soft text-ed-accent-text',
        dot: 'bg-ed-accent-soft',
      };
    case 'failed':
      return {
        kind: 'failed' as const,
        label: 'Failed',
        activity: 'Render Failed',
        bar: 'bg-ed-danger',
        chip: 'bg-ed-danger-soft text-ed-danger',
        dot: 'bg-ed-danger-soft',
      };
    default: // 'drafting', 'pending', and anything unrecognised
      return {
        kind: 'drafting' as const,
        label: 'Working On',
        activity: 'Working On',
        bar: 'bg-ed-warn',
        chip: 'bg-ed-warn-soft text-ed-warn',
        dot: 'bg-ed-warn-soft',
      };
  }
}

function StatusIcon({ kind }: { kind: ReturnType<typeof statusView>['kind'] }) {
  if (kind === 'exported') return <CheckCircle2 size={12} className="text-ed-ok" />;
  if (kind === 'rendering') return <Loader2 size={12} className="text-ed-info animate-spin" />;
  if (kind === 'failed') return <AlertTriangle size={12} className="text-ed-danger" />;
  if (kind === 'approved') return <CheckCircle2 size={12} className="text-ed-ok" />;
  if (kind === 'narrated' || kind === 'scripted') return <Mic size={12} className="text-ed-accent-text" />;
  return <Edit3 size={12} className="text-ed-warn" />;
}

export default async function WorkspaceHubPage({ params }: { params: { slug: string } }) {
  const { slug: workspaceId } = await params;

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  const { data: videoProjects } = await supabase
    .from('video_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-ed-text mb-4">Workspace not found</h2>
        <Link href="/workspaces" className="text-ed-accent-text hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const totalVideos = videoProjects?.length ?? 0;
  const exportedCount = videoProjects?.filter((v) => statusView(v.status).kind === 'exported').length ?? 0;
  const renderingCount = videoProjects?.filter((v) => statusView(v.status).kind === 'rendering').length ?? 0;
  const failedCount = videoProjects?.filter((v) => statusView(v.status).kind === 'failed').length ?? 0;
  const draftingCount = totalVideos - exportedCount - renderingCount - failedCount;
  const recentActivity = videoProjects?.slice(0, 4) ?? [];

  return (
    <div className="w-full max-w-[1600px] mx-auto">

      {/* Top Navigation Row */}
      <div className="mb-6 flex items-center justify-between">
        {/* Breadcrumb */}
        <div className="flex items-center text-sm font-medium text-ed-text-dim">
          <Link href="/workspaces" className="hover:text-ed-accent-text transition-colors flex items-center gap-1">
            ← All Workspaces
          </Link>
          <span className="mx-2 text-ed-text-faint">/</span>
          <span className="text-ed-text">{workspace.name}</span>
          <span className="ml-3 bg-ed-accent-soft text-ed-accent-text text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-ed-accent-border">
            Active Studio
          </span>
        </div>

        {/* Workspace Actions */}
        {/*
          The "Voice Hub" button that used to sit beside Settings is gone. It linked to a
          Setup Identity page (UGC / Custom Business) that persisted nothing — narration
          voices are served by the local Voice Studio, and the channel's default voice is
          now picked in Settings → Channel, against that live list.
        */}
        <div className="flex items-center gap-3">
          <Link href={`/workspaces/${workspace.id}/settings`} className="bg-ed-surface border border-ed-border text-ed-text-dim hover:bg-ed-well hover:border-ed-border-strong px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5">
            <Settings size={14} className="text-ed-text-dim" />
            Settings
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left Sidebar: Workspace Pulse & Video Library */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Workspace Pulse: production stats, real activity, style reference */}
          <div className="bg-ed-surface border border-ed-border rounded-xl shadow-sm flex flex-col flex-1 min-h-[600px]">

            {/* Production Snapshot */}
            <div className="p-5">
              <h3 className="font-bold text-ed-text mb-4 flex items-center gap-2 text-sm">
                <Activity size={16} className="text-ed-accent-text" />
                Production Snapshot
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-ed-well border border-ed-border rounded-lg py-2.5">
                  <p className="text-lg font-black text-ed-text">{totalVideos}</p>
                  <p className="text-[9px] uppercase font-bold text-ed-text-dim tracking-wider">Total</p>
                </div>
                <div className="bg-ed-info-soft border border-ed-info-border rounded-lg py-2.5">
                  <p className="text-lg font-black text-ed-info">{renderingCount}</p>
                  <p className="text-[9px] uppercase font-bold text-ed-info tracking-wider">Rendering</p>
                </div>
                <div className="bg-ed-ok-soft border border-ed-ok-border rounded-lg py-2.5">
                  <p className="text-lg font-black text-ed-ok">{exportedCount}</p>
                  <p className="text-[9px] uppercase font-bold text-ed-ok tracking-wider">Exported</p>
                </div>
              </div>
              {draftingCount > 0 && (
                <p className="text-[10px] text-ed-text-dim mt-2 text-center">{draftingCount} in draft / queued</p>
              )}
              {failedCount > 0 && (
                <p className="text-[10px] text-ed-danger font-semibold mt-1 text-center">
                  {failedCount} render{failedCount === 1 ? '' : 's'} failed
                </p>
              )}
            </div>

            {/* Recent Activity (real data) */}
            <div className="px-5 pb-5 border-t border-ed-border pt-4">
              <h4 className="font-bold text-ed-text text-xs mb-4">Recent Activity</h4>
              {recentActivity.length === 0 ? (
                <p className="text-[10px] text-ed-text-faint">No activity yet — create your first video to get started.</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((video, idx) => {
                    const view = statusView(video.status);
                    return (
                      <div key={video.id} className="flex gap-3 relative">
                        {idx < recentActivity.length - 1 && (
                          <div className="absolute top-6 left-2.5 bottom-[-16px] w-px bg-ed-hover"></div>
                        )}
                        <div className={`p-1.5 rounded-full z-10 shrink-0 h-fit ${view.dot}`}>
                          <StatusIcon kind={view.kind} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ed-text">{view.activity}</p>
                          <p className="text-[10px] text-ed-text-dim">{video.topic || 'Untitled'} &bull; {timeAgo(video.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Style Reference (real workspace config) */}
            <div className="px-5 pb-5 border-t border-ed-border pt-4 flex-1">
              {/* Every value below is now editable — Settings → Channel writes exactly
                  these columns. The panel read as immutable channel trivia for as long as
                  nothing could change it, so it links to its own editor. */}
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="font-bold text-ed-text flex items-center gap-2 text-xs">
                  <Palette size={14} className="text-ed-accent-text" />
                  Style Reference
                </h4>
                <Link
                  href={`/workspaces/${workspace.id}/settings`}
                  className="text-[10px] font-bold uppercase tracking-wider text-ed-accent-text hover:text-ed-accent-text"
                >
                  Edit
                </Link>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-ed-text-faint tracking-wider shrink-0 pt-0.5">Niche</span>
                  <span className="text-xs font-semibold text-ed-text text-right">{prettify(workspace.content_theme)}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-ed-text-faint tracking-wider shrink-0 pt-0.5">Voice</span>
                  <span className="text-xs font-semibold text-ed-text text-right flex items-center gap-1">
                    <Mic size={11} className="text-ed-text-faint" />
                    {prettify(workspace.narration_voice_id)}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-ed-text-faint tracking-wider shrink-0 pt-0.5">Art Style</span>
                  <span className="text-xs font-semibold text-ed-text text-right">{prettify(workspace.visual_aesthetic)}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-ed-text-faint tracking-wider shrink-0 pt-0.5">Aspect Ratio</span>
                  <span className="text-xs font-semibold text-ed-text text-right flex items-center gap-1">
                    <Ratio size={11} className="text-ed-text-faint" />
                    {prettify(workspace.aspect_ratio)}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-ed-text-faint tracking-wider shrink-0 pt-0.5">Duration</span>
                  <span className="text-xs font-semibold text-ed-text text-right flex items-center gap-1">
                    <Clock3 size={11} className="text-ed-text-faint" />
                    {prettify(workspace.duration_pref)}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Center: Form */}
        <div className="lg:col-span-2">
          <NewVideoForm workspace={workspace} />
        </div>

        {/* Right Sidebar: Video Library */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Dedicated Video Library */}
          <div className="bg-ed-surface border border-ed-border rounded-xl shadow-sm flex flex-col h-full min-h-[600px]">
            <div className="p-3 border-b border-ed-border flex items-center justify-between bg-ed-well rounded-t-xl">
              <h2 className="text-sm font-bold text-ed-text flex items-center gap-1.5">
                <MonitorPlay size={16} className="text-ed-accent-text" />
                Library
              </h2>
              <span className="bg-ed-accent-soft text-ed-accent-text text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                {videoProjects ? videoProjects.length : 0}
              </span>
            </div>

            <div className="p-2 flex-1 overflow-y-auto space-y-2">
              {!videoProjects || videoProjects.length === 0 ? (
                <div className="text-center flex flex-col items-center justify-center h-full opacity-60">
                  <MonitorPlay size={24} className="text-ed-text-faint mb-2" />
                  <p className="text-xs text-ed-text-dim">No videos yet</p>
                </div>
              ) : (
                videoProjects.map((video) => {
                  const view = statusView(video.status);
                  // The card is a wrapper rather than the <Link> itself so the delete
                  // button can sit beside the link instead of inside it — see the
                  // markup note in DeleteProjectButton.
                  return (
                    <div key={video.id} className="bg-ed-surface border border-ed-border rounded-lg shadow-sm hover:border-ed-accent-border transition-all group relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${view.bar}`}></div>
                      <DeleteProjectButton
                        projectId={video.id}
                        workspaceId={workspace.id}
                        topic={video.topic}
                      />
                      <Link href={`/workspaces/${workspace.id}/videos/${video.id}`} className="block p-3">
                        <div className="pl-1">
                          {/* pr-5 keeps a long title clear of the delete button's corner. */}
                          <h3 className="font-semibold text-ed-text group-hover:text-ed-accent-text transition-colors line-clamp-2 text-xs leading-tight mb-2 pr-5">
                            {video.topic || "Untitled"}
                          </h3>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm ${view.chip}`}>
                              {view.label}
                            </span>
                            <span className="text-[9px] text-ed-text-faint font-medium">{new Date(video.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
