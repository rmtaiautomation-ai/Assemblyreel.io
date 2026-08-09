"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Play, Pause, Image as ImageIcon, Volume2, Wand2, Clock, Maximize2, SkipBack, Type, Music, Loader2, Upload, LayoutTemplate, Settings, FolderOpen, Film, Layers, MonitorPlay, ChevronDown, ChevronRight, Trash2, Lock, Unlock, VolumeX, Download, Info, ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { generateSceneAudio, generateFullNarration, getAvailableVoices } from "@/app/actions/audio-actions";
import { updateScene, createSceneWithMedia, reorderScenes, deleteScenes } from "@/app/actions/scene-actions";
import { createTimelineItem, updateTimelineItem, deleteTimelineItem } from "@/app/actions/timeline-actions";
import { updateProjectTrackStates, updateProjectStatus } from "@/app/actions/video-actions";
import { Rnd } from "react-rnd";
import { Player, PlayerRef } from '@remotion/player';
import { VideoComposition } from '@/remotion/compositions/VideoComposition';
import type { VideoCompositionProps, CompositionScene, CompositionAudioClip, OverlayPreset, SceneOverlay } from '@/remotion/types';
import { parseTrackStates, normalizeProjectStatus, type TrackStates, type TrackId, type ProjectStatus } from '@/lib/timeline-types';

type TabState = 'media' | 'scene' | 'export';
type AspectRatio = '16:9' | '9:16' | '1:1';
type MediaType = 'image' | 'audio' | 'video';

interface MediaAsset {
  id: string;
  // Present only for freshly-picked files this session; absent for assets loaded from the DB.
  file?: File;
  name: string;
  url: string;
  type: MediaType;
  duration?: number;
  // Real `media.id` once the upload (or generation) has been persisted. `id`/`url` above are
  // never mutated after creation — see handleFileUpload — so playback/selection code that
  // reads them mid-session never sees a value swap out from under it.
  mediaId?: string;
  // The durable /media/... URL. Kept separate from `url` (which stays the blob: URL for the
  // rest of the session) precisely because `url` must not be swapped mid-session; anything
  // written to the database must use this instead, or a dead blob: URL gets persisted.
  persistedUrl?: string;
  uploadStatus?: 'uploading' | 'ready' | 'failed';
}

interface TimelineClip {
  id: string;
  assetId: string;
  asset: MediaAsset;
  trackId: string;
  startTime: number;
  duration: number;
  trimStart?: number;
}

// Only scenes/clips that came from Supabase have UUID ids. Mock preview scenes ("mock-1")
// and scenes/clips created client-side before their persistence call resolves use short
// random ids — writing those to a UUID primary key would throw, so they stay local-only
// until reconciled with the real id the DB assigns.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPersistedScene = (sceneId: string) => UUID_PATTERN.test(sceneId);

function mediaRowToAsset(row: any): MediaAsset {
  return {
    id: row.id,
    name: row.original_filename || `${row.media_type}-${String(row.id).slice(0, 8)}`,
    url: row.url || '',
    type: row.media_type as MediaType,
    duration: row.duration_seconds || undefined,
    mediaId: row.id,
    persistedUrl: row.url || '',
    uploadStatus: 'ready',
  };
}

function timelineItemToClip(item: any, mediaById: Map<string, any>): TimelineClip | null {
  const mediaRow = mediaById.get(item.media_id);
  if (!mediaRow) return null;
  return {
    id: item.id,
    assetId: item.media_id,
    asset: mediaRowToAsset(mediaRow),
    trackId: item.track_id,
    startTime: item.start_time,
    duration: item.duration,
    trimStart: item.trim_start || 0,
  };
}

