import React from "react";
import Link from "next/link";
import { Settings, Mic, Palette, MonitorPlay, Activity, CheckCircle2, Ratio, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import NewVideoForm from "@/components/ui/NewVideoForm";

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
        <h2 className="text-xl font-bold text-gray-800 mb-4">Workspace not found</h2>
        <Link href="/workspaces" className="text-purple-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const totalVideos = videoProjects?.length ?? 0;
  const completedCount = videoProjects?.filter((v) => v.status === 'completed').length ?? 0;
  const renderingCount = videoProjects?.filter((v) => v.status === 'rendering').length ?? 0;
  const draftingCount = totalVideos - completedCount - renderingCount;
  const recentActivity = videoProjects?.slice(0, 4) ?? [];

  return (
    <div className="w-full max-w-[1600px] mx-auto">

      {/* Top Navigation Row */}
      <div className="mb-6 flex items-center justify-between">
        {/* Breadcrumb */}
        <div className="flex items-center text-sm font-medium text-gray-500">
          <Link href="/workspaces" className="hover:text-purple-600 transition-colors flex items-center gap-1">
            ← All Workspaces
          </Link>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-gray-900">{workspace.name}</span>
          <span className="ml-3 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-purple-200">
            Active Studio
          </span>
        </div>

        {/* Workspace Actions */}
        <div className="flex items-center gap-3">
          <Link href={`/workspaces/${workspace.id}/settings`} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5">
            <Settings size={14} className="text-gray-500" />
            Settings
          </Link>
          <Link href={`/workspaces/${workspace.id}/characters`} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5">
            <Mic size={14} className="text-gray-500" />
            Voice Hub
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left Sidebar: Workspace Pulse & Video Library */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Workspace Pulse: production stats, real activity, style reference */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col flex-1 min-h-[600px]">

            {/* Production Snapshot */}
            <div className="p-5">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
                <Activity size={16} className="text-purple-600" />
                Production Snapshot
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 border border-gray-100 rounded-lg py-2.5">
                  <p className="text-lg font-black text-gray-900">{totalVideos}</p>
                  <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Total</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg py-2.5">
                  <p className="text-lg font-black text-blue-700">{renderingCount}</p>
                  <p className="text-[9px] uppercase font-bold text-blue-600 tracking-wider">Rendering</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg py-2.5">
                  <p className="text-lg font-black text-green-700">{completedCount}</p>
                  <p className="text-[9px] uppercase font-bold text-green-600 tracking-wider">Done</p>
                </div>
              </div>
              {draftingCount > 0 && (
                <p className="text-[10px] text-gray-500 mt-2 text-center">{draftingCount} in draft / queued</p>
              )}
            </div>

            {/* Recent Activity (real data) */}
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              <h4 className="font-bold text-gray-900 text-xs mb-4">Recent Activity</h4>
              {recentActivity.length === 0 ? (
                <p className="text-[10px] text-gray-400">No activity yet — create your first video to get started.</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((video, idx) => (
                    <div key={video.id} className="flex gap-3 relative">
                      {idx < recentActivity.length - 1 && (
                        <div className="absolute top-6 left-2.5 bottom-[-16px] w-px bg-gray-200"></div>
                      )}
                      <div className={`p-1.5 rounded-full z-10 shrink-0 h-fit ${
                        video.status === 'completed' ? 'bg-green-100' :
                        video.status === 'rendering' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <CheckCircle2 size={12} className={
                          video.status === 'completed' ? 'text-green-600' :
                          video.status === 'rendering' ? 'text-blue-600' : 'text-gray-400'
                        } />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">
                          {video.status === 'completed' ? 'Video Rendered' : video.status === 'rendering' ? 'Rendering In Progress' : 'Draft Created'}
                        </p>
                        <p className="text-[10px] text-gray-500">{video.topic || 'Untitled'} &bull; {timeAgo(video.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Style Reference (real workspace config) */}
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 flex-1">
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-xs">
                <Palette size={14} className="text-purple-600" />
                Style Reference
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider shrink-0 pt-0.5">Niche</span>
                  <span className="text-xs font-semibold text-gray-800 text-right">{prettify(workspace.content_theme)}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider shrink-0 pt-0.5">Voice</span>
                  <span className="text-xs font-semibold text-gray-800 text-right flex items-center gap-1">
                    <Mic size={11} className="text-gray-400" />
                    {prettify(workspace.narration_voice_id)}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider shrink-0 pt-0.5">Art Style</span>
                  <span className="text-xs font-semibold text-gray-800 text-right">{prettify(workspace.visual_aesthetic)}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider shrink-0 pt-0.5">Aspect Ratio</span>
                  <span className="text-xs font-semibold text-gray-800 text-right flex items-center gap-1">
                    <Ratio size={11} className="text-gray-400" />
                    {prettify(workspace.aspect_ratio)}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider shrink-0 pt-0.5">Duration</span>
                  <span className="text-xs font-semibold text-gray-800 text-right flex items-center gap-1">
                    <Clock3 size={11} className="text-gray-400" />
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-full min-h-[600px]">
            <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <MonitorPlay size={16} className="text-purple-600" />
                Library
              </h2>
              <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                {videoProjects ? videoProjects.length : 0}
              </span>
            </div>

            <div className="p-2 flex-1 overflow-y-auto space-y-2">
              {!videoProjects || videoProjects.length === 0 ? (
                <div className="text-center flex flex-col items-center justify-center h-full opacity-60">
                  <MonitorPlay size={24} className="text-gray-400 mb-2" />
                  <p className="text-xs text-gray-500">No videos yet</p>
                </div>
              ) : (
                videoProjects.map((video) => (
                  <Link key={video.id} href={`/workspaces/${workspace.id}/videos/${video.id}`} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:border-purple-300 transition-all group flex flex-col gap-2 block relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      video.status === 'completed' ? 'bg-green-500' :
                      video.status === 'rendering' ? 'bg-blue-500 animate-pulse' :
                      'bg-yellow-500'
                    }`}></div>
                    <div className="pl-1">
                      <h3 className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2 text-xs leading-tight mb-2">
                        {video.topic || "Untitled"}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className={`text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm ${
                          video.status === 'completed' ? 'bg-green-100 text-green-700' :
                          video.status === 'rendering' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {video.status}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">{new Date(video.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
