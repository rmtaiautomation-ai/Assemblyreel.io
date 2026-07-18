"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Image as ImageIcon, Volume2, Wand2, Clock, Maximize2, SkipBack, Type, Music, Loader2, Upload, LayoutTemplate, Settings, FolderOpen, Film, Layers, MonitorPlay, ChevronDown, Trash2, Lock, Unlock, VolumeX } from "lucide-react";
import { generateSceneAudio } from "@/app/actions/audio-actions";
import { Rnd } from "react-rnd";

type TabState = 'media' | 'scene' | 'export';
type AspectRatio = '16:9' | '9:16' | '1:1';
type MediaType = 'image' | 'audio' | 'video';

interface MediaAsset {
  id: string;
  file: File;
  url: string;
  type: MediaType;
  duration?: number;
}

interface TimelineClip {
  id: string;
  assetId: string;
  asset: MediaAsset;
  trackId: string;
  startTime: number;
  duration: number;
}

export default function TimelineEditor({ 
  initialProject, 
  initialScenes 
}: { 
  initialProject: any, 
  initialScenes: any[] 
}) {
  const [scenes, setScenes] = useState<any[]>(initialScenes);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [selectedScene, setSelectedScene] = useState<any | null>(null);
  const [selectedSceneTrack, setSelectedSceneTrack] = useState<'V1' | 'A1' | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [isPlaying, setIsPlaying] = useState(false);
  const lastTimeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabState>('scene');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'scene' | 'clip', id: string, trackId?: string } | null>(null);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [a1Scenes, setA1Scenes] = useState<any[]>([...initialScenes]);
  const [draggingAsset, setDraggingAsset] = useState<MediaAsset | null>(null);
  const [draggingScene, setDraggingScene] = useState<{ id: string, track: string, duration: number } | null>(null);
  const [v1DragInsertIndex, setV1DragInsertIndex] = useState<number | null>(null);
  const [a1DragInsertIndex, setA1DragInsertIndex] = useState<number | null>(null);

  const [trackStates, setTrackStates] = useState({
    V1: { locked: false, muted: false },
    A1: { locked: false, muted: false },
    A2: { locked: false, muted: false }
  });

  const toggleTrackState = (trackId: 'V1' | 'A1' | 'A2', key: 'locked' | 'muted') => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [key]: !prev[trackId][key]
      }
    }));
  };
  
  const getSceneDuration = (scene: any) => {
    if (scene.custom_media_url && scene.assetId) {
      const asset = mediaAssets.find(a => a.id === scene.assetId);
      if (asset && asset.duration) {
        return asset.duration;
      }
    }
    return scene.video_duration || 5;
  };

  const getUnshiftedLeftPosition = (track: 'V1' | 'A1', index: number) => {
    const trackScenes = track === 'V1' ? scenes : a1Scenes;
    let time = 0;
    for (let i = 0; i < index; i++) {
       if (draggingScene && draggingScene.track === track && trackScenes[i].id === draggingScene.id) {
          continue;
       }
       time += getSceneDuration(trackScenes[i]);
    }
    return time * scale;
  };

  const getSceneLeftPosition = (track: 'V1' | 'A1', sceneIndex: number) => {
    let time = getUnshiftedLeftPosition(track, sceneIndex) / scale;
    const trackScenes = track === 'V1' ? scenes : a1Scenes;
    const insertIdx = track === 'V1' ? v1DragInsertIndex : a1DragInsertIndex;
    
    if (insertIdx !== null && sceneIndex >= insertIdx) {
      if (draggingAsset) {
        time += (draggingAsset.duration || 5);
      } else if (draggingScene && draggingScene.track === track && trackScenes[sceneIndex].id !== draggingScene.id) {
        time += (draggingScene.duration || 5);
      }
    }
    return time * scale;
  };

  const getVisualSequenceNumber = (track: 'V1' | 'A1', originalIndex: number) => {
    const trackScenes = track === 'V1' ? scenes : a1Scenes;
    const insertIdx = track === 'V1' ? v1DragInsertIndex : a1DragInsertIndex;
    
    if (!draggingScene || draggingScene.track !== track || insertIdx === null) {
      return trackScenes[originalIndex].sequence_number;
    }

    const dragIndex = trackScenes.findIndex(s => s.id === draggingScene.id);
    if (dragIndex === -1) return trackScenes[originalIndex].sequence_number;

    if (originalIndex === dragIndex) {
      let finalIndex = insertIdx;
      if (insertIdx > dragIndex) finalIndex -= 1;
      return finalIndex + 1;
    }

    let finalIndex = originalIndex;
    if (originalIndex > dragIndex) finalIndex -= 1;
    
    let simulatedInsert = insertIdx;
    if (simulatedInsert > dragIndex) simulatedInsert -= 1;

    if (finalIndex >= simulatedInsert) finalIndex += 1;
    
    return finalIndex + 1;
  };

  const mediaRefs = useRef<{ [id: string]: HTMLMediaElement | null }>({});

  // Timeline scaling and zooming
  const [scale, setScale] = useState(30); // 1 Second = 30px width
  
  // Resizing State for scenes
  const [resizingSceneId, setResizingSceneId] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [initialDuration, setInitialDuration] = useState<number>(0);

  const formatDuration = (d: number) => {
    const m = Math.floor(d / 60).toString().padStart(2, '0');
    const s = Math.floor(d % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAssets: MediaAsset[] = Array.from(e.target.files).map(file => {
        let type: MediaType = 'image';
        if (file.type.startsWith('audio/')) type = 'audio';
        if (file.type.startsWith('video/')) type = 'video';
        return {
           file,
           id: Math.random().toString(36).substring(7),
           url: URL.createObjectURL(file),
           type
        };
      });
      setMediaAssets(prev => [...prev, ...newAssets]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingScene ? 'move' : 'copy';
  };

  const applyMagneticSnap = (trackId: string, requestedStartTime: number, ignoreClipId?: string) => {
    const trackClips = timelineClips.filter(c => c.trackId === trackId && c.id !== ignoreClipId);
    if (trackClips.length === 0) return 0;

    let closestLeftClip = null;
    let maxRightEdge = 0;
    
    for (const clip of trackClips) {
      const rightEdge = clip.startTime + clip.duration;
      if (rightEdge <= requestedStartTime + 0.5) { 
        if (rightEdge >= maxRightEdge) {
          maxRightEdge = rightEdge;
          closestLeftClip = clip;
        }
      }
    }
    
    if (closestLeftClip) {
       return closestLeftClip.startTime + closestLeftClip.duration;
    }
    return 0; // Snap to 0 if dropped before everything
  };

  const handleDrop = async (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setV1DragInsertIndex(null);
    setA1DragInsertIndex(null);
    setDraggingAsset(null);
    setDraggingScene(null);
    const dataStr = e.dataTransfer.getData('text/plain');
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        if (data.type === 'reorder') {
           const trackScenes = data.track === 'V1' ? scenes : a1Scenes;
           const setTrackScenes = data.track === 'V1' ? setScenes : setA1Scenes;
           
           const rect = e.currentTarget.getBoundingClientRect();
           const dropX = e.clientX - rect.left;
           const startTime = dropX / scale;
           
           let insertIndex = trackScenes.length;
           for (let i = 0; i < trackScenes.length; i++) {
              const sceneDuration = getSceneDuration(trackScenes[i]);
              const sceneLeft = getSceneLeftPosition(data.track as 'V1' | 'A1', i) / scale;
              const sceneMidpoint = sceneLeft + (sceneDuration / 2);
              if (startTime < sceneMidpoint) {
                 insertIndex = i;
                 break;
              }
           }
           
           setTrackScenes(prev => {
              const newScenes = [...prev];
              const [movedScene] = newScenes.splice(data.index, 1);
              if (insertIndex > data.index) insertIndex -= 1;
              newScenes.splice(insertIndex, 0, movedScene);
              return newScenes.map((s, idx) => ({ ...s, sequence_number: idx + 1 }));
           });
           return;
        }
        
        const asset = data as MediaAsset;
        
        // Enforce track rules
        if (trackId === 'A1') {
          alert("A1 is reserved for AI generated Voiceover. Please drop custom audio onto the A2 track.");
          return;
        }
        if (asset.type === 'audio' && trackId === 'V1') {
          alert("Audio files cannot be dropped on the video track.");
          return;
        }
        if ((asset.type === 'video' || asset.type === 'image') && trackId === 'A2') {
          alert("Visual media (video/images) can only be dropped on the V1 video track.");
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        let startTime = dropX / scale;
        
        // Apply Magnetic Snapping for non-V1 tracks
        if (trackId !== 'V1') {
          startTime = applyMagneticSnap(trackId, startTime);
        }
        
        let durationSecs = 5; // Default for images or missing duration
        if (asset.duration) {
          durationSecs = asset.duration;
        } else if (asset.type === 'audio' || asset.type === 'video') {
           try {
              durationSecs = await new Promise<number>((resolve) => {
                 const media = document.createElement(asset.type === 'audio' ? 'audio' : 'video');
                 media.src = asset.url;
                 media.onloadedmetadata = () => resolve(media.duration);
                 media.onerror = () => resolve(5);
              });
           } catch (err) {}
        }
        
        if (trackId === 'V1') {
          let insertIndex = scenes.length;
          
          for (let i = 0; i < scenes.length; i++) {
             const sceneDuration = scenes[i].video_duration || 5;
             const sceneLeft = getSceneLeftPosition('V1', i) / scale;
             const sceneMidpoint = sceneLeft + (sceneDuration / 2);
             
             if (startTime < sceneMidpoint) {
                insertIndex = i;
                break;
             }
          }

          const newScene = {
            id: Math.random().toString(36).substring(7),
            sequence_number: 0,
            video_duration: durationSecs,
            voice_over_beat: asset.file.name,
            final_video_prompt: 'Custom Media',
            generation_status: 'Completed',
            custom_media_url: asset.url,
            custom_media_type: asset.type,
            audio_url: asset.type === 'video' ? asset.url : undefined,
            assetId: asset.id
          };

          setScenes(prev => {
             const newScenes = [...prev];
             newScenes.splice(insertIndex, 0, newScene);
             return newScenes.map((s, idx) => ({ ...s, sequence_number: idx + 1 }));
          });
        } else {
          const newClip: TimelineClip = {
            id: Math.random().toString(36).substring(7),
            assetId: asset.id,
            asset,
            trackId,
            startTime,
            duration: durationSecs
          };
          
          setTimelineClips(prev => [...prev, newClip]);
        }
      } catch (err) {
        console.error("Failed to parse dropped asset data", err);
      }
    }
  };

  const handleGenerateAllAudio = async () => {
    setIsGeneratingAll(true);
    for (const scene of scenes) {
      if (!scene.audio_url) {
        setGeneratingSceneId(scene.id);
        const res = await generateSceneAudio(scene.id, scene.voice_over_beat);
        if (res.success) {
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, audio_url: res.audioUrl } : s));
          if (selectedScene?.id === scene.id) {
            setSelectedScene((prev: any) => ({ ...prev, audio_url: res.audioUrl }));
          }
        } else {
          alert(`Error on Scene ${scene.sequence_number}: ${res.error}`);
          break;
        }
      }
    }
    setGeneratingSceneId(null);
    setIsGeneratingAll(false);
  };

  const handleRegenerateSingleAudio = async (sceneId: string, voiceOver: string) => {
    setGeneratingSceneId(sceneId);
    const res = await generateSceneAudio(sceneId, voiceOver);
    if (res.success) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audio_url: res.audioUrl } : s));
      setSelectedScene((prev: any) => ({ ...prev, audio_url: res.audioUrl }));
    }
    setGeneratingSceneId(null);
  };

  const updateSceneDetails = (sceneId: string, field: string, value: any) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, [field]: value } : s));
    setSelectedScene((prev: any) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        setTimelineHeight(prev => Math.max(200, Math.min(prev - e.movementY, window.innerHeight - 300)));
      }
      
      if (resizingSceneId) {
        const deltaX = e.clientX - resizeStartX;
        const deltaSeconds = deltaX / scale;
        const newDuration = Math.max(1, initialDuration + deltaSeconds);

        setScenes(prev => prev.map(s => 
          s.id === resizingSceneId ? { ...s, video_duration: newDuration } : s
        ));
      }
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingSceneId(null);
    };
    
    if (isResizing || resizingSceneId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingSceneId, resizeStartX, initialDuration, scale]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    
    return () => {
       window.removeEventListener('keydown', handleKeyDown);
       window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  const handleDeleteItem = () => {
    if (!contextMenu) return;
    if (contextMenu.trackId && trackStates[contextMenu.trackId as 'V1'|'A1'|'A2']?.locked) {
       alert("Track is locked.");
       setContextMenu(null);
       return;
    }
    if (contextMenu.type === 'scene') {
      setScenes(prev => {
        const newScenes = prev.filter(s => s.id !== contextMenu.id);
        return newScenes.map((s, idx) => ({ ...s, sequence_number: idx + 1 }));
      });
      if (selectedScene?.id === contextMenu.id) {
         setSelectedScene(null);
      }
    } else if (contextMenu.type === 'clip') {
      setTimelineClips(prev => prev.filter(c => c.id !== contextMenu.id));
    }
    setContextMenu(null);
  };

  const contentDuration = scenes.reduce((acc, scene) => acc + getSceneDuration(scene), 0);
  const clipsMaxTime = timelineClips.length > 0 ? Math.max(...timelineClips.map(c => c.startTime + c.duration)) : 0;
  
  // The visual width of the timeline ruler (includes 15s buffer padding)
  const timelineDuration = Math.max(60, contentDuration + 15, clipsMaxTime + 15);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      const animate = (time: number) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        setCursorPosition(prev => {
          const newPos = prev + (delta * scale);
          if (newPos >= timelineDuration * scale) {
            setIsPlaying(false);
            return timelineDuration * scale; // Stop exactly at the end of the timeline width
          }
          return newPos;
        });
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, scale, timelineDuration]);

  // Synchronized Playback Logic
  const currentTime = cursorPosition / scale;

  useEffect(() => {
    Object.values(mediaRefs.current).forEach(media => {
      if (!media) return;
      const startTime = parseFloat(media.dataset.start || "0");
      const duration = parseFloat(media.dataset.duration || "0");
      
      const isOverlapping = currentTime >= startTime && currentTime < (startTime + duration);

      if (isPlaying && isOverlapping) {
         const targetTime = currentTime - startTime;
         if (Math.abs(media.currentTime - targetTime) > 0.3) {
            media.currentTime = targetTime;
         }
         if (media.paused) {
            media.play().catch(e => console.log("Playback blocked:", e));
         }
      } else {
         if (!media.paused) {
            media.pause();
         }
         if (!isPlaying && isOverlapping) {
             const targetTime = currentTime - startTime;
             if (Math.abs(media.currentTime - targetTime) > 0.1) {
                 media.currentTime = targetTime;
             }
         }
      }
    });
  }, [cursorPosition, isPlaying, scale]);

  const activeScene = scenes.find((s, idx) => {
    const startTime = scenes.slice(0, idx).reduce((acc, prev) => acc + (prev.video_duration || 5), 0);
    const endTime = startTime + (s.video_duration || 5);
    return currentTime >= startTime && currentTime < endTime;
  });

  const activeClipV1 = timelineClips.find(c => c.trackId === 'V1' && currentTime >= c.startTime && currentTime < (c.startTime + c.duration));

  const displayScene = activeScene;

  const getSceneColor = (status: string) => {
    if (status === 'Completed') return 'border-emerald-400 bg-emerald-50 text-emerald-700';
    if (status === 'Rendering') return 'border-blue-400 bg-blue-50 text-blue-700';
    return 'border-gray-300 bg-gray-100 text-gray-700'; // Pending
  };

  const getAspectRatioStyle = () => {
    switch (aspectRatio) {
      case '1:1': return '1 / 1';
      case '9:16': return '9 / 16';
      case '16:9': return '16 / 9';
      default: return '16 / 9';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      {/* Hidden Media Elements for Audio Sync */}
      <div className="hidden">
         {/* Scenes Audio (A1) */}
         {a1Scenes.map((scene, idx) => scene.audio_url && (
            <audio 
              key={`audio-scene-${scene.id}`}
              src={scene.audio_url}
              ref={el => { mediaRefs.current[`scene-${scene.id}`] = el; }}
              data-start={a1Scenes.slice(0, idx).reduce((acc, s) => acc + (s.video_duration || 5), 0)}
              data-duration={scene.video_duration || 5}
              muted={trackStates.A1.muted}
            />
         ))}
         {/* Timeline Audio Clips (A2) */}
         {timelineClips.filter(c => c.asset.type === 'audio').map(clip => (
            <audio
              key={`clip-${clip.id}`}
              src={clip.asset.url}
              ref={el => { mediaRefs.current[`clip-${clip.id}`] = el; }}
              data-start={clip.startTime}
              data-duration={clip.duration}
              muted={trackStates.A2.muted}
            />
         ))}
      </div>

      {/* Top Section: Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel (Tabbed Interface) */}
        <div className="w-[380px] lg:w-[420px] bg-white border-r border-gray-200 flex flex-col flex-none shadow-[2px_0_10px_rgba(0,0,0,0.05)] z-10">
          
          {/* Tab Headers */}
          <div className="flex items-center border-b border-gray-100 p-2 gap-1 bg-gray-50/50">
            <button 
              onClick={() => setActiveTab('media')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${activeTab === 'media' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'}`}
            >
              <FolderOpen size={14} /> Media
            </button>
            <button 
              onClick={() => setActiveTab('scene')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${activeTab === 'scene' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'}`}
            >
              <Layers size={14} /> Scene Info
            </button>
            <button 
              onClick={() => setActiveTab('export')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${activeTab === 'export' ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-200' : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'}`}
            >
              <Wand2 size={14} /> Export
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
            
            {/* MEDIA TAB */}
            {activeTab === 'media' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Project Assets</h3>
                <div 
                  className="border-2 border-dashed border-gray-300 hover:border-purple-400 bg-gray-50 hover:bg-purple-50/30 rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept="audio/*,video/*,image/*" 
                    multiple 
                    onChange={handleFileUpload}
                  />
                  <div className="bg-white p-3 rounded-full border border-gray-100 shadow-sm group-hover:border-purple-200 transition-colors">
                    <Upload size={20} className="text-gray-400 group-hover:text-purple-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700 group-hover:text-purple-700">Import Media</p>
                    <p className="text-xs text-gray-400 mt-1">Drag & drop or click to browse</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                   {mediaAssets.map((asset) => (
                     <div 
                       key={asset.id} 
                       onClick={() => {
                         setSelectedAsset(asset);
                         setSelectedScene(null);
                       }}
                       draggable
                       onDragStart={(e) => {
                         setDraggingAsset(asset);
                         e.dataTransfer.setData('text/plain', JSON.stringify(asset));
                         e.dataTransfer.effectAllowed = 'copy';
                         
                         const duration = asset.duration || 5;
                         const width = duration * scale;
                         
                         const dragGhost = document.createElement('div');
                         dragGhost.style.width = `${width}px`;
                         dragGhost.style.height = '50px';
                         dragGhost.style.borderRadius = '6px';
                         dragGhost.style.border = '2px solid #10b981'; // emerald-500 to match the screenshot
                         dragGhost.style.overflow = 'hidden';
                         dragGhost.style.position = 'absolute';
                         dragGhost.style.top = '-1000px';
                         dragGhost.style.backgroundColor = '#ecfdf5';
                         dragGhost.style.display = 'flex';
                         
                         if (asset.type === 'image' || asset.type === 'video') {
                             if (asset.type === 'image') {
                                dragGhost.style.backgroundImage = `url(${asset.url})`;
                                dragGhost.style.backgroundSize = 'cover';
                                dragGhost.style.backgroundPosition = 'center';
                             } else {
                                const numFrames = Math.max(1, Math.ceil(width / 80));
                                for(let i=0; i<numFrames; i++) {
                                   const vid = document.createElement('video');
                                   vid.src = `${asset.url}#t=${(duration / numFrames) * i + 0.1}`;
                                   vid.style.height = '100%';
                                   vid.style.width = `${100 / numFrames}%`;
                                   vid.style.objectFit = 'cover';
                                   vid.style.borderRight = '1px solid rgba(0,0,0,0.2)';
                                   dragGhost.appendChild(vid);
                                }
                             }
                         } else {
                             const icon = document.createElement('div');
                             icon.style.padding = '10px';
                             icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
                             dragGhost.appendChild(icon);
                         }

                         const label = document.createElement('div');
                         label.style.position = 'absolute';
                         label.style.left = '6px';
                         label.style.top = '6px';
                         label.style.backgroundColor = 'rgba(0,0,0,0.5)';
                         label.style.color = 'white';
                         label.style.padding = '2px 6px';
                         label.style.borderRadius = '4px';
                         label.style.fontSize = '10px';
                         label.style.fontWeight = 'bold';
                         label.style.zIndex = '10';
                         label.style.whiteSpace = 'nowrap';
                         label.innerText = asset.file.name;
                         dragGhost.appendChild(label);
                         
                         document.body.appendChild(dragGhost);
                         e.dataTransfer.setDragImage(dragGhost, 10, 10);
                         setTimeout(() => { document.body.removeChild(dragGhost); }, 0);
                       }}
                       onDragEnd={() => {
                         setDraggingAsset(null);
                         setV1DragInsertIndex(null);
                         setA1DragInsertIndex(null);
                       }}
                       className="flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing group/asset w-full"
                     >
                       {/* Preview Box */}
                       <div className={`w-full aspect-square bg-gray-100 rounded-lg relative overflow-hidden flex items-center justify-center border transition-colors ${selectedAsset?.id === asset.id ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 group-hover/asset:border-purple-300 shadow-sm'}`}>
                         
                         {asset.type === 'image' ? (
                           <div className="absolute inset-0 bg-cover bg-center opacity-90 group-hover/asset:opacity-100 transition-opacity" style={{ backgroundImage: `url(${asset.url})` }}></div>
                         ) : asset.type === 'video' ? (
                           <video 
                             src={asset.url} 
                             className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover/asset:opacity-100 transition-opacity" 
                             muted 
                             preload="metadata"
                             onLoadedMetadata={(e) => {
                               if(!asset.duration) {
                                  const d = e.currentTarget.duration;
                                  if (d && !isNaN(d) && d !== Infinity) {
                                      setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, duration: d } : a));
                                  }
                               }
                             }}
                           />
                         ) : (
                           <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                             <Music size={24} className="text-purple-400 group-hover/asset:text-purple-600 transition-colors" />
                             <audio 
                               src={asset.url} 
                               className="hidden" 
                               preload="metadata"
                               onLoadedMetadata={(e) => {
                                 if(!asset.duration) {
                                    const d = e.currentTarget.duration;
                                    if (d && !isNaN(d) && d !== Infinity) {
                                        setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, duration: d } : a));
                                    }
                                 }
                               }}
                             />
                           </div>
                         )}

                         {/* Duration Badge */}
                         {(asset.type === 'video' || asset.type === 'audio') && (
                            <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white font-mono font-medium drop-shadow-md z-10">
                              {asset.duration ? formatDuration(asset.duration) : '00:00'}
                            </div>
                         )}
                       </div>
                       
                       {/* Filename Below */}
                       <span className="text-[10px] text-gray-600 group-hover/asset:text-purple-600 font-medium truncate w-full text-center px-0.5 transition-colors" title={asset.file.name}>
                         {asset.file.name}
                       </span>
                     </div>
                   ))}
                   {mediaAssets.length === 0 && (
                      <div className="col-span-3 text-center text-xs text-gray-400 italic py-4">No media imported yet.</div>
                   )}
                </div>
              </div>
            )}

            {/* SCENE DETAILS TAB */}
            {activeTab === 'scene' && (
              <div className="animate-in fade-in duration-200 h-full flex flex-col">
                {!selectedScene ? (
                   <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-70 mt-12">
                     <Layers size={40} className="text-gray-300 mb-4" />
                     <h3 className="text-sm font-semibold text-gray-600 mb-2">No Scene Selected</h3>
                     <p className="text-xs text-gray-500">Click a scene block on the timeline below to view and edit its properties.</p>
                     
                     <div className="w-full mt-10 pt-6 border-t border-gray-100 text-left">
                       <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Project Summary</h4>
                       <p className="text-sm text-gray-800 font-bold mb-1 line-clamp-2">{initialProject.topic}</p>
                       <p className="text-xs text-gray-500 mb-4 font-medium">{scenes.length} Scenes • {Math.round(contentDuration)} seconds</p>
                       
                       <button 
                         onClick={handleGenerateAllAudio}
                         disabled={isGeneratingAll}
                         className="w-full py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                       >
                         {isGeneratingAll ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                         {isGeneratingAll ? "Generating Voices..." : "Generate All Voices"}
                       </button>
                     </div>
                   </div>
                ) : (
                   <div className="space-y-6">
                     <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                        <div className="bg-purple-100 text-purple-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm">
                          {selectedScene.sequence_number}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm">Scene Properties</h3>
                          <span className="text-[10px] text-gray-400 font-mono">ID: {selectedScene.id.substring(0,8)}</span>
                        </div>
                     </div>
                     
                     <div className="space-y-4">
                        {/* Voiceover Text */}
                        <div>
                           <label className="flex items-center justify-between text-xs font-bold text-gray-600 mb-2">
                              <span className="flex items-center gap-1.5"><Type size={14} className="text-gray-500"/> Voiceover Text</span>
                           </label>
                           <textarea 
                             className="w-full bg-white border border-gray-200 focus:border-purple-400 focus:ring-4 focus:ring-purple-100 rounded-lg p-3 text-sm text-gray-800 transition-all resize-none min-h-[100px] shadow-sm"
                             value={selectedScene.voice_over_beat}
                             onChange={(e) => updateSceneDetails(selectedScene.id, 'voice_over_beat', e.target.value)}
                           />
                           <div className="flex justify-between items-center mt-3">
                              <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1"><Clock size={12}/> Est. duration: {selectedScene.video_duration}s</span>
                              <button 
                                onClick={() => handleRegenerateSingleAudio(selectedScene.id, selectedScene.voice_over_beat)}
                                disabled={generatingSceneId === selectedScene.id}
                                className="text-[10px] px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-md border border-gray-200 shadow-sm transition-colors flex items-center gap-1.5"
                              >
                                {generatingSceneId === selectedScene.id ? <Loader2 size={12} className="animate-spin text-green-600" /> : <Volume2 size={12} className="text-green-600"/>}
                                {selectedScene.audio_url ? "Regenerate" : "Generate"}
                              </button>
                           </div>
                           {selectedScene.audio_url && (
                             <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-2 shadow-sm">
                               <audio src={selectedScene.audio_url} controls className="w-full h-8 outline-none" />
                             </div>
                           )}
                        </div>

                        {/* Visual Prompt */}
                        <div className="pt-4 border-t border-gray-100">
                           <label className="flex items-center justify-between text-xs font-bold text-gray-600 mb-2">
                              <span className="flex items-center gap-1.5"><ImageIcon size={14} className="text-gray-500"/> Visual Generation Prompt</span>
                           </label>
                           <textarea 
                             className="w-full bg-white border border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 rounded-lg p-3 text-sm text-gray-800 transition-all resize-none min-h-[80px] shadow-sm"
                             value={selectedScene.final_video_prompt}
                             onChange={(e) => updateSceneDetails(selectedScene.id, 'final_video_prompt', e.target.value)}
                           />
                           <div className="flex justify-between items-center mt-3">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
                                 selectedScene.generation_status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                 selectedScene.generation_status === 'Rendering' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                                 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                {selectedScene.generation_status}
                              </span>
                              <button className="text-[10px] px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-md border border-gray-200 shadow-sm transition-colors flex items-center gap-1.5">
                                <ImageIcon size={12} className="text-blue-500" /> Render Visual
                              </button>
                           </div>
                        </div>
                     </div>
                   </div>
                )}
              </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
              <div className="animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Export Settings</h3>
                <div className="space-y-4">
                   <div>
                     <label className="block text-xs font-bold text-gray-600 mb-1.5">Resolution</label>
                     <select className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 shadow-sm font-medium">
                       <option>1080x1920 (9:16 Shorts)</option>
                       <option>1920x1080 (16:9 Landscape)</option>
                       <option>1080x1080 (1:1 Square)</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-gray-600 mb-1.5">Quality</label>
                     <select className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 shadow-sm font-medium">
                       <option>High (1080p, 60fps)</option>
                       <option>Standard (1080p, 30fps)</option>
                       <option>Draft (720p, 30fps)</option>
                     </select>
                   </div>
                   
                   <div className="pt-6 mt-4 border-t border-gray-100">
                     <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                       <Download size={18} /> Render & Export Video
                     </button>
                     <p className="text-center text-[10px] text-gray-500 font-medium mt-3">Estimated render time: 4-5 minutes</p>
                   </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right Panel (Main Video Preview) */}
        {/* We keep the preview player area dark because it acts like a true screen/monitor */}
        <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-4 lg:p-8 border-l border-gray-200 shadow-inner overflow-hidden">
           
           {/* Maximized player container that respects aspect ratio */}
           <div className="w-full h-full flex flex-col items-center justify-center pb-4"> {/* reduced pb to make it balanced */}
             <div 
               className="bg-black rounded-2xl overflow-hidden shadow-2xl relative flex flex-col items-center justify-center border border-gray-800 transition-all duration-300 w-full max-h-full"
               style={{ 
                 aspectRatio: getAspectRatioStyle(),
                 maxWidth: aspectRatio === '16:9' ? '100%' : 'min(100%, 80vh)' // Limit width for taller formats so they don't get cut off vertically
               }}
             >
               
               {/* Media Asset Preview / Mock Video content based on selected scene */}
               {selectedAsset ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                     {selectedAsset.type === 'video' ? (
                        <video src={selectedAsset.url} controls className="w-full h-full object-contain" autoPlay />
                     ) : selectedAsset.type === 'image' ? (
                        <img src={selectedAsset.url} className="w-full h-full object-contain" alt="Asset Preview" />
                     ) : (
                        <div className="flex flex-col items-center text-gray-400 bg-gray-900 w-full h-full justify-center">
                           <Music size={64} className="mb-6 opacity-50 text-purple-500" />
                           <p className="text-sm font-bold mb-4">{selectedAsset.file.name}</p>
                           <audio src={selectedAsset.url} controls className="w-3/4 max-w-sm outline-none" autoPlay />
                        </div>
                     )}
                  </div>
               ) : activeClipV1 ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                    {activeClipV1.asset.type === 'video' ? (
                       <video 
                         src={activeClipV1.asset.url} 
                         className="w-full h-full object-contain"
                         ref={el => { mediaRefs.current[`clip-${activeClipV1.id}`] = el; }}
                         data-start={activeClipV1.startTime}
                         data-duration={activeClipV1.duration}
                         muted={trackStates.V1.muted}
                       />
                    ) : (
                       <img src={activeClipV1.asset.url} className="w-full h-full object-contain" alt="Asset Preview" />
                    )}
                 </div>
               ) : displayScene ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center transition-opacity duration-300">
                    {displayScene.custom_media_url ? (
                        displayScene.custom_media_type === 'video' ? (
                           <video 
                             src={displayScene.custom_media_url} 
                             className="absolute inset-0 w-full h-full object-contain bg-black"
                             ref={el => { mediaRefs.current[`scene-video-${displayScene.id}`] = el; }}
                             data-start={scenes.slice(0, scenes.indexOf(displayScene)).reduce((acc, s) => acc + (s.video_duration || 5), 0)}
                             data-duration={displayScene.video_duration || 5}
                             muted={trackStates.V1.muted}
                           />
                        ) : (
                           <img src={displayScene.custom_media_url} className="absolute inset-0 w-full h-full object-contain bg-black" alt="Scene Preview" />
                        )
                    ) : (
                       <>
                          {displayScene.generation_status === 'Completed' ? (
                             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555529733-0e67056058e1?q=80&w=1000')] bg-cover bg-center opacity-70"></div>
                          ) : (
                             <Film size={48} className="text-gray-700 mb-4 opacity-50" />
                          )}
                          <div className="relative z-10 max-w-lg">
                            <p className="text-yellow-400 text-xl md:text-3xl font-black uppercase tracking-wider drop-shadow-md text-shadow" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                              {displayScene.voice_over_beat}
                            </p>
                          </div>
                       </>
                    )}
                 </div>
               ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-900">
                     <MonitorPlay size={48} className="mb-4 opacity-50" />
                     <p className="font-medium text-sm">Select a scene to preview</p>
                  </div>
               )}

               {/* Native controls are used instead of custom overlay */}
             </div>
           </div>
        </div>
      </div>

      {/* Resizer Handle */}
      <div 
        className="h-1.5 w-full bg-gray-200 border-y border-gray-300 cursor-row-resize hover:bg-purple-200 transition-colors flex items-center justify-center flex-none z-20"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-12 h-0.5 rounded-full bg-gray-400"></div>
      </div>

      {/* Bottom Horizontal Timeline (Light Theme) */}
      <div 
        className="bg-white overflow-hidden flex flex-col flex-none relative z-10"
        style={{ height: `${timelineHeight}px` }}
      >
        {/* Timeline Toolbar */}
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between shadow-sm relative z-40">
          <div className="flex items-center gap-4">
             <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Timeline Editor</span>
             <div className="h-4 w-px bg-gray-300"></div>
             <button className="text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1 text-xs font-semibold" title="Undo">
               <SkipBack size={14} /> Undo
             </button>
          </div>

          {/* Centered Play Button */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
             <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`w-8 h-8 flex items-center justify-center rounded-md shadow-sm transition-colors border ${isPlaying ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-gray-700 hover:text-purple-600 border-gray-200'}`}
             >
                {isPlaying ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current ml-0.5" />}
             </button>
          </div>

          <div className="flex items-center gap-4">
             {/* Ratio selector relocated to Timeline Toolbar */}
             <div className="relative">
               <button 
                 onClick={() => setShowRatioMenu(!showRatioMenu)}
                 className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-purple-600 bg-white border border-gray-200 px-2.5 py-1.5 rounded-md shadow-sm transition-colors"
               >
                 <LayoutTemplate size={14} />
                 {aspectRatio}
                 <ChevronDown size={14} className="ml-0.5 text-gray-400" />
               </button>
               
               {showRatioMenu && (
                 <div className="absolute top-full left-0 mt-1 w-24 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
                   {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ratio) => (
                     <button
                       key={ratio}
                       onClick={() => {
                         setAspectRatio(ratio);
                         setShowRatioMenu(false);
                       }}
                       className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-gray-50 transition-colors ${aspectRatio === ratio ? 'text-purple-600 bg-purple-50/50' : 'text-gray-700'}`}
                     >
                       {ratio}
                     </button>
                   ))}
                 </div>
               )}
             </div>

             {/* Zoom Controls */}
             <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1 shadow-sm">
                <button 
                  onClick={() => setScale(Math.max(10, scale - 10))}
                  className="text-gray-500 hover:text-gray-800 font-bold px-1"
                >-</button>
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden relative border border-gray-200">
                   <div className="absolute left-0 top-0 h-full bg-gray-400 rounded-full" style={{ width: `${(scale/100)*100}%`}}></div>
                </div>
                <button 
                  onClick={() => setScale(Math.min(100, scale + 10))}
                  className="text-gray-500 hover:text-gray-800 font-bold px-1"
                >+</button>
             </div>
          </div>
        </div>

        {/* Timeline Track Area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto relative pb-6 pt-1 custom-scrollbar bg-gray-50/30 z-10">
           
           <div className="min-w-max">
              {/* Ruler Track */}
              <div className="flex items-end mb-1 relative group w-max">
                 <div className="w-32 shrink-0 sticky left-0 z-30 bg-white h-6 border-b border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></div>
                 <div 
                    className="relative h-6 border-b border-gray-200 cursor-pointer"
                    style={{ width: `${timelineDuration * scale}px` }}
                    onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       setCursorPosition(e.clientX - rect.left);
                       setSelectedAsset(null);
                    }}
                 >
                    {[...Array(Math.ceil(timelineDuration) + 1)].map((_, i) => {
                       // Only show labels every 5 seconds if zoomed out, or every second if zoomed in
                       const showLabel = scale < 20 ? i % 5 === 0 : true;
                       return (
                         <div key={i} className="absolute flex flex-col items-center" style={{ left: `${i * scale}px` }}>
                            {showLabel && <span className="text-[9px] text-gray-500 font-mono font-medium mb-1">{i}s</span>}
                            <div className={`w-px ${i % 5 === 0 ? 'h-2 bg-gray-400' : 'h-1 bg-gray-300'}`}></div>
                         </div>
                       )
                    })}

                    {/* Playhead / Cursor - Changed to Purple */}
                    <div 
                      className="absolute top-0 h-[800px] z-50 pointer-events-none flex flex-col items-center"
                      style={{ left: `${cursorPosition}px`, transform: 'translateX(-50%)' }}
                    >
                       <div className="w-3 h-3 bg-purple-600 rounded-sm mb-0.5 relative flex items-center justify-center z-50 shadow-sm">
                          <div className="absolute -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[4px] border-t-purple-600"></div>
                       </div>
                       <div className="w-px h-full bg-purple-600/80 shadow-[0_0_8px_rgba(147,51,234,0.4)]"></div>
                    </div>
                 </div>
              </div>

              {/* Video Track (V1) */}
              <div 
                className="flex items-center mb-0.5 group relative mt-2"
              >
                 <div className="w-32 shrink-0 sticky left-0 z-30 bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400">
                    <span className="text-[13px] font-bold text-gray-600">V1</span>
                    <button onClick={() => toggleTrackState('V1', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.V1.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.V1.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <button onClick={() => toggleTrackState('V1', 'muted')} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.V1.muted ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.V1.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Mute Track</div>
                    </button>
                 </div>
                 <div 
                   className="flex flex-1 relative h-16 bg-white rounded-r-md items-center cursor-pointer ml-1 border-y border-r border-gray-100 shadow-sm" 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                   }}
                   onDragOver={(e) => {
                     if (trackStates.V1.locked) return;
                     handleDragOver(e);
                     if ((draggingAsset && (draggingAsset.type === 'video' || draggingAsset.type === 'image')) || (draggingScene && draggingScene.track === 'V1')) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dropX = e.clientX - rect.left;
                        let insertIdx = scenes.length;
                        
                        for (let i = 0; i < scenes.length; i++) {
                           const sceneDuration = getSceneDuration(scenes[i]);
                           const sceneLeft = getSceneLeftPosition('V1', i);
                           const sceneMidpoint = sceneLeft + (sceneDuration * scale / 2);
                           if (dropX < sceneMidpoint) {
                              insertIdx = i;
                              break;
                           }
                        }
                        if (v1DragInsertIndex !== insertIdx) {
                           setV1DragInsertIndex(insertIdx);
                        }
                     }
                   }}
                   onDrop={(e) => {
                     if (trackStates.V1.locked) return;
                     handleDrop(e, 'V1')
                   }}
                 >
                    {/* Scene Blocks (AI Generated) */}
                    {scenes.map((scene, idx) => (
                       <div 
                         key={`video-${scene.id}`}
                         draggable={!trackStates.V1.locked}
                         onDragStart={(e) => {
                            if (trackStates.V1.locked) {
                               e.preventDefault();
                               return;
                            }
                            const sceneData = { type: 'reorder', track: 'V1', sceneId: scene.id, index: idx };
                            e.dataTransfer.setData('text/plain', JSON.stringify(sceneData));
                            setDraggingScene({ id: scene.id, track: 'V1', duration: getSceneDuration(scene) });
                            e.dataTransfer.effectAllowed = 'copyMove';
                         }}
                         onDragEnd={() => {
                            setDraggingScene(null);
                            setV1DragInsertIndex(null);
                         }}
                         onClick={(e) => {
                           setSelectedScene(scene);
                           setSelectedSceneTrack('V1');
                           setSelectedAsset(null);
                           setActiveTab('scene');
                         }}
                         onContextMenu={(e) => {
                           e.preventDefault();
                           setContextMenu({ x: e.pageX, y: e.pageY, type: 'scene', id: scene.id, trackId: 'V1' });
                         }}
                         className={`h-[80%] absolute top-[10%] rounded-md border ${getSceneColor(scene.generation_status)} cursor-pointer transition-all overflow-hidden group/block shadow-sm ${selectedScene?.id === scene.id && selectedSceneTrack === 'V1' ? 'ring-2 ring-purple-400 ring-offset-1 z-20 scale-[1.02]' : 'hover:brightness-95 z-10'}`}
                         style={{ 
                           left: `${getSceneLeftPosition('V1', idx)}px`,
                           width: `${getSceneDuration(scene) * scale}px`,
                           opacity: draggingScene?.id === scene.id ? 0.001 : 1
                         }}
                       >
                         <div className="w-full h-full p-1.5 flex flex-col relative">
                            <div className={`flex items-center gap-1.5 mb-1 opacity-100 z-10 ${scene.custom_media_url ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] bg-black/30 w-fit px-1.5 py-0.5 rounded-sm' : 'opacity-90'}`}>
                               {scene.custom_media_type === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
                               <span className="text-[9px] font-bold truncate">Sc {getVisualSequenceNumber('V1', idx)} {scene.custom_media_url ? `(${scene.voice_over_beat})` : ''}</span>
                            </div>
                            {scene.custom_media_url && (
                               <div className="absolute inset-0 z-0 flex overflow-hidden rounded-md pointer-events-none">
                                  {scene.custom_media_type === 'video' ? (
                                     Array.from({ length: Math.max(1, Math.ceil((getSceneDuration(scene) * scale) / 80)) }).map((_, i, arr) => (
                                        <video 
                                          key={i}
                                          src={`${scene.custom_media_url}#t=${(getSceneDuration(scene) / arr.length) * i + 0.1}`} 
                                          className="h-full object-cover shrink-0 border-r border-black/20" 
                                          style={{ width: `${100 / arr.length}%` }}
                                          preload="metadata"
                                        />
                                     ))
                                  ) : (
                                     Array.from({ length: Math.max(1, Math.ceil((getSceneDuration(scene) * scale) / 80)) }).map((_, i, arr) => (
                                        <img 
                                          key={i}
                                          src={scene.custom_media_url} 
                                          className="h-full object-cover shrink-0 border-r border-black/20" 
                                          style={{ width: `${100 / arr.length}%` }}
                                        />
                                     ))
                                  )}
                               </div>
                            )}
                         </div>
                       </div>
                    ))}

                    {v1DragInsertIndex !== null && (draggingAsset || (draggingScene && draggingScene.track === 'V1')) && (
                        <div 
                           className="h-[80%] absolute top-[10%] rounded-md border-2 border-dashed border-purple-400 bg-purple-100/50 z-0 pointer-events-none transition-all flex items-center justify-center overflow-hidden"
                           style={{
                              left: `${getUnshiftedLeftPosition('V1', v1DragInsertIndex)}px`,
                              width: `${(draggingAsset?.duration || draggingScene?.duration || 5) * scale}px`
                           }}
                        >
                           <div className="flex items-center text-purple-400 opacity-50 gap-2">
                              {draggingAsset?.type === 'video' ? <Film size={16} /> : draggingAsset?.type === 'image' ? <ImageIcon size={16} /> : <LayoutTemplate size={16} />}
                              <span className="text-xs font-bold">Insert Here</span>
                           </div>
                        </div>
                    )}

                    {/* Dropped Custom Media Clips */}
                    {timelineClips.filter(c => c.trackId === 'V1').map(clip => (
                      <Rnd
                        key={clip.id}
                        bounds="parent"
                        dragAxis="x"
                        enableResizing={false}
                        disableDragging={trackStates.V1.locked}
                        size={{ width: clip.duration * scale, height: '80%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('V1', newTime, clip.id);
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: snappedTime } : c));
                        }}
                        style={{ top: '10%' }}
                        className="rounded-md border border-blue-400 bg-blue-100/90 cursor-grab active:cursor-grabbing overflow-hidden z-20 shadow-sm hover:brightness-95 transition-all"
                        onClick={(e: any) => {
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          setSelectedSceneTrack(null);
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'V1' });
                        }}
                      >
                         <div className="w-full h-full p-1.5 flex flex-col relative pointer-events-none">
                            <div className="flex items-center gap-1.5 mb-1 opacity-90 text-blue-900">
                               {clip.asset.type === 'video' ? <Film size={10} /> : clip.asset.type === 'image' ? <ImageIcon size={10} /> : <Music size={10} />}
                               <span className="text-[9px] font-bold truncate">{clip.asset.file.name}</span>
                            </div>
                         </div>
                      </Rnd>
                    ))}
                 </div>
              </div>

              {/* Audio Track (A1) */}
              <div 
                className="flex items-center mb-0.5 group relative"
              >
                 <div className="w-32 shrink-0 sticky left-0 z-30 bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400">
                    <span className="text-[13px] font-bold text-gray-600">A1</span>
                    <button onClick={() => toggleTrackState('A1', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A1.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A1.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <button onClick={() => toggleTrackState('A1', 'muted')} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A1.muted ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A1.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Mute Track</div>
                    </button>
                 </div>
                 <div 
                   className="flex flex-1 relative h-14 bg-white rounded-r-md items-center cursor-pointer ml-1 border-y border-r border-gray-100 shadow-sm" 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                   }}
                   onDragOver={(e) => { 
                      if (trackStates.A1.locked) return;
                      handleDragOver(e); 
                      if (draggingScene?.track === 'A1') {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dropX = e.clientX - rect.left;
                        let insertIdx = a1Scenes.length;
                        
                        for (let i = 0; i < a1Scenes.length; i++) {
                           const sceneDuration = a1Scenes[i].video_duration || 5;
                           const sceneLeft = getSceneLeftPosition('A1', i);
                           const sceneMidpoint = sceneLeft + (sceneDuration * scale / 2);
                           if (dropX < sceneMidpoint) {
                              insertIdx = i;
                              break;
                           }
                        }
                        if (a1DragInsertIndex !== insertIdx) {
                           setA1DragInsertIndex(insertIdx);
                        }
                      }
                   }}
                   onDrop={(e) => {
                      if (trackStates.A1.locked) return;
                      handleDrop(e, 'A1');
                   }}
                 >
                    {a1Scenes.map((scene, idx) => (
                       <div 
                         key={`audio-${scene.id}`}
                         draggable={!trackStates.A1.locked}
                         onDragStart={(e) => {
                            if (trackStates.A1.locked) {
                               e.preventDefault();
                               return;
                            }
                            const sceneData = { type: 'reorder', track: 'A1', sceneId: scene.id, index: idx };
                            e.dataTransfer.setData('text/plain', JSON.stringify(sceneData));
                            setDraggingScene({ id: scene.id, track: 'A1', duration: scene.video_duration || 5 });
                            e.dataTransfer.effectAllowed = 'copyMove';
                         }}
                         onDragEnd={() => {
                            setDraggingScene(null);
                            setA1DragInsertIndex(null);
                         }}
                         onClick={(e) => {
                           setSelectedScene(scene);
                           setSelectedSceneTrack('A1');
                           setSelectedAsset(null);
                           setActiveTab('scene');
                         }}
                         onContextMenu={(e) => {
                           e.preventDefault();
                           setContextMenu({ x: e.pageX, y: e.pageY, type: 'scene', id: scene.id, trackId: 'A1' });
                         }}
                         className={`h-[70%] absolute top-[15%] rounded-md border border-purple-200 bg-purple-50 text-purple-800 cursor-pointer transition-all overflow-hidden p-1 shadow-sm ${selectedScene?.id === scene.id && selectedSceneTrack === 'A1' ? 'ring-2 ring-purple-400 ring-offset-1 z-20 scale-[1.02]' : 'hover:bg-purple-100 z-10'}`}
                         style={{ 
                           left: `${getSceneLeftPosition('A1', idx)}px`,
                           width: `${(scene.video_duration || 5) * scale}px`,
                           opacity: draggingScene?.id === scene.id ? 0.001 : 1
                         }}
                       >
                         <div className="flex items-center gap-1.5 opacity-90 mb-0.5">
                            <Volume2 size={9} />
                            <span className="text-[8px] font-bold truncate block whitespace-nowrap">
                              {scene.voice_over_beat}
                            </span>
                         </div>
                         {/* Static Symmetrical Waveform */}
                         <div className="absolute inset-x-1 bottom-1 top-4 opacity-60 flex items-center overflow-hidden pointer-events-none">
                           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100">
                              <path 
                                 d={Array.from({length: 250}).map((_, i) => {
                                    const h = 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45;
                                    return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`;
                                 }).join(' ')}
                                 stroke={scene.audio_url ? '#a855f7' : '#d8b4fe'} 
                                 strokeWidth="2.5" 
                                 strokeLinecap="round"
                              />
                           </svg>
                         </div>
                       </div>
                    ))}

                    {a1DragInsertIndex !== null && draggingScene?.track === 'A1' && (
                        <div 
                           className="h-[70%] absolute top-[15%] rounded-md border-2 border-dashed border-purple-400 bg-purple-100/50 z-0 pointer-events-none transition-all flex items-center justify-center overflow-hidden"
                           style={{
                              left: `${getUnshiftedLeftPosition('A1', a1DragInsertIndex)}px`,
                              width: `${(draggingScene.duration || 5) * scale}px`
                           }}
                        >
                           <div className="flex items-center text-purple-400 opacity-50 gap-2">
                              <Volume2 size={16} />
                              <span className="text-xs font-bold">Move Here</span>
                           </div>
                        </div>
                    )}

                    {/* Dropped Custom Media Clips */}
                    {timelineClips.filter(c => c.trackId === 'A1').map(clip => (
                      <Rnd
                        key={clip.id}
                        bounds="parent"
                        dragAxis="x"
                        enableResizing={false}
                        disableDragging={trackStates.A1.locked}
                        size={{ width: clip.duration * scale, height: '70%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('A1', newTime, clip.id);
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: snappedTime } : c));
                        }}
                        style={{ top: '15%' }}
                        className="rounded-md border border-blue-400 bg-blue-100/90 cursor-grab active:cursor-grabbing overflow-hidden z-20 shadow-sm hover:brightness-95 transition-all p-1"
                        onClick={(e: any) => {
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          setSelectedSceneTrack(null);
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'A1' });
                        }}
                      >
                         <div className="flex items-center gap-1.5 opacity-90 mb-0.5 text-blue-900 pointer-events-none relative z-10">
                            <Music size={9} />
                            <span className="text-[8px] font-bold truncate block whitespace-nowrap">{clip.asset.file.name}</span>
                         </div>
                         <div className="absolute inset-x-1 bottom-1 top-4 opacity-40 flex items-center overflow-hidden pointer-events-none z-0">
                           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100">
                              <path 
                                 d={Array.from({length: 250}).map((_, i) => {
                                    const h = 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45;
                                    return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`;
                                 }).join(' ')}
                                 stroke="#3b82f6" 
                                 strokeWidth="2.5" 
                                 strokeLinecap="round"
                              />
                           </svg>
                         </div>
                      </Rnd>
                    ))}
                 </div>
              </div>

              {/* Music Track (A2) */}
              <div 
                className="flex items-center group relative"
              >
                 <div className="w-32 shrink-0 sticky left-0 z-30 bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400">
                    <span className="text-[13px] font-bold text-gray-600">A2</span>
                    <button onClick={() => toggleTrackState('A2', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A2.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A2.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <button onClick={() => toggleTrackState('A2', 'muted')} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A2.muted ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A2.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Mute Track</div>
                    </button>
                 </div>
                 <div 
                   className="flex flex-1 relative h-12 bg-gray-50 rounded-r-md items-center cursor-pointer ml-1 border border-gray-200 border-dashed hover:bg-gray-100 transition-colors" 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                   }}
                   onDragOver={(e) => { 
                     if (trackStates.A2.locked) return;
                     handleDragOver(e); 
                     setV1DragInsertIndex(null); 
                     setA1DragInsertIndex(null); 
                   }}
                   onDrop={(e) => {
                      if (trackStates.A2.locked) return;
                      handleDrop(e, 'A2');
                   }}
                 >
                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none opacity-50 z-0">
                       <Music size={12} className="mr-2 text-gray-500"/>
                       <span className="text-[10px] text-gray-500 font-bold italic">Drop audio here...</span>
                    </div>

                    {/* Dropped Custom Media Clips */}
                    {timelineClips.filter(c => c.trackId === 'A2').map(clip => (
                      <Rnd
                        key={clip.id}
                        bounds="parent"
                        dragAxis="x"
                        enableResizing={false}
                        disableDragging={trackStates.A2.locked}
                        size={{ width: clip.duration * scale, height: '70%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('A2', newTime, clip.id);
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: snappedTime } : c));
                        }}
                        style={{ top: '15%' }}
                        className="rounded-md border border-blue-400 bg-blue-100/90 cursor-grab active:cursor-grabbing overflow-hidden z-20 shadow-sm hover:brightness-95 transition-all p-1"
                        onClick={(e: any) => {
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          setSelectedSceneTrack(null);
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'A2' });
                        }}
                      >
                         <div className="flex items-center gap-1.5 opacity-90 mb-0.5 text-blue-900 pointer-events-none relative z-10">
                            <Music size={9} />
                            <span className="text-[8px] font-bold truncate block whitespace-nowrap">{clip.asset.file.name}</span>
                         </div>
                         <div className="absolute inset-x-1 bottom-1 top-4 opacity-40 flex items-center overflow-hidden pointer-events-none z-0">
                           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100">
                              <path 
                                 d={Array.from({length: 250}).map((_, i) => {
                                    const h = 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45;
                                    return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`;
                                 }).join(' ')}
                                 stroke="#3b82f6" 
                                 strokeWidth="2.5" 
                                 strokeLinecap="round"
                              />
                           </svg>
                         </div>
                      </Rnd>
                    ))}
                 </div>
              </div>

              {/* Extra Clickable Space Below Tracks */}
              <div className="flex items-stretch group relative flex-1 mt-2">
                 {/* Invisible sticky spacer to match track headers */}
                 <div className="w-32 shrink-0 sticky left-0 z-30 bg-transparent pointer-events-none"></div>
                 {/* Clickable timeline area */}
                 <div 
                   className="flex flex-1 relative min-h-[150px] cursor-pointer"
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                   }}
                 >
                 </div>
              </div>

           </div>
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[9999] min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 50), left: Math.min(contextMenu.x, window.innerWidth - 140) }}
        >
          <button 
            className="w-full text-left px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 transition-colors"
            onClick={(e) => {
               e.stopPropagation();
               handleDeleteItem();
            }}
          >
            <Trash2 size={16} /> Delete {contextMenu.type === 'scene' ? 'Scene' : 'Clip'}
          </button>
        </div>
      )}
    </div>
  );
}