export default function TimelineEditor({
  workspaceId,
  initialProject,
  initialScenes,
  initialMedia = [],
  initialTimelineItems = [],
}: {
  workspaceId: string,
  initialProject: any,
  initialScenes: any[],
  initialMedia?: any[],
  initialTimelineItems?: any[],
}) {
  const [scenes, setScenes] = useState<any[]>(initialScenes);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>(() => {
    const mediaById = new Map(initialMedia.map((m) => [m.id, m]));
    return initialTimelineItems
      .map((item) => timelineItemToClip(item, mediaById))
      .filter((c): c is TimelineClip => c !== null);
  });
  const [selectedScene, setSelectedScene] = useState<any | null>(null);
  const [selectedSceneTrack, setSelectedSceneTrack] = useState<'V1' | 'A1' | 'A2' | null>(null);
  const [selectedTimelineClip, setSelectedTimelineClip] = useState<TimelineClip | null>(null);
  const [selectedSceneKeys, setSelectedSceneKeys] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [isPlaying, setIsPlaying] = useState(false);
  const lastTimeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  // Trimming a clip edge and dragging the timeline panel's height are separate
  // gestures — sharing one flag let a clip trim also resize the panel.
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  // Master audio — one continuous narration WAV covering the whole project
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(initialProject.narration_url || null);
  const [masterAudioDuration, setMasterAudioDuration] = useState<number>(0);
  const [isGeneratingNarration, setIsGeneratingNarration] = useState(false);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);

  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");

  useEffect(() => {
    getAvailableVoices().then((res) => {
      if (res.success && res.voices) {
        setAvailableVoices(res.voices);
      }
    });
  }, []);

  const [activeTab, setActiveTab] = useState<TabState>('scene');
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatusMessage, setRenderStatusMessage] = useState<string | null>(null);
  // 0-1 fraction from Remotion's real onProgress, via polling GET /api/render-remotion.
  const [renderProgress, setRenderProgress] = useState(0);
  // Mirrors video_projects.status locally so the header chip reflects the render as
  // it happens. Reading initialProject.status directly would freeze it at whatever
  // the server sent on page load.
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>(() =>
    normalizeProjectStatus(initialProject.status)
  );
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);
  const [selectedAiModel, setSelectedAiModel] = useState<'fal-luma' | 'fal-kling' | 'fal-minimax' | 'gemini-veo' | 'runway-gen3' | 'mock-banana' | 'gemini-image'>('fal-luma');
  const [isGeneratingVisualId, setIsGeneratingVisualId] = useState<string | null>(null);
  const [isGeneratingAllVisuals, setIsGeneratingAllVisuals] = useState(false);
  const [exportResolution, setExportResolution] = useState<'1080x1920' | '1920x1080' | '1080x1080'>('1080x1920');
  const [exportQuality, setExportQuality] = useState<'High' | 'Standard' | 'Draft'>('High');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'scene' | 'clip', id: string, trackId?: string } | null>(null);

  // Accordion collapse states for Scene Info panel
  const [isVoiceoverExpanded, setIsVoiceoverExpanded] = useState(true);
  const [isVisualExpanded, setIsVisualExpanded] = useState(true);
  const [isOverlayExpanded, setIsOverlayExpanded] = useState(true);

  // Visual generation button mode
  const [generateMode, setGenerateMode] = useState<'individual' | 'all'>('individual');

  // The Media panel is the user's imported-asset library, so it shows only files
  // they actually uploaded. Generated visuals (Fal/Gemini/stock) also get media
  // rows, but they belong to their scene — surfacing them here would present
  // every generated clip as a re-importable asset.
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(
    () => initialMedia.filter(m => m.source === 'upload').map(mediaRowToAsset)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remotionPlayerRef = useRef<PlayerRef>(null);
  
  const [draggingAsset, setDraggingAsset] = useState<MediaAsset | null>(null);
  const [draggingScene, setDraggingScene] = useState<{ id: string, track: string, duration: number } | null>(null);
  const [v1DragInsertIndex, setV1DragInsertIndex] = useState<number | null>(null);
  const [a1DragInsertIndex, setA1DragInsertIndex] = useState<number | null>(null);

  // Explicitly typed: inferring from `initialProject.track_states` (which is `any`)
  // widened the whole state to `any` and left every `prev` below implicitly typed.
  const [trackStates, setTrackStates] = useState<TrackStates>(() =>
    parseTrackStates(initialProject.track_states)
  );
  const [activeVolumePopup, setActiveVolumePopup] = useState<TrackId | null>(null);

  // Non-blocking banner for background persistence failures. Deliberately not an
  // alert(): this save is debounced and retries on every change, so a modal would
  // fire repeatedly. One replaceable banner says the same thing without trapping
  // the user — but it still says it, rather than failing silently the way the
  // narration_url column did.
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);

  const saveTrackStatesTimerRef = useRef<NodeJS.Timeout | null>(null);
  // The effect below runs on mount too, which would write identical state back to
  // the DB on every page load — pure noise, and a guaranteed error every load if
  // the column is missing. Only persist once the user has actually changed something.
  const trackStatesDirtyRef = useRef(false);

  useEffect(() => {
    if (!trackStatesDirtyRef.current) return;

    if (saveTrackStatesTimerRef.current) clearTimeout(saveTrackStatesTimerRef.current);
    saveTrackStatesTimerRef.current = setTimeout(async () => {
      const res = await updateProjectTrackStates(initialProject.id, trackStates);
      if (!res.success) {
        setPersistenceWarning(
          `Track volume/mute settings aren't being saved: ${res.error}. ` +
          `If this persists, run add-track-states-column.sql in the Supabase SQL editor.`
        );
      } else {
        setPersistenceWarning(null);
      }
    }, 1000);
    return () => {
      if (saveTrackStatesTimerRef.current) clearTimeout(saveTrackStatesTimerRef.current);
    };
  }, [trackStates, initialProject.id]);

  const toggleTrackState = (trackId: TrackId, key: 'locked' | 'muted') => {
    trackStatesDirtyRef.current = true;
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [key]: !prev[trackId][key]
      }
    }));
  };

  // Mirrors toggleTrackState so the three volume sliders share one dirty-flagged
  // path; dragging to 0 also flips `muted` so the header icon matches the level.
  const setTrackVolume = (trackId: TrackId, volume: number) => {
    trackStatesDirtyRef.current = true;
    setTrackStates(prev => ({
      ...prev,
      [trackId]: { ...prev[trackId], volume, muted: volume === 0 }
    }));
  };
  
  const getSceneDuration = (scene: any) => {
    if (scene.video_duration) {
      return scene.video_duration;
    }
    if (scene.custom_media_url && scene.assetId) {
      const asset = mediaAssets.find(a => a.id === scene.assetId);
      if (asset && asset.duration) {
        return asset.duration;
      }
    }
    return 5;
  };

  // V1 and A1 are two views of the same scene rows — A1 renders each scene's
  // narration, V1 its visual — so both read from the single `scenes` array.
  const getUnshiftedLeftPosition = (track: 'V1' | 'A1', index: number) => {
    const trackScenes = scenes;
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
    const trackScenes = scenes;
    const insertIdx = track === 'V1' ? v1DragInsertIndex : a1DragInsertIndex;
    
    if (insertIdx !== null && sceneIndex >= insertIdx) {
      if (draggingAsset) {
        time += (draggingAsset.duration || 5);
      } else if (draggingScene && draggingScene.track === track && trackScenes[sceneIndex].id !== draggingScene.id) {
        time += (draggingScene.duration || 5);
      }
    }
    let position = time * scale;

    // Shift position rightward during a left-edge drag to keep the right edge anchored
    if (isResizing && resizingEdge === 'left' && resizingTrack === track) {
       const resizeIndex = trackScenes.findIndex(s => s.id === resizingSceneId);
       if (resizeIndex !== -1 && sceneIndex >= resizeIndex) {
          const currentDuration = getSceneDuration(trackScenes[resizeIndex]);
          const durationDiff = initialDuration - currentDuration;
          position += durationDiff * scale;
       }
    }

    return position;
  };

  const getVisualSequenceNumber = (track: 'V1' | 'A1', originalIndex: number) => {
    const trackScenes = scenes;
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
  const [initialTrimStart, setInitialTrimStart] = useState<number>(0);
  const [resizingEdge, setResizingEdge] = useState<'left' | 'right' | null>(null);
  const [resizingTrack, setResizingTrack] = useState<string | null>(null);

  const handleResizeStart = (e: React.PointerEvent, sceneId: string, track: string, edge: 'left' | 'right', duration: number, trimStart: number = 0) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingSceneId(sceneId);
    setResizingTrack(track);
    setResizingEdge(edge);
    setResizeStartX(e.clientX);
    setInitialDuration(duration);
    setInitialTrimStart(trimStart);
    setIsResizing(true);
  };

  // handlePointerMove records the values it lands on so handlePointerUp can persist
  // them once, on release, without reading state from inside a setter.
  const lastResizeValuesRef = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    if (!isResizing || !resizingSceneId || !resizingTrack || !resizingEdge) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - resizeStartX;
      const deltaDuration = deltaX / scale;

      if (resizingTrack === 'A1_clip' || resizingTrack === 'A2_clip') {
        setTimelineClips(prev => prev.map(clip => {
          if (clip.id === resizingSceneId) {
            let newDuration = initialDuration;
            if (resizingEdge === 'right') {
              newDuration = initialDuration + deltaDuration;
            } else if (resizingEdge === 'left') {
              newDuration = initialDuration - deltaDuration;
            }
            const maxDuration = clip.asset.duration || 15;
            const finalDuration = Math.min(maxDuration, Math.max(0.5, newDuration));
            
            let newTrimStart = clip.trimStart || 0;
            let newStartTime = clip.startTime;
            if (resizingEdge === 'left') {
              newTrimStart = initialTrimStart + (initialDuration - finalDuration);
              newTrimStart = Math.min(maxDuration - finalDuration, Math.max(0, newTrimStart));
              newStartTime = Math.max(0, clip.startTime + (initialDuration - finalDuration));
            }
            lastResizeValuesRef.current = { duration: finalDuration, trim_start: newTrimStart, start_time: newStartTime };
            return { ...clip, duration: finalDuration, trimStart: newTrimStart, startTime: newStartTime };
          }
          return clip;
        }));
        return;
      }

      // Resizing on either V1 or A1 trims the same underlying scene row.
      setScenes(prev => prev.map(scene => {
        if (scene.id === resizingSceneId) {
          let newDuration = initialDuration;
          if (resizingEdge === 'right') {
            newDuration = initialDuration + deltaDuration;
          } else if (resizingEdge === 'left') {
            // Because scenes are sequential, dragging the left edge just trims the duration for now
            newDuration = initialDuration - deltaDuration;
          }
          let maxDuration = 8;
          if (scene.custom_media_url && scene.assetId) {
            const asset = mediaAssets.find(a => a.id === scene.assetId);
            if (asset && asset.duration) maxDuration = asset.duration;
          }
          const finalDuration = Math.min(maxDuration, Math.max(0.5, newDuration));
          
          let newTrimStart = scene.trim_start || 0;
          if (resizingEdge === 'left') {
            newTrimStart = initialTrimStart + (initialDuration - finalDuration);
            newTrimStart = Math.min(maxDuration - finalDuration, Math.max(0, newTrimStart));
          }
          lastResizeValuesRef.current = { video_duration: finalDuration, trim_start: newTrimStart };
          return { ...scene, video_duration: finalDuration, trim_start: newTrimStart };
        }
        return scene;
      }));
    };

    const handlePointerUp = () => {
      // Persist once on release rather than on every pointermove frame.
      const finalValues = lastResizeValuesRef.current;
      if (finalValues && resizingSceneId) {
        if (resizingTrack === 'A1_clip' || resizingTrack === 'A2_clip') {
          persistTimelineItemFields(resizingSceneId, finalValues);
        } else {
          persistSceneFields(resizingSceneId, finalValues);
        }
      }
      lastResizeValuesRef.current = null;

      setIsResizing(false);
      setResizingSceneId(null);
      setResizingTrack(null);
      setResizingEdge(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isResizing, resizingSceneId, resizingTrack, resizingEdge, resizeStartX, initialDuration, scale]);

  const formatDuration = (d: number) => {
    const m = Math.floor(d / 60).toString().padStart(2, '0');
    const s = Math.floor(d % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const newAssets: MediaAsset[] = Array.from(e.target.files).map(file => {
      let type: MediaType = 'image';
      if (file.type.startsWith('audio/')) type = 'audio';
      if (file.type.startsWith('video/')) type = 'video';
      return {
         file,
         id: Math.random().toString(36).substring(7),
         name: file.name,
         url: URL.createObjectURL(file),
         type,
         uploadStatus: 'uploading' as const,
      };
    });
    // Instant optimistic UX, unchanged — the asset appears immediately with a
    // blob: URL. `id`/`url` are never touched again below; only mediaId/uploadStatus
    // get patched once the upload resolves, so anything already reading them mid-session
    // (selection, the seek-storm-guarded playback effect) never sees a value swap.
    setMediaAssets(prev => [...prev, ...newAssets]);

    newAssets.forEach(async (asset) => {
      try {
        const formData = new FormData();
        formData.append('file', asset.file!);
        formData.append('projectId', initialProject.id);
        const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
          setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, mediaId: data.mediaId, persistedUrl: data.url, uploadStatus: 'ready' } : a));
          flushPendingMediaCreations(asset.id, data.mediaId, data.url);
        } else {
          console.error('[handleFileUpload] Upload failed:', data.error);
          setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, uploadStatus: 'failed' } : a));
        }
      } catch (err) {
        console.error('[handleFileUpload] Upload request failed:', err);
        setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, uploadStatus: 'failed' } : a));
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingScene ? 'move' : 'copy';
  };

  const applyMagneticSnap = (trackId: string, requestedStartTime: number, ignoreClipId?: string) => {
    if (requestedStartTime < 4.0) return 0;
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
           // Reordering from either lane moves the shared scene row, so the
           // visual and its narration always travel together.
           const trackScenes = scenes;
           const setTrackScenes = setScenes;

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
           
           const reordered = [...trackScenes];
           const [movedScene] = reordered.splice(data.index, 1);
           if (insertIndex > data.index) insertIndex -= 1;
           reordered.splice(insertIndex, 0, movedScene);
           const renumbered = reordered.map((s, idx) => ({ ...s, sequence_number: idx + 1 }));

           setTrackScenes(renumbered);
           // Reordering shifts every scene between the old and new position — persist
           // the whole order, not just the moved one, or sequence_numbers collide.
           reorderScenes(
              renumbered
                .map(s => ({ id: s.id, sequence_number: s.sequence_number }))
                .filter(u => isPersistedScene(u.id))
           );
           return;
        }
        
        if (data.type === 'move_clip') {
           if (trackId === 'V1') {
             alert("Audio clips cannot be moved to the video track.");
             return;
           }
           const rect = e.currentTarget.getBoundingClientRect();
           const dropX = e.clientX - rect.left;
           let newStartTime = dropX / scale;
           newStartTime = applyMagneticSnap(trackId, newStartTime, data.clipId);
           if (newStartTime < 0.2) newStartTime = 0;

           setTimelineClips(prev => prev.map(c => {
             if (c.id === data.clipId) {
               return { ...c, trackId, startTime: newStartTime };
             }
             return c;
           }));
           persistTimelineItemFields(data.clipId, { track_id: trackId, start_time: newStartTime });
           if (selectedTimelineClip?.id === data.clipId) {
             setSelectedSceneTrack(trackId as 'A1' | 'A2');
             setSelectedSceneKeys([`${data.clipId}_${trackId}`]);
           }
           return;
         }

        // `data` is a JSON.parse of a JSON.stringify(asset) drag payload — stringifying a
        // File object yields {}, so `data.file`/`data.mediaId` can't be trusted. Re-resolve
        // the live entry from state, which still has the real File and any mediaId that's
        // since arrived from the upload reconciliation.
        const asset = (mediaAssets.find(a => a.id === (data as MediaAsset).id) ?? data) as MediaAsset;

        // Enforce track rules
        if (asset.type === 'audio' && trackId === 'V1') {
          alert("Audio files cannot be dropped on the video track.");
          return;
        }
        if ((asset.type === 'video' || asset.type === 'image') && (trackId === 'A1' || trackId === 'A2')) {
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

          const tempSceneId = Math.random().toString(36).substring(7);
          const newScene = {
            id: tempSceneId,
            sequence_number: 0,
            video_duration: durationSecs,
            voice_over_beat: asset.name,
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

          const persistNewScene = async (mediaId: string, persistedUrl: string) => {
            const res = await createSceneWithMedia(initialProject.id, mediaId, {
              // Matches the position the local renumbering (.map((s,idx) => idx+1)) just gave it.
              sequence_number: insertIndex + 1,
              video_duration: durationSecs,
              voice_over_beat: asset.name,
              final_video_prompt: 'Custom Media',
              generation_status: 'Completed',
              // Must be the durable URL — asset.url is still a blob: for a fresh upload.
              custom_media_url: persistedUrl,
              custom_media_type: asset.type,
              audio_url: asset.type === 'video' ? persistedUrl : undefined,
            });
            if (res.success && res.scene) {
              // Swap the temp id for the real UUID so future edits/deletes can persist.
              setScenes(prev => prev.map(s => s.id === tempSceneId ? { ...s, id: res.scene.id } : s));

              // The insert shifted every scene at/after insertIndex. Persist the whole
              // ordering, or those siblings keep stale sequence_numbers and collide.
              const finalOrder = [...scenes];
              finalOrder.splice(insertIndex, 0, { id: res.scene.id });
              reorderScenes(
                finalOrder
                  .map((s, idx) => ({ id: s.id, sequence_number: idx + 1 }))
                  .filter(u => isPersistedScene(u.id))
              );
            } else {
              console.error('[handleDrop] Failed to persist new V1 scene:', res.error);
            }
          };

          if (asset.mediaId && asset.persistedUrl) {
            persistNewScene(asset.mediaId, asset.persistedUrl);
          } else {
            queuePendingMediaCreation(asset.id, persistNewScene);
          }
        } else {
          addTimelineClip(asset, trackId as 'A1' | 'A2', startTime, durationSecs);
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

  // Generates ONE continuous narration WAV and places it as a single A1 block
  const handleGenerateFullNarration = async () => {
    setIsGeneratingNarration(true);
    const res = await generateFullNarration(initialProject.id, scenes, selectedVoiceId || undefined);
    if (res.success && res.audioUrl) {
      setMasterAudioUrl(res.audioUrl);
      // If Deepgram provided exact durations for each scene, apply them immediately to the UI
      if (res.updatedScenes) {
         setScenes(prev => prev.map(s => {
            const update = res.updatedScenes.find((u: any) => u.id === s.id);
            return update ? { ...s, video_duration: update.video_duration } : s;
         }));
      }
      if (res.persistWarning) {
        alert(res.persistWarning);
      }
    } else {
      alert(`Narration error: ${res.error}`);
    }
    setIsGeneratingNarration(false);
  };

  const handleRegenerateSingleAudio = async (sceneId: string, voiceOver: string) => {
    setGeneratingSceneId(sceneId);
    const res = await generateSceneAudio(sceneId, voiceOver, selectedVoiceId || undefined);
    if (res.success) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audio_url: res.audioUrl } : s));
      setSelectedScene((prev: any) => ({ ...prev, audio_url: res.audioUrl }));
    }
    setGeneratingSceneId(null);
  };

  // Pending writes are merged per scene so a debounced textarea save never drops
  // a field that was changed while the timer was running.
  const pendingSavesRef = useRef<{ [sceneId: string]: Record<string, any> }>({});
  const saveTimersRef = useRef<{ [sceneId: string]: ReturnType<typeof setTimeout> }>({});

  const persistSceneFields = (sceneId: string, fields: Record<string, any>, debounce = false) => {
    if (!isPersistedScene(sceneId)) return;

    pendingSavesRef.current[sceneId] = { ...pendingSavesRef.current[sceneId], ...fields };

    const flush = () => {
      const payload = pendingSavesRef.current[sceneId];
      delete pendingSavesRef.current[sceneId];
      delete saveTimersRef.current[sceneId];
      if (!payload || Object.keys(payload).length === 0) return;
      updateScene(sceneId, payload).then(res => {
        if (!res.success) console.error("[Scene Save]", res.error);
      });
    };

    if (saveTimersRef.current[sceneId]) clearTimeout(saveTimersRef.current[sceneId]);
    if (debounce) {
      saveTimersRef.current[sceneId] = setTimeout(flush, 800);
    } else {
      flush();
    }
  };

  const updateSceneDetails = (sceneId: string, field: string, value: any) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, [field]: value } : s));
    setSelectedScene((prev: any) => ({ ...prev, [field]: value }));
    // Typing debounces; dropdowns save straight away.
    const isFreeText = field === 'voice_over_beat' || field === 'final_video_prompt';
    persistSceneFields(sceneId, { [field]: value }, isFreeText);
  };

  // Same merge-and-debounce shape as persistSceneFields, for timeline_items rows.
  const pendingTimelineSavesRef = useRef<{ [clipId: string]: Record<string, any> }>({});
  const timelineSaveTimersRef = useRef<{ [clipId: string]: ReturnType<typeof setTimeout> }>({});

  const persistTimelineItemFields = (clipId: string, fields: Record<string, any>, debounce = false) => {
    if (!isPersistedScene(clipId)) return;

    pendingTimelineSavesRef.current[clipId] = { ...pendingTimelineSavesRef.current[clipId], ...fields };

    const flush = () => {
      const payload = pendingTimelineSavesRef.current[clipId];
      delete pendingTimelineSavesRef.current[clipId];
      delete timelineSaveTimersRef.current[clipId];
      if (!payload || Object.keys(payload).length === 0) return;
      updateTimelineItem(clipId, payload).then(res => {
        if (!res.success) console.error("[Timeline Item Save]", res.error);
      });
    };

    if (timelineSaveTimersRef.current[clipId]) clearTimeout(timelineSaveTimersRef.current[clipId]);
    if (debounce) {
      timelineSaveTimersRef.current[clipId] = setTimeout(flush, 800);
    } else {
      flush();
    }
  };

  // Dropping a just-uploaded asset onto the timeline before its upload request
  // resolves means we don't have a real mediaId to create the scene/clip row
  // with yet. Queue the deferred creation keyed by the asset's temp id and
  // run it once the upload reconciliation supplies the real mediaId.
  const pendingMediaCreationsRef = useRef<{ [assetTempId: string]: Array<(mediaId: string, persistedUrl: string) => void> }>({});

  const queuePendingMediaCreation = (assetTempId: string, callback: (mediaId: string, persistedUrl: string) => void) => {
    if (!pendingMediaCreationsRef.current[assetTempId]) pendingMediaCreationsRef.current[assetTempId] = [];
    pendingMediaCreationsRef.current[assetTempId].push(callback);
  };

  const flushPendingMediaCreations = (assetTempId: string, mediaId: string, persistedUrl: string) => {
    const queued = pendingMediaCreationsRef.current[assetTempId];
    if (!queued) return;
    delete pendingMediaCreationsRef.current[assetTempId];
    queued.forEach(cb => cb(mediaId, persistedUrl));
  };

  // Shared by handleDrop's A1/A2 branch and the Media panel's quick-add buttons:
  // optimistic add + fire-and-forget persistence, queued if the asset's upload
  // hasn't resolved to a real mediaId yet.
  const addTimelineClip = (asset: MediaAsset, trackId: 'A1' | 'A2', startTime: number, duration: number) => {
    const tempClipId = Math.random().toString(36).substring(7);
    const newClip: TimelineClip = { id: tempClipId, assetId: asset.id, asset, trackId, startTime, duration };
    setTimelineClips(prev => [...prev, newClip]);

    const persist = async (mediaId: string) => {
      const res = await createTimelineItem(initialProject.id, mediaId, { trackId, startTime, duration });
      if (res.success && res.timelineItem) {
        setTimelineClips(prev => prev.map(c => c.id === tempClipId ? { ...c, id: res.timelineItem.id } : c));
      } else {
        console.error('[addTimelineClip] Failed to persist timeline item:', res.error);
      }
    };

    // timeline_items reference media by id and hold no URL of their own, so the
    // persisted URL isn't needed here.
    if (asset.mediaId) {
      persist(asset.mediaId);
    } else {
      queuePendingMediaCreation(asset.id, persist);
    }
  };

  const handleSelectSceneBlock = (e: React.MouseEvent, scene: any, track: 'V1' | 'A1', index: number) => {
    e.stopPropagation();
    setSelectedAsset(null);
    setSelectedTimelineClip(null);
    const key = `${scene.id}_${track}`;

    // Park the playhead on the clicked scene so the preview shows it. The
    // existing cursor sync effect drives the Remotion player from here.
    setIsPlaying(false);
    setCursorPosition(getUnshiftedLeftPosition(track, index));

    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setSelectedSceneKeys(prev => 
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      );
    } else {
      setSelectedSceneKeys([key]);
    }
    setSelectedScene(scene);
    setSelectedSceneTrack(track);
    setActiveTab('scene');
  };

  // Removing a scene both deletes its row and renumbers the survivors — persisting
  // only one of those leaves the timeline inconsistent after a reload.
  const removeScenesAndPersist = (idsToDelete: string[]) => {
    const renumbered = scenes
      .filter(s => !idsToDelete.includes(s.id))
      .map((s, idx) => ({ ...s, sequence_number: idx + 1 }));

    setScenes(renumbered);

    const persistedDeletes = idsToDelete.filter(isPersistedScene);
    if (persistedDeletes.length === 0) return;

    deleteScenes(persistedDeletes).then(res => {
      if (!res.success) {
        console.error('[removeScenesAndPersist] Delete failed:', res.error);
        return;
      }
      reorderScenes(
        renumbered
          .map(s => ({ id: s.id, sequence_number: s.sequence_number }))
          .filter(u => isPersistedScene(u.id))
      );
    });
  };

  const handleDeleteSelectedScenes = () => {
    if (selectedSceneKeys.length === 0) return;

    const v1IdsToDelete = selectedSceneKeys
      .filter(k => k.endsWith('_V1'))
      .map(k => k.split('_')[0]);

    const a1IdsToDelete = selectedSceneKeys
      .filter(k => k.endsWith('_A1'))
      .map(k => k.split('_')[0]);

    // Deleting on V1 removes the whole scene; deleting on A1 only clears its
    // narration, leaving the visual in place.
    if (v1IdsToDelete.length > 0) {
      removeScenesAndPersist(v1IdsToDelete);
    }

    if (a1IdsToDelete.length > 0) {
      setScenes(prev => prev.map(s => a1IdsToDelete.includes(s.id) ? { ...s, audio_url: undefined } : s));
      a1IdsToDelete.filter(isPersistedScene).forEach(id => persistSceneFields(id, { audio_url: null }));
    }

    const clipIdsToDelete = selectedSceneKeys
      .filter(k => k.endsWith('_A2') || k.endsWith('_V1_clip') || k.endsWith('_A1_clip'))
      .map(k => k.split('_')[0]);

    if (clipIdsToDelete.length > 0) {
      setTimelineClips(prev => prev.filter(c => !clipIdsToDelete.includes(c.id)));
      clipIdsToDelete.filter(isPersistedScene).forEach(id => { deleteTimelineItem(id); });
      if (selectedTimelineClip && clipIdsToDelete.includes(selectedTimelineClip.id)) {
        setSelectedTimelineClip(null);
      }
    }

    setSelectedSceneKeys([]);
    setSelectedScene(null);
    setSelectedSceneTrack(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allKeys: string[] = [
          ...scenes.map(s => `${s.id}_V1`),
          ...scenes.map(s => `${s.id}_A1`),
          ...timelineClips.map(c => `${c.id}_${c.trackId}`)
        ];
        setSelectedSceneKeys(allKeys);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSceneKeys.length > 0) {
        e.preventDefault();
        const v1IdsToDelete = selectedSceneKeys
          .filter(k => k.endsWith('_V1'))
          .map(k => k.split('_')[0]);

        const a1IdsToDelete = selectedSceneKeys
          .filter(k => k.endsWith('_A1'))
          .map(k => k.split('_')[0]);

        const clipIdsToDelete = selectedSceneKeys
          .filter(k => k.endsWith('_A2') || k.endsWith('_V1_clip') || k.endsWith('_A1_clip'))
          .map(k => k.split('_')[0]);

        if (v1IdsToDelete.length > 0) {
          removeScenesAndPersist(v1IdsToDelete);
        }

        if (a1IdsToDelete.length > 0) {
          setScenes(prev => prev.map(s => a1IdsToDelete.includes(s.id) ? { ...s, audio_url: undefined } : s));
          a1IdsToDelete.filter(isPersistedScene).forEach(id => persistSceneFields(id, { audio_url: null }));
        }

        if (clipIdsToDelete.length > 0) {
          setTimelineClips(prev => prev.filter(c => !clipIdsToDelete.includes(c.id)));
          clipIdsToDelete.filter(isPersistedScene).forEach(id => { deleteTimelineItem(id); });
          if (selectedTimelineClip && clipIdsToDelete.includes(selectedTimelineClip.id)) {
            setSelectedTimelineClip(null);
          }
        }

        setSelectedSceneKeys([]);
        setSelectedScene(null);
        setSelectedSceneTrack(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSceneKeys, scenes, timelineClips, selectedTimelineClip]);

  // Polls /api/media/[mediaId]/status until the generation reaches a terminal
  // state. Only entered for genuinely async providers (real Fal.ai); everything
  // else already comes back terminal from the initial POST.
  const pollMediaStatus = async (mediaId: string, intervalMs = 3000, maxAttempts = 60) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      try {
        const res = await fetch(`/api/media/${mediaId}/status`);
        const data = await res.json();
        if (data.status === 'ready' || data.status === 'failed') return data;
      } catch (err) {
        console.error('[pollMediaStatus] Status check failed:', err);
      }
    }
    return { status: 'failed', error: 'Generation timed out' };
  };

  const handleGenerateSceneVisual = async (sceneId: string, prompt: string, modelToUse = selectedAiModel, duration = 5) => {
    setIsGeneratingVisualId(sceneId);
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, generation_status: 'Rendering' } : s));
    if (selectedScene?.id === sceneId) {
      setSelectedScene((prev: any) => ({ ...prev, generation_status: 'Rendering' }));
    }

    const applyFailure = (message: string) => {
      alert("Visual Generation Error: " + message);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, generation_status: 'Failed' } : s));
      if (selectedScene?.id === sceneId) {
        setSelectedScene((prev: any) => ({ ...prev, generation_status: 'Failed' }));
      }
      persistSceneFields(sceneId, { generation_status: 'Failed' });
    };

    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, projectId: initialProject.id, prompt, model: modelToUse, duration, aspectRatio }),
      });

      let data = await res.json();
      if (!data.success) {
        applyFailure(data.error || "Unknown error");
        return;
      }

      const mediaId = data.mediaId;
      if (data.status === 'generating') {
        data = { ...data, ...(await pollMediaStatus(mediaId)) };
      }

      if (data.status !== 'ready') {
        applyFailure(data.error || "Generation failed");
        return;
      }

      const result = {
        media_id: mediaId,
        custom_media_url: data.url || "",
        custom_media_type: data.mediaType === 'image' ? 'image' : 'video',
        // Stock placeholders are labeled honestly — never shown as a real render.
        generation_status: data.simulated ? 'Simulated' : 'Completed',
        video_duration: duration,
      };
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, ...result } : s));
      if (selectedScene?.id === sceneId) {
        setSelectedScene((prev: any) => ({ ...prev, ...result }));
      }
      persistSceneFields(sceneId, result);
    } catch (err: any) {
      applyFailure(err.message);
    } finally {
      setIsGeneratingVisualId(null);
    }
  };

  const handleGenerateAllVisuals = async () => {
    setIsGeneratingAllVisuals(true);
    for (const scene of scenes) {
      if (!scene.custom_media_url || scene.custom_media_url === "") {
        await handleGenerateSceneVisual(scene.id, scene.final_video_prompt || "Cinematic video scene", selectedAiModel, scene.video_duration || 5);
      }
    }
    setIsGeneratingAllVisuals(false);
  };

  const handleRenderVideo = async () => {
    setIsRendering(true);
    setRenderStatusMessage("Submitting render job to Remotion engine...");
    setRenderOutputPath(null);

    // Every exit path below must land the project on a terminal status. Leaving it
    // on 'rendering' after a failure was unrecoverable from the UI: the workspace
    // hub would show a spinner forever with no way to clear it.
    const markStatus = async (status: ProjectStatus) => {
      setProjectStatus(status);
      const res = await updateProjectStatus(initialProject.id, status);
      if (!res.success) {
        setPersistenceWarning(`Could not update project status to "${status}": ${res.error}`);
      }
      return res.success;
    };

    // Warn BEFORE rendering, not after: a clip whose asset never finished uploading
    // has no server-fetchable URL, so it cannot appear in the .mp4. Saying so up
    // front is the whole point — silently omitting this audio is the bug being fixed.
    if (unexportableClipNames.length > 0) {
      const names = unexportableClipNames.join(', ');
      const proceed = window.confirm(
        `${unexportableClipNames.length} audio clip(s) still uploading and will be MISSING from the export:\n\n${names}\n\n` +
        `Wait for the upload to finish for these to be included.\n\nRender anyway?`
      );
      if (!proceed) {
        setIsRendering(false);
        setRenderStatusMessage(null);
        return;
      }
    }

    // Polls the render route's progress endpoint while the POST below is still
    // in flight — same shape as pollMediaStatus, just on an interval instead of
    // a fixed attempt count, since a render's length isn't known up front.
    const progressPoll = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/render-remotion?projectId=${initialProject.id}`);
        const data = await res.json();
        if (data.success) setRenderProgress(data.progress);
      } catch {
        // Transient poll failure — the next tick tries again; not worth surfacing.
      }
    }, 500);

    try {
      // Inside the try: a throw here (offline, action error) previously escaped the
      // handler entirely, so `finally` never ran and the button stayed spinning.
      await markStatus('rendering');

      const payload = {
        projectId: initialProject.id,
        ...remotionInputProps,
      };

      const res = await fetch("/api/render-remotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // A 500 from the route returns JSON, but a proxy/timeout may return HTML —
      // res.json() would throw and mask the real cause, so read defensively.
      let data: any;
      try {
        data = await res.json();
      } catch {
        data = { success: false, error: `Render service returned ${res.status} ${res.statusText}` };
      }

      if (data.success) {
        await markStatus('exported');
        if (data.mode === "local-remotion") {
          setRenderStatusMessage("Render completed! File saved locally at: " + data.outputPath);
          setRenderOutputPath(data.outputPath);
        } else {
          setRenderStatusMessage(`Render Job Queued! (ID: ${data.jobId}) Ready for serverless cloud execution.`);
        }
      } else {
        await markStatus('failed');
        setRenderStatusMessage("Render Error: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      await markStatus('failed');
      setRenderStatusMessage("Render Error: " + (err.message || "Failed to submit request"));
    } finally {
      setIsRendering(false);
    }
  };

  // Panel height only — scene/clip trimming is handled by the pointer effect above.
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      setTimelineHeight(prev => Math.max(200, Math.min(prev - e.movementY, window.innerHeight - 300)));
    };

    const handleMouseUp = () => setIsResizingPanel(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

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
    
    const handleGlobalClick = () => {
       setContextMenu(null);
       setActiveVolumePopup(null);
    };
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
      if (contextMenu.trackId === 'A1') {
        setScenes(prev => prev.map(s => s.id === contextMenu.id ? { ...s, audio_url: undefined } : s));
        if (isPersistedScene(contextMenu.id)) persistSceneFields(contextMenu.id, { audio_url: null });
      } else {
        removeScenesAndPersist([contextMenu.id]);
      }
      if (selectedScene?.id === contextMenu.id) {
         setSelectedScene(null);
      }
    } else if (contextMenu.type === 'clip') {
      setTimelineClips(prev => prev.filter(c => c.id !== contextMenu.id));
      if (isPersistedScene(contextMenu.id)) deleteTimelineItem(contextMenu.id);
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
    // 1. Sync the Remotion Player
    if (remotionPlayerRef.current) {
      // The Player carries V1 scene-video audio only (narration is stripped from
      // remotionPreviewProps), so the V1 track's mute button governs it.
      if (trackStates.V1.muted || trackStates.V1.volume === 0) {
        if (!remotionPlayerRef.current.isMuted()) remotionPlayerRef.current.mute();
      } else {
        if (remotionPlayerRef.current.isMuted()) remotionPlayerRef.current.unmute();
        // Fallback for setVolume if it exists in Remotion Player v4
        if (typeof remotionPlayerRef.current.setVolume === 'function') {
           remotionPlayerRef.current.setVolume(trackStates.V1.volume ?? 1);
        }
      }
      const currentFrame = Math.max(0, Math.round(currentTime * (exportQuality === 'High' ? 60 : 30)));
      if (isPlaying) {
        remotionPlayerRef.current.play();
        // If it drifts by more than 5 frames, snap it back
        if (Math.abs(remotionPlayerRef.current.getCurrentFrame() - currentFrame) > 5) {
          remotionPlayerRef.current.seekTo(currentFrame);
        }
      } else {
        remotionPlayerRef.current.pause();
        remotionPlayerRef.current.seekTo(currentFrame);
      }
    }

    // 2. Sync Native DOM Media Elements
    Object.values(mediaRefs.current).forEach(media => {
      if (!media) return;

      const track = media.dataset.track as 'V1' | 'A1' | 'A2';
      if (track && trackStates[track]) {
        media.muted = trackStates[track].muted || trackStates[track].volume === 0;
        media.volume = trackStates[track].volume !== undefined ? trackStates[track].volume : 1.0;
      }

      const startTime = parseFloat(media.dataset.start || "0");
      const duration = parseFloat(media.dataset.duration || "0");
      const trimStart = parseFloat(media.dataset.trimStart || "0");
      
      // Never trust `duration` alone — it may be a placeholder set before metadata loaded.
      // The element's own duration is authoritative once known, and a target past the end
      // is unreachable: the browser clamps the seek, the drift never closes, and we'd seek
      // again every frame (a futile loop that sounds like static).
      const realDuration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Infinity;
      const isOverlapping = currentTime >= startTime && currentTime < (startTime + duration);
      const rawTarget = (currentTime - startTime) + trimStart;
      const isWithinMedia = rawTarget < realDuration;

      if (isPlaying && isOverlapping && isWithinMedia) {
         const targetTime = rawTarget;
         // Avoid InvalidStateError by only setting currentTime when readyState >= 1 (metadata loaded).
         // `media.seeking` is essential: assigning currentTime starts an async seek that doesn't
         // update currentTime right away, so without this guard the next frame reads the stale
         // value, seeks again, and repeats ~60x/sec — a seek storm that sounds like static.
         if (media.readyState >= 1 && !isNaN(targetTime) && !media.seeking) {
            if (Math.abs(media.currentTime - targetTime) > 0.3) {
               media.currentTime = targetTime;
            }
         }
         if (media.paused) {
            const playPromise = media.play();
            if (playPromise !== undefined) {
               playPromise.catch(e => {
                  console.log("Playback pending metadata load:", e);
                  const retryPlay = () => {
                     media.play().catch(() => {});
                     media.removeEventListener('loadedmetadata', retryPlay);
                     media.removeEventListener('canplay', retryPlay);
                  };
                  media.addEventListener('loadedmetadata', retryPlay);
                  media.addEventListener('canplay', retryPlay);
               });
            }
         }
      } else {
         if (!media.paused) {
            media.pause();
         }
         if (!isPlaying && isOverlapping && isWithinMedia) {
             const targetTime = rawTarget;
             if (media.readyState >= 1 && !isNaN(targetTime) && !media.seeking) {
                 if (Math.abs(media.currentTime - targetTime) > 0.1) {
                     media.currentTime = targetTime;
                 }
             }
         }
      }
    });
  }, [cursorPosition, isPlaying, scale, trackStates, scenes, timelineClips, selectedAsset, exportQuality]);

  const getSceneColor = (status: string) => {
    if (status === 'Completed') return 'border-gray-800 bg-emerald-50 text-emerald-700';
    if (status === 'Simulated') return 'border-gray-800 bg-amber-50 text-amber-700';
    if (status === 'Rendering') return 'border-gray-800 bg-blue-50 text-blue-700';
    if (status === 'Failed') return 'border-red-400 bg-red-50 text-red-700';
    return 'border-gray-800 bg-gray-100 text-gray-700'; // Pending
  };

  const getAspectRatioStyle = () => {
    switch (aspectRatio) {
      case '1:1': return '1 / 1';
      case '9:16': return '9 / 16';
      case '16:9': return '16 / 9';
      default: return '16 / 9';
    }
  };

  // Derive Remotion composition data from scenes state
  const remotionFps = exportQuality === 'High' ? 60 : 30;
  const remotionDimensions = (() => {
    switch (exportResolution) {
      case '1080x1920': return { width: 1080, height: 1920 };
      case '1080x1080': return { width: 1080, height: 1080 };
      default: return { width: 1920, height: 1080 };
    }
  })();

  const remotionScenes: CompositionScene[] = useMemo(() =>
    scenes.map(s => ({
      id: s.id,
      mediaUrl: s.custom_media_url || '',
      mediaType: (s.custom_media_type || 'image') as 'video' | 'image',
      durationInSeconds: s.video_duration || 5,
      trimStartInSeconds: s.trim_start || 0,
      overlay: s.overlay_text && s.overlay_preset !== 'none' ? {
        text: s.overlay_text,
        preset: (s.overlay_preset || 'none') as OverlayPreset,
        color: s.overlay_color || '#FFFFFF',
      } : undefined,
    })),
    [scenes]
  );

  // A1/A2 audio clips for the *render*. Two rules matter here:
  //
  //  1. `asset.persistedUrl`, never `asset.url`. A freshly-uploaded asset keeps its
  //     `blob:` URL for the whole session, and a blob: URL is meaningless to the
  //     headless renderer — it would fail to fetch, or silently produce silence.
  //  2. A muted track exports silent, matching every NLE (CapCut/Premiere): track
  //     mute is an editorial decision, not just a monitoring one.
  const { remotionAudioClips, unexportableClipNames } = useMemo(() => {
    const clips: CompositionAudioClip[] = [];
    const unexportable: string[] = [];

    timelineClips
      .filter(c => c.asset.type === 'audio')
      .forEach(clip => {
        const track = trackStates[clip.trackId as TrackId];
        if (track?.muted || track?.volume === 0) return;

        const src = clip.asset.persistedUrl;
        if (!src) {
          // Deliberately collected rather than dropped in silence — vanishing audio
          // with no explanation is the exact failure this whole change removes.
          unexportable.push(clip.asset.name);
          return;
        }

        clips.push({
          id: clip.id,
          src,
          startInSeconds: clip.startTime,
          durationInSeconds: clip.duration,
          trimStartInSeconds: clip.trimStart || 0,
          volume: track?.volume ?? 1,
        });
      });

    return { remotionAudioClips: clips, unexportableClipNames: unexportable };
  }, [timelineClips, trackStates]);

  const remotionTotalDurationInFrames = useMemo(() => {
    const v1Duration = remotionScenes.reduce((acc, s) => acc + s.durationInSeconds, 0);
    // Clips can extend past the last scene; without them in this max the composition
    // would be cut short and the tail of a music bed would be truncated.
    const clipsEnd = remotionAudioClips.reduce(
      (acc, c) => Math.max(acc, c.startInSeconds + c.durationInSeconds),
      0
    );
    const maxDuration = Math.max(v1Duration, masterAudioDuration || 0, clipsEnd);
    return Math.max(1, Math.round(maxDuration * remotionFps));
  }, [remotionScenes, masterAudioDuration, remotionFps, remotionAudioClips]);

  const remotionInputProps: VideoCompositionProps = useMemo(() => ({
    scenes: remotionScenes,
    audioUrl: masterAudioUrl || undefined,
    audioClips: remotionAudioClips,
    fps: remotionFps,
    width: remotionDimensions.width,
    height: remotionDimensions.height,
    durationInFrames: remotionTotalDurationInFrames,
  }), [remotionScenes, masterAudioUrl, remotionAudioClips, remotionFps, remotionDimensions.width, remotionDimensions.height, remotionTotalDurationInFrames]);

  // The preview Player deliberately gets NO narration track and NO A1/A2 clips:
  // hidden native <audio> elements are the single source of both while editing, and
  // feeding the same files to the Player as well makes each play twice, out of sync.
  // Dropping only the audio fields lets the Player stay unmuted so V1 scene videos
  // keep their own soundtracks — which is otherwise silenced entirely, since the
  // per-scene <audio> fallback below only renders when there's no master narration.
  // The render payload keeps both; the editor is the only place they'd collide.
  const remotionPreviewProps: VideoCompositionProps = useMemo(
    () => ({ ...remotionInputProps, audioUrl: undefined, audioClips: undefined }),
    [remotionInputProps]
  );

  const statusChip = {
    exported: { label: 'Exported', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
    rendering: { label: 'Rendering', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Loader2 size={11} className="animate-spin" /> },
    failed: { label: 'Render failed', cls: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={11} /> },
    pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: <Clock size={11} /> },
    drafting: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Film size={11} /> },
  }[projectStatus];

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      {/* Editor header. Lives here rather than in the server page so its actions can
          reach real editor state — that separation is why the old buttons were dead. */}
      <header className="flex items-center justify-between px-3 h-12 flex-none bg-white border-b border-gray-200 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
            title="Back to workspace"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="h-5 w-px bg-gray-200 shrink-0" />
          <h1 className="text-[13px] font-bold text-gray-900 truncate" title={initialProject.topic || 'Untitled Video'}>
            {initialProject.topic || 'Untitled Video'}
          </h1>
          <span className={`shrink-0 flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border ${statusChip.cls}`}>
            {statusChip.icon}
            {statusChip.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mr-1">
            <Clock size={12} />
            {formatDuration(contentDuration)}
          </span>
          <button
            onClick={handleRenderVideo}
            disabled={isRendering || scenes.length === 0}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            title={scenes.length === 0 ? 'Add at least one scene to export' : 'Render this project to an .mp4'}
          >
            {isRendering ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isRendering ? 'Rendering…' : 'Export'}
          </button>
        </div>
      </header>

      {/* Background-persistence failures. Floating rather than inline so it never
          shifts the timeline layout, and dismissible so it can't trap the user. */}
      {persistenceWarning && (
        <div className="fixed bottom-4 right-4 z-[200] max-w-sm bg-amber-50 border border-amber-300 rounded-lg shadow-lg p-3 flex items-start gap-2.5">
          <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-amber-900 mb-0.5">Changes may not be saved</p>
            <p className="text-[10px] text-amber-800 leading-relaxed">{persistenceWarning}</p>
          </div>
          <button
            onClick={() => setPersistenceWarning(null)}
            className="text-amber-600 hover:text-amber-900 text-xs font-bold leading-none shrink-0"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hidden Media Elements for Audio Sync */}
      <div className="hidden">
         {/* Master narration audio (single file, audio-first) */}
         {masterAudioUrl && (
           <audio
             key="master-narration"
             src={masterAudioUrl}
             // The element lives in a display:none wrapper, where browsers are free to
             // resolve preload to "none" — without this the duration is never learned,
             // which leaves the A1 block spanning the whole ruler and makes the sync
             // effect chase seek targets past the end of the file.
             preload="auto"
             ref={el => {
               masterAudioRef.current = el;
               mediaRefs.current["master-narration"] = el;
               if (el && el.readyState >= 1) {
                 const d = el.duration;
                 if (Number.isFinite(d) && d > 0) {
                    setMasterAudioDuration(d);
                 }
               }
             }}
             data-start="0"
             data-duration={masterAudioDuration || 9999}
             data-track="A1"
             muted={trackStates.A1.muted}
             onLoadedMetadata={(e) => {
               const d = (e.target as HTMLAudioElement).duration;
               if (Number.isFinite(d) && d > 0) setMasterAudioDuration(d);
             }}
             onCanPlay={(e) => {
               const d = (e.target as HTMLAudioElement).duration;
               if (Number.isFinite(d) && d > 0) setMasterAudioDuration(d);
             }}
             onDurationChange={(e) => {
               const d = (e.target as HTMLAudioElement).duration;
               if (Number.isFinite(d) && d > 0) setMasterAudioDuration(d);
             }}
           />
         )}
         {/* Per-scene audio clips — used only when no master narration exists */}
         {!masterAudioUrl && scenes.map((scene, idx) => scene.audio_url && (
            <audio
              key={`audio-scene-${scene.id}`}
              src={scene.audio_url}
              ref={el => { mediaRefs.current[`scene-${scene.id}`] = el; }}
              data-start={scenes.slice(0, idx).reduce((acc, s) => acc + (s.video_duration || 5), 0)}
              data-duration={scene.video_duration || 5}
              data-track="A1"
              muted={trackStates.A1.muted}
            />
         ))}
         {/* Timeline Audio Clips (A1 & A2) */}
         {timelineClips.filter(c => c.asset.type === 'audio').map(clip => (
            <audio
              key={`clip-${clip.id}`}
              src={clip.asset.url}
              ref={el => { mediaRefs.current[`clip-${clip.id}`] = el; }}
              data-start={clip.startTime}
              data-duration={clip.duration}
              // The playback sync effect reads data-trim-start; without it a trimmed
              // clip previewed from its head while the export honoured the trim, so
              // editor and .mp4 disagreed.
              data-trim-start={clip.trimStart || 0}
              data-track={clip.trackId}
              muted={trackStates[clip.trackId as 'A1' | 'A2']?.muted || false}
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
                         label.innerText = asset.name;
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
                         {/* Upload state — a failed upload means this asset won't survive a reload */}
                         {asset.uploadStatus === 'uploading' && (
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white font-bold flex items-center gap-1 z-10">
                              <Loader2 size={9} className="animate-spin" /> Saving
                            </div>
                         )}
                         {asset.uploadStatus === 'failed' && (
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-600 rounded text-[9px] text-white font-bold z-10" title="Upload failed — this file won't persist after a reload">
                              Not saved
                            </div>
                         )}
                         {/* Audio Quick Add Buttons */}
                         {asset.type === 'audio' && (
                           <div className="absolute bottom-1 right-1 flex items-center gap-1 z-20">
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 addTimelineClip(asset, 'A1', 0, Math.min(asset.duration || 5, 5));
                               }}
                               className="px-1.5 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-[9px] font-bold transition-colors shadow-sm"
                               title="Add to Track A1 at 0s"
                             >
                               + A1
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 addTimelineClip(asset, 'A2', 0, Math.min(asset.duration || 5, 5));
                               }}
                               className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold transition-colors shadow-sm"
                               title="Add to Track A2 at 0s"
                             >
                               + A2
                             </button>
                           </div>
                         )}
                       </div>
                       
                       {/* Filename Below */}
                       <span className="text-[10px] text-gray-600 group-hover/asset:text-purple-600 font-medium truncate w-full text-center px-0.5 transition-colors" title={asset.name}>
                         {asset.name}
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
                {selectedTimelineClip && (selectedSceneTrack === 'A1' || selectedSceneTrack === 'A2') ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                      <div className="bg-blue-100 text-blue-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm">
                        <Music size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">{selectedSceneTrack === 'A1' ? 'A1 Audio Clip' : 'A2 Custom Audio'}</h3>
                        <span className="text-[10px] text-gray-400 font-mono">FILE: {selectedTimelineClip.asset.name}</span>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-900 mb-2">Audio Preview</p>
                      <audio src={selectedTimelineClip.asset.url} controls className="w-full h-8" />
                    </div>

                    {/* Left to Right Trimming & Duration Controls */}
                    <div className="space-y-4 pt-2">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Trim & Duration (Left to Right)</h4>
                      
                      {/* Duration Control (Decrease from left to right) */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-gray-700">Clip Duration (seconds)</label>
                          <span className="text-xs font-bold text-blue-600 font-mono">{selectedTimelineClip.duration.toFixed(1)}s</span>
                        </div>
                        <input 
                          type="range"
                          min="0.5"
                          max={selectedTimelineClip.asset.duration || 15}
                          step="0.5"
                          value={selectedTimelineClip.duration}
                          onChange={(e) => {
                            const newDur = parseFloat(e.target.value);
                            setTimelineClips(prev => prev.map(c => c.id === selectedTimelineClip.id ? { ...c, duration: newDur } : c));
                            setSelectedTimelineClip(prev => prev ? { ...prev, duration: newDur } : null);
                            persistTimelineItemFields(selectedTimelineClip.id, { duration: newDur }, true);
                          }}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-[10px] text-gray-400">Decrease duration from left to right on the A2 track.</p>
                      </div>

                      {/* Trim Start from Left */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-gray-700">Trim Start (Left edge)</label>
                          <span className="text-xs font-bold text-blue-600 font-mono">{(selectedTimelineClip.trimStart || 0).toFixed(1)}s</span>
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={(selectedTimelineClip.asset.duration || 15) - 0.5}
                          step="0.5"
                          value={selectedTimelineClip.trimStart || 0}
                          onChange={(e) => {
                            const newTrim = parseFloat(e.target.value);
                            const maxDur = selectedTimelineClip.asset.duration || 15;
                            const remainingDur = Math.max(0.5, maxDur - newTrim);
                            setTimelineClips(prev => prev.map(c => c.id === selectedTimelineClip.id ? { 
                              ...c, 
                              trimStart: newTrim,
                              duration: Math.min(c.duration, remainingDur)
                            } : c));
                            setSelectedTimelineClip(prev => prev ? {
                              ...prev,
                              trimStart: newTrim,
                              duration: Math.min(prev.duration, remainingDur)
                            } : null);
                            persistTimelineItemFields(selectedTimelineClip.id, {
                              trim_start: newTrim,
                              duration: Math.min(selectedTimelineClip.duration, remainingDur),
                            }, true);
                          }}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-[10px] text-gray-400">Trim off the beginning of the audio from left to right.</p>
                      </div>

                      {/* Start Time on Timeline */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-gray-700">Timeline Position (Start Time)</label>
                          <span className="text-xs font-bold text-gray-700 font-mono">{selectedTimelineClip.startTime.toFixed(1)}s</span>
                        </div>
                        <input 
                          type="number"
                          step="0.5"
                          min="0"
                          value={selectedTimelineClip.startTime}
                          onChange={(e) => {
                            const newStart = Math.max(0, parseFloat(e.target.value) || 0);
                            setTimelineClips(prev => prev.map(c => c.id === selectedTimelineClip.id ? { ...c, startTime: newStart } : c));
                            setSelectedTimelineClip(prev => prev ? { ...prev, startTime: newStart } : null);
                            persistTimelineItemFields(selectedTimelineClip.id, { start_time: newStart }, true);
                          }}
                          className="w-full p-2 text-xs border border-gray-200 rounded-md font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
                      <button 
                        onClick={() => {
                          setTimelineClips(prev => prev.filter(c => c.id !== selectedTimelineClip.id));
                          setSelectedTimelineClip(null);
                          setSelectedSceneTrack(null);
                        }}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold py-2 px-3 rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 size={14} /> Delete Clip
                      </button>
                    </div>
                  </div>
                ) : !selectedScene ? (
                   <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-70 mt-12">
                     <Layers size={40} className="text-gray-300 mb-4" />
                     <h3 className="text-sm font-semibold text-gray-600 mb-2">No Scene Selected</h3>
                     <p className="text-xs text-gray-500">Click a scene block on the timeline below to view and edit its properties.</p>
                     
                     <div className="w-full mt-10 pt-6 border-t border-gray-100 text-left">
                       <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Project Summary</h4>
                       <p className="text-sm text-gray-800 font-bold mb-1 line-clamp-2">{initialProject.topic}</p>
                       <p className="text-xs text-gray-500 mb-2 font-medium">{scenes.length} Scenes • {Math.round(contentDuration)} seconds</p>

                       {/* Master narration status badge */}
                       {masterAudioUrl && (
                         <div className="flex items-center gap-2 mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-none" />
                           <span className="text-[10px] font-bold text-green-700 truncate">
                             Narration ready{masterAudioDuration > 0 ? ` · ${Math.round(masterAudioDuration)}s` : ' · on A1'}
                           </span>
                         </div>
                       )}

                        {availableVoices.length > 0 && (
                          <div className="mb-3">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                              Voice Artist
                            </label>
                            <select
                              value={selectedVoiceId}
                              onChange={(e) => setSelectedVoiceId(e.target.value)}
                              className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
                            >
                              <option value="">Auto (Default for active engine)</option>
                              {availableVoices.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} ({v.engine} · {v.gender || "voice"})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                       <button
                         onClick={handleGenerateFullNarration}
                         disabled={isGeneratingNarration}
                         className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-2"
                       >
                         {isGeneratingNarration ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                         {isGeneratingNarration
                           ? 'Generating Narration…'
                           : masterAudioUrl
                             ? 'Re-generate Narration'
                             : 'Generate Full Narration'}
                       </button>
                       <p className="text-[10px] text-gray-400 text-center">One continuous audio on A1 · align V1 b-roll to match</p>
                     </div>
                   </div>
                ) : (
                   <div className="flex flex-col gap-4 flex-1">
                     <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                        <div className="bg-purple-100 text-purple-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm shrink-0">
                          {selectedScene.sequence_number}
                        </div>
                        <div className="flex items-center justify-between flex-1">
                          <h3 className="font-bold text-gray-900 text-sm">Scene Properties</h3>
                          <span className="text-[10px] text-gray-400 font-mono bg-gray-50 border border-gray-100 px-2 py-1 rounded-md">ID: {selectedScene.id.substring(0,8)}</span>
                        </div>
                     </div>
                     
                     {/* ── Voiceover Accordion ── */}
                     <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <button
                          onClick={() => setIsVoiceoverExpanded(prev => !prev)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <Volume2 size={14} className="text-green-600" /> Voiceover Text
                          </span>
                          {isVoiceoverExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </button>
                        {isVoiceoverExpanded && (
                          <div className="p-3 bg-white border-t border-gray-100 space-y-3">
                           <textarea 
                             className="w-full bg-white border border-gray-200 focus:border-purple-400 focus:ring-4 focus:ring-purple-100 rounded-lg p-3 text-sm text-gray-800 transition-all resize-none min-h-[80px] shadow-sm"
                             value={selectedScene.voice_over_beat}
                             onChange={(e) => updateSceneDetails(selectedScene.id, 'voice_over_beat', e.target.value)}
                             onBlur={(e) => persistSceneFields(selectedScene.id, { voice_over_beat: e.target.value })}
                           />
                           {availableVoices.length > 0 && (
                             <div>
                               <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                 Voice Artist
                               </label>
                               <select
                                 value={selectedVoiceId}
                                 onChange={(e) => setSelectedVoiceId(e.target.value)}
                                 className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-200"
                               >
                                 <option value="">Auto (Default for active engine)</option>
                                 {availableVoices.map((v) => (
                                   <option key={v.id} value={v.id}>
                                     {v.name} ({v.engine} · {v.gender || "voice"})
                                   </option>
                                 ))}
                               </select>
                             </div>
                           )}
                           <div className="flex justify-between items-center">
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
                             <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 shadow-sm">
                               <audio src={selectedScene.audio_url} controls className="w-full h-8 outline-none" />
                             </div>
                           )}
                          </div>
                        )}
                     </div>

                     {/* ── Text Overlay Accordion ── */}
                     <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <button
                          onClick={() => setIsOverlayExpanded(prev => !prev)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <Type size={14} className="text-amber-500" /> Text Overlay
                          </span>
                          {isOverlayExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </button>
                        {isOverlayExpanded && (
                          <div className="p-3 bg-white border-t border-gray-100 space-y-3">
                            {/* Overlay Text */}
                            <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Overlay Text</label>
                              <input
                                type="text"
                                className="w-full bg-white border border-gray-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 rounded-lg p-2 text-sm text-gray-800 transition-all shadow-sm"
                                value={selectedScene.overlay_text || ''}
                                onChange={(e) => updateSceneDetails(selectedScene.id, 'overlay_text', e.target.value)}
                                placeholder="e.g. Welcome to the future!"
                              />
                            </div>
                            {/* Preset & Color */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Animation</label>
                                <select
                                  value={selectedScene.overlay_preset || 'none'}
                                  onChange={(e: any) => updateSceneDetails(selectedScene.id, 'overlay_preset', e.target.value)}
                                  className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                >
                                  <option value="none">None</option>
                                  <option value="slide">Slide In</option>
                                  <option value="pop">Pop In (Hormozi)</option>
                                  <option value="typewriter">Typewriter</option>
                                  <option value="lower-third">Lower Third</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1">Color</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={selectedScene.overlay_color || '#FFFFFF'}
                                    onChange={(e) => updateSceneDetails(selectedScene.id, 'overlay_color', e.target.value)}
                                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                                  />
                                  <span className="text-[10px] text-gray-500 font-mono">{selectedScene.overlay_color || '#FFFFFF'}</span>
                                </div>
                              </div>
                            </div>
                            {selectedScene.overlay_text && selectedScene.overlay_preset !== 'none' && (
                              <p className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                                ✨ Preview this overlay in the main video player above.
                              </p>
                            )}
                          </div>
                        )}
                     </div>

                      {/* ── Visual Generation Accordion ── */}
                     <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex-1 flex flex-col">
                        <button
                          onClick={() => setIsVisualExpanded(prev => !prev)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <ImageIcon size={14} className="text-blue-500" /> Visual Generation
                          </span>
                          {isVisualExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </button>
                        {isVisualExpanded && (
                          <div className="p-3 bg-white border-t border-gray-100 space-y-3 flex-1 flex flex-col">

                           {/* AI Model & Duration */}
                           <div className="grid grid-cols-2 gap-2">
                              <div>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">AI Video Model</label>
                                 <select
                                   value={selectedScene.ai_model || selectedAiModel}
                                   onChange={(e: any) => updateSceneDetails(selectedScene.id, 'ai_model', e.target.value)}
                                   className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                 >
                                   <optgroup label="Live — real render">
                                     <option value="gemini-image">Google Gemini Pro Image</option>
                                   </optgroup>
                                   <optgroup label="Simulated — no API key configured">
                                     <option value="fal-luma">Fal.ai Luma Dream</option>
                                     <option value="fal-kling">Fal.ai Kling AI</option>
                                     <option value="fal-minimax">Fal.ai Minimax</option>
                                     <option value="gemini-veo">Google Gemini / Veo</option>
                                     <option value="runway-gen3">Runway Gen-3</option>
                                     <option value="mock-banana">Mock Generate (Free Test 🍌)</option>
                                   </optgroup>
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">Clip Duration</label>
                                 <select
                                   value={selectedScene.video_duration || 5}
                                   onChange={(e: any) => updateSceneDetails(selectedScene.id, 'video_duration', Number(e.target.value))}
                                   className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                 >
                                   {/* Deepgram writes exact narration-aligned durations (e.g. 4.7s).
                                       Surface that value so the select isn't blank and picking it back
                                       doesn't silently snap the scene off the voiceover. */}
                                   {selectedScene.video_duration != null && ![5, 8, 10].includes(Number(selectedScene.video_duration)) && (
                                     <option value={selectedScene.video_duration}>
                                       {Number(selectedScene.video_duration).toFixed(1)}s (narration-aligned)
                                     </option>
                                   )}
                                   <option value={5}>5 seconds</option>
                                   <option value={8}>8 seconds</option>
                                   <option value={10}>10 seconds</option>
                                 </select>
                              </div>
                           </div>

                           <textarea 
                             className="w-full bg-white border border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 rounded-lg p-3 text-sm text-gray-800 transition-all resize-none min-h-[200px] flex-1 shadow-sm"
                             value={selectedScene.final_video_prompt}
                             onChange={(e) => updateSceneDetails(selectedScene.id, 'final_video_prompt', e.target.value)}
                             onBlur={(e) => persistSceneFields(selectedScene.id, { final_video_prompt: e.target.value })}
                             placeholder="Describe the visual scene in detail..."
                           />
                           <div className="flex flex-col gap-3 mt-2">
                              {/* Inline Toggle Switch */}
                              <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200/60">
                                <span className="text-[11px] font-bold text-gray-600">Apply to all subsequent scenes</span>
                                <button
                                  onClick={() => setGenerateMode(generateMode === 'all' ? 'individual' : 'all')}
                                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                                    generateMode === 'all' ? 'bg-purple-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                                      generateMode === 'all' ? 'translate-x-3.5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                              
                              {/* Primary Action Button */}
                              {generateMode === 'all' ? (
                                <button
                                  onClick={handleGenerateAllVisuals}
                                  disabled={isGeneratingAllVisuals}
                                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex justify-center items-center gap-2"
                                  title="Automatically generate videos for Scene 1 to N"
                                >
                                  {isGeneratingAllVisuals ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                  {isGeneratingAllVisuals ? "Generating 1→N..." : "Generate All Scenes (1→N)"}
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleGenerateSceneVisual(selectedScene.id, selectedScene.final_video_prompt, selectedScene.ai_model || selectedAiModel, selectedScene.video_duration || 5)}
                                  disabled={isGeneratingVisualId === selectedScene.id}
                                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors flex justify-center items-center gap-2"
                                >
                                  {isGeneratingVisualId === selectedScene.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <ImageIcon size={14} />
                                  )}
                                  {selectedScene.custom_media_url ? "Regenerate Current Scene" : "Render Current Scene"}
                                </button>
                              )}
                           </div>
                          </div>
                        )}
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
                     <label className="block text-xs font-bold text-gray-600 mb-1.5">Default AI Model</label>
                     <select
                       value={selectedAiModel}
                       onChange={(e) => setSelectedAiModel(e.target.value as typeof selectedAiModel)}
                       className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 shadow-sm font-medium"
                     >
                       <option value="gemini-image">Google Gemini Pro Image (Real)</option>
                       <option value="mock-banana">Mock Generate (Free Test 🍌)</option>
                       <option value="fal-luma">Fal.ai — Luma Dream Machine</option>
                       <option value="fal-kling">Fal.ai — Kling Video</option>
                       <option value="fal-minimax">Fal.ai — MiniMax</option>
                       <optgroup label="Simulated — no API key configured">
                         <option value="gemini-veo">Google Gemini / Veo</option>
                         <option value="runway-gen3">Runway Gen-3</option>
                       </optgroup>
                     </select>
                     <p className="text-[10px] text-gray-400 mt-1">Used by &ldquo;Generate All&rdquo; and as the fallback for scenes with no model set.</p>
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-gray-600 mb-1.5">Resolution</label>
                     <select 
                       value={exportResolution}
                       onChange={(e: any) => setExportResolution(e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 shadow-sm font-medium"
                     >
                       <option value="1080x1920">1080x1920 (9:16 Shorts)</option>
                       <option value="1920x1080">1920x1080 (16:9 Landscape)</option>
                       <option value="1080x1080">1080x1080 (1:1 Square)</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-gray-600 mb-1.5">Quality</label>
                     <select 
                       value={exportQuality}
                       onChange={(e: any) => setExportQuality(e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 shadow-sm font-medium"
                     >
                       <option value="High">High (1080p, 60fps)</option>
                       <option value="Standard">Standard (1080p, 30fps)</option>
                       <option value="Draft">Draft (720p, 30fps)</option>
                     </select>
                   </div>
                   
                   <div className="pt-6 mt-4 border-t border-gray-100">
                     {renderOutputPath ? (
                        <a
                          href={`/api/render/download?path=${encodeURIComponent(renderOutputPath)}`}
                          download
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={18} /> Download Video
                        </a>
                     ) : (
                       <button 
                         onClick={handleRenderVideo}
                         disabled={isRendering}
                         className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                       >
                         {isRendering ? (
                           <>
                             <Loader2 size={18} className="animate-spin" /> Rendering Video...
                           </>
                         ) : (
                           <>
                             <Download size={18} /> Render & Export Video
                           </>
                         )}
                       </button>
                     )}
                     
                     {renderStatusMessage && !renderOutputPath && (
                        <div className="mt-4 p-4 rounded-xl border text-xs font-medium break-all bg-gray-50 border-gray-200 text-gray-700">
                          {renderStatusMessage}
                        </div>
                      )}

                     <p className="text-center text-[10px] text-gray-500 font-medium mt-3">Estimated cloud render time: 5-15 seconds</p>
                   </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Middle Panel (Main Video Preview — Remotion Player) */}
        <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-4 lg:p-8 border-l border-r border-gray-200 shadow-inner overflow-hidden">
           
           {/* Maximized player container that respects aspect ratio */}
           <div className="w-full h-full flex flex-col items-center justify-center pb-4">
             <div 
               className="bg-black rounded-2xl overflow-hidden shadow-2xl relative flex flex-col items-center justify-center border border-gray-800 transition-all duration-300 w-full max-h-full"
               style={{ 
                 aspectRatio: getAspectRatioStyle(),
                 maxWidth: aspectRatio === '16:9' ? '100%' : 'min(100%, 80vh)'
               }}
             >
               
               {/* Media Asset Preview (when an asset is explicitly selected from the media panel) */}
               {selectedAsset ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                     {selectedAsset.type === 'video' ? (
                        <video src={selectedAsset.url} controls playsInline className="w-full h-full object-contain" autoPlay />
                     ) : selectedAsset.type === 'image' ? (
                        <img src={selectedAsset.url} className="w-full h-full object-contain" alt="Asset Preview" />
                     ) : (
                        <div className="flex flex-col items-center text-gray-400 bg-gray-900 w-full h-full justify-center">
                           <Music size={64} className="mb-6 opacity-50 text-purple-500" />
                           <p className="text-sm font-bold mb-4">{selectedAsset.name}</p>
                           <audio src={selectedAsset.url} controls className="w-3/4 max-w-sm outline-none" autoPlay />
                        </div>
                     )}
                  </div>
               ) : scenes.length > 0 ? (
                  /* Remotion Player — renders the full composition with all scenes and overlays */
                  <div className="absolute inset-0">
                    <Player
                      ref={remotionPlayerRef}
                      component={VideoComposition}
                      inputProps={remotionPreviewProps}
                      durationInFrames={remotionTotalDurationInFrames}
                      compositionWidth={remotionDimensions.width}
                      compositionHeight={remotionDimensions.height}
                      fps={remotionFps}
                      style={{ width: '100%', height: '100%' }}
                      controls={false}
                      autoPlay={false}
                      loop={false}
                      // Remotion's Player has no `muted` prop — only `initiallyMuted`,
                      // plus imperative mute()/unmute() applied in the sync effect.
                      // The Player supplies V1 scene-video audio only (narration is
                      // stripped from remotionPreviewProps), so the V1 mute button drives it.
                      initiallyMuted={trackStates.V1.muted}
                    />
                  </div>
               ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-900">
                     <MonitorPlay size={48} className="mb-4 opacity-50" />
                     <p className="font-medium text-sm">Select a scene to preview</p>
                  </div>
               )}

             </div>
           </div>
        </div>


        {/* Right Panel (CapCut-style File Details / Properties) */}
        {selectedScene && (!selectedTimelineClip || (selectedSceneTrack !== 'A1' && selectedSceneTrack !== 'A2')) && activeTab === 'scene' && (
           <div className="w-[300px] lg:w-[320px] bg-white flex flex-col flex-none shadow-[-2px_0_10px_rgba(0,0,0,0.05)] z-10 h-full">
              {/* Tab Header */}
              <div className="flex items-center border-b border-gray-100 p-2 gap-1 bg-gray-50/50">
                 <div className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold bg-white text-gray-900 shadow-sm border border-gray-200">
                    <Info size={14} className="text-gray-500" /> Details
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                 <div className="space-y-5">
                    {/* Thumbnail Preview */}
                    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black aspect-video relative">
                       {selectedScene.custom_media_url ? (
                         selectedScene.custom_media_type === 'video' ? (
                           <video src={selectedScene.custom_media_url} className="w-full h-full object-contain" muted preload="metadata" />
                         ) : (
                           <img src={selectedScene.custom_media_url} className="w-full h-full object-contain" alt="Scene thumbnail" />
                         )
                       ) : (
                         <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900">
                           <Film size={32} className="opacity-40 mb-2" />
                           <span className="text-[10px] font-medium opacity-60">No media yet</span>
                         </div>
                       )}
                       <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] text-white font-mono font-bold">
                         Scene {selectedScene.sequence_number}
                       </div>
                    </div>

                    {/* Properties Table */}
                    <div className="space-y-0 border border-gray-200 rounded-lg overflow-hidden">
                       {/* Name */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</span>
                         <span className="text-[11px] font-semibold text-gray-800 text-right truncate max-w-[160px]" title={selectedScene.voice_over_beat}>
                           {selectedScene.custom_media_url ? (selectedScene.voice_over_beat?.substring(0, 30) || 'Scene ' + selectedScene.sequence_number) : 'Scene ' + selectedScene.sequence_number}
                         </span>
                       </div>
                       {/* Source */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Source</span>
                         <span className="text-[11px] font-semibold text-gray-800">
                           {selectedScene.generation_status === 'Simulated'
                             ? 'Simulated Placeholder'
                             : selectedScene.custom_media_url
                               ? selectedScene.assetId ? 'Local Upload' : 'AI Generated'
                               : 'Draft (No Media)'}
                         </span>
                       </div>
                       {/* Type */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</span>
                         <span className="text-[11px] font-semibold text-gray-800 capitalize">
                           {selectedScene.custom_media_type || 'text'}
                         </span>
                       </div>
                       {/* Duration */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Duration</span>
                         <span className="text-[11px] font-bold text-gray-800 font-mono">
                           {(selectedScene.video_duration || 5).toFixed(1)}s
                         </span>
                       </div>
                       {/* Resolution */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Resolution</span>
                         <span className="text-[11px] font-semibold text-gray-800">
                           {aspectRatio === '9:16' ? '1080 × 1920' : aspectRatio === '1:1' ? '1080 × 1080' : '1920 × 1080'}
                         </span>
                       </div>
                       {/* FPS */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Frame Rate</span>
                         <span className="text-[11px] font-semibold text-gray-800">
                           {exportQuality === 'High' ? '60 fps' : '30 fps'}
                         </span>
                       </div>
                       {/* Track */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Track</span>
                         <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                           V1 — Video
                         </span>
                       </div>
                       {/* Status */}
                       <div className="flex items-center justify-between px-3 py-2.5 bg-white">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</span>
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                           selectedScene.generation_status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                           selectedScene.generation_status === 'Simulated' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                           selectedScene.generation_status === 'Rendering' ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                           'bg-gray-100 text-gray-600 border-gray-200'
                         }`}>
                           {selectedScene.generation_status || 'Pending'}
                         </span>
                       </div>
                    </div>

                    {/* Audio Info (if narration exists) */}
                    {(selectedScene.audio_url || masterAudioUrl) && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Volume2 size={12} className="text-green-600" /> Audio
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</span>
                          <span className="text-[11px] font-semibold text-gray-800">
                            {masterAudioUrl ? 'Full Narration' : 'Per-Scene TTS'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Track</span>
                          <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                            A1 — Audio
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Scene ID */}
                    <div className="text-center pt-2 border-t border-gray-100">
                       <span className="text-[9px] font-mono text-gray-400">ID: {selectedScene.id}</span>
                    </div>
                 </div>
              </div>
           </div>
        )}
      </div>

      {/* Resizer Handle */}
      <div 
        className="h-1.5 w-full bg-gray-200 border-y border-gray-300 cursor-row-resize hover:bg-purple-200 transition-colors flex items-center justify-center flex-none z-20"
        onMouseDown={() => setIsResizingPanel(true)}
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
             {/* NOTE: an "Undo" button used to sit here with no onClick handler.
                 Removed rather than faked — real undo needs an inverse-operation log
                 (a delete must be re-inserted into Supabase, not just restored in
                 React state), which is a feature in its own right, not a wiring fix.
                 A button that looks live and does nothing is worse than no button. */}
             <button
                onClick={() => {
                  const allKeys: string[] = [
                    ...scenes.map(s => `${s.id}_V1`),
                    ...scenes.map(s => `${s.id}_A1`),
                    ...timelineClips.map(c => `${c.id}_${c.trackId}`)
                  ];
                  setSelectedSceneKeys(allKeys);
                }}
                className="text-gray-500 hover:text-purple-600 transition-colors flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded hover:bg-purple-50"
                title="Select All items across V1, A1, A2 (Ctrl+A)"
              >
                <Layers size={13} /> Select All
              </button>
             {/* Destructive actions deliberately do NOT live in the toolbar. A delete
                 button that appears on selection is easy to hit by accident and is
                 detached from the thing it deletes; deletion belongs on the item's own
                 right-click menu (and the Delete key). What the toolbar shows instead
                 is a passive selection count, which is information, not a hazard. */}
             {selectedSceneKeys.length > 0 && (
               <span className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-md animate-in fade-in duration-150">
                 <Layers size={12} />
                 {selectedSceneKeys.length} selected
                 <span className="text-purple-400 font-medium">— right-click to delete</span>
               </span>
             )}
          </div>

          {/* Centered Play Button & Skip to Start */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
             <button 
                onClick={() => {
                   setCursorPosition(0);
                   setSelectedAsset(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-md shadow-sm transition-colors border bg-white text-gray-700 hover:text-purple-600 border-gray-200"
                title="Skip to Beginning (0s)"
             >
                <SkipBack size={14} />
             </button>
             <button 
                onClick={() => {
                   setSelectedAsset(null);
                   setIsPlaying(!isPlaying);
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-md shadow-sm transition-colors border ${isPlaying ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-gray-700 hover:text-purple-600 border-gray-200'}`}
                title={isPlaying ? "Pause" : "Play"}
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
        <div className="flex-1 overflow-x-auto overflow-y-auto relative pb-6 pt-1 custom-scrollbar bg-gray-50/30 z-10"
           onKeyDown={(e) => { if (e.key === 'Backspace' || e.key === 'Delete') handleDeleteSelectedScenes(); }}>
           
           <div className="min-w-max relative">
              {/* Playhead Vertical Line */}
              <div 
                className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
                style={{ left: `calc(8rem + ${cursorPosition}px)`, transform: 'translateX(-50%)' }}
              >
                 <div className="w-px h-full bg-black shadow-[0_0_8px_rgba(0,0,0,0.3)]"></div>
              </div>

              {/* Ruler Track */}
              <div className="flex items-end mb-1 relative group w-max">
                 <div className="w-32 shrink-0 sticky left-0 z-50 bg-white h-6 border-b border-gray-200 pr-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] before:absolute before:-inset-y-4 before:inset-x-0 before:bg-white before:-z-10 before:border-r before:border-gray-200"></div>
                 <div 
                    className="relative h-6 border-b border-gray-200 cursor-pointer"
                    style={{ width: `${timelineDuration * scale}px` }}
                    onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       setCursorPosition(e.clientX - rect.left);
                       setSelectedAsset(null);
                       setSelectedSceneKeys([]);
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
                      className="absolute top-0 h-6 z-50 pointer-events-none flex flex-col items-center"
                      style={{ left: `${cursorPosition}px`, transform: 'translateX(-50%)' }}
                    >
                       <div className="w-3 h-3 bg-black rounded-sm mb-0.5 relative flex items-center justify-center z-50 shadow-sm">
                          <div className="absolute -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[4px] border-t-black"></div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Video Track (V1) */}
              <div className="flex items-stretch group relative">
                 <div className={`w-32 shrink-0 sticky left-0 ${activeVolumePopup === 'V1' ? 'z-[60]' : 'z-[52]'} bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400`}>
                    <span 
                      className="text-[13px] font-bold text-gray-600 cursor-pointer hover:text-purple-600 transition-colors"
                      onClick={() => {
                        const allV1Keys = [
                          ...scenes.map(s => `${s.id}_V1`),
                          ...timelineClips.filter(c => c.trackId === 'V1').map(c => `${c.id}_V1`)
                        ];
                        setSelectedSceneKeys(allV1Keys);
                        setSelectedScene(null);
                        setSelectedTimelineClip(null);
                        setSelectedSceneTrack(null);
                      }}
                      title="Select all on V1"
                    >
                      V1
                    </span>
                    <button onClick={() => toggleTrackState('V1', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.V1.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.V1.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setActiveVolumePopup(activeVolumePopup === 'V1' ? null : 'V1'); }} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.V1.muted || trackStates.V1.volume === 0 ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                         {trackStates.V1.muted || trackStates.V1.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                         <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Volume</div>
                      </button>
                      {activeVolumePopup === 'V1' && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 p-2 w-10 h-36 bg-purple-900 border border-purple-700/50 rounded-xl shadow-2xl z-[100] flex flex-col items-center justify-between cursor-default" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] font-bold text-purple-100">{Math.round((trackStates.V1.volume ?? 1) * 100)}</span>
                          <div className="relative flex-1 w-full h-full flex justify-center overflow-hidden">
                             <input 
                               type="range" min="0" max="1" step="0.05" 
                               value={trackStates.V1.volume ?? 1} 
                               onChange={e => {
                                  const vol = parseFloat(e.target.value);
                                  setTrackVolume('V1', vol);
                               }} 
                               className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90px] h-1.5 appearance-none bg-purple-950 rounded-full outline-none accent-purple-400 -rotate-90 origin-center cursor-pointer"
                             />
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
                 <div 
                   className={`flex flex-1 relative h-16 rounded-r-md items-center border-y border-r shadow-sm transition-all ${trackStates.V1.locked ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60 grayscale' : 'bg-white border-gray-100 cursor-pointer'}`} 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                     setSelectedSceneKeys([]);
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
                           if (trackStates.V1.locked) return;
                           handleSelectSceneBlock(e, scene, 'V1', idx);
                         }}
                         onContextMenu={(e) => {
                           e.preventDefault();
                           if (trackStates.V1.locked) return;
                           setContextMenu({ x: e.pageX, y: e.pageY, type: 'scene', id: scene.id, trackId: 'V1' });
                         }}
                         className={`h-[80%] absolute top-[10%] rounded-md border ${getSceneColor(scene.generation_status)} cursor-pointer transition-all overflow-hidden group/block shadow-sm ${
                           selectedSceneKeys.includes(`${scene.id}_V1`) || (selectedScene?.id === scene.id && selectedSceneTrack === 'V1' && selectedSceneKeys.length === 0)
                             ? 'ring-2 ring-purple-500 ring-offset-1 z-20 scale-[1.02] bg-purple-500/20'
                             : 'hover:brightness-95 z-10'
                         }`}
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
                                          src={`${scene.custom_media_url}#t=${(scene.trim_start || 0) + (getSceneDuration(scene) / arr.length) * i + 0.1}`}
                                          className="h-full object-cover shrink-0 border-r border-black/20"
                                          style={{ width: `${100 / arr.length}%` }}
                                          preload="metadata"
                                          muted
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
                         {/* Resize Handles */}
                         {!trackStates.V1.locked && selectedScene?.id === scene.id && selectedSceneTrack === 'V1' && (
                            <>
                              <div 
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-l-md transition-colors"
                                onPointerDown={(e) => handleResizeStart(e, scene.id, 'V1', 'left', getSceneDuration(scene))}
                              />
                              <div 
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-r-md transition-colors"
                                onPointerDown={(e) => handleResizeStart(e, scene.id, 'V1', 'right', getSceneDuration(scene))}
                              />
                            </>
                         )}
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
                        minWidth={0.5 * scale}
                        maxWidth={(clip.asset.duration || 8) * scale}
                        enableResizing={trackStates.V1.locked ? false : { top:false, right:true, bottom:false, left:true, topRight:false, bottomRight:false, bottomLeft:false, topLeft:false }}
                        disableDragging={true}
                        size={{ width: clip.duration * scale, height: '80%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('V1', newTime, clip.id);
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: snappedTime < 0.2 ? 0 : snappedTime } : c));
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                           const newWidth = ref.offsetWidth;
                           const newDuration = newWidth / scale;
                           const newStartTime = position.x / scale;
                           const maxDuration = clip.asset.duration || 8;
                           const finalDuration = Math.min(maxDuration, Math.max(0.5, newDuration));
                           
                           let newTrimStart = clip.trimStart || 0;
                           if (direction === 'left' || direction === 'topLeft' || direction === 'bottomLeft') {
                              newTrimStart += (clip.duration - finalDuration);
                              newTrimStart = Math.min(maxDuration - finalDuration, Math.max(0, newTrimStart));
                           }
                           
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: finalDuration, startTime: newStartTime, trimStart: newTrimStart } : c));
                        }}
                        style={{ top: '10%' }}
                        className="rounded-md border border-blue-400 bg-blue-100/90 cursor-grab active:cursor-grabbing overflow-hidden z-20 shadow-sm hover:brightness-95 transition-all"
                        onClick={(e: any) => {
                          if (trackStates.V1.locked) return;
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          setSelectedSceneTrack(null);
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          if (trackStates.V1.locked) return;
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'V1' });
                        }}
                      >
                         <div className="w-full h-full p-1.5 flex flex-col relative pointer-events-none">
                            <div className="flex items-center gap-1.5 mb-1 opacity-90 text-blue-900">
                               {clip.asset.type === 'video' ? <Film size={10} /> : clip.asset.type === 'image' ? <ImageIcon size={10} /> : <Music size={10} />}
                               <span className="text-[9px] font-bold truncate">{clip.asset.name}</span>
                            </div>
                         </div>
                      </Rnd>
                    ))}
                 </div>
              </div>

              {/* Audio Track (A1) */}
              <div className="flex items-stretch group relative">
                 <div className={`w-32 shrink-0 sticky left-0 ${activeVolumePopup === 'A1' ? 'z-[60]' : 'z-[51]'} bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400`}>
                    <span 
                      className="text-[13px] font-bold text-gray-600 cursor-pointer hover:text-purple-600 transition-colors"
                      onClick={() => {
                        const allA1Keys = [
                          ...scenes.map(s => `${s.id}_A1`),
                          ...timelineClips.filter(c => c.trackId === 'A1').map(c => `${c.id}_A1`)
                        ];
                        setSelectedSceneKeys(allA1Keys);
                        setSelectedScene(null);
                        setSelectedTimelineClip(null);
                        setSelectedSceneTrack(null);
                      }}
                      title="Select all on A1"
                    >
                      A1
                    </span>
                    <button onClick={() => toggleTrackState('A1', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A1.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A1.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setActiveVolumePopup(activeVolumePopup === 'A1' ? null : 'A1'); }} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A1.muted || trackStates.A1.volume === 0 ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                         {trackStates.A1.muted || trackStates.A1.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                         <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Volume</div>
                      </button>
                      {activeVolumePopup === 'A1' && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 p-2 w-10 h-36 bg-purple-900 border border-purple-700/50 rounded-xl shadow-2xl z-[100] flex flex-col items-center justify-between cursor-default" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] font-bold text-purple-100">{Math.round((trackStates.A1.volume ?? 1) * 100)}</span>
                          <div className="relative flex-1 w-full h-full flex justify-center overflow-hidden">
                             <input 
                               type="range" min="0" max="1" step="0.05" 
                               value={trackStates.A1.volume ?? 1} 
                               onChange={e => {
                                  const vol = parseFloat(e.target.value);
                                  setTrackVolume('A1', vol);
                               }} 
                               className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90px] h-1.5 appearance-none bg-purple-950 rounded-full outline-none accent-purple-400 -rotate-90 origin-center cursor-pointer"
                             />
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
                 <div 
                   className={`flex flex-1 relative h-14 rounded-r-md items-center border-y border-r shadow-sm transition-all ${trackStates.A1.locked ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60 grayscale' : 'bg-white border-gray-100 cursor-pointer'}`} 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                     setSelectedSceneKeys([]);
                   }}
                   onDragOver={(e) => { 
                      if (trackStates.A1.locked) return;
                      handleDragOver(e); 
                      if (draggingScene?.track === 'A1') {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dropX = e.clientX - rect.left;
                        let insertIdx = scenes.length;

                        for (let i = 0; i < scenes.length; i++) {
                           const sceneDuration = scenes[i].video_duration || 5;
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
                   {/* ─ MASTER NARRATION BLOCK (audio-first) ─ */}
                   {masterAudioUrl ? (
                     <div
                       className="h-[70%] absolute top-[15%] rounded-md border border-purple-600 bg-gradient-to-r from-purple-100 to-purple-50 text-purple-900 overflow-hidden shadow-sm"
                       // Use timelineDuration as a visual fallback so it doesn't shrink with V1 scenes if duration is missing.
                       style={{ left: 0, width: `${(masterAudioDuration || timelineDuration) * scale}px` }}
                     >
                       <div className="flex items-center gap-1.5 p-1 opacity-90">
                         <Volume2 size={9} className="flex-none" />
                         <span className="text-[8px] font-bold truncate">
                           Full Narration{masterAudioDuration > 0 ? ` · ${Math.round(masterAudioDuration)}s` : ''}
                         </span>
                       </div>
                       <div className="absolute inset-x-1 bottom-1 top-4 opacity-60 flex items-center overflow-hidden pointer-events-none">
                         <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
                           <path suppressHydrationWarning
                             d={Array.from({length: 250}).map((_, i) => { const h = 8 + Math.abs(Math.sin(i * 0.3) * Math.cos(i * 1.7)) * 40; return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`; }).join(' ')}
                             stroke="#9333ea" strokeWidth="2.5" strokeLinecap="round"
                           />
                         </svg>
                       </div>
                       <button
                         onClick={() => setMasterAudioUrl(null)}
                         title="Remove master narration"
                         className="absolute right-1 top-1 text-purple-400 hover:text-red-500 transition-colors z-10"
                       >
                         <Trash2 size={10} />
                       </button>
                     </div>
                   ) : (
                     /* ─ PER-SCENE clips (shown only when no master narration) ─ */
                     <>
                     {scenes.map((scene, idx) => (
                        <div 
                          key={`audio-${scene.id}`}
                          draggable={!trackStates.A1.locked}
                          onDragStart={(e) => {
                             if (trackStates.A1.locked) { e.preventDefault(); return; }
                             e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'reorder', track: 'A1', sceneId: scene.id, index: idx }));
                             setDraggingScene({ id: scene.id, track: 'A1', duration: scene.video_duration || 5 });
                             e.dataTransfer.effectAllowed = 'copyMove';
                          }}
                          onDragEnd={() => { setDraggingScene(null); setA1DragInsertIndex(null); }}
                          onClick={(e) => { if (!trackStates.A1.locked) handleSelectSceneBlock(e, scene, 'A1', idx); }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!trackStates.A1.locked) setContextMenu({ x: e.pageX, y: e.pageY, type: 'scene', id: scene.id, trackId: 'A1' });
                          }}
                          className={`h-[70%] absolute top-[15%] rounded-md border border-gray-800 bg-purple-50 text-purple-800 cursor-pointer transition-all overflow-hidden p-1 shadow-sm ${
                            selectedSceneKeys.includes(`${scene.id}_A1`) || (selectedScene?.id === scene.id && selectedSceneTrack === 'A1' && selectedSceneKeys.length === 0)
                              ? 'ring-2 ring-gray-900 ring-offset-1 z-20 scale-[1.02] bg-purple-200'
                              : 'hover:bg-purple-100 z-10'
                          }`}
                          style={{ left: `${getSceneLeftPosition('A1', idx)}px`, width: `${(scene.video_duration || 5) * scale}px`, opacity: draggingScene?.id === scene.id ? 0.001 : 1 }}
                        >
                          <div className="flex items-center gap-1.5 opacity-90 mb-0.5">
                             <Volume2 size={9} />
                             <span className="text-[8px] font-bold truncate block whitespace-nowrap">{scene.voice_over_beat}</span>
                          </div>
                          <div className="absolute inset-x-1 bottom-1 top-4 opacity-60 flex items-center overflow-hidden pointer-events-none">
                            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
                              <path suppressHydrationWarning
                                d={Array.from({length: 250}).map((_, i) => { const h = 5 + Math.abs(Math.sin(i * 0.4) * Math.cos(i * 1.9)) * 45; return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`; }).join(' ')}
                                stroke={scene.audio_url ? '#a855f7' : '#d8b4fe'} strokeWidth="2.5" strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          {!trackStates.A1.locked && selectedScene?.id === scene.id && selectedSceneTrack === 'A1' && (
                            <>
                              <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-l-md" onPointerDown={(e) => handleResizeStart(e, scene.id, 'A1', 'left', scene.video_duration || 5)} />
                              <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-r-md" onPointerDown={(e) => handleResizeStart(e, scene.id, 'A1', 'right', scene.video_duration || 5)} />
                            </>
                          )}
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
                        minWidth={0.5 * scale}
                        maxWidth={(clip.asset.duration || 8) * scale}
                        enableResizing={false}
                        disableDragging={true}
                        size={{ width: clip.duration * scale, height: '70%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('A1', newTime, clip.id);
                           const finalStart = snappedTime < 0.2 ? 0 : snappedTime;
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: finalStart } : c));
                           persistTimelineItemFields(clip.id, { start_time: finalStart });
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                           const newWidth = ref.offsetWidth;
                           const newDuration = newWidth / scale;
                           const newStartTime = position.x / scale;
                           const maxDuration = clip.asset.duration || 8;
                           const finalDuration = Math.min(maxDuration, Math.max(0.5, newDuration));
                           
                           let newTrimStart = clip.trimStart || 0;
                           if (direction === 'left' || direction === 'topLeft' || direction === 'bottomLeft') {
                              newTrimStart += (clip.duration - finalDuration);
                              newTrimStart = Math.min(maxDuration - finalDuration, Math.max(0, newTrimStart));
                           }
                           
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: finalDuration, startTime: newStartTime, trimStart: newTrimStart } : c));
                           if (selectedTimelineClip?.id === clip.id) {
                              setSelectedTimelineClip(prev => prev ? { ...prev, duration: finalDuration, startTime: newStartTime, trimStart: newTrimStart } : null);
                           }
                           persistTimelineItemFields(clip.id, { duration: finalDuration, start_time: newStartTime, trim_start: newTrimStart });
                        }}
                        style={{ top: '15%' }}
                        className={`rounded-md border border-blue-400 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm hover:brightness-95 transition-all p-1 ${
                          (selectedTimelineClip?.id === clip.id && selectedSceneTrack === 'A1') || selectedSceneKeys.includes(`${clip.id}_A1`)
                            ? 'ring-2 ring-blue-600 ring-offset-1 z-30 scale-[1.02] bg-blue-200'
                            : 'bg-blue-100/90 z-20'
                        }`}
                        onClick={(e: any) => {
                          e.stopPropagation();
                          if (trackStates.A1.locked) return;
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          const key = `${clip.id}_A1`;
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            setSelectedSceneKeys(prev => 
                              prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                            );
                          } else {
                            setSelectedSceneKeys([key]);
                          }
                          setSelectedTimelineClip(clip);
                          setSelectedSceneTrack('A1');
                          setActiveTab('scene');
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          if (trackStates.A1.locked) return;
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'A1' });
                        }}
                      >
                         <div 
                           className="flex items-center gap-1.5 opacity-90 mb-0.5 text-blue-900 relative z-20 cursor-move"
                           draggable={!trackStates.A1.locked}
                           onDragStart={(e) => {
                             e.stopPropagation();
                             if (trackStates.A1.locked) {
                               e.preventDefault();
                               return;
                             }
                             const moveData = {
                               type: 'move_clip',
                               clipId: clip.id,
                               fromTrackId: 'A1',
                               duration: clip.duration
                             };
                             e.dataTransfer.setData('text/plain', JSON.stringify(moveData));
                             e.dataTransfer.effectAllowed = 'move';
                           }}
                           title="Drag to move between Track A1 and A2"
                         >
                            <Music size={9} className="shrink-0 pointer-events-none" />
                            <span className="text-[8px] font-bold truncate block whitespace-nowrap pointer-events-none">{clip.asset.name}</span>
                         </div>
                         <div className="absolute inset-x-1 bottom-1 top-4 opacity-40 flex items-center overflow-hidden pointer-events-none z-0">
                           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
                              <path suppressHydrationWarning
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

                         {/* Visible Left Drag Handle (Trim Start / Left-to-Right decrease) */}
                         <div 
                           className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-blue-600/80 hover:bg-blue-500 z-50 rounded-l-md transition-colors flex items-center justify-center group/handle shadow-sm"
                           title="Drag left/right to trim start of audio"
                           onPointerDown={(e) => handleResizeStart(e, clip.id, 'A1_clip', 'left', clip.duration, clip.trimStart || 0)}
                         >
                           <div className="w-0.5 h-3 bg-white/80 rounded-full"></div>
                         </div>

                         {/* Visible Right Drag Handle (Duration / Right-to-Left decrease) */}
                         <div 
                           className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-blue-600/80 hover:bg-blue-500 z-50 rounded-r-md transition-colors flex items-center justify-center group/handle shadow-sm"
                           title="Drag left/right to decrease/increase duration"
                           onPointerDown={(e) => handleResizeStart(e, clip.id, 'A1_clip', 'right', clip.duration, clip.trimStart || 0)}
                         >
                           <div className="w-0.5 h-3 bg-white/80 rounded-full"></div>
                         </div>
                      </Rnd>
                    ))}
                    </>
                   )}
                 </div>
              </div>

              {/* Music Track (A2) */}
              <div className="flex items-stretch group relative">
                 <div className={`w-32 shrink-0 sticky left-0 ${activeVolumePopup === 'A2' ? 'z-[60]' : 'z-[50]'} bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400`}>
                    <span 
                      className="text-[13px] font-bold text-gray-600 cursor-pointer hover:text-purple-600 transition-colors"
                      onClick={() => {
                        const allA2Keys = timelineClips.filter(c => c.trackId === 'A2').map(c => `${c.id}_A2`);
                        setSelectedSceneKeys(allA2Keys);
                        setSelectedScene(null);
                        setSelectedTimelineClip(null);
                        setSelectedSceneTrack(null);
                      }}
                      title="Select all on A2"
                    >
                      A2
                    </span>
                    <button onClick={() => toggleTrackState('A2', 'locked')} className={`group/lock relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A2.locked ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                       {trackStates.A2.locked ? <Lock size={18} /> : <Unlock size={18} />}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/lock:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Lock Track</div>
                    </button>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setActiveVolumePopup(activeVolumePopup === 'A2' ? null : 'A2'); }} className={`group/mute relative flex items-center justify-center hover:text-gray-700 transition-colors ${trackStates.A2.muted || trackStates.A2.volume === 0 ? 'text-purple-600 hover:text-purple-700' : ''}`}>
                         {trackStates.A2.muted || trackStates.A2.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                         <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover/mute:block bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-50">Volume</div>
                      </button>
                      {activeVolumePopup === 'A2' && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 p-2 w-10 h-36 bg-purple-900 border border-purple-700/50 rounded-xl shadow-2xl z-[100] flex flex-col items-center justify-between cursor-default" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] font-bold text-purple-100">{Math.round((trackStates.A2.volume ?? 1) * 100)}</span>
                          <div className="relative flex-1 w-full h-full flex justify-center overflow-hidden">
                             <input 
                               type="range" min="0" max="1" step="0.05" 
                               value={trackStates.A2.volume ?? 1} 
                               onChange={e => {
                                  const vol = parseFloat(e.target.value);
                                  setTrackVolume('A2', vol);
                               }} 
                               className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90px] h-1.5 appearance-none bg-purple-950 rounded-full outline-none accent-purple-400 -rotate-90 origin-center cursor-pointer"
                             />
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
                 <div 
                   className={`flex flex-1 relative h-12 rounded-r-md items-center border transition-all ${trackStates.A2.locked ? 'bg-gray-100 border-gray-200 border-solid cursor-not-allowed opacity-60 grayscale' : 'bg-gray-50 border-gray-200 border-dashed hover:bg-gray-100 cursor-pointer'}`} 
                   style={{ width: `${timelineDuration * scale}px` }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedAsset(null);
                     setSelectedTimelineClip(null);
                     setSelectedSceneKeys([]);
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
                        minWidth={0.5 * scale}
                        maxWidth={(clip.asset.duration || 8) * scale}
                        enableResizing={false}
                        disableDragging={true}
                        size={{ width: clip.duration * scale, height: '70%' }}
                        position={{ x: clip.startTime * scale, y: 0 }}
                        onDragStop={(e, d) => {
                           const newTime = d.x / scale;
                           const snappedTime = applyMagneticSnap('A2', newTime, clip.id);
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: snappedTime } : c));
                           persistTimelineItemFields(clip.id, { start_time: snappedTime });
                           if (selectedTimelineClip?.id === clip.id) {
                              setSelectedTimelineClip(prev => prev ? { ...prev, startTime: snappedTime } : null);
                           }
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                           const newWidth = ref.offsetWidth;
                           const newDuration = newWidth / scale;
                           const newStartTime = position.x / scale;
                           const maxDuration = clip.asset.duration || 8;
                           const finalDuration = Math.min(maxDuration, Math.max(0.5, newDuration));
                           
                           let newTrimStart = clip.trimStart || 0;
                           if (direction === 'left' || direction === 'topLeft' || direction === 'bottomLeft') {
                              newTrimStart += (clip.duration - finalDuration);
                              newTrimStart = Math.min(maxDuration - finalDuration, Math.max(0, newTrimStart));
                           }
                           
                           setTimelineClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: finalDuration, startTime: newStartTime, trimStart: newTrimStart } : c));
                           if (selectedTimelineClip?.id === clip.id) {
                              setSelectedTimelineClip(prev => prev ? { ...prev, duration: finalDuration, startTime: newStartTime, trimStart: newTrimStart } : null);
                           }
                           persistTimelineItemFields(clip.id, { duration: finalDuration, start_time: newStartTime, trim_start: newTrimStart });
                        }}
                        style={{ top: '15%' }}
                        className={`rounded-md border border-blue-400 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm hover:brightness-95 transition-all p-1 ${
                          (selectedTimelineClip?.id === clip.id && selectedSceneTrack === 'A2') || selectedSceneKeys.includes(`${clip.id}_A2`)
                            ? 'ring-2 ring-blue-600 ring-offset-1 z-30 scale-[1.02] bg-blue-200'
                            : 'bg-blue-100/90 z-20'
                        }`}
                        onClick={(e: any) => {
                          e.stopPropagation();
                          if (trackStates.A2.locked) return;
                          setSelectedAsset(null);
                          setSelectedScene(null);
                          const key = `${clip.id}_A2`;
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            setSelectedSceneKeys(prev => 
                              prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                            );
                          } else {
                            setSelectedSceneKeys([key]);
                          }
                          setSelectedTimelineClip(clip);
                          setSelectedSceneTrack('A2');
                          setActiveTab('scene');
                        }}
                        onContextMenu={(e: any) => {
                          e.preventDefault();
                          if (trackStates.A2.locked) return;
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'clip', id: clip.id, trackId: 'A2' });
                        }}
                      >
                         {/* Visible Left Drag Handle (Trim Start / Left-to-Right decrease) */}
                         <div 
                           className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-blue-600/80 hover:bg-blue-500 z-50 rounded-l-md transition-colors flex items-center justify-center group/handle shadow-sm"
                           title="Drag left/right to trim start of audio"
                           onPointerDown={(e) => handleResizeStart(e, clip.id, 'A2_clip', 'left', clip.duration, clip.trimStart || 0)}
                         >
                           <div className="w-0.5 h-3 bg-white/80 rounded-full"></div>
                         </div>

                         {/* Visible Right Drag Handle (Duration / Right-to-Left decrease) */}
                         <div 
                           className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-blue-600/80 hover:bg-blue-500 z-50 rounded-r-md transition-colors flex items-center justify-center group/handle shadow-sm"
                           title="Drag left/right to decrease/increase duration"
                           onPointerDown={(e) => handleResizeStart(e, clip.id, 'A2_clip', 'right', clip.duration, clip.trimStart || 0)}
                         >
                           <div className="w-0.5 h-3 bg-white/80 rounded-full"></div>
                         </div>

                         <div 
                           className="flex items-center gap-1.5 opacity-90 mb-0.5 text-blue-900 relative z-20 cursor-move"
                           draggable={!trackStates.A2.locked}
                           onDragStart={(e) => {
                             e.stopPropagation();
                             if (trackStates.A2.locked) {
                               e.preventDefault();
                               return;
                             }
                             const moveData = {
                               type: 'move_clip',
                               clipId: clip.id,
                               fromTrackId: 'A2',
                               duration: clip.duration
                             };
                             e.dataTransfer.setData('text/plain', JSON.stringify(moveData));
                             e.dataTransfer.effectAllowed = 'move';
                           }}
                           title="Drag to move between Track A1 and A2"
                         >
                            <Music size={9} className="shrink-0 pointer-events-none" />
                            <span className="text-[8px] font-bold truncate block whitespace-nowrap pointer-events-none">{clip.asset.name}</span>
                         </div>
                         <div className="absolute inset-x-1 bottom-1 top-4 opacity-40 flex items-center overflow-hidden pointer-events-none z-0">
                           <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
                              <path suppressHydrationWarning
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
                   className="flex flex-1 relative min-h-[30px] cursor-pointer"
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
      
      {/* Context Menu — the single home for destructive actions.
          Selection-aware: right-clicking an item that's part of a multi-selection
          acts on the whole selection, so removing the toolbar's "Delete Selected"
          button costs no capability. */}
      {contextMenu && (() => {
        const contextKey = `${contextMenu.id}_${contextMenu.trackId ?? ''}`;
        const isBulk = selectedSceneKeys.length > 1 && selectedSceneKeys.includes(contextKey);
        // Deleting on A1 clears a scene's narration and leaves the visual in place —
        // it does not delete the scene. The menu used to say "Delete Scene" here,
        // which promised something far more destructive than what actually happens.
        const isNarrationOnly = contextMenu.type === 'scene' && contextMenu.trackId === 'A1';

        const label = isBulk
          ? `Delete ${selectedSceneKeys.length} items`
          : isNarrationOnly
            ? 'Remove narration'
            : contextMenu.type === 'scene'
              ? 'Delete scene'
              : 'Delete clip';

        return (
          <div
            className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[9999] min-w-[190px] animate-in fade-in zoom-in-95 duration-100"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 60), left: Math.min(contextMenu.x, window.innerWidth - 200) }}
          >
            <button
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2.5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (isBulk) {
                  handleDeleteSelectedScenes();
                  setContextMenu(null);
                } else {
                  handleDeleteItem();
                }
              }}
            >
              <Trash2 size={15} />
              <span className="flex-1">{label}</span>
              <kbd className="text-[10px] font-sans font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">Del</kbd>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
