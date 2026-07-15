import React from "react";
import Link from "next/link";
import { Settings, Mic, Layout, Palette, Image as ImageIcon, MonitorPlay } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import NewVideoForm from "@/components/ui/NewVideoForm";

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

  return (
    <div className="max-w-5xl mx-auto py-4 px-4 lg:py-6">

      {/* Header Area */}
      <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/workspaces"
              className="text-sm font-medium text-gray-500 hover:text-purple-600 transition-colors flex items-center gap-1"
            >
              ← All Workspaces
            </Link>
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
              Active Studio
            </span>
          </div>

          <h1 className="text-4xl font-bold text-purple-800 tracking-tight mb-2">{workspace.name}</h1>
          <p className="text-gray-600 font-medium mb-4">{workspace.content_theme}</p>

          <div className="flex flex-wrap gap-2">
            {workspace.aspect_ratio && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                <Layout size={14} className="text-purple-500" />
                {workspace.aspect_ratio}
              </div>
            )}
            {workspace.narration_voice_id && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                <Mic size={14} className="text-purple-500" />
                {workspace.narration_voice_id}
              </div>
            )}
            {workspace.visual_aesthetic && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                <ImageIcon size={14} className="text-purple-500" />
                {workspace.visual_aesthetic}
              </div>
            )}
            {workspace.linked_accounts && workspace.linked_accounts.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                <MonitorPlay size={14} className="text-purple-500" />
                {workspace.linked_accounts.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href={`/workspaces/${workspace.id}/settings`} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
            <Settings size={18} />
            Settings
          </Link>
          <Link href={`/workspaces/${workspace.id}/characters`} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
            <Mic size={18} />
            Voice Hub
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-4">

          {/* Content Generator Form Client Component */}
          <NewVideoForm workspace={workspace} />

          {/* Niche Settings and Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Palette size={18} className="text-purple-500" />
                Niche Settings
              </h3>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <strong>Theme:</strong> {workspace.content_theme} <br/>
                <strong>Aesthetic:</strong> {workspace.visual_aesthetic}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3">Workspace Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Videos Generated</span>
                  <span className="font-bold text-gray-900">{videoProjects ? videoProjects.length : 0}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                  <span className="text-gray-600">Credits Used</span>
                  <span className="font-bold text-gray-900">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Publishing Rate</span>
                  <span className="font-bold text-gray-900">0/week</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Dedicated Video Library */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-160px)] min-h-[500px]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <MonitorPlay size={20} className="text-purple-600" />
                Video Library
              </h2>
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-md">
                {videoProjects ? videoProjects.length : 0} Projects
              </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-2">
              {!videoProjects || videoProjects.length === 0 ? (
                <div className="text-center flex flex-col items-center justify-center h-full opacity-60">
                  <MonitorPlay size={32} className="text-gray-400 mb-3" />
                  <h3 className="text-sm font-bold text-gray-700">No videos yet</h3>
                  <p className="text-xs text-gray-500 max-w-[200px] mt-1">Generate your first script to see it here.</p>
                </div>
              ) : (
                videoProjects.map((video) => (
                  <Link key={video.id} href={`/workspaces/${workspace.id}/videos/${video.id}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col gap-3 block relative overflow-hidden">
                    {/* Status Indicator Bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      video.status === 'completed' ? 'bg-green-500' :
                      video.status === 'rendering' ? 'bg-blue-500 animate-pulse' :
                      'bg-yellow-500'
                    }`}></div>

                    <div className="pl-2">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2 text-sm leading-tight">
                          {video.topic || "Untitled Project"}
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-3 mt-2">
                        <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          video.status === 'completed' ? 'bg-green-100 text-green-700' :
                          video.status === 'rendering' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {video.status}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">{new Date(video.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="text-xs text-purple-600 font-medium flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        View Timeline →
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
