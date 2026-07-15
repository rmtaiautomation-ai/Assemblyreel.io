"use client";

import React, { useState } from "react";
import { Play, Image as ImageIcon, Volume2, Wand2, X, Clock, Maximize2, SkipBack, Settings, Type, Music, Loader2 } from "lucide-react";
import { generateSceneAudio } from "@/app/actions/audio-actions";

export default function TimelineEditor({ 
  initialProject, 
  initialScenes 
}: { 
  initialProject: any, 
  initialScenes: any[] 
}) {
  const [scenes, setScenes] = useState<any[]>(initialScenes);
  const [selectedScene, setSelectedScene] = useState<any | null>(null);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [timelineHeight, setTimelineHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);

  const handleGenerateAllAudio = async () => {
    setIsGeneratingAll(true);
    for (const scene of scenes) {
      if (!scene.audio_url) {
        setGeneratingSceneId(scene.id);
        const res = await generateSceneAudio(scene.id, scene.voice_over_beat);
        if (res.success) {
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, audio_url: res.audioUrl } : s));
        } else {
          alert(`Error on Scene ${scene.sequence_number}: ${res.error}`);
          break; // Stop generating if there's an error
        }
      }
    }
    setGeneratingSceneId(null);
    setIsGeneratingAll(false);
  };

  const handleRegenerateSingleAudio = async (scene: any) => {
    setGeneratingSceneId(scene.id);
    const res = await generateSceneAudio(scene.id, scene.voice_over_beat);
    if (res.success) {
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, audio_url: res.audioUrl } : s));
      // Update selected scene to reflect change in modal
      setSelectedScene({ ...scene, audio_url: res.audioUrl });
    }
    setGeneratingSceneId(null);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      setTimelineHeight(prev => Math.max(200, Math.min(prev - e.movementY, 800)));
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 1 Second = 30px width for the timeline scale
  const SCALE = 30; 

  // Calculate the actual content duration
  const contentDuration = scenes.reduce((acc, scene) => acc + (scene.video_duration || 5), 0);
  
  // Force the timeline ruler to be at least 60 seconds, and always add a 15s buffer at the end
  const timelineDuration = Math.max(60, contentDuration + 15);

  return (
    <div className="flex flex-col h-full">
      
      {/* Top Section: Preview Player & Master Script Info */}
      <div className="flex flex-col lg:flex-row gap-6 px-6 pb-6 pt-6 flex-1 overflow-y-auto min-h-[200px]">
        
        {/* Left: Video Preview Player Placeholder */}
        <div className="w-full lg:w-1/2 bg-black rounded-2xl aspect-video relative flex flex-col items-center justify-center border border-gray-800 overflow-hidden shadow-xl">
          {selectedScene ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gray-900 text-center">
               <ImageIcon size={48} className="text-gray-600 mb-4" />
               <p className="text-gray-400 text-sm font-medium">Previewing Scene {selectedScene.sequence_number}</p>
               <p className="text-white text-lg mt-2 italic font-serif">"{selectedScene.voice_over_beat}"</p>
            </div>
          ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                <Play size={48} className="text-gray-700 mb-4" />
                <p className="text-gray-500 font-medium">Select a scene on the timeline to preview</p>
             </div>
          )}
          
          {/* Player Controls (Mock) */}
          <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/80 to-transparent flex items-center px-4 gap-4">
             <button className="text-white hover:text-purple-400 transition-colors"><SkipBack size={20}/></button>
             <button className="text-white hover:text-purple-400 transition-colors"><Play size={24}/></button>
             <div className="h-1 flex-1 bg-gray-700 rounded-full overflow-hidden">
               <div className="h-full bg-purple-500 w-1/3"></div>
             </div>
             <span className="text-xs text-gray-300 font-mono">00:12 / {Math.floor(contentDuration / 60).toString().padStart(2, '0')}:{Math.floor(contentDuration % 60).toString().padStart(2, '0')}</span>
             <button className="text-white hover:text-purple-400 transition-colors"><Maximize2 size={18}/></button>
          </div>
        </div>

        {/* Right: Project Details & Quick Actions */}
        <div className="w-full lg:w-1/2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
               <h2 className="text-xl font-bold text-gray-900 line-clamp-1">{initialProject.topic}</h2>
               <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${
                  initialProject.status === 'completed' ? 'bg-green-100 text-green-700 border border-green-200' :
                  initialProject.status === 'rendering' ? 'bg-blue-100 text-blue-700 border border-blue-200 animate-pulse' :
                  'bg-yellow-100 text-yellow-700 border border-yellow-200'
                }`}>
                  {initialProject.status || 'Drafting'}
                </span>
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2 mb-6">
               <Settings size={14} /> {initialProject.narrative_arc || "Standard Arc"}
            </p>

            <h3 className="font-semibold text-gray-800 text-sm mb-2">Global Master Script</h3>
            <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl max-h-[150px] overflow-y-auto text-sm text-gray-600 custom-scrollbar">
               {initialProject.master_script || (
                 <span className="italic opacity-60">Master script is currently drafting via AI. Showing timeline cuts based on hooks...</span>
               )}
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-wrap">
            <button className="px-4 py-2 border border-gray-200 text-gray-700 bg-white rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm">
              Export Script
            </button>
            <button 
              onClick={handleGenerateAllAudio}
              disabled={isGeneratingAll}
              className="px-6 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isGeneratingAll ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
              {isGeneratingAll ? "Generating..." : "Generate All Audio"}
            </button>
            <button className="px-6 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 shadow-md transition-colors flex items-center gap-2">
              <Wand2 size={16} /> Render Final Video
            </button>
          </div>
        </div>

      </div>

      {/* Resizer Handle */}
      <div 
        className="h-2 w-full bg-gray-50 border-t border-gray-200 cursor-row-resize hover:bg-gray-200 transition-colors flex items-center justify-center flex-none"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-10 h-0.5 rounded-full bg-gray-300"></div>
      </div>

      {/* Horizontal Timeline Editor */}
      <div 
        className="bg-white shadow-2xl overflow-hidden flex flex-col flex-none"
        style={{ height: `${timelineHeight}px` }}
      >
        {/* Timeline Toolbar */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="w-3 h-3 rounded-full bg-red-400"></div>
             <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
             <div className="w-3 h-3 rounded-full bg-green-400"></div>
             <span className="ml-4 text-xs font-bold text-gray-500 tracking-widest uppercase">Editor Timeline</span>
          </div>
          <div className="flex items-center gap-4 text-gray-500">
             <span className="text-xs font-mono bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">Scale: 1s = {SCALE}px</span>
          </div>
        </div>

        {/* Timeline Area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto relative pb-4 pt-2 custom-scrollbar">
           
           <div className="min-w-max px-4">
              {/* Ruler Track */}
              <div className="flex items-end mb-2 relative group w-max">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white h-6 border-b border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></div>
                 <div 
                    className="relative h-6 border-b border-gray-200 cursor-pointer ml-2"
                    style={{ width: `${timelineDuration * SCALE}px` }}
                    onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       setCursorPosition(e.clientX - rect.left);
                    }}
                 >
                    {[...Array(Math.ceil(timelineDuration) + 1)].map((_, i) => (
                       <div key={i} className="absolute flex flex-col items-center" style={{ left: `${i * SCALE}px` }}>
                          <span className="text-[9px] text-gray-400 font-mono mb-1">{i}s</span>
                          <div className="w-[1px] h-2 bg-gray-300"></div>
                       </div>
                    ))}

                    {/* Playhead / Cursor */}
                    <div 
                      className="absolute top-0 h-[336px] z-50 pointer-events-none flex flex-col items-center"
                      style={{ left: `${cursorPosition}px`, transform: 'translateX(-50%)' }}
                    >
                       <div className="w-3 h-3 bg-gray-800 rounded-sm mb-0.5 relative flex items-center justify-center">
                          <div className="absolute -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[4px] border-t-gray-800"></div>
                       </div>
                       <div className="w-[1.5px] h-full bg-gray-800 shadow-[0_0_3px_rgba(0,0,0,0.3)]"></div>
                    </div>
                 </div>
              </div>

              {/* Spacer above Text Track */}
              <div className="flex items-center mb-1 group relative">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white"></div>
                 <div 
                    className="flex flex-1 relative h-7 ml-2 cursor-pointer" 
                    style={{ width: `${timelineDuration * SCALE}px` }}
                    onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       setCursorPosition(e.clientX - rect.left);
                    }}
                 >
                 </div>
              </div>

              {/* Caption / Text Track */}
              <div className="flex items-center mb-1 group relative">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white py-1 flex items-center gap-2 border-r border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <Type size={14} className="text-purple-500" />
                    <span className="text-[10px] font-bold text-gray-700">T1 (Text)</span>
                 </div>
                 <div 
                   className="flex flex-1 relative h-6 bg-gray-100 rounded-lg ml-2 items-center border border-gray-200 shadow-inner cursor-pointer" 
                   style={{ width: `${timelineDuration * SCALE}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                   }}
                 >
                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                       <span className="text-[9px] text-gray-400 font-medium italic">Caption / Text layer...</span>
                    </div>
                 </div>
              </div>

              {/* Video Track */}
              <div className="flex items-center mb-1 group relative">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white py-4 flex items-center gap-2 border-r border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <ImageIcon size={14} className="text-blue-500" />
                    <span className="text-xs font-bold text-gray-700">V1 (Visuals)</span>
                 </div>
                 <div 
                   className="flex flex-1 relative h-20 bg-gray-50 rounded-lg ml-2 items-center border border-gray-100 shadow-inner cursor-pointer" 
                   style={{ width: `${timelineDuration * SCALE}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                   }}
                 >
                    {scenes.map((scene) => (
                       <div 
                         key={`video-${scene.id}`}
                         onClick={(e) => {
                           e.stopPropagation();
                           setSelectedScene(scene);
                         }}
                         className="h-[80%] absolute top-[10%] rounded-md border border-blue-400 bg-blue-50 hover:bg-blue-100 hover:border-blue-500 cursor-pointer transition-all overflow-hidden group/block shadow-sm"
                         style={{ 
                           left: `${scenes.slice(0, scene.sequence_number - 1).reduce((acc, s) => acc + (s.video_duration || 5), 0) * SCALE}px`,
                           width: `${(scene.video_duration || 5) * SCALE}px`
                         }}
                       >
                         <div className="w-full h-full p-1.5 flex flex-col">
                            <span className="text-[9px] font-bold text-blue-700 truncate">Sc {scene.sequence_number}</span>
                            <div className="flex-1 w-full bg-blue-100/50 rounded mt-1 overflow-hidden flex items-center justify-center">
                              {scene.generation_status === 'Completed' ? (
                                <ImageIcon size={14} className="text-blue-500" />
                              ) : (
                                <span className="text-[8px] text-blue-600 font-bold uppercase tracking-widest">{scene.generation_status}</span>
                              )}
                            </div>
                         </div>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Audio Track */}
              <div className="flex items-center mb-1 group relative">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white py-4 flex items-center gap-2 border-r border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <Volume2 size={14} className="text-green-500" />
                    <span className="text-xs font-bold text-gray-700">A1 (Voice)</span>
                 </div>
                 <div 
                   className="flex flex-1 relative h-16 bg-gray-50 rounded-lg ml-2 items-center border border-gray-100 shadow-inner cursor-pointer" 
                   style={{ width: `${timelineDuration * SCALE}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                   }}
                 >
                    {scenes.map((scene) => (
                       <div 
                         key={`audio-${scene.id}`}
                         onClick={(e) => {
                           e.stopPropagation();
                           setSelectedScene(scene);
                         }}
                         className="h-[70%] absolute top-[15%] rounded-md border border-green-400 bg-green-50 hover:bg-green-100 hover:border-green-500 cursor-pointer transition-all overflow-hidden px-2 py-1 shadow-sm"
                         style={{ 
                           left: `${scenes.slice(0, scene.sequence_number - 1).reduce((acc, s) => acc + (s.video_duration || 5), 0) * SCALE}px`,
                           width: `${(scene.video_duration || 5) * SCALE}px`
                         }}
                       >
                         <span className="text-[10px] text-green-800 font-medium truncate block whitespace-nowrap opacity-80 group-hover:opacity-100">
                           {scene.voice_over_beat}
                         </span>
                         <div className="absolute bottom-1.5 left-2 right-2 h-2 opacity-40 flex items-center gap-[1px]">
                           {[...Array(10)].map((_,i) => <div key={i} className={`flex-1 ${scene.audio_url ? 'bg-green-500' : 'bg-gray-400'} rounded-full`} style={{ height: `${Math.random() * 100}%` }}></div>)}
                         </div>
                         {generatingSceneId === scene.id && (
                           <div className="absolute inset-0 bg-green-900/50 flex items-center justify-center rounded-md">
                             <Loader2 size={14} className="text-white animate-spin" />
                           </div>
                         )}
                       </div>
                    ))}
                 </div>
              </div>

              {/* Background Music Track */}
              <div className="flex items-center mb-1 group relative">
                 <div className="w-24 shrink-0 sticky left-0 z-10 bg-white py-3 flex items-center gap-2 border-r border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <Music size={14} className="text-blue-500" />
                    <span className="text-xs font-bold text-gray-700">A2 (Music)</span>
                 </div>
                 <div 
                   className="flex flex-1 relative h-16 bg-gray-100 rounded-lg ml-2 items-center border border-gray-200 shadow-inner cursor-pointer" 
                   style={{ width: `${timelineDuration * SCALE}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                   }}
                 >
                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                       <span className="text-[10px] text-gray-400 font-medium italic">Background music slot...</span>
                    </div>
                 </div>
              </div>

              {/* Empty Clickable Bottom Space */}
              <div className="flex items-center group relative mb-1">
                 <div className="w-24 shrink-0 sticky left-0 z-10 py-3 pr-2"></div>
                 <div 
                    className="flex flex-1 relative h-6 ml-2 cursor-pointer" 
                    style={{ width: `${timelineDuration * SCALE}px` }}
                    onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       setCursorPosition(e.clientX - rect.left);
                    }}
                 >
                 </div>
              </div>

           </div>
        </div>
      </div>

      {/* Editor Modal (Center Pop-up) */}
      {selectedScene && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
               <div className="flex items-center gap-3">
                  <div className="bg-purple-100 text-purple-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold">
                    {selectedScene.sequence_number}
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">Edit Scene</h3>
               </div>
               <button 
                 onClick={() => setSelectedScene(null)}
                 className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
               >
                 <X size={20} />
               </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
               
               {/* Voiceover Field */}
               <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                     <Volume2 size={16} className="text-green-500"/> Voiceover Text
                  </label>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-200 focus:border-green-400 focus:ring-2 focus:ring-green-100 rounded-xl p-4 text-sm text-gray-800 transition-all resize-none min-h-[100px]"
                    defaultValue={selectedScene.voice_over_beat}
                    onChange={(e) => setSelectedScene({...selectedScene, voice_over_beat: e.target.value})}
                  />
                  <div className="flex justify-between items-center mt-2">
                     <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> Estimated length: {selectedScene.video_duration}s</span>
                     <button 
                       onClick={() => handleRegenerateSingleAudio(selectedScene)}
                       disabled={generatingSceneId === selectedScene.id}
                       className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1"
                     >
                       {generatingSceneId === selectedScene.id ? <Loader2 size={12} className="animate-spin" /> : null}
                       {selectedScene.audio_url ? "Regenerate Audio" : "Generate Audio"}
                     </button>
                  </div>
                  {selectedScene.audio_url && (
                    <audio src={selectedScene.audio_url} controls className="w-full mt-3 h-8" />
                  )}
               </div>

               {/* Visual Prompt Field */}
               <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                     <ImageIcon size={16} className="text-blue-500"/> AI Image Prompt
                  </label>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl p-4 text-sm text-gray-800 transition-all resize-none min-h-[80px]"
                    defaultValue={selectedScene.final_video_prompt}
                  />
                  <div className="flex justify-between items-center mt-2">
                     <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                        selectedScene.generation_status === 'Completed' ? 'bg-green-100 text-green-700' :
                        'bg-yellow-100 text-yellow-700'
                     }`}>
                       Status: {selectedScene.generation_status}
                     </span>
                     <button className="text-xs font-semibold text-blue-600 hover:text-blue-700">Regenerate Visual</button>
                  </div>
               </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
               <button 
                 onClick={() => setSelectedScene(null)}
                 className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={() => setSelectedScene(null)}
                 className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl shadow-md transition-colors"
               >
                 Save Changes
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
