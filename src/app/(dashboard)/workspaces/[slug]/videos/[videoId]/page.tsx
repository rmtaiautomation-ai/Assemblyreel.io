import React from "react";
import Link from "next/link";
import { ArrowLeft, Play, Download, Wand2, Image as ImageIcon, Volume2, RefreshCw, LayoutTemplate } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import TimelineEditor from "@/components/ui/TimelineEditor";

export default async function TimelineEditorPage({ params }: { params: { slug: string, videoId: string } }) {
  const { slug: workspaceId, videoId } = await params;
  
  const supabase = await createClient();
  
  const { data: project } = await supabase
    .from('video_projects')
    .select('*')
    .eq('id', videoId)
    .single();

  const { data: dbScenes } = await supabase
    .from('scenes')
    .select('*')
    .eq('project_id', videoId)
    .order('sequence_number', { ascending: true });

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Project not found</h2>
        <Link href={`/workspaces/${workspaceId}`} className="text-purple-600 hover:underline">
          Return to Workspace
        </Link>
      </div>
    );
  }

  const scenes = dbScenes && dbScenes.length > 0 ? dbScenes : [
    {
      id: "mock-1",
      sequence_number: 1,
      video_duration: 4.5,
      voice_over_beat: project.script_hook || "Have you ever noticed there are no clocks in a casino? Here is why...",
      final_video_prompt: "A cinematic wide shot of a lavish casino floor, warm golden lighting, no windows visible, high quality.",
      generation_status: "Completed",
      video_url: null,
      audio_url: null
    },
    {
      id: "mock-2",
      sequence_number: 2,
      video_duration: 3.2,
      voice_over_beat: "They are designed specifically to make you lose track of time.",
      final_video_prompt: "Close up of a spinning roulette wheel in slow motion, blurred background, hyper realistic.",
      generation_status: "Rendering",
      video_url: null,
      audio_url: null
    },
    {
      id: "mock-3",
      sequence_number: 3,
      video_duration: 5.0,
      voice_over_beat: "Without natural light or clocks, your brain forgets how long you've been sitting there.",
      final_video_prompt: "A hypnotized looking person sitting at a slot machine, colorful lights reflecting on their face, moody atmosphere.",
      generation_status: "Pending API",
      video_url: null,
      audio_url: null
    }
  ];

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      
      {/* Top Navigation Bar - Light Theme */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-none shadow-sm h-14">
        <div className="flex items-center gap-4">
          <Link 
            href={`/workspaces/${workspaceId}`}
            className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-600"
            title="Back to Hub"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
             <h1 className="text-sm font-bold text-gray-800">{project.topic || "Untitled Video"}</h1>
             <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
               {project.status || 'Drafting'}
             </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm">
            <RefreshCw size={14} /> Regenerate Script
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm">
            <Download size={14} /> Export Video
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
         <TimelineEditor initialProject={project} initialScenes={scenes} />
      </div>
    </div>
  );
}
