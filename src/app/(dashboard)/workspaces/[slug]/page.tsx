import React from "react";
import Link from "next/link";
import { Settings, Mic, Layout, Palette, Image as ImageIcon, MonitorPlay, Activity, CheckCircle2, Loader2, Lightbulb, BarChart2, Flame, ImagePlus } from "lucide-react";
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

        {/* Left Sidebar: Command Center & Video Library */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Workspace Command Center */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col flex-1">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
              <Activity size={16} className="text-purple-600" />
              Command Center
            </h3>
            
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative w-28 h-28 flex items-center justify-center mb-3">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-gray-100"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-purple-600 drop-shadow-sm"
                    strokeDasharray="60, 100"
                    strokeWidth="3"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-gray-900">45</span>
                  <span className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Mins</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-gray-800">Monthly Output</p>
                <p className="text-[10px] text-gray-500 mt-0.5">45 / 120 mins used</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 flex-1">
              <h4 className="font-bold text-gray-900 text-xs mb-4">Recent Activity</h4>
              <div className="space-y-4">
                <div className="flex gap-3 relative">
                  <div className="absolute top-6 left-2.5 bottom-[-16px] w-px bg-gray-200"></div>
                  <div className="bg-green-100 p-1.5 rounded-full z-10 shrink-0 h-fit">
                    <CheckCircle2 size={12} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Video Rendered</p>
                    <p className="text-[10px] text-gray-500">The Fall of Jericho &bull; 2h ago</p>
                  </div>
                </div>
                <div className="flex gap-3 relative">
                  <div className="absolute top-6 left-2.5 bottom-[-16px] w-px bg-gray-200"></div>
                  <div className="bg-purple-100 p-1.5 rounded-full z-10 shrink-0 h-fit">
                    <Activity size={12} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Script Generated</p>
                    <p className="text-[10px] text-gray-500">Samson&apos;s Final Stand &bull; 5h ago</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="bg-gray-100 p-1.5 rounded-full z-10 shrink-0 h-fit">
                    <CheckCircle2 size={12} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Workspace Created</p>
                    <p className="text-[10px] text-gray-500">Throne of Glory &bull; 2d ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Insights Brain */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
              <Lightbulb size={16} className="text-purple-600 fill-purple-100" />
              AI Insights
            </h3>
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg flex gap-3 items-start">
                <span className="text-lg">🎯</span>
                <p className="text-xs text-purple-900 font-medium leading-relaxed">Hooks under 5s have 30% higher retention in this niche.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 items-start">
                <span className="text-lg">💡</span>
                <p className="text-xs text-blue-900 font-medium leading-relaxed">Audiences love historical analogies. Use them in Act 2.</p>
              </div>
            </div>
          </div>

          {/* Channel Demographics */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
              <BarChart2 size={16} className="text-purple-600" />
              Audience Demographics
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                  <span>18-24</span>
                  <span>45%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: '45%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                  <span>25-34</span>
                  <span>35%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-purple-400 h-2 rounded-full" style={{ width: '35%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                  <span>35-44</span>
                  <span>20%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-purple-300 h-2 rounded-full" style={{ width: '20%' }}></div>
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
