import React from "react";
import Link from "next/link";
import { Settings, Mic, Layout, Palette, Image as ImageIcon, Sparkles, Wand2, MonitorPlay } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export default async function WorkspaceHubPage({ params }: { params: { slug: string } }) {
  const { slug: workspaceId } = await params;
  
  const supabase = await createClient();
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  const { data: videoProjects } = await supabase
    .from('video_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  async function handleGenerate(formData: FormData) {
    "use server";
    const topic = formData.get("topic") as string;
    const narrativeArc = formData.get("narrative_arc") as string;
    const scriptHook = formData.get("script_hook") as string;
    
    if (!topic) return;

    const supabaseAdmin = await createClient(); // uses the same client
    
    // Handle Image Uploads
    const files = formData.getAll("images") as File[];
    const imageUrls: string[] = [];
    
    for (const file of files) {
      if (file.size > 0 && imageUrls.length < 3) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        
        const { data, error: uploadError } = await supabaseAdmin.storage
          .from('character-references')
          .upload(fileName, file);
          
        if (data) {
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from('character-references')
            .getPublicUrl(data.path);
          imageUrls.push(publicUrl);
        } else {
          console.error("Upload error:", uploadError);
        }
      }
    }
    
    const { error } = await supabaseAdmin.from('video_projects').insert([
      {
        workspace_id: workspaceId,
        topic: topic,
        narrative_arc: narrativeArc,
        script_hook: scriptHook,
        manual_image_urls: imageUrls,
        status: 'pending',
      }
    ]);

    if (error) {
      console.error("Error creating video project:", error.message, error.details, error.hint);
    }

    revalidatePath(`/workspaces/${workspaceId}`);
  }

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

          {/* Content Generator */}
          <div className="bg-white border border-purple-100 rounded-xl shadow-sm p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-purple-600"></div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-purple-600" size={24} />
              <h2 className="text-2xl font-bold text-gray-900">Create New Video</h2>
            </div>

            <form action={handleGenerate} className="space-y-3">
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Core Topic / Story</label>
                <p className="text-xs text-gray-500 mb-2">A detailed explanation of what this specific video will cover.</p>
                <textarea
                  name="topic"
                  required
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 p-3 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all resize-none min-h-[80px]"
                  placeholder={`e.g. How casinos use carpet patterns and lack of clocks to keep you gambling...`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Narrative Arc</label>
                  <p className="text-xs text-gray-500 mb-2">The pacing and structure of the story.</p>
                  <select 
                    name="narrative_arc" 
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 p-2.5 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 appearance-none"
                  >
                    <option value="The Mystery Reveal">The Mystery Reveal (Question → Truth)</option>
                    <option value="Chronological History">Chronological History (Past → Present)</option>
                    <option value="Problem and Solution">Problem &amp; Solution (Pain → Answer)</option>
                    <option value="Did You Know?">The &quot;Did You Know?&quot; (Fast Fact Stacking)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reference Images (Optional)</label>
                  <p className="text-xs text-gray-500 mb-2">Upload up to 3 images for consistent character generation.</p>
                  <input 
                    type="file" 
                    name="images"
                    multiple 
                    accept="image/*"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-700 p-2 rounded-xl text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Script Hook (First 5 seconds)</label>
                <p className="text-xs text-gray-500 mb-2">Type out the exact hook you want the AI to use, or leave it blank to auto-generate.</p>
                <textarea
                  name="script_hook"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 p-3 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all resize-none min-h-[60px]"
                  placeholder={`e.g. Have you ever noticed there are no clocks in a casino? Here is why...`}
                />
              </div>

              <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2.5 rounded-lg shadow-md transition-colors flex items-center gap-2"
                >
                  <Wand2 size={18} />
                  Generate Script
                </button>
              </div>
            </form>
          </div>

          {/* Niche Settings and Stats (Moved from sidebar) */}
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
