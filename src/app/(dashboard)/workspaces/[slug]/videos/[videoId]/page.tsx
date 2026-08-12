import React from "react";
import Link from "next/link";
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

  const { data: media } = await supabase
    .from('media')
    .select('*')
    .eq('project_id', videoId);

  const { data: timelineItems } = await supabase
    .from('timeline_items')
    .select('*')
    .eq('project_id', videoId);

  // Independent text-overlay clips (the OV track). Like every other table here,
  // this query returns null rather than throwing when the migration hasn't run
  // yet, so the editor degrades to "no overlay clips" instead of failing to load.
  const { data: overlayClips } = await supabase
    .from('overlay_clips')
    .select('*')
    .eq('project_id', videoId);

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

  // The editor header (back nav, title, live status, Export) is rendered by
  // TimelineEditor itself, not here. It used to live in this server component,
  // which is exactly why its buttons were dead: "Render Video" needs the render
  // handler and "Sync Data" needed client state, and neither is reachable from a
  // server component. Moving it into the client tree is what makes them real.
  return (
    <div className="fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      <div className="flex-1 flex flex-col min-h-0 relative">
         <TimelineEditor
           workspaceId={workspaceId}
           initialProject={project}
           initialScenes={scenes}
           initialMedia={media || []}
           initialTimelineItems={timelineItems || []}
           initialOverlayClips={overlayClips || []}
         />
      </div>
    </div>
  );
}
