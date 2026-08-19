"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { loadProjectForWhiteboard } from "@/app/actions/whiteboard-actions";
import { Play, Pause, Image as ImageIcon, Volume2, Wand2, Clock, Maximize2, SkipBack, Type, Music, Loader2, Upload, LayoutTemplate, Settings, FolderOpen, Film, Layers, MonitorPlay, ChevronDown, ChevronRight, Trash2, Lock, Unlock, VolumeX, Download, Info, ArrowLeft, AlertTriangle, CheckCircle2, Mic, Repeat, Check, X, ArrowRightLeft, ZoomIn, Zap, Sun, Clapperboard, Contrast, Sparkles, Sunrise } from "lucide-react";
import { generateSceneAudio, generateFullNarration, getAvailableVoices, getActNarrations, type ActNarration } from "@/app/actions/audio-actions";
import { regenerateActNarration, approveAndGenerateVisuals } from "@/app/actions/whiteboard-actions";
import { updateScene, createSceneWithMedia, reorderScenes, deleteScenes } from "@/app/actions/scene-actions";
import { createTimelineItem, updateTimelineItem, deleteTimelineItem } from "@/app/actions/timeline-actions";
import { updateProjectTrackStates, updateProjectStatus, updateProjectCaptionsEnabled } from "@/app/actions/video-actions";
import { getOrCreatePresetMedia } from "@/app/actions/media-actions";
import { createOverlayClip, updateOverlayClip, deleteOverlayClip } from "@/app/actions/overlay-clip-actions";
import { TRANSITION_MUSIC_PRESETS, getTransitionMusicPreset } from "@/lib/transition-music-presets";
import { Rnd } from "react-rnd";
import { Player, PlayerRef } from '@remotion/player';
import { VideoComposition } from '@/remotion/compositions/VideoComposition';
import type { VideoCompositionProps, CompositionScene, CompositionAudioClip, OverlayClipData, OverlayClipKind, OverlayPreset, SceneOverlay, ChecklistCardData, TitleCutoutCardData, DimScrimData, ParticleFieldData, LightBeamData, LightSweepData, FilmDamageData, TransitionType, CaptionWord } from '@/remotion/types';
import { isEnvironmentalKind } from '@/remotion/types';
import { layoutScenes, maxTransitionSeconds } from '@/remotion/timeline';
import { parseTrackStates, normalizeProjectStatus, type TrackStates, type TrackId, type ProjectStatus } from '@/lib/timeline-types';

/* Loaded on demand. The Scene Board is a modal most editing sessions never open,
   and it drags in the whole whiteboard-actions surface with it — no reason for
   any of that to sit in the editor's initial bundle. */
const SceneBoard = dynamic(() => import("@/components/ui/Whiteboard"), { ssr: false });

/** Payload `loadProjectForWhiteboard` hands the board, fetched when the modal opens. */
type SceneBoardData = NonNullable<Awaited<ReturnType<typeof loadProjectForWhiteboard>>["data"]>;

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

/**
 * A text overlay on the OV track. Deliberately NOT a `TimelineClip`: that type
 * carries an `asset`/`assetId` because every A1/A2 clip is backed by a media
 * file, and an overlay has no media behind it at all — it's pure config.
 *
 * Camel-cased mirror of a `overlay_clips` row (see db/create-overlay-clips.sql).
 */
interface OverlayClip {
  id: string;
  /** Defaults to 'text' for every row written before this field existed. */
  kind: OverlayClipKind;
  text: string;
  kickerText?: string;
  preset: OverlayPreset;
  color: string;
  fontSize?: number;
  /** Centre of the overlay, as a percentage of frame width/height. */
  xPercent: number;
  yPercent: number;
  dimBackground: boolean;
  startTime: number;
  duration: number;
  /** Kind-specific fields — see OverlayClipData in remotion/types.ts. */
  templateData?: ChecklistCardData | TitleCutoutCardData | Record<string, never>;
}

const overlayRowToClip = (row: any): OverlayClip => ({
  id: row.id,
  kind: (row.kind || 'text') as OverlayClipKind,
  text: row.text ?? '',
  kickerText: row.kicker_text ?? undefined,
  preset: (row.preset || 'cinematic-reveal') as OverlayPreset,
  color: row.color || '#FFFFFF',
  fontSize: row.font_size ?? undefined,
  xPercent: typeof row.x_percent === 'number' ? row.x_percent : 50,
  yPercent: typeof row.y_percent === 'number' ? row.y_percent : 50,
  dimBackground: Boolean(row.dim_background),
  startTime: typeof row.start_time === 'number' ? row.start_time : 0,
  duration: typeof row.duration === 'number' ? row.duration : 3,
  templateData: row.template_data && typeof row.template_data === 'object' ? row.template_data : {},
});

/**
 * Quick placements, as percentages of the frame. 15/85 rather than 0/100 for the
 * edges: the stored percentage is the overlay's CENTRE, so a true 0 or 100 would
 * hang half the text off-screen. 15% keeps it inside the title-safe area that
 * broadcast and social crops respect.
 */
const POSITION_PRESETS: { label: string; xPercent: number; yPercent: number }[] = [
  { label: 'Top', xPercent: 50, yPercent: 15 },
  { label: 'Center', xPercent: 50, yPercent: 50 },
  { label: 'Bottom', xPercent: 50, yPercent: 85 },
  { label: 'Left', xPercent: 25, yPercent: 50 },
  { label: 'Right', xPercent: 75, yPercent: 50 },
];

/** Snap threshold, in percentage points, for the drag-to-position guides. */
const POSITION_SNAP_TOLERANCE = 3;
/** The lines an overlay snaps to while being dragged: centre lines and safe margins. */
const SNAP_TARGETS = [15, 50, 85];

/** The eight animation presets an overlay clip can use, for the picker UI. */
const OVERLAY_PRESET_OPTIONS: { value: OverlayPreset; label: string }[] = [
  { value: 'cinematic-reveal', label: 'Cinematic Reveal' },
  { value: 'line-wipe', label: 'Line Wipe' },
  { value: 'letter-collapse', label: 'Letter Collapse' },
  { value: 'chapter-card', label: 'Chapter Card' },
  { value: 'slide', label: 'Slide In' },
  { value: 'pop', label: 'Pop In (Hormozi)' },
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'lower-third', label: 'Lower Third' },
];

/**
 * Left-edge accent color per OV clip kind, so the kinds are
 * distinguishable at a glance on the timeline's dark clip blocks — matching
 * how CapCut/Premiere color-code clips by category rather than using one
 * flat color for every clip on a track. Rendered as a small absolutely-
 * positioned strip (not a `border-l-*` utility) so its color can't get
 * fought over by the block's own all-sides `border-color` utility, which
 * Tailwind's generated CSS order doesn't guarantee losing to a directional
 * override.
 */
const OVERLAY_KIND_ACCENT: Record<OverlayClipKind, { stripe: string; icon: string }> = {
  'text': { stripe: 'bg-fuchsia-400', icon: 'text-fuchsia-300' },
  'checklist-card': { stripe: 'bg-emerald-400', icon: 'text-emerald-300' },
  'title-cutout-card': { stripe: 'bg-sky-400', icon: 'text-sky-300' },
  'dim-scrim': { stripe: 'bg-gray-400', icon: 'text-gray-300' },
  'particles': { stripe: 'bg-amber-400', icon: 'text-amber-300' },
  'light-beam': { stripe: 'bg-yellow-400', icon: 'text-yellow-300' },
  'light-sweep': { stripe: 'bg-orange-400', icon: 'text-orange-300' },
  // Neutral rather than warm: this one is wear on the print, not a light source.
  'film-damage': { stripe: 'bg-stone-400', icon: 'text-stone-300' },
};

/**
 * Fixed label for the kinds that carry no `text` of their own, shown on the
 * timeline block. Kinds absent from this map fall back to their own text.
 */
const OVERLAY_KIND_BLOCK_LABEL: Partial<Record<OverlayClipKind, string>> = {
  'dim-scrim': 'Dim Scrim',
  'particles': 'Particles',
  'light-beam': 'Light Beam',
  'light-sweep': 'Light Sweep',
  'film-damage': 'Old Film',
};

/**
 * Classic interval-scheduling greedy pack: walk clips in start order and drop
 * each into the first lane whose last clip has already ended.
 */
const greedyPackLanes = (clips: OverlayClip[]): { laneByClipId: Record<string, number>; laneCount: number } => {
  const ordered = [...clips].sort((a, b) => a.startTime - b.startTime);
  const laneEnds: number[] = [];
  const laneByClipId: Record<string, number> = {};

  for (const clip of ordered) {
    const clipEnd = clip.startTime + clip.duration;
    // A tiny epsilon so two clips that merely touch (one ends exactly where the
    // next begins) share a lane instead of wastefully splitting into two.
    let lane = laneEnds.findIndex((end) => end <= clip.startTime + 0.001);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(clipEnd);
    } else {
      laneEnds[lane] = clipEnd;
    }
    laneByClipId[clip.id] = lane;
  }

  return { laneByClipId, laneCount: laneEnds.length };
};

/**
 * Assigns each overlay clip a lane so clips overlapping in time never render on
 * top of each other — the auto-expanding OV1/OV2/OV3 behaviour CapCut has.
 *
 * Purely derived from `startTime`/`duration`, never stored — so trimming or
 * moving a clip out of an overlap re-packs the lanes automatically with
 * nothing to keep in sync.
 *
 * Environmental clips (scrim, particles, light beam) are packed in their OWN
 * separate pool, whose lanes always come after every text/card lane. These are
 * full-frame background layers, not content competing for screen space the way
 * two overlapping text clips are — sharing one lane pool meant an environmental
 * clip dragged near a text clip's time range could get reassigned into that
 * text clip's lane (and vice versa), which reads as the two swapping places on
 * the timeline. Keeping them in separate pools makes their rows stable and
 * always the ones closest to V1.
 *
 * Shares `isEnvironmentalKind` with the composition's paint order rather than
 * re-testing `kind` here: the two used to hard-code their own `=== 'dim-scrim'`
 * checks, so adding a kind broke both in different ways.
 */
const packOverlayLanes = (clips: OverlayClip[]): { laneByClipId: Record<string, number>; laneCount: number } => {
  const environmentalClips = clips.filter(c => isEnvironmentalKind(c.kind));
  const otherClips = clips.filter(c => !isEnvironmentalKind(c.kind));

  const otherPacked = greedyPackLanes(otherClips);
  const environmentalPacked = greedyPackLanes(environmentalClips);

  const laneByClipId: Record<string, number> = { ...otherPacked.laneByClipId };
  for (const [clipId, lane] of Object.entries(environmentalPacked.laneByClipId)) {
    laneByClipId[clipId] = otherPacked.laneCount + lane;
  }

  return {
    laneByClipId,
    laneCount: Math.max(1, otherPacked.laneCount + environmentalPacked.laneCount),
  };
};

// Only scenes/clips that came from Supabase have UUID ids. Mock preview scenes ("mock-1")
// and scenes/clips created client-side before their persistence call resolves use short
// random ids — writing those to a UUID primary key would throw, so they stay local-only
// until reconciled with the real id the DB assigns.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPersistedScene = (sceneId: string) => UUID_PATTERN.test(sceneId);

/**
 * Turns the project's title into a filename the browser's Save As dialog can offer
 * for the exported .mp4. Client-side only — the file on disk stays keyed by
 * projectId (renders overwrite in place), this just controls what name the download
 * attribute suggests. Strips characters illegal on Windows/macOS filesystems and
 * falls back to a generic name for an untitled project rather than downloading as "".
 */
const toExportFileName = (title: string | undefined | null) => {
  const safe = (title || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80);
  return `${safe || 'video'}.mp4`;
};

/**
 * Thumbnail-grid picker for a single image slot on the Title + Cutout Card
 * template — the one genuinely new UI piece this template needs, since no
 * "pick an already-uploaded image" control exists anywhere else in this app.
 *
 * Simpler than the stock-media picker's stage-then-confirm flow: the image is
 * already local, so a click assigns it directly rather than staging a pick
 * that needs a separate "Apply" step. Sources from every project image
 * (uploads + AI-generated + stock), not just the Media panel's uploads-only
 * library, since a background or cutout is just as likely to be a generated
 * visual as an uploaded one.
 */
function OverlayImagePicker({
  label,
  images,
  selectedUrl,
  onSelect,
}: {
  label: string;
  images: { id: string; name: string; url: string }[];
  selectedUrl?: string;
  onSelect: (url: string | undefined) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
        {selectedUrl && (
          <button
            onClick={() => onSelect(undefined)}
            className="text-[10px] font-bold text-gray-400 hover:text-red-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {images.length === 0 ? (
        <div className="text-[10px] text-gray-400 italic py-2">No project images yet.</div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
          {images.map((image) => {
            const isSelected = selectedUrl === image.url;
            return (
              <button
                key={image.id}
                onClick={() => onSelect(image.url)}
                title={image.name}
                className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors bg-gray-100 ${
                  isSelected ? 'border-fuchsia-500 ring-2 ring-fuchsia-200' : 'border-transparent hover:border-fuchsia-300'
                }`}
              >
                <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                {isSelected && (
                  <div className="absolute inset-0 bg-fuchsia-900/20 flex items-center justify-center">
                    <Check size={14} className="text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The 6 transition cards in the Transition In accordion — same options the dropdown
 * offers, as a drag source instead of a select list. Module-level and static: the
 * type list is a code change (see add-scene-transitions.sql's comment on
 * transition_type), not something that varies per scene.
 */
// `sampleAnimation` names a @keyframes rule in globals.css, applied via inline
// `style` on the card's icon — a live loop of roughly what the transition does,
// so you can tell them apart before dragging one anywhere.
const TRANSITION_CARDS: { type: TransitionType; label: string; icon: typeof X; sampleAnimation: string }[] = [
  { type: 'none', label: 'Cut', icon: X, sampleAnimation: 'tcard-cut 1.6s ease-in-out infinite' },
  { type: 'crossfade', label: 'Crossfade', icon: Layers, sampleAnimation: 'tcard-crossfade 2.2s ease-in-out infinite' },
  { type: 'slide', label: 'Slide', icon: ArrowRightLeft, sampleAnimation: 'tcard-slide 1.8s ease-in-out infinite' },
  { type: 'zoom', label: 'Zoom', icon: ZoomIn, sampleAnimation: 'tcard-zoom 2s ease-in-out infinite' },
  { type: 'glitch', label: 'Glitch', icon: Zap, sampleAnimation: 'tcard-glitch 1.4s steps(6, jump-end) infinite' },
  { type: 'light-leak', label: 'Light Leak', icon: Sun, sampleAnimation: 'tcard-light-leak 2.4s ease-in-out infinite' },
];

/**
 * Turns the render route's raw stage string into something worth showing a user.
 *
 * Two sources feed this: stages this app sets itself ("caching media", "encoding",
 * "done") and Remotion's own `stitchStage` from onProgress, which is "rendering"
 * while extracting frames and "muxing" while assembling the final file. Anything
 * unrecognised falls back to a generic label rather than leaking an internal token
 * into the UI.
 */
const humanizeRenderStage = (stage: string | null): string => {
  switch (stage) {
    case 'starting': return 'Starting export…';
    case 'caching media': return 'Downloading media…';
    case 'encoding': return 'Preparing composition…';
    case 'rendering': return 'Rendering frames…';
    case 'muxing': return 'Assembling video…';
    case 'done': return 'Finishing up…';
    default: return 'Starting export…';
  }
};

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

/** Shortest a block may be trimmed to, in seconds. */
const MIN_BLOCK_DURATION = 0.5;

/** Approximate width of one filmstrip thumbnail inside a scene block, in pixels. */
const FILMSTRIP_THUMB_WIDTH = 80;

// This component is a client component but Next still renders it on the server,
// where useLayoutEffect logs a warning. Effects never run there anyway.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Selected blocks are drawn slightly proud of the track. Applied through the same
 *  inline `transform` that positions them, because an inline transform overrides
 *  Tailwind's `scale-*` class entirely — the two cannot coexist on one element. */
const SELECTED_BLOCK_SCALE = 1.02;

function blockTransform(leftPx: number, scaled: boolean) {
  return `translate3d(${leftPx}px, 0, 0)${scaled ? ` scale(${SELECTED_BLOCK_SCALE})` : ''}`;
}

/**
 * How blocks slide aside to open a gap while a scene is dragged over them.
 *
 * Applied ONLY during a reorder drag. It must never be live during a trim: the
 * gesture writes a new transform every frame, and a transition would make the block
 * chase the cursor instead of tracking it — the exact lag the direct-DOM gesture
 * path exists to remove. Because position is a transform, this animates on the
 * compositor and costs nothing per frame.
 *
 * Decelerating curve (fast start, soft landing), which is what makes the movement
 * read as physical rather than mechanical.
 */
const REORDER_SLIDE = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';

/**
 * Clamping rules for trimming a scene, kept as a pure function so the pointermove
 * DOM path and the commit-on-release path cannot drift apart. If those two ever
 * computed different values the block would visibly jump the instant the mouse
 * came up, which is exactly the class of bug this refactor exists to avoid.
 */
function computeSceneResize(args: {
  initialDuration: number;
  initialTrimStart: number;
  deltaDuration: number;
  edge: 'left' | 'right';
  maxDuration: number;
  currentTrimStart: number;
}): { duration: number; trimStart: number } {
  const { initialDuration, initialTrimStart, deltaDuration, edge, maxDuration, currentTrimStart } = args;

  const rawDuration = edge === 'right'
    ? initialDuration + deltaDuration
    // Scenes are sequential, so dragging the left edge trims the duration rather
    // than moving the block.
    : initialDuration - deltaDuration;
  const duration = Math.min(maxDuration, Math.max(MIN_BLOCK_DURATION, rawDuration));

  let trimStart = currentTrimStart;
  if (edge === 'left') {
    trimStart = initialTrimStart + (initialDuration - duration);
    trimStart = Math.min(maxDuration - duration, Math.max(0, trimStart));
  }

  return { duration, trimStart };
}

/**
 * Clip counterpart of `computeSceneResize`. Clips also carry a start time, since
 * they float on the track rather than being packed end to end.
 *
 * Note `startTime` is derived from `initialStartTime` — the value captured on
 * pointerdown — not from the clip's current state. The previous implementation read
 * the live value inside a `setTimelineClips` updater and added the same offset again
 * on every pointermove, so a left-edge trim drifted further right the more frames it
 * took to complete the gesture.
 */
function computeClipResize(args: {
  initialDuration: number;
  initialTrimStart: number;
  initialStartTime: number;
  deltaDuration: number;
  edge: 'left' | 'right';
  maxDuration: number;
  currentTrimStart: number;
}): { duration: number; trimStart: number; startTime: number } {
  const { initialStartTime, initialDuration, edge } = args;
  const { duration, trimStart } = computeSceneResize(args);

  const startTime = edge === 'left'
    ? Math.max(0, initialStartTime + (initialDuration - duration))
    : initialStartTime;

  return { duration, trimStart, startTime };
}

export default function TimelineEditor({
  workspaceId,
  initialProject,
  initialScenes,
  initialMedia = [],
  initialTimelineItems = [],
  initialOverlayClips = [],
}: {
  workspaceId: string,
  initialProject: any,
  initialScenes: any[],
  initialMedia?: any[],
  initialTimelineItems?: any[],
  initialOverlayClips?: any[],
}) {
  const [scenes, setScenes] = useState<any[]>(initialScenes);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>(() => {
    const mediaById = new Map(initialMedia.map((m) => [m.id, m]));
    return initialTimelineItems
      .map((item) => timelineItemToClip(item, mediaById))
      .filter((c): c is TimelineClip => c !== null);
  });
  const [overlayClips, setOverlayClips] = useState<OverlayClip[]>(
    () => initialOverlayClips.map(overlayRowToClip)
  );
  const [selectedOverlayClipId, setSelectedOverlayClipId] = useState<string | null>(null);
  // While dragging/trimming an OV clip, the V1 scene-boundary time it's
  // currently snapped to — drives the CapCut-style vertical alignment guide
  // line spanning the OV and V1 rows. Null whenever not snapped to anything.
  const [overlaySnapGuideTime, setOverlaySnapGuideTime] = useState<number | null>(null);
  const [selectedScene, setSelectedScene] = useState<any | null>(null);
  const [selectedSceneTrack, setSelectedSceneTrack] = useState<'V1' | 'A1' | 'A2' | null>(null);
  const [selectedTimelineClip, setSelectedTimelineClip] = useState<TimelineClip | null>(null);
  const [selectedSceneKeys, setSelectedSceneKeys] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  // Authoritative position for the playback RAF loop. Reading `cursorPosition` from a
  // `setCursorPosition(prev => ...)` updater worked for computing the next value, but
  // hid the "have we reached the end" decision inside that updater where it couldn't
  // reliably control whether the next frame gets scheduled — `requestAnimationFrame`
  // was being called unconditionally, once even in the same tick the end was reached.
  // This ref lets `animate` decide synchronously, in its own scope, before scheduling.
  const cursorPositionRef = useRef(cursorPosition);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [isPlaying, setIsPlaying] = useState(false);
  const lastTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  // Trimming a clip edge and dragging the timeline panel's height are separate
  // gestures — sharing one flag let a clip trim also resize the panel.
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  // Master audio — one continuous narration WAV covering the whole project.
  // Short/mid-form only; long-form uses `actNarrations` below instead.
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(initialProject.narration_url || null);

  // Long-form narration, one file per Act.
  //
  // The audio track is chunked by ACT, not by scene: a 25-minute video is 9 blocks
  // here while V1 carries ~150. That granularity is the point — an Act is the unit the
  // user reviews, re-words and re-records, and keeping each one in its own file is
  // what lets Act 5 be replaced without re-synthesising the other 22 minutes.
  const [actNarrations, setActNarrations] = useState<ActNarration[]>([]);
  const [selectedActNumber, setSelectedActNumber] = useState<number | null>(null);
  const [regeneratingActNumber, setRegeneratingActNumber] = useState<number | null>(null);

  // Presence of act rows *is* the long-form signal: they only ever exist for projects
  // that were generated Act-by-Act.
  const hasActNarration = actNarrations.length > 0;

  const actNarrationDuration = useMemo(
    () => actNarrations.reduce((acc, a) => Math.max(acc, a.startSeconds + a.durationSeconds), 0),
    [actNarrations]
  );

  useEffect(() => {
    let cancelled = false;
    getActNarrations(initialProject.id)
      .then(rows => { if (!cancelled) setActNarrations(rows); })
      // Absent db/add-act-narration.sql this simply returns [], which reads as
      // "short/mid-form" and leaves the single-bar path untouched.
      .catch(err => console.warn("[Timeline] Could not load act narrations:", err));
    return () => { cancelled = true; };
  }, [initialProject.id]);

  const [isApproving, setIsApproving] = useState(false);

  const handleApproveAndGenerateVisuals = async () => {
    setIsApproving(true);
    try {
      const res = await approveAndGenerateVisuals({
        projectId: initialProject.id,
        topic: initialProject.topic,
        visualAesthetic: initialProject.visual_aesthetic || "Cinematic",
      });

      if (!res.success) {
        alert(res.error || "Could not generate visuals.");
        return;
      }

      setProjectStatus('approved');
      router.refresh();

      const summary = `Generated prompts for ${res.sceneCount} scenes with ${res.blueprintCount} character blueprints shared across every act.`;
      alert(res.warnings.length > 0 ? `${summary}\n\n${res.warnings.join("\n")}` : summary);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRegenerateAct = async (actNumber: number) => {
    setRegeneratingActNumber(actNumber);
    try {
      const res = await regenerateActNarration({ projectId: initialProject.id, actNumber });
      if (!res.success) {
        alert(res.error || `Could not re-record Act ${actNumber}.`);
        return;
      }
      if (res.acts) setActNarrations(res.acts);
      // Scene durations for this act changed, so the ruler and every later act moved.
      router.refresh();
      if (res.warnings.length > 0) alert(res.warnings.join("\n\n"));
    } finally {
      setRegeneratingActNumber(null);
    }
  };
  const [masterAudioDuration, setMasterAudioDuration] = useState<number>(0);
  // The master narration bar is draggable but always springs back here — see the
  // Rnd on A1. Its start time is therefore fixed at 0, which is why nothing
  // downstream (captions, the render payload, the composition) carries an offset.
  const masterNarrationRndRef = useRef<Rnd | null>(null);
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
  // Raw stage string from the same poll (e.g. "encoding") — humanized at render time.
  const [renderStage, setRenderStage] = useState<string | null>(null);
  // Holds the interval id outside React state so it can be cleared from any exit path
  // (success, failure, or the resume-on-reload flow below) without stale closures.
  // The previous version created this as a local `const` inside handleRenderVideo and
  // never cleared it anywhere — it ran forever after the render finished and doubled
  // up if the user rendered a second time.
  // Typed `number` rather than ReturnType<typeof setInterval>: @types/node is in
  // scope here and would resolve that to Node's Timeout, which never matches what
  // window.setInterval actually returns in the browser.
  const renderPollRef = useRef<number | null>(null);
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

  /**
   * How scenes source their visuals. A scene's own `generation_mode` wins; this is the
   * project-wide fallback for scenes that haven't set one.
   *
   * Seeded from the project row so the choice survives a reload — it was previously
   * React-only state, which meant bulk generation refused to run until the mode was
   * re-picked after every refresh.
   */
  const [globalGenerationMode, setGlobalGenerationMode] = useState<string>(
    initialProject.default_generation_mode || ''
  );

  // Stock-media search settings. Global rather than per-scene: they describe where to
  // search, not what the scene is, and carrying them across scenes is what makes
  // searching several scenes in a row bearable.
  const [globalStockProvider, setGlobalStockProvider] = useState<'pexels' | 'pixabay'>('pexels');
  const [globalStockType, setGlobalStockType] = useState<'video' | 'image'>('video');

  interface StockResult {
    id: string;
    thumbnailUrl: string;
    mediaUrl: string;
    type: 'video' | 'image';
  }
  // Keyed by scene so switching scenes hides stale results without needing an effect
  // to clear them.
  const [stockSearchResults, setStockSearchResults] = useState<{
    sceneId: string;
    results: StockResult[];
  } | null>(null);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  // A thumbnail click only stages a pick for preview; nothing is downloaded or
  // persisted until the user hits Apply, so browsing results doesn't burn storage.
  const [pendingStockPick, setPendingStockPick] = useState<{ sceneId: string; result: StockResult } | null>(null);
  const [isApplyingStock, setIsApplyingStock] = useState(false);
  // Project Media's equivalent of `pendingStockPick`. Kept as its own state rather
  // than folded into that one because applying them is genuinely different work — a
  // stock pick has to be downloaded and re-hosted first, a project asset is already
  // here — while *previewing* them is identical, which is what `pendingPickFor`
  // below unifies.
  const [pendingProjectPick, setPendingProjectPick] = useState<{ sceneId: string; asset: MediaAsset } | null>(null);
  const [exportResolution, setExportResolution] = useState<'1080x1920' | '1920x1080' | '1080x1080'>('1080x1920');
  const [exportQuality, setExportQuality] = useState<'High' | 'Standard' | 'Draft'>('High');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  // 'narration' is the single master-narration bar on A1 — not a scene row and not a
  // library clip, so it needs its own type rather than borrowing one of theirs.
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'scene' | 'clip' | 'overlay' | 'narration', id: string, trackId?: string } | null>(null);

  const router = useRouter();

  // ── Scene Board modal ──
  // The board used to be a separate route reached from a header link. It now
  // opens over the editor, so reviewing the script costs no navigation and no
  // loss of timeline state. Its data is fetched lazily on first open rather than
  // threaded through props, which would make every editor load pay for it.
  const [isSceneBoardOpen, setIsSceneBoardOpen] = useState(false);
  const [sceneBoardData, setSceneBoardData] = useState<SceneBoardData | null>(null);
  const [isLoadingSceneBoard, setIsLoadingSceneBoard] = useState(false);
  const [sceneBoardError, setSceneBoardError] = useState<string | null>(null);
  // Same stale-closure reason as `contextMenuOpenRef` — read by the []-deps keydown effect.
  const sceneBoardOpenRef = useRef(false);
  sceneBoardOpenRef.current = isSceneBoardOpen;
  // Mirrors `contextMenu` for the keydown effect below, which binds once with []
  // deps and would otherwise close over a stale null forever.
  const contextMenuOpenRef = useRef(false);
  contextMenuOpenRef.current = contextMenu !== null;

  /**
   * Isolated preview — renders a ONE-scene composition instead of the whole timeline
   * so a single scene can be looped and inspected.
   *
   * Deliberately NOT built on the Player's `inFrame`/`outFrame`: the playback sync
   * effect below seeks the absolute timeline frame on every cursor change, and would
   * fight those bounds every frame. A one-scene `scenes` array starts that scene at
   * frame 0 instead, which sidesteps offset translation entirely.
   *
   * Held as an id rather than the scene object so it can't go stale against `scenes`.
   */
  const [isolatedSceneId, setIsolatedSceneId] = useState<string | null>(null);

  // Accordion collapse states for Scene Info panel
  // Visual Generation is the panel's primary tool, so it opens by default and the rest
  // start collapsed — with all four open the visual controls sat below the fold.
  const [isVoiceoverExpanded, setIsVoiceoverExpanded] = useState(false);
  const [isVisualExpanded, setIsVisualExpanded] = useState(true);
  const [isOverlayExpanded, setIsOverlayExpanded] = useState(false);
  const [isTransitionExpanded, setIsTransitionExpanded] = useState(false);
  // Project-level controls (summary, voice, narration) render below whatever the
  // current selection is, so they stay reachable at all times. Collapsed by
  // default — with a scene selected, the scene's own controls are the point.
  const [isProjectExpanded, setIsProjectExpanded] = useState(false);
  // Ken Burns has no accordion of its own (single checkbox, nothing to expand into),
  // but its bulk-apply actions live behind this small menu instead of the row itself.
  const [showKenBurnsMenu, setShowKenBurnsMenu] = useState(false);
  // The OV track's "+ Add" button opens a menu picking WHICH kind of clip to
  // create (plain text vs. one of the two graphic-card templates) — same idea
  // as showRatioMenu/showKenBurnsMenu, but this button lives inside TWO
  // nested traps those don't: the Timeline Track Area's `overflow-x-auto
  // overflow-y-auto` scroll container (clips a plain `position: absolute`
  // popup no matter its z-index) AND the OV row's `sticky left-0 z-[52]`
  // sidebar, which — because `position: sticky` with a set z-index creates
  // its OWN stacking context per spec — caps any z-index inside it at 52
  // relative to the rest of the page, so even `position: fixed` isn't enough
  // on its own. `addOverlayMenuPos` holds the button's on-screen rect
  // (captured on open) so the menu can be rendered via `createPortal` into
  // `document.body`, escaping both the scroll clipping and the stacking
  // context in one move.
  //
  // Anchored by EITHER `top` (menu below the button) or `bottom` (menu above
  // it), never both. Anchoring the flipped case by its bottom edge is what
  // lets it open upward without measuring the menu first — the browser grows
  // it upward from a known line, so the placement stays correct however many
  // kinds the menu ends up listing.
  const [showAddOverlayMenu, setShowAddOverlayMenu] = useState(false);
  const [addOverlayMenuPos, setAddOverlayMenuPos] = useState<
    { left: number; top?: number; bottom?: number; maxHeight: number } | null
  >(null);
  const addOverlayButtonRef = useRef<HTMLButtonElement>(null);
  // Which V1 scene a transition card is currently being dragged over — drives the
  // amber "drop here" ring while the drag is in flight. Separate from `draggingScene`
  // (that's for reordering scene blocks, a different drag entirely).
  const [transitionDragOverSceneId, setTransitionDragOverSceneId] = useState<string | null>(null);
  // Which scene just received a transition (via card click OR card drop) — drives a
  // brief confirmation glow on its left-edge indicator, then clears itself.
  const [transitionJustAppliedId, setTransitionJustAppliedId] = useState<string | null>(null);
  // Transition-music (A2) drag state — a separate pair from the transition-card ones
  // above: that drag targets a V1 scene block, this one targets the A2 lane itself
  // and snaps to whichever scene boundary is nearest the cursor, not a specific block.
  // `null` boundary index with `isDraggingMusicPreset` true just means "no boundary is
  // close enough yet to have been computed" (e.g. pointer hasn't moved over A2 yet).
  const [isDraggingMusicPreset, setIsDraggingMusicPreset] = useState(false);
  const [musicDragNearestBoundaryIdx, setMusicDragNearestBoundaryIdx] = useState<number | null>(null);
  // Which A2 clip just landed via a preset drop — drives a brief confirmation pulse
  // on that clip block, then clears itself. No persistent "there's music here"
  // indicator is needed the way the V1 transition seam line is: the clip itself is
  // already a visible block on A2 once created.
  const [musicJustAppliedClipId, setMusicJustAppliedClipId] = useState<string | null>(null);

  // Auto-captions. `narration_words` is written by the Deepgram pass inside
  // generateFullNarration, so it only exists once narration has been generated —
  // the toggle stays disabled until then rather than silently doing nothing.
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(
    Boolean(initialProject.captions_enabled)
  );
  const captionWords: CaptionWord[] = useMemo(
    () => (Array.isArray(initialProject.narration_words) ? initialProject.narration_words : []),
    [initialProject.narration_words]
  );

  // Lets the timeline's "Replace media" action scroll the Visual Generation
  // accordion into view. The scroll is deferred through state + an effect rather
  // than fired inline, because the node does not exist until React has committed
  // the `activeTab`/`isVisualExpanded` change that reveals it.
  const visualAccordionRef = useRef<HTMLDivElement>(null);
  const [pendingVisualScroll, setPendingVisualScroll] = useState(false);

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

  /**
   * Per-scene duration, and the cumulative start offset of every scene, in seconds.
   *
   * `getSceneLeftPosition` used to sum every preceding scene's duration on each call,
   * and it is called once per scene per track — O(n²) duration lookups per render,
   * each one potentially scanning `mediaAssets`. Prefix sums make that O(n), which
   * matters twice over: these helpers also run inside the drop-target hit test on
   * every single `dragover` event.
   */
  const sceneDurations = useMemo(
    () => scenes.map(getSceneDuration),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSceneDuration is
    // a render-scoped closure over exactly these two values.
    [scenes, mediaAssets]
  );
  const sceneOffsets = useMemo(() => {
    const offsets: number[] = [];
    let elapsed = 0;
    for (const duration of sceneDurations) {
      offsets.push(elapsed);
      elapsed += duration;
    }
    return offsets;
  }, [sceneDurations]);

  // The internal scene-to-scene cut points, as indices into `scenes`/`sceneOffsets`
  // (boundary `i` sits between scene `i-1` and scene `i`, at time `sceneOffsets[i]`).
  // Index 0 is the very start of the timeline, not a boundary BETWEEN two scenes, so
  // it's excluded — matching the transition cards' own "first scene has nothing to
  // transition from" rule. Used by the transition-music drag to find the nearest cut
  // to snap a dropped clip's center onto.
  const findNearestSceneBoundaryIdx = (timeSeconds: number): number | null => {
    if (scenes.length < 2) return null;
    let nearestIdx: number | null = null;
    let nearestDistance = Infinity;
    for (let i = 1; i < scenes.length; i++) {
      const distance = Math.abs(sceneOffsets[i] - timeSeconds);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIdx = i;
      }
    }
    return nearestIdx;
  };

  /**
   * Every V1 scene boundary in seconds — timeline start, every cut point, and
   * the very end of the last scene. Used to give an OV clip being dragged or
   * trimmed a CapCut-style magnetic snap + a visible alignment guide line
   * against V1, the same way `sceneOffsets` drives V1's own cut points.
   */
  const v1BoundaryTimes = useMemo(() => {
    if (sceneOffsets.length === 0) return [];
    const lastIdx = sceneOffsets.length - 1;
    return [...sceneOffsets, sceneOffsets[lastIdx] + sceneDurations[lastIdx]];
  }, [sceneOffsets, sceneDurations]);

  /** Pixel distance within which an OV clip's dragged/trimmed edge snaps to a V1 boundary. */
  const OVERLAY_TIME_SNAP_PX = 8;

  const nearestV1BoundaryTime = (timeSeconds: number): number | null => {
    const thresholdSeconds = OVERLAY_TIME_SNAP_PX / scale;
    let nearest: number | null = null;
    let nearestDistance = Infinity;
    for (const boundary of v1BoundaryTimes) {
      const distance = Math.abs(boundary - timeSeconds);
      if (distance < thresholdSeconds && distance < nearestDistance) {
        nearestDistance = distance;
        nearest = boundary;
      }
    }
    return nearest;
  };

  // Hoisted out of the position helpers below: they are called once per scene, and a
  // findIndex inside them would put the O(n²) back that the prefix sums just removed.
  const draggingSceneIndex = useMemo(
    () => (draggingScene ? scenes.findIndex(s => s.id === draggingScene.id) : -1),
    [draggingScene, scenes]
  );

  // Gates the slide animation on the blocks. A trim is explicitly excluded: those are
  // driven by per-frame DOM writes that must land instantly.
  const isReordering = Boolean(draggingScene || draggingAsset) && !isResizing;

  // V1 and A1 are two views of the same scene rows — A1 renders each scene's
  // narration, V1 its visual — so both read from the single `scenes` array.
  const getUnshiftedLeftPosition = (track: 'V1' | 'A1', index: number) => {
    let time = sceneOffsets[index] ?? 0;
    // The dragged scene is lifted out of the row while its placeholder shows the
    // drop slot, so everything after it closes up by that scene's duration.
    if (draggingScene && draggingScene.track === track && draggingSceneIndex !== -1 && draggingSceneIndex < index) {
      time -= sceneDurations[draggingSceneIndex];
    }
    return time * scale;
  };

  const getSceneLeftPosition = (track: 'V1' | 'A1', sceneIndex: number) => {
    let time = getUnshiftedLeftPosition(track, sceneIndex) / scale;
    const insertIdx = track === 'V1' ? v1DragInsertIndex : a1DragInsertIndex;

    if (insertIdx !== null && sceneIndex >= insertIdx) {
      if (draggingAsset) {
        time += (draggingAsset.duration || 5);
      } else if (draggingScene && draggingScene.track === track && scenes[sceneIndex].id !== draggingScene.id) {
        time += (draggingScene.duration || 5);
      }
    }

    // No resize adjustment here any more. A trim in progress never touches `scenes`
    // state (see the gesture handling below) — the affected blocks are moved by
    // writing `transform`/`width` straight to their DOM nodes, and this function
    // supplies the committed geometry React restores once the gesture ends.
    return time * scale;
  };

  const getVisualSequenceNumber = (track: 'V1' | 'A1', originalIndex: number) => {
    const trackScenes = scenes;
    const insertIdx = track === 'V1' ? v1DragInsertIndex : a1DragInsertIndex;
    
    if (!draggingScene || draggingScene.track !== track || insertIdx === null) {
      return trackScenes[originalIndex].sequence_number;
    }

    const dragIndex = draggingSceneIndex;
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

  /** How many filmstrip thumbnails fit across a block of the given duration. */
  const filmstripCount = (durationSeconds: number) =>
    Math.max(1, Math.ceil((durationSeconds * scale) / FILMSTRIP_THUMB_WIDTH));


  /**
   * Trim gestures are driven entirely through refs and direct DOM writes; the only
   * React state involved is `isResizing`, which flips once at each end of the gesture.
   *
   * The version this replaces called `setScenes` on every `pointermove`. Pointer
   * devices emit 500-1000 events/sec, and because this component holds the whole
   * editor in one tree — with no memoised children — each of those re-rendered the
   * panel, the ruler, all three tracks and every block. Worse, `remotionScenes` is
   * keyed on `[scenes]`, so each frame also rebuilt the Remotion input props and
   * re-rendered the <Player>. Writing `transform`/`width` straight to the handful of
   * affected nodes instead keeps the gesture at a flat cost no matter how many
   * scenes the project has.
   */
  type GestureTarget = {
    node: HTMLElement;
    baseLeftPx: number;
    scaled: boolean;
    /**
     * The exact inline `transform`/`width` React had rendered onto this node
     * when the gesture began — i.e. the values React still BELIEVES are on the
     * DOM. Restored verbatim when the gesture ends; see `clearGestureDom` for
     * why removing the properties instead corrupts the whole track.
     */
    initialTransform: string;
    initialWidth: string;
  };
  type GestureSnapshot = {
    kind: 'scene' | 'clip';
    id: string;
    track: string;
    edge: 'left' | 'right';
    startClientX: number;
    scale: number;
    initialDuration: number;
    initialTrimStart: number;
    initialStartTime: number;
    maxDuration: number;
    /** The trimmed block itself — the same scene appears on both V1 and A1. */
    resizeTargets: GestureTarget[];
    /** Blocks after it, which slide as it grows or shrinks. */
    shiftTargets: GestureTarget[];
  };

  const gestureRef = useRef<GestureSnapshot | null>(null);
  const gestureFrameRef = useRef<number | null>(null);
  const gesturePointerXRef = useRef(0);
  // Distinguishes a real trim from a bare click on the handle, so the latter doesn't
  // write an unchanged duration back to the database.
  const gestureMovedRef = useRef(false);
  // handlePointerMove records the values it lands on so handlePointerUp can persist
  // them once, on release, without reading state from inside a setter.
  const lastResizeValuesRef = useRef<Record<string, any> | null>(null);
  // Scene block DOM nodes, keyed `${sceneId}_V1` / `${sceneId}_A1` to match the
  // existing `selectedSceneKeys` convention.
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});
  // Number of filmstrip thumbnails a block was showing when its gesture began. The
  // count is normally derived from the block's pixel width, so resizing would mount
  // and unmount real <video preload="metadata"> elements mid-drag, each firing a
  // range request. Freezing it keeps the strip stable until the gesture commits.
  const [frozenStrip, setFrozenStrip] = useState<{ sceneId: string; count: number } | null>(null);

  const readTarget = (key: string): GestureTarget | null => {
    const node = blockRefs.current[key];
    if (!node) return null;
    return {
      node,
      baseLeftPx: Number(node.dataset.baseLeft || 0),
      scaled: node.dataset.scaled === '1',
      initialTransform: node.style.transform,
      initialWidth: node.style.width,
    };
  };

  const handleResizeStart = (e: React.PointerEvent, sceneId: string, track: string, edge: 'left' | 'right', duration: number, trimStart: number = 0) => {
    e.stopPropagation();
    e.preventDefault();

    const isClip = track === 'A1_clip' || track === 'A2_clip';
    const resizeTargets: GestureTarget[] = [];
    const shiftTargets: GestureTarget[] = [];
    let maxDuration = 8;
    let initialStartTime = 0;

    if (isClip) {
      // Clips are positioned by react-rnd, which owns their node's transform, so they
      // keep the state-driven path below (rAF-coalesced, but still re-rendering).
      // There are only ever a handful of them, and reaching into Rnd's internals to
      // move them by hand would be far more fragile than it is worth.
      const clip = timelineClips.find(c => c.id === sceneId);
      maxDuration = clip?.asset.duration || 15;
      initialStartTime = clip?.startTime || 0;
    } else {
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const scene = sceneIndex === -1 ? null : scenes[sceneIndex];
      if (scene?.custom_media_url && scene.assetId) {
        // `mediaAssets` is upload-only (it backs the Media panel's import
        // library), so a generated or stock video's real duration was never
        // found here and this silently fell back to the hardcoded 8s below —
        // letting a 6s clip get dragged out to 8s of footage that doesn't
        // exist. `projectVisualAssets` covers every source, not just uploads.
        const asset = projectVisualAssets.find(a => a.id === scene.assetId);
        if (asset && asset.duration) maxDuration = asset.duration;
      }

      // The trimmed scene renders on both V1 and A1; so does everything after it.
      // Resolved once here so the move handler never touches React state or the DOM
      // tree — it only writes to nodes it already holds.
      for (const suffix of ['V1', 'A1'] as const) {
        const own = readTarget(`${sceneId}_${suffix}`);
        if (own) resizeTargets.push(own);
        for (let i = sceneIndex + 1; i < scenes.length; i++) {
          const following = readTarget(`${scenes[i].id}_${suffix}`);
          if (following) shiftTargets.push(following);
        }
      }

      if (scene?.custom_media_url) {
        setFrozenStrip({ sceneId, count: filmstripCount(duration) });
      }

      // Hinted here rather than in the style prop so only the blocks that actually
      // move get promoted. Setting it on every block for the duration of a gesture
      // would hand the compositor 60+ layers to hold for a project of that size.
      for (const t of [...resizeTargets, ...shiftTargets]) {
        t.node.style.willChange = 'transform';
      }
    }

    // Seeded to the press position so the first `applyGestureToDom` — which the layout
    // effect fires on the render that `setIsResizing(true)` triggers, before any
    // pointermove — computes a zero delta instead of reading a stale X and snapping
    // the block to its minimum duration.
    gesturePointerXRef.current = e.clientX;
    gestureMovedRef.current = false;

    gestureRef.current = {
      kind: isClip ? 'clip' : 'scene',
      id: sceneId,
      track,
      edge,
      startClientX: e.clientX,
      scale,
      initialDuration: duration,
      initialTrimStart: trimStart,
      initialStartTime,
      maxDuration,
      resizeTargets,
      shiftTargets,
    };

    // The only state the gesture touches. Everything else it needs — the edge, the
    // scale, the affected nodes — lives in `gestureRef`, which costs no render.
    setIsResizing(true);
  };

  /**
   * Paints the in-progress gesture onto the DOM. Called from the rAF tick, and again
   * from a layout effect after any render that happens mid-gesture — React would
   * otherwise reset `transform`/`width` back to the committed geometry and the block
   * would snap backwards for a frame.
   */
  const applyGestureToDom = () => {
    const g = gestureRef.current;
    if (!g || g.kind !== 'scene') return;

    const deltaDuration = (gesturePointerXRef.current - g.startClientX) / g.scale;
    const { duration, trimStart } = computeSceneResize({
      initialDuration: g.initialDuration,
      initialTrimStart: g.initialTrimStart,
      deltaDuration,
      edge: g.edge,
      maxDuration: g.maxDuration,
      currentTrimStart: g.initialTrimStart,
    });
    lastResizeValuesRef.current = { video_duration: duration, trim_start: trimStart };

    const deltaPx = (duration - g.initialDuration) * g.scale;
    const widthPx = duration * g.scale;

    for (const t of g.resizeTargets) {
      t.node.style.width = `${widthPx}px`;
      // A left-edge trim keeps the right edge pinned, so the block's own left moves
      // by the inverse of the size change. A right-edge trim leaves it where it is.
      t.node.style.transform = blockTransform(g.edge === 'left' ? t.baseLeftPx - deltaPx : t.baseLeftPx, t.scaled);
    }
    // Left-edge trims pin the right edge, so nothing downstream moves.
    if (g.edge === 'right') {
      for (const t of g.shiftTargets) {
        t.node.style.transform = blockTransform(t.baseLeftPx + deltaPx, t.scaled);
      }
    }
  };

  /**
   * Puts every node back to the exact inline `transform`/`width` React last
   * rendered onto it, so the DOM matches React's own model again.
   *
   * It must RESTORE those values, never `removeProperty` them. `transform` and
   * `width` are rendered by React through the `style` prop on both the V1 and
   * A1 scene blocks — so removing them desyncs the DOM from React's virtual
   * model, and React only writes a style back when its computed value CHANGES
   * between renders. After a trim, the blocks whose geometry happens to be
   * unchanged therefore never get rewritten: they keep no transform at all and
   * collapse to the left edge of the track, which is the "every scene piles up
   * on the left / scene 2 covers scene 1" corruption. Restoring instead leaves
   * DOM and vdom in agreement, so the commit that follows updates precisely the
   * blocks whose geometry really did change.
   *
   * `will-change` is the one exception — it's only ever set imperatively here,
   * React never renders it, so removing it is correct.
   */
  const clearGestureDom = (g: GestureSnapshot) => {
    for (const t of [...g.resizeTargets, ...g.shiftTargets]) {
      t.node.style.width = t.initialWidth;
      t.node.style.transform = t.initialTransform;
      t.node.style.removeProperty('will-change');
    }
  };

  useEffect(() => {
    if (!isResizing || !gestureRef.current) return;

    const runFrame = () => {
      gestureFrameRef.current = null;
      const g = gestureRef.current;
      if (!g) return;

      if (g.kind === 'scene') {
        applyGestureToDom();
        return;
      }

      // Clip path: still a state update, but now at most one per animation frame
      // instead of one per pointer event.
      const deltaDuration = (gesturePointerXRef.current - g.startClientX) / g.scale;
      const next = computeClipResize({
        initialDuration: g.initialDuration,
        initialTrimStart: g.initialTrimStart,
        initialStartTime: g.initialStartTime,
        deltaDuration,
        edge: g.edge,
        maxDuration: g.maxDuration,
        currentTrimStart: g.initialTrimStart,
      });
      lastResizeValuesRef.current = {
        duration: next.duration,
        trim_start: next.trimStart,
        start_time: next.startTime,
      };
      setTimelineClips(prev => prev.map(clip => clip.id === g.id
        ? { ...clip, duration: next.duration, trimStart: next.trimStart, startTime: next.startTime }
        : clip));
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      // Coalesce to one update per frame. Everything the work needs lives in refs,
      // so the listener itself stays a couple of assignments.
      gesturePointerXRef.current = e.clientX;
      gestureMovedRef.current = true;
      if (gestureFrameRef.current === null) {
        gestureFrameRef.current = requestAnimationFrame(runFrame);
      }
    };

    const handlePointerUp = () => {
      if (gestureFrameRef.current !== null) {
        cancelAnimationFrame(gestureFrameRef.current);
        gestureFrameRef.current = null;
      }

      const g = gestureRef.current;
      const finalValues = gestureMovedRef.current ? lastResizeValuesRef.current : null;

      if (g && !finalValues) clearGestureDom(g);

      if (g && finalValues) {
        if (g.kind === 'clip') {
          persistTimelineItemFields(g.id, finalValues);
        } else {
          // Order here is the whole fix, and all three steps matter:
          //
          // 1. Null `gestureRef` FIRST. The layout effect further down
          //    (`if (isResizing && gestureRef.current?.kind === 'scene')
          //    applyGestureToDom()`) reapplies in-progress drag geometry on any
          //    render landing mid-gesture. The commit below forces exactly such
          //    a render, so leaving the ref set would let it refire with stale
          //    pointer data on top of the geometry just committed.
          //
          // 2. Restore the pre-gesture inline styles BEFORE committing, so the
          //    DOM once again holds precisely what React thinks it holds. React
          //    writes a style only when its computed value CHANGES between
          //    renders, so it can neither detect nor repair a DOM the gesture
          //    edited behind its back — handing it a matching starting point is
          //    what makes the commit below reliably correct.
          //
          // 3. Commit. React now rewrites exactly the blocks whose geometry
          //    genuinely changed (the trimmed scene's width, and every later
          //    block's offset) and correctly leaves the rest alone, because for
          //    those the restored DOM is already the right answer.
          gestureRef.current = null;
          clearGestureDom(g);
          setScenes(prev => prev.map(scene => scene.id === g.id
            ? { ...scene, video_duration: finalValues.video_duration, trim_start: finalValues.trim_start }
            : scene));
          setSelectedScene((prev: any) => prev && prev.id === g.id
            ? { ...prev, video_duration: finalValues.video_duration, trim_start: finalValues.trim_start }
            : prev);
          persistSceneFields(g.id, finalValues);
        }
      }

      lastResizeValuesRef.current = null;
      gestureRef.current = null;

      setFrozenStrip(null);
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    // Without this a gesture interrupted by the browser (dragged out of the window,
    // a touch turned into a scroll) would leave the inline overrides painted on and
    // the trim never committed.
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (gestureFrameRef.current !== null) {
        cancelAnimationFrame(gestureFrameRef.current);
        gestureFrameRef.current = null;
      }
    };
    // Everything the handlers read lives in refs, so this subscribes once per
    // gesture rather than re-binding as values change mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResizing]);

  // Re-assert the gesture's geometry after any render that lands mid-drag (a hover,
  // a playback tick, a background save finishing). Without this React would repaint
  // the blocks at their committed positions and the drag would visibly stutter.
  useIsomorphicLayoutEffect(() => {
    if (isResizing && gestureRef.current?.kind === 'scene') applyGestureToDom();
  });

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
        // A transition card dropped precisely on a scene block is handled by that
        // block's own onDrop (which stops propagation before this ever runs). One
        // that lands here instead was dropped on empty track space with no scene
        // under the cursor — there is nothing to apply a transition TO, and letting
        // it fall through to the asset-insert logic below would misread this payload
        // as a media asset. No-op is correct, not a missing feature.
        if (data.type === 'transition') {
          return;
        }
        if (data.type === 'transition-music') {
          // Guide lines + confirmation pulse are drag/drop-scoped UI state, not
          // committed data — always clear them here regardless of how this
          // branch exits, so a drop on a locked track or off A2 doesn't leave
          // a stale glow behind (onDragEnd covers a cancelled drag, but not a
          // drop that lands somewhere this branch rejects).
          setIsDraggingMusicPreset(false);
          setMusicDragNearestBoundaryIdx(null);

          // A1 is reserved for the master narration; V1 doesn't take audio at
          // all. Only A2 is ever a valid target, matching the guide lines,
          // which only ever render there.
          if (trackId !== 'A2') return;

          const preset = getTransitionMusicPreset(data.presetKey);
          if (!preset) return;

          const rect = e.currentTarget.getBoundingClientRect();
          const timeAtCursor = (e.clientX - rect.left) / scale;
          const boundaryIdx = findNearestSceneBoundaryIdx(timeAtCursor);
          // Nothing to center on — fewer than 2 scenes means no internal cuts exist.
          if (boundaryIdx === null) return;

          const boundaryTime = sceneOffsets[boundaryIdx];
          const startTime = Math.max(0, boundaryTime - preset.durationSeconds / 2);

          // Replace, don't stack: a second preset dropped near a boundary that
          // already has one takes its place, the same single-value-per-cut rule
          // the V1 transition cards follow.
          const existingAtBoundary = timelineClips.find(c => {
            if (c.trackId !== 'A2') return false;
            const center = c.startTime + c.duration / 2;
            return Math.abs(center - boundaryTime) < 1;
          });
          if (existingAtBoundary) {
            setTimelineClips(prev => prev.filter(c => c.id !== existingAtBoundary.id));
            if (isPersistedScene(existingAtBoundary.id)) {
              deleteTimelineItem(existingAtBoundary.id);
            }
          }

          const mediaRes = await getOrCreatePresetMedia(initialProject.id, preset.key);
          if (!mediaRes.success || !mediaRes.mediaId) {
            console.error('[handleDrop] Failed to resolve preset media:', mediaRes.error);
            return;
          }

          const presetAsset: MediaAsset = {
            id: `preset-${preset.key}`,
            name: preset.label,
            url: preset.url,
            type: 'audio',
            duration: preset.durationSeconds,
            mediaId: mediaRes.mediaId,
            persistedUrl: preset.url,
          };
          const newClipId = addTimelineClip(presetAsset, 'A2', startTime, preset.durationSeconds);
          setMusicJustAppliedClipId(newClipId);
          window.setTimeout(() => {
            setMusicJustAppliedClipId(prev => (prev === newClipId ? null : prev));
          }, 900);
          return;
        }
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

  /**
   * Every visual already in the project, for the "Project Media" scene mode.
   *
   * Deliberately wider than `mediaAssets`, which is filtered to `source === 'upload'`
   * because the Media panel is an import library. This is a different question —
   * "what picture can this scene show?" — and a clip generated for scene 3 is a
   * perfectly good answer for scene 7, so generated and stock rows belong here too.
   * Same underlying `initialMedia`; no extra query.
   */
  const projectVisualAssets = useMemo(
    () => initialMedia
      .filter(m => (m.media_type === 'image' || m.media_type === 'video') && m.url)
      .map(m => ({ ...mediaRowToAsset(m), source: m.source as string | undefined })),
    [initialMedia]
  );

  /**
   * Images only, for the Title + Cutout Card's two image-picker slots. Same
   * underlying `projectVisualAssets` — every project image regardless of
   * source (upload/AI-generated/stock) is a valid pick for a background or
   * cutout, same reasoning as `projectVisualAssets` itself.
   */
  const projectImageAssets = useMemo(
    () => projectVisualAssets.filter(m => m.type === 'image'),
    [projectVisualAssets]
  );

  /**
   * The unapplied pick standing in for a scene's media, from either picker.
   *
   * Every preview surface — the main player, the scene thumbnail, the filmstrip —
   * needs the same answer, and each one used to ask `pendingStockPick` directly.
   * Routing them through here is what lets a second picker light up all three
   * without touching any of them again.
   */
  const pendingPickFor = (sceneId: string): { mediaUrl: string; type: 'video' | 'image' } | null => {
    if (pendingStockPick && pendingStockPick.sceneId === sceneId) {
      return { mediaUrl: pendingStockPick.result.mediaUrl, type: pendingStockPick.result.type };
    }
    if (pendingProjectPick && pendingProjectPick.sceneId === sceneId) {
      const asset = pendingProjectPick.asset;
      return { mediaUrl: asset.url, type: asset.type === 'video' ? 'video' : 'image' };
    }
    return null;
  };

  /**
   * Points a scene at an asset the project already has, instead of generating a new
   * one. Writes the same `custom_media_url`/`custom_media_type` fields that stock
   * media and AI generation both write, so everything downstream — the preview, the
   * render payload, Ken Burns — treats it identically to a generated visual.
   */
  const applyProjectMediaToScene = (sceneId: string, asset: MediaAsset) => {
    // persistedUrl over url: `url` may still be a session-only blob: URL for a file
    // uploaded this session, and writing that to the DB stores a link that is dead
    // on the next page load.
    const durableUrl = asset.persistedUrl || asset.url;
    const fields = {
      custom_media_url: durableUrl,
      custom_media_type: asset.type,
      generation_status: 'Completed',
    };
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, ...fields } : s));
    setSelectedScene((prev: any) => prev && prev.id === sceneId ? { ...prev, ...fields } : prev);
    persistSceneFields(sceneId, fields);
    setPendingProjectPick(null);
  };

  // A staged pick belongs to the scene it was made on. Selecting a different scene
  // abandons it, rather than leaving an amber "not saved yet" preview bound to a
  // scene the user has navigated away from.
  useEffect(() => {
    setPendingProjectPick(prev => (prev && prev.sceneId !== selectedScene?.id ? null : prev));
  }, [selectedScene?.id]);

  /**
   * Copies one scene's visual-generation setup onto every scene in the project.
   *
   * This is what the "Apply this setup to all scenes" toggle actually does. Before,
   * the toggle only chose which button rendered, so configuring Scene 1 for stock
   * media and flipping it on left every other scene generating with whatever mode
   * it already had — the setup never travelled.
   *
   * Three fields move, and the omissions are deliberate:
   *  - `video_duration` stays put. Durations are narration-aligned per scene, and
   *    overwriting them would pull the picture off the voiceover.
   *  - `final_video_prompt` / `stock_search_query` stay put. Those are what a scene
   *    is about, not how it's produced.
   *  - `custom_media_type` only lands on scenes with no media yet. On a scene that
   *    already holds a visual it describes the file that IS there, so forcing it
   *    would leave the renderer drawing an <img> for a video.
   *
   * Stock provider/type need no propagation — `globalStockProvider`/`globalStockType`
   * are already project-wide.
   */
  const applyVisualSetupToAllScenes = (sourceScene: any) => {
    const mode = sourceScene.generation_mode || globalGenerationMode || 'ai_video';
    const model = sourceScene.ai_model || selectedAiModel;
    const mediaType = sourceScene.custom_media_type;

    setScenes(prev => prev.map(s => {
      const fields: Record<string, any> = { generation_mode: mode, ai_model: model };
      if (mediaType && !s.custom_media_url) fields.custom_media_type = mediaType;
      return { ...s, ...fields };
    }));
    setSelectedScene((prev: any) => prev ? { ...prev, generation_mode: mode, ai_model: model } : prev);

    scenes.forEach(s => {
      const fields: Record<string, any> = { generation_mode: mode, ai_model: model };
      if (mediaType && !s.custom_media_url) fields.custom_media_type = mediaType;
      persistSceneFields(s.id, fields);
    });
  };

  /**
   * Bulk sibling of the per-scene Ken Burns checkbox: sets `ken_burns_enabled` on
   * every IMAGE scene in the project in one action, instead of clicking through them
   * one by one. Video scenes are skipped — the checkbox is hidden for them for the
   * same reason (they already have their own motion).
   */
  const applyKenBurnsToAllImageScenes = (enabled: boolean) => {
    const targetIds = scenes.filter(s => s.custom_media_type !== 'video').map(s => s.id);
    setScenes(prev => prev.map(s => targetIds.includes(s.id) ? { ...s, ken_burns_enabled: enabled } : s));
    setSelectedScene((prev: any) =>
      prev && targetIds.includes(prev.id) ? { ...prev, ken_burns_enabled: enabled } : prev
    );
    targetIds.forEach(id => persistSceneFields(id, { ken_burns_enabled: enabled }));
    setShowKenBurnsMenu(false);
  };

  /**
   * Shared by both ways of setting a scene's transition — clicking a card (targets
   * the selected scene) and dragging a card onto a scene block (targets whichever
   * block it lands on). Layered on `updateSceneDetails` purely to add the "just
   * applied" flash so both paths give the same confirmation.
   */
  const applyTransitionToScene = (sceneId: string, type: TransitionType) => {
    updateSceneDetails(sceneId, 'transition_type', type);
    setTransitionJustAppliedId(sceneId);
    window.setTimeout(() => {
      setTransitionJustAppliedId(prev => (prev === sceneId ? null : prev));
    }, 900);
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

  /* ── OV track: overlay clips ─────────────────────────────────────────────
     Same merge-and-debounce shape as the two persisters above, for
     overlay_clips rows. Debouncing matters more here than anywhere else in
     this file: dragging an overlay around the preview fires a position update
     on every pointer move. */
  const pendingOverlaySavesRef = useRef<{ [clipId: string]: Record<string, any> }>({});
  const overlaySaveTimersRef = useRef<{ [clipId: string]: ReturnType<typeof setTimeout> }>({});

  const persistOverlayClipFields = (clipId: string, fields: Record<string, any>, debounce = false) => {
    if (!isPersistedScene(clipId)) return;

    pendingOverlaySavesRef.current[clipId] = { ...pendingOverlaySavesRef.current[clipId], ...fields };

    const flush = () => {
      const payload = pendingOverlaySavesRef.current[clipId];
      delete pendingOverlaySavesRef.current[clipId];
      delete overlaySaveTimersRef.current[clipId];
      if (!payload || Object.keys(payload).length === 0) return;
      updateOverlayClip(clipId, payload).then(res => {
        if (!res.success) console.error("[Overlay Clip Save]", res.error);
      });
    };

    if (overlaySaveTimersRef.current[clipId]) clearTimeout(overlaySaveTimersRef.current[clipId]);
    if (debounce) {
      overlaySaveTimersRef.current[clipId] = setTimeout(flush, 800);
    } else {
      flush();
    }
  };

  /** Local state + persistence for one field of one overlay clip. */
  const updateOverlayClipField = (
    clipId: string,
    field: keyof OverlayClip,
    value: any,
    dbColumn: string,
    debounce = false
  ) => {
    setOverlayClips(prev => prev.map(c => (c.id === clipId ? { ...c, [field]: value } : c)));
    persistOverlayClipFields(clipId, { [dbColumn]: value }, debounce);
  };

  /**
   * Merge-updates a graphic card's `template_data` (e.g. one bullet edited, an
   * image slot assigned) rather than replacing it whole, so a caller only ever
   * has to know about the field it's changing.
   */
  const updateOverlayClipTemplateData = (clipId: string, patch: Record<string, any>) => {
    const clip = overlayClips.find(c => c.id === clipId);
    if (!clip) return;
    const nextTemplateData = { ...(clip.templateData || {}), ...patch };
    updateOverlayClipField(clipId, 'templateData', nextTemplateData, 'template_data');
  };

  /** Per-kind defaults for a freshly created overlay clip. */
  const overlayClipDefaultsForKind = (kind: OverlayClipKind): { text: string; color: string; templateData: Record<string, any> } => {
    switch (kind) {
      case 'checklist-card':
        return {
          text: 'Checklist',
          color: '#FFFFFF',
          templateData: { bullets: ['First point', 'Second point', 'Third point'] } satisfies ChecklistCardData,
        };
      case 'title-cutout-card':
        return {
          text: 'Your Title',
          color: '#FFFFFF',
          templateData: {} satisfies TitleCutoutCardData,
        };
      case 'dim-scrim':
        // `color` is this clip's scrim color, not text — white would render as
        // a wash instead of a dim, so this kind needs its own default.
        return {
          text: '',
          color: '#000000',
          templateData: { opacity: 0.45, fadeInSeconds: 0.3, fadeOutSeconds: 0.3 } satisfies DimScrimData,
        };
      case 'particles':
        // Same `color`-isn't-text caveat as dim-scrim: for both atmospheric
        // kinds `color` is the light's own tint, so the white text default
        // would wash the frame out rather than tint it.
        return {
          text: '',
          color: '#FFE1AA',
          templateData: {
            count: 45,
            speed: 1,
            sizeScale: 1,
            fadeInSeconds: 0.8,
            fadeOutSeconds: 0.8,
          } satisfies ParticleFieldData,
        };
      case 'light-beam':
        return {
          text: '',
          color: '#FFE1AA',
          templateData: {
            xPercent: 50,
            width: 14,
            intensity: 0.75,
            fadeInSeconds: 0.6,
            fadeOutSeconds: 0.6,
          } satisfies LightBeamData,
        };
      case 'light-sweep':
        return {
          text: '',
          color: '#FFE1AA',
          templateData: {
            width: 5,
            intensity: 0.5,
            cycleSeconds: 4,
            angle: 100,
            reverse: false,
            fadeInSeconds: 0.5,
            fadeOutSeconds: 0.5,
          } satisfies LightSweepData,
        };
      case 'film-damage':
        // `color` tints the scratches only — the grain stays neutral. White is
        // right here, unlike the other atmospheric kinds: real print scratches
        // are bare film base, not warm light.
        return {
          text: '',
          color: '#FFFFFF',
          templateData: {
            grainAmount: 0.35,
            grainScale: 0.8,
            scratchCount: 4,
            scratchIntensity: 0.5,
            fadeInSeconds: 0.4,
            fadeOutSeconds: 0.4,
          } satisfies FilmDamageData,
        };
      default:
        return { text: 'Your title', color: '#FFFFFF', templateData: {} };
    }
  };

  /**
   * Creates a new overlay clip at the playhead, using the optimistic-create-
   * then-reconcile pattern the rest of this file uses: a temp id renders
   * immediately, then swaps for the real UUID once the insert resolves.
   * `isPersistedScene` gates every write, so the temp id never reaches the DB.
   */
  const handleAddOverlayClip = async (kind: OverlayClipKind = 'text') => {
    const startTime = Math.max(0, cursorPosition / scale);
    const duration = 3;
    const tempId = Math.random().toString(36).substring(7);
    const { text, color, templateData } = overlayClipDefaultsForKind(kind);

    const optimistic: OverlayClip = {
      id: tempId,
      kind,
      text,
      preset: 'cinematic-reveal',
      color,
      xPercent: 50,
      yPercent: 50,
      dimBackground: false,
      startTime,
      duration,
      templateData,
    };
    setOverlayClips(prev => [...prev, optimistic]);
    setSelectedOverlayClipId(tempId);
    // A brand-new clip starts exactly at the playhead (frame 0 of its own
    // Sequence — its entrance animation's very start), which isn't the most
    // useful first frame to land on. Force the jump to its settled midpoint
    // so the Player shows something worth looking at immediately.
    seekIntoOverlayClip(optimistic, true);

    const res = await createOverlayClip(initialProject.id, {
      text: optimistic.text,
      preset: optimistic.preset,
      color: optimistic.color,
      xPercent: optimistic.xPercent,
      yPercent: optimistic.yPercent,
      dimBackground: optimistic.dimBackground,
      startTime,
      duration,
      kind,
      templateData,
    });

    if (res.success && res.overlayClip) {
      const realId = res.overlayClip.id;
      setOverlayClips(prev => prev.map(c => (c.id === tempId ? { ...c, id: realId } : c)));
      setSelectedOverlayClipId(prev => (prev === tempId ? realId : prev));
    } else {
      console.error('[handleAddOverlayClip] Failed to create overlay clip:', res.error);
      // Roll the optimistic clip back rather than leaving a ghost that looks
      // saved but will vanish on the next page load.
      setOverlayClips(prev => prev.filter(c => c.id !== tempId));
      setSelectedOverlayClipId(prev => (prev === tempId ? null : prev));
    }
  };

  /**
   * The video's real on-screen rectangle inside the Player's container, in
   * container-relative pixels.
   *
   * The Player letterboxes: a 9:16 composition in a 16:9 container leaves black
   * bars either side, and the container rect covers those bars while the video
   * doesn't. Measuring the container instead of the video would put every
   * dragged overlay off by the width of the bars, and differently so per aspect
   * ratio — the exact failure the plan flagged to watch for.
   */
  const playerStageRef = useRef<HTMLDivElement>(null);
  const [playerStageRect, setPlayerStageRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // The measuring effect itself lives further down, next to `remotionDimensions`
  // — it needs the composition's aspect ratio, which isn't computed until then.

  /**
   * Drag an overlay around the preview.
   *
   * Position is written continuously so what's on screen during the drag IS the
   * real value — no separate "preview" representation that could disagree with
   * what lands. Persistence is debounced during the move and flushed on release.
   */
  const handleOverlayPositionDragStart = (e: React.PointerEvent, clip: OverlayClip) => {
    e.preventDefault();
    e.stopPropagation();
    if (playerStageRect.width === 0 || playerStageRect.height === 0) return;

    const stageElement = playerStageRef.current;
    if (!stageElement) return;
    const stageBox = stageElement.getBoundingClientRect();
    const videoLeft = stageBox.left + playerStageRect.left;
    const videoTop = stageBox.top + playerStageRect.top;

    let latest = { xPercent: clip.xPercent, yPercent: clip.yPercent };

    const onMove = (moveEvent: PointerEvent) => {
      const rawX = ((moveEvent.clientX - videoLeft) / playerStageRect.width) * 100;
      const rawY = ((moveEvent.clientY - videoTop) / playerStageRect.height) * 100;

      // Snap to the centre lines and the title-safe margins, then clamp so the
      // overlay can never be dragged fully out of frame.
      const snap = (value: number) => {
        const target = SNAP_TARGETS.find(t => Math.abs(value - t) <= POSITION_SNAP_TOLERANCE);
        return target ?? value;
      };

      latest = {
        xPercent: Math.min(100, Math.max(0, snap(rawX))),
        yPercent: Math.min(100, Math.max(0, snap(rawY))),
      };
      setOverlayClipPosition(clip.id, latest.xPercent, latest.yPercent, true);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Final, un-debounced write so the last position can't be lost to a
      // pending timer if the user navigates away immediately after dropping.
      persistOverlayClipFields(clip.id, { x_percent: latest.xPercent, y_percent: latest.yPercent });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Min/max an overlay's font size can be dragged or typed to. */
  const MIN_OVERLAY_FONT_SIZE = 16;
  const MAX_OVERLAY_FONT_SIZE = 200;
  /** Min/max a graphic-card's overall scale can be dragged or typed to. */
  const MIN_OVERLAY_CARD_SCALE = 0.4;
  const MAX_OVERLAY_CARD_SCALE = 2.5;

  /**
   * Moves the playhead into an overlay clip's active time range so the real
   * composition `<Player>` — not just the drag-to-position/resize badge —
   * actually shows this clip's render (its real fontSize, color, and
   * kind-specific layout) while it's selected and being edited. Without this,
   * editing a clip whose time range the playhead isn't currently inside only
   * moves the small abstract preview badge; the real video frame underneath
   * doesn't change, since Remotion only renders a Sequence's children while
   * the playhead is inside its [from, from+duration) window.
   *
   * Only jumps when the playhead is currently OUTSIDE the clip's range (or
   * `force` is set), so re-selecting a clip you're already scrubbed into
   * doesn't yank the playhead away from wherever you were checking (e.g. its
   * exit animation).
   */
  const seekIntoOverlayClip = (clip: { startTime: number; duration: number }, force = false) => {
    const startPx = clip.startTime * scale;
    const endPx = (clip.startTime + clip.duration) * scale;
    if (force || cursorPosition < startPx || cursorPosition > endPx) {
      setCursorPosition(startPx + (endPx - startPx) / 2);
    }
  };

  /**
   * Drag-resize an overlay from the small handle on its preview region.
   * Mirrors `handleOverlayPositionDragStart`'s pattern exactly: local state
   * written every move (debounced persist), then one un-debounced flush on
   * release so the final size can't be lost to a pending timer.
   *
   * Branches on `kind`: for a graphic card (checklist/title-cutout), the
   * images and layout are a fixed-size box that `fontSize` never touched —
   * only the header/headline text did — so dragging here scales the WHOLE
   * card via `template_data.scale` instead. Plain text has no "card" to
   * scale, so it keeps adjusting `fontSize` as before.
   */
  const handleOverlayResizeDragStart = (e: React.PointerEvent, clip: OverlayClip) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;

    if (clip.kind === 'checklist-card' || clip.kind === 'title-cutout-card') {
      const startScale = (clip.templateData as { scale?: number } | undefined)?.scale ?? 1;
      let latest = startScale;

      const onMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        latest = Math.min(MAX_OVERLAY_CARD_SCALE, Math.max(MIN_OVERLAY_CARD_SCALE, startScale + deltaX * 0.005));
        updateOverlayClipTemplateData(clip.id, { scale: latest });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        // Un-debounced final flush, matching the font-size/position drags below.
        const nextTemplateData = { ...(clip.templateData || {}), scale: latest };
        persistOverlayClipFields(clip.id, { template_data: nextTemplateData });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    const startFontSize = clip.fontSize ?? 64;
    let latest = startFontSize;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      latest = Math.min(MAX_OVERLAY_FONT_SIZE, Math.max(MIN_OVERLAY_FONT_SIZE, Math.round(startFontSize + deltaX * 0.5)));
      updateOverlayClipField(clip.id, 'fontSize', latest, 'font_size', true);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      persistOverlayClipFields(clip.id, { font_size: latest });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Writes both position axes at once — used by the preset buttons and the drag. */
  const setOverlayClipPosition = (clipId: string, xPercent: number, yPercent: number, debounce = false) => {
    setOverlayClips(prev =>
      prev.map(c => (c.id === clipId ? { ...c, xPercent, yPercent } : c))
    );
    persistOverlayClipFields(clipId, { x_percent: xPercent, y_percent: yPercent }, debounce);
  };

  /**
   * Move an overlay clip along the timeline.
   *
   * Pointer-events rather than <Rnd>'s own dragging (which is disabled here, as
   * it is for A1/A2 clips) so a drag can't be confused with a click-to-select,
   * and so the persist fires once on release instead of on every pointer move.
   */
  const handleOverlayDragStart = (e: React.PointerEvent, clip: OverlayClip) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const originalStart = clip.startTime;
    let latestStart = originalStart;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaSeconds = (moveEvent.clientX - startX) / scale;
      let candidateStart = Math.max(0, originalStart + deltaSeconds);
      const candidateEnd = candidateStart + clip.duration;

      // Snap whichever edge (start or end) is actually closer to a V1
      // boundary, so the two don't fight when they're near different cuts.
      const startSnap = nearestV1BoundaryTime(candidateStart);
      const endSnap = nearestV1BoundaryTime(candidateEnd);
      if (startSnap !== null && (endSnap === null || Math.abs(startSnap - candidateStart) <= Math.abs(endSnap - candidateEnd))) {
        candidateStart = startSnap;
        setOverlaySnapGuideTime(startSnap);
      } else if (endSnap !== null) {
        candidateStart = endSnap - clip.duration;
        setOverlaySnapGuideTime(endSnap);
      } else {
        setOverlaySnapGuideTime(null);
      }

      latestStart = candidateStart;
      setOverlayClips(prev => prev.map(c => (c.id === clip.id ? { ...c, startTime: latestStart } : c)));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setOverlaySnapGuideTime(null);
      persistOverlayClipFields(clip.id, { start_time: latestStart });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * Trim an overlay clip from either edge.
   *
   * Dragging the LEFT edge moves the start and shortens the clip by the same
   * amount so its end stays put; dragging the right edge only changes duration.
   * Unlike an audio clip there's no source media to run out of, so the only
   * limit is a 0.5s floor — a title shorter than that can't finish animating in.
   */
  const handleOverlayResizeStart = (
    e: React.PointerEvent,
    clip: OverlayClip,
    edge: 'left' | 'right'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const originalStart = clip.startTime;
    const originalDuration = clip.duration;
    let latest = { startTime: originalStart, duration: originalDuration };

    const onMove = (moveEvent: PointerEvent) => {
      const deltaSeconds = (moveEvent.clientX - startX) / scale;

      if (edge === 'left') {
        // Clamped so the left edge can't cross the right one, nor go negative.
        const maxShift = originalDuration - 0.5;
        let shift = Math.min(maxShift, Math.max(-originalStart, deltaSeconds));
        let candidateStart = originalStart + shift;
        const snap = nearestV1BoundaryTime(candidateStart);
        if (snap !== null) {
          candidateStart = snap;
          shift = candidateStart - originalStart;
          setOverlaySnapGuideTime(snap);
        } else {
          setOverlaySnapGuideTime(null);
        }
        latest = { startTime: candidateStart, duration: originalDuration - shift };
      } else {
        let candidateDuration = Math.max(0.5, originalDuration + deltaSeconds);
        const candidateEnd = originalStart + candidateDuration;
        const snap = nearestV1BoundaryTime(candidateEnd);
        if (snap !== null) {
          candidateDuration = Math.max(0.5, snap - originalStart);
          setOverlaySnapGuideTime(snap);
        } else {
          setOverlaySnapGuideTime(null);
        }
        latest = { startTime: originalStart, duration: candidateDuration };
      }

      setOverlayClips(prev => prev.map(c => (c.id === clip.id ? { ...c, ...latest } : c)));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setOverlaySnapGuideTime(null);
      persistOverlayClipFields(clip.id, {
        start_time: latest.startTime,
        duration: latest.duration,
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleDeleteOverlayClip = (clipId: string) => {
    setOverlayClips(prev => prev.filter(c => c.id !== clipId));
    setSelectedOverlayClipId(prev => (prev === clipId ? null : prev));
    if (isPersistedScene(clipId)) {
      deleteOverlayClip(clipId).then(res => {
        if (!res.success) console.error('[handleDeleteOverlayClip]', res.error);
      });
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
  // Returns the new clip's (temporary, pre-persistence) id — existing callers that
  // don't need it simply ignore the return value; the transition-music drop handler
  // uses it to flag the freshly-created clip for a brief confirmation pulse.
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

    return tempClipId;
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
    // An Act and a scene are different selection kinds sharing one Inspector, so
    // selecting either must clear the other or the panel shows two things at once.
    setSelectedActNumber(null);
    setActiveTab('scene');
  };

  /**
   * Target of the timeline's right-click "Replace media" action.
   *
   * Applies the same selection side effects as clicking the block, then expands the
   * Visual Generation accordion and queues a scroll to it. Deliberately reuses the
   * existing panel instead of opening a modal: that panel already carries the model
   * picker, duration, prompt and Generate button, so a modal would be a second UI
   * for work this one already does.
   */
  const focusSceneVisualGeneration = (sceneId: string) => {
    const index = scenes.findIndex(s => s.id === sceneId);
    if (index === -1) return;

    setSelectedAsset(null);
    setSelectedTimelineClip(null);
    setSelectedSceneKeys([`${sceneId}_V1`]);
    setSelectedScene(scenes[index]);
    setSelectedSceneTrack('V1');
    setActiveTab('scene');
    setIsVisualExpanded(true);

    // Park the playhead on the scene being replaced, matching a normal block click,
    // so the preview shows the visual the user is about to swap out.
    setIsPlaying(false);
    setCursorPosition(getUnshiftedLeftPosition('V1', index));

    setPendingVisualScroll(true);
  };

  useEffect(() => {
    if (!pendingVisualScroll) return;
    visualAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setPendingVisualScroll(false);
  }, [pendingVisualScroll]);

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

  const handleGenerateSceneVisual = async (sceneId: string, prompt: string, modelToUse = selectedAiModel, requestedDuration = 5) => {
    setIsGeneratingVisualId(sceneId);

    const sceneToGen = scenes.find(s => s.id === sceneId);
    const mode = sceneToGen?.generation_mode || globalGenerationMode || 'ai_video';

    // Smart duration rounding: AI video models only emit fixed lengths, so round the
    // scene's exact narration-aligned duration (e.g. 3.6s) UP to the next available
    // increment. Rounding down would leave the tail of the voiceover with no picture.
    // Images and lip-sync have no such constraint and use the exact duration.
    let assetDuration = requestedDuration;
    if (mode === 'ai_video') {
      if (requestedDuration <= 5.0) assetDuration = 5;
      else if (requestedDuration <= 8.0) assetDuration = 8;
      else assetDuration = 10;
    }

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
        body: JSON.stringify({ sceneId, projectId: initialProject.id, prompt, model: modelToUse, duration: assetDuration, aspectRatio }),
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
        // INTENTIONAL: video_duration is NOT overwritten with the generated asset's
        // length. The scene stays at its exact narration-aligned duration (e.g. 3.6s)
        // while the underlying clip may be 5s — Remotion simply plays the first 3.6s,
        // and the extra footage remains available as buffer if the scene is later
        // stretched by hand. Writing the asset length back here would push every
        // following scene out of sync with the voiceover.
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

  /** Fetches stock results for one scene into the picker grid. */
  const handleStockSearch = async (sceneId: string, query: string) => {
    if (!query.trim()) return;
    setIsSearchingStock(true);
    try {
      const res = await fetch(
        `/api/stock-media?query=${encodeURIComponent(query)}&provider=${globalStockProvider}&type=${globalStockType}`
      );
      const data = await res.json();
      setStockSearchResults({ sceneId, results: data.success ? data.results || [] : [] });
    } catch (e) {
      console.error('[Stock Search] failed:', e);
      setStockSearchResults({ sceneId, results: [] });
    } finally {
      setIsSearchingStock(false);
    }
  };

  /** Stages a thumbnail as the pending pick for preview — no download, no save yet. */
  const handleSelectStockResult = (sceneId: string, result: StockResult) => {
    setPendingStockPick({ sceneId, result });
  };

  /** Downloads the approved pick onto our own storage, then persists it to the scene. */
  const handleApplyStockResult = async (sceneId: string, result: StockResult) => {
    setIsApplyingStock(true);
    try {
      const res = await fetch('/api/media/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.mediaUrl, projectId: initialProject.id, mediaType: result.type }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Failed to save this pick: ${data.error || 'unknown error'}`);
        return;
      }
      updateSceneDetails(sceneId, 'custom_media_url', data.url);
      updateSceneDetails(sceneId, 'custom_media_type', result.type);
      updateSceneDetails(sceneId, 'generation_status', 'Completed');
      setPendingStockPick(null);
    } catch (e: any) {
      console.error('[Stock Apply] failed:', e);
      alert('Failed to save this pick — check your connection and try again.');
    } finally {
      setIsApplyingStock(false);
    }
  };

  const handleGenerateAllVisuals = async () => {
    // Scenes that already have a visual used to be skipped unconditionally, which
    // made "Generate All" useless for restyling a project — the very scene you just
    // configured was the first one passed over. Now it asks, so re-running after a
    // partial pass is still safe by default but a deliberate restyle is possible.
    const alreadyFilled = scenes.filter(s => s.custom_media_url);
    let overwriteFilled = false;
    if (alreadyFilled.length > 0) {
      overwriteFilled = window.confirm(
        `${alreadyFilled.length} of ${scenes.length} scenes already have a visual.\n\n` +
        `OK — regenerate those too, replacing what's there (costs a provider call each).\n` +
        `Cancel — leave them alone and only fill the ${scenes.length - alreadyFilled.length} empty scene(s).`
      );
    }

    setIsGeneratingAllVisuals(true);
    try {
      for (const scene of scenes) {
        if (scene.custom_media_url && !overwriteFilled) continue;

        const mode = scene.generation_mode || globalGenerationMode;
        if (!mode) {
          alert("Pick a Default Media Mode first, or set one on each scene.");
          return;
        }

        // Project Media means "the user picks from what already exists" — there is
        // nothing to generate, and no sane way to choose on their behalf across a
        // whole project. Skipped rather than falling through to the AI branch, which
        // would spend a real generation call on a scene that never asked for one.
        if (mode === 'project_media') continue;

        if (mode === 'stock_media') {
          // Uses the user's chosen provider/type rather than a hardcoded Pexels video
          // search. No picker here on purpose: there's nobody watching to choose a
          // thumbnail across a hundred scenes, so the top result is applied directly.
          const query =
            scene.stock_search_query || scene.final_video_prompt || scene.voice_over_beat || 'cinematic';
          try {
            const res = await fetch(
              `/api/stock-media?query=${encodeURIComponent(query.substring(0, 80))}` +
              `&provider=${globalStockProvider}&type=${globalStockType}`
            );
            const data = await res.json();
            const top = data.success ? data.results?.[0] : null;
            if (top) {
              // Bulk-fill still downloads onto our own storage rather than hotlinking —
              // there's just nobody reviewing the pick first, unlike the manual picker.
              const dl = await fetch('/api/media/from-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: top.mediaUrl, projectId: initialProject.id, mediaType: top.type }),
              });
              const dlData = await dl.json();
              if (dlData.success) {
                const result = {
                  custom_media_url: dlData.url,
                  custom_media_type: top.type,
                  generation_status: 'Completed',
                };
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, ...result } : s));
                if (selectedScene?.id === scene.id) {
                  setSelectedScene((prev: any) => ({ ...prev, ...result }));
                }
                persistSceneFields(scene.id, result);
              } else {
                console.error('[Generate All] Failed to save stock pick for scene', scene.id, dlData.error);
              }
            }
          } catch (e) {
            console.error('[Stock] bulk fetch failed for scene', scene.id, e);
          }
        } else if (mode === 'static_theme') {
          // Renders as the composition's dark gradient fallback — no media to fetch,
          // so this only needs to stop looking unfinished.
          const result = { generation_status: 'Completed' };
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, ...result } : s));
          persistSceneFields(scene.id, result);
        } else if (mode === 'lip_sync') {
          // No provider wired up yet — skipped rather than silently marked complete.
          console.warn('[Lip Sync] not implemented; skipping scene', scene.id);
        } else {
          await handleGenerateSceneVisual(
            scene.id,
            scene.final_video_prompt || "Cinematic video scene",
            // Prefer the scene's own model, matching how single-scene generation
            // resolves it. Bulk used to always force the global default, so a model
            // chosen per scene — including one just propagated by the toggle — was
            // silently ignored here.
            scene.ai_model || selectedAiModel,
            scene.video_duration || 5
          );
        }
      }
    } finally {
      setIsGeneratingAllVisuals(false);
    }
  };

  // Every exit path that touches render state must land the project on a terminal
  // status. Leaving it on 'rendering' after a failure was unrecoverable from the UI:
  // the workspace hub would show a spinner forever with no way to clear it. Lifted to
  // component level (was local to handleRenderVideo) so the resume-on-reload flow
  // below can reach the same terminal-status logic.
  const markStatus = async (status: ProjectStatus) => {
    setProjectStatus(status);
    const res = await updateProjectStatus(initialProject.id, status);
    if (!res.success) {
      setPersistenceWarning(`Could not update project status to "${status}": ${res.error}`);
    }
    return res.success;
  };

  const stopRenderProgressPolling = () => {
    if (renderPollRef.current !== null) {
      window.clearInterval(renderPollRef.current);
      renderPollRef.current = null;
    }
  };

  // Polls the render route's progress endpoint on an interval, since a render's
  // length isn't known up front (same shape as pollMediaStatus, which uses a fixed
  // attempt count instead because media generation has a rough expected duration).
  //
  // Shared by handleRenderVideo AND the resume-on-reload effect below — the only way
  // a reloaded page can find out about a render already in flight is by polling this
  // same endpoint, so the two flows share one implementation rather than two interval
  // lifecycles that could drift out of sync.
  //
  // `completeOnDone` exists because the server's progress map is never cleaned up
  // after a render finishes — it keeps {progress: 1, stage: 'done'} for that project
  // indefinitely. So a stale 'done' is a real possibility on the FIRST poll tick.
  //
  //   - handleRenderVideo passes false: its POST response is the authoritative
  //     completion signal, and trusting a 'done' reading here would let a leftover
  //     entry from a PREVIOUS render close the modal moments after a new one started.
  //   - The resume-on-reload effect passes true: it has no POST response to wait on,
  //     so a 'done' reading is the only way it can ever learn the render finished —
  //     and there, 'done' genuinely means this render, since the page only resumes
  //     when the project row already says 'rendering'.
  //
  // The output path is reconstructed from projectId rather than read from a response,
  // since the render route always writes to public/media/final_exports/{id}.mp4 — the
  // resume flow has no response to read it from.
  const startRenderProgressPolling = (projectId: string, completeOnDone: boolean) => {
    stopRenderProgressPolling();
    renderPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/render-remotion?projectId=${projectId}`);
        const data = await res.json();
        if (!data.success) return;

        setRenderProgress(data.progress);
        setRenderStage(data.stage ?? null);

        if (completeOnDone && data.stage === 'done') {
          stopRenderProgressPolling();
          setIsRendering(false);
          setRenderStatusMessage("Render completed!");
          setRenderOutputPath(`/media/final_exports/${projectId}.mp4`);
          await markStatus('exported');
        }
      } catch {
        // Transient poll failure — the next tick tries again; not worth surfacing.
      }
    }, 500);
  };

  const handleRenderVideo = async () => {
    setIsRendering(true);
    setRenderStatusMessage("Submitting render job to Remotion engine...");
    setRenderOutputPath(null);
    setRenderProgress(0);
    setRenderStage(null);

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

    startRenderProgressPolling(initialProject.id, false);

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
          setRenderStatusMessage("Render completed!");
          // `data.outputPath` is the SERVER's absolute filesystem path — meaningless
          // to the browser, and rejected by /api/render/download, whose security check
          // only allows files under the OS temp dir. The render route now writes into
          // `public/media/final_exports/`, so `publicUrl` is already directly servable
          // and needs no download proxy at all.
          setRenderOutputPath(data.publicUrl);
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
      stopRenderProgressPolling();
      setIsRendering(false);
    }
  };

  // Resumes progress if this project was already mid-render when the page loaded —
  // e.g. the user reloaded, or (before this feature existed) navigated away and back.
  // The render itself is not tied to the original request's connection and keeps
  // running server-side regardless, so without this the editor would silently show
  // no feedback at all for a render that is genuinely still in progress.
  //
  // Known limitation, accepted rather than solved here: `renderProgress` on the
  // server is an in-memory-only map. If the dev server restarted mid-render, there is
  // no entry to find, and this will show 0% indefinitely rather than resolving.
  useEffect(() => {
    if (normalizeProjectStatus(initialProject.status) !== 'rendering') return;
    setIsRendering(true);
    setRenderStatusMessage("Resuming render progress…");
    startRenderProgressPolling(initialProject.id, true);
    // Intentionally no cleanup-driven stopRenderProgressPolling here: unmounting this
    // effect (e.g. React re-rendering the tree) should not silently drop progress
    // visibility for a render that is still genuinely running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warns on tab close/refresh/typing a new URL while a render is in flight. This is
  // a real web-platform ceiling, not a gap in this implementation: browsers show their
  // own generic prompt regardless of any custom text set here, and there is no way to
  // block browser back/forward navigation the way the in-app Links below are blocked.
  useEffect(() => {
    if (!isRendering) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRendering]);

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
      // Escape = deselect everything, the standard NLE gesture. Without it there
      // was no way back out of a selection at all: every block click forces
      // activeTab to 'scene' and sets a selection, so the project-level view was
      // unreachable for the rest of the session once you clicked anything.
      if (e.key === 'Escape') {
        // A context menu is the more immediate thing to dismiss — only fall
        // through to clearing the selection when nothing is layered on top.
        if (contextMenuOpenRef.current) {
          setContextMenu(null);
          setActiveVolumePopup(null);
          return;
        }
        // Then the Scene Board modal — dismiss the topmost layer first, and only
        // touch the selection underneath once nothing is covering it.
        if (sceneBoardOpenRef.current) {
          setIsSceneBoardOpen(false);
          return;
        }
        setSelectedScene(null);
        setSelectedSceneTrack(null);
        setSelectedSceneKeys([]);
        setSelectedTimelineClip(null);
        setSelectedOverlayClipId(null);
        setSelectedAsset(null);
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

  /**
   * Opens the Scene Board modal, fetching its data on first open only.
   *
   * The fetch is cached in `sceneBoardData` for the rest of the session: the board
   * is a review surface people reopen repeatedly, and re-running the full project
   * + acts + scenes query on every open would be pure waste. Approving inside the
   * modal clears the cache (see the modal's `onFinalized`), since that is the one
   * action which invalidates it.
   */
  const openSceneBoard = async () => {
    setIsSceneBoardOpen(true);
    setContextMenu(null);
    if (sceneBoardData || isLoadingSceneBoard) return;

    setIsLoadingSceneBoard(true);
    setSceneBoardError(null);
    const result = await loadProjectForWhiteboard(initialProject.id);
    if (result.success && result.data) {
      setSceneBoardData(result.data);
    } else {
      setSceneBoardError(result.error || "Couldn't load the Scene Board.");
    }
    setIsLoadingSceneBoard(false);
  };

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
    } else if (contextMenu.type === 'overlay') {
      handleDeleteOverlayClip(contextMenu.id);
    } else if (contextMenu.type === 'narration') {
      // Same effect as the bar's own trash button — local only, matching the
      // existing behavior rather than newly introducing a persisted delete here.
      setMasterAudioUrl(null);
    }
    setContextMenu(null);
  };

  const contentDuration = scenes.reduce((acc, scene) => acc + getSceneDuration(scene), 0);
  const clipsMaxTime = timelineClips.length > 0 ? Math.max(...timelineClips.map(c => c.startTime + c.duration)) : 0;

  // The visual width of the timeline ruler (includes 15s buffer padding)
  const timelineDuration = Math.max(60, contentDuration + 15, clipsMaxTime + 15);

  // Where playback should actually stop — the true end of content (V1's scenes, A1's
  // narration, or any dragged clip on either track, whichever runs longest), with NONE
  // of the ruler's 15s browsing buffer or 60s floor. Without this, Play kept running
  // the cursor to the end of that padded/floored width, well past a short video's real
  // last frame.
  const playbackEndDuration = Math.max(contentDuration, masterAudioDuration || 0, actNarrationDuration, clipsMaxTime);

  // Keeps the ref current for every OTHER way cursorPosition changes (click-to-seek,
  // drag, reset-on-drag-start) so the playback loop below always resumes from the
  // real position instead of a stale one captured when it last ran.
  useEffect(() => {
    cursorPositionRef.current = cursorPosition;
  }, [cursorPosition]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      return;
    }

    lastTimeRef.current = performance.now();
    const maxPos = playbackEndDuration * scale;

    const animate = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const newPos = cursorPositionRef.current + delta * scale;

      if (newPos >= maxPos) {
        // Stop exactly at the end of the timeline width, and — critically — do not
        // schedule another frame. The old version scheduled unconditionally here, so
        // once `prev` was clamped to `maxPos`, every subsequent frame recomputed the
        // same clamped value and rescheduled again, spinning until React's `isPlaying`
        // update was processed and the effect below could finally cancel it.
        cursorPositionRef.current = maxPos;
        setCursorPosition(maxPos);
        setIsPlaying(false);
        return;
      }

      cursorPositionRef.current = newPos;
      setCursorPosition(newPos);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, scale, playbackEndDuration]);

  // Synchronized Playback Logic
  const currentTime = cursorPosition / scale;

  useEffect(() => {
    // Isolated preview renders a one-scene composition that starts at frame 0, so
    // every absolute-timeline seek below would be meaningless here — and, because
    // this effect runs on each cursor change, would drag the looping scene back to
    // the wrong frame continuously. The native elements carry narration for the whole
    // timeline, which has no position inside a single looping scene either, so pause
    // them rather than leaving them running untracked behind the isolated view.
    if (isolatedSceneId) {
      Object.values(mediaRefs.current).forEach(media => {
        if (media && !media.paused) media.pause();
      });
      return;
    }

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
  }, [cursorPosition, isPlaying, scale, trackStates, scenes, timelineClips, selectedAsset, exportQuality, isolatedSceneId]);

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

  // Measures the video's real letterboxed rect inside the Player container —
  // see `playerStageRef` above for why the container rect alone is wrong.
  // Re-runs on container resize AND on an aspect-ratio change, since either
  // moves where the black bars fall.
  useLayoutEffect(() => {
    const element = playerStageRef.current;
    if (!element) return;

    const measure = () => {
      const { width: boxWidth, height: boxHeight } = element.getBoundingClientRect();
      if (boxWidth === 0 || boxHeight === 0) return;

      const compositionAspect = remotionDimensions.width / remotionDimensions.height;
      const boxAspect = boxWidth / boxHeight;

      // Box wider than the composition → pillarboxed, so height fills.
      // Otherwise letterboxed, so width fills.
      const videoWidth = boxAspect > compositionAspect ? boxHeight * compositionAspect : boxWidth;
      const videoHeight = boxAspect > compositionAspect ? boxHeight : boxWidth / compositionAspect;

      setPlayerStageRect({
        left: (boxWidth - videoWidth) / 2,
        top: (boxHeight - videoHeight) / 2,
        width: videoWidth,
        height: videoHeight,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [remotionDimensions.width, remotionDimensions.height]);

  const remotionScenes: CompositionScene[] = useMemo(() =>
    scenes.map(s => {
      // An unapplied pick stands in for this scene's media everywhere it's
      // previewed — including the main player — but only until Apply/navigation
      // resolves it; the underlying scene data is untouched until then.
      const pendingHere = pendingPickFor(s.id);
      return {
      id: s.id,
      mediaUrl: pendingHere ? pendingHere.mediaUrl : (s.custom_media_url || ''),
      mediaType: (pendingHere ? pendingHere.type : (s.custom_media_type || 'image')) as 'video' | 'image',
      durationInSeconds: s.video_duration || 5,
      trimStartInSeconds: s.trim_start || 0,
      overlay: s.overlay_text && s.overlay_preset !== 'none' ? {
        text: s.overlay_text,
        preset: (s.overlay_preset || 'none') as OverlayPreset,
        color: s.overlay_color || '#FFFFFF',
      } : undefined,
      // Passed through UNCLAMPED. `layoutScenes` clamps against neighbour durations
      // at render time, because the legal maximum changes whenever an adjacent scene
      // is resized — a value clamped here would silently go stale.
      transition: s.transition_type && s.transition_type !== 'none' ? {
        type: s.transition_type as TransitionType,
        durationInSeconds:
          typeof s.transition_duration === 'number' ? s.transition_duration : 0.5,
      } : undefined,
      // Passed through regardless of media type; the renderer ignores it for video.
      kenBurnsEnabled: Boolean(s.ken_burns_enabled),
      };
    }),
    [scenes, pendingStockPick, pendingProjectPick]
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

  // Render payload for the OV track. Straight camelCase mapping — an overlay
  // clip needs no URL resolution the way audio clips do, since it has no media
  // behind it, so there is nothing here that can be "unexportable".
  const remotionOverlayClips: OverlayClipData[] = useMemo(
    () => overlayClips.map(clip => ({
      id: clip.id,
      kind: clip.kind,
      text: clip.text,
      kickerText: clip.kickerText,
      preset: clip.preset,
      color: clip.color,
      fontSize: clip.fontSize,
      xPercent: clip.xPercent,
      yPercent: clip.yPercent,
      dimBackground: clip.dimBackground,
      startInSeconds: clip.startTime,
      durationInSeconds: clip.duration,
      templateData: clip.templateData,
    })),
    [overlayClips]
  );

  // Which OV lane each clip sits in, so overlapping clips never render stacked
  // on top of each other in the timeline. Derived, never stored.
  const { laneByClipId: overlayLaneByClipId, laneCount: overlayLaneCount } = useMemo(
    () => packOverlayLanes(overlayClips),
    [overlayClips]
  );

  const selectedOverlayClip = useMemo(
    () => overlayClips.find(c => c.id === selectedOverlayClipId) ?? null,
    [overlayClips, selectedOverlayClipId]
  );

  // Typed reads of the selected clip's template_data, kept here rather than
  // inline in the JSX below so the properties panel doesn't repeat the same
  // `as ChecklistCardData | undefined` cast at every field.
  const selectedChecklistBullets = useMemo(
    () => (selectedOverlayClip?.kind === 'checklist-card'
      ? ((selectedOverlayClip.templateData as ChecklistCardData)?.bullets ?? [])
      : []),
    [selectedOverlayClip]
  );
  const selectedChecklistTextColor = useMemo(
    () => (selectedOverlayClip?.kind === 'checklist-card'
      ? ((selectedOverlayClip.templateData as ChecklistCardData)?.textColor ?? '#FFFFFF')
      : '#FFFFFF'),
    [selectedOverlayClip]
  );
  const selectedChecklistScale = useMemo(
    () => (selectedOverlayClip?.kind === 'checklist-card'
      ? ((selectedOverlayClip.templateData as ChecklistCardData)?.scale ?? 1)
      : 1),
    [selectedOverlayClip]
  );
  const selectedTitleCutoutData = useMemo(
    () => (selectedOverlayClip?.kind === 'title-cutout-card'
      ? ((selectedOverlayClip.templateData as TitleCutoutCardData) ?? {})
      : {}),
    [selectedOverlayClip]
  );
  const selectedDimScrimData = useMemo(
    () => (selectedOverlayClip?.kind === 'dim-scrim'
      ? ((selectedOverlayClip.templateData as DimScrimData) ?? {})
      : {}),
    [selectedOverlayClip]
  );
  const selectedParticleData = useMemo(
    () => (selectedOverlayClip?.kind === 'particles'
      ? ((selectedOverlayClip.templateData as ParticleFieldData) ?? {})
      : {}),
    [selectedOverlayClip]
  );
  const selectedLightBeamData = useMemo(
    () => (selectedOverlayClip?.kind === 'light-beam'
      ? ((selectedOverlayClip.templateData as LightBeamData) ?? {})
      : {}),
    [selectedOverlayClip]
  );
  const selectedFilmDamageData = useMemo(
    () => (selectedOverlayClip?.kind === 'film-damage'
      ? ((selectedOverlayClip.templateData as FilmDamageData) ?? {})
      : {}),
    [selectedOverlayClip]
  );
  const selectedLightSweepData = useMemo(
    () => (selectedOverlayClip?.kind === 'light-sweep'
      ? ((selectedOverlayClip.templateData as LightSweepData) ?? {})
      : {}),
    [selectedOverlayClip]
  );

  const remotionTotalDurationInFrames = useMemo(() => {
    // Shares `layoutScenes` with the composition rather than summing seconds here.
    // The old local sum rounded once at the end while the composition rounds each
    // scene, so the two could disagree by up to N/2 frames across N scenes — the
    // Player's reported length never quite matched the composition's real last frame.
    // Transitions do not affect this total by design.
    const { totalDurationInFrames: scenesFrames } = layoutScenes(remotionScenes, remotionFps);

    // Clips can extend past the last scene; without them in this max the composition
    // would be cut short and the tail of a music bed would be truncated.
    const clipsEnd = remotionAudioClips.reduce(
      (acc, c) => Math.max(acc, c.startInSeconds + c.durationInSeconds),
      0
    );
    const trailingAudioFrames = Math.round(
      Math.max(masterAudioDuration || 0, actNarrationDuration, clipsEnd) * remotionFps
    );

    // An overlay clip placed past the last scene would otherwise be cut off by
    // the composition ending early — same reasoning as the audio clips above.
    const overlaysEnd = remotionOverlayClips.reduce(
      (acc, c) => Math.max(acc, c.startInSeconds + c.durationInSeconds),
      0
    );

    return Math.max(1, scenesFrames, trailingAudioFrames, Math.round(overlaysEnd * remotionFps));
  }, [remotionScenes, masterAudioDuration, actNarrationDuration, remotionFps, remotionAudioClips, remotionOverlayClips]);

  // Long-form narration rides the existing positioned-clip path rather than the single
  // `audioUrl` track: each act needs its own start offset, which `audioUrl` cannot
  // express (it is documented as "always starts at frame 0"). No stitching is needed —
  // VideoComposition already wraps every clip in its own <Sequence>.
  const actNarrationClips: CompositionAudioClip[] = useMemo(() => {
    const track = trackStates.A1;
    if (track?.muted || track?.volume === 0) return [];

    return actNarrations
      .filter(act => act.audioUrl && act.durationSeconds > 0)
      .map(act => ({
        id: `act-narration-${act.actNumber}`,
        src: act.audioUrl,
        startInSeconds: act.startSeconds,
        durationInSeconds: act.durationSeconds,
        trimStartInSeconds: 0,
        volume: track?.volume ?? 1,
      }));
  }, [actNarrations, trackStates.A1]);

  const remotionInputProps: VideoCompositionProps = useMemo(() => ({
    scenes: remotionScenes,
    // Deliberately dropped when act narration exists: populating both would play the
    // narration twice, which is the exact hazard CompositionAudioClip warns about.
    audioUrl: hasActNarration ? undefined : (masterAudioUrl || undefined),
    audioClips: [...actNarrationClips, ...remotionAudioClips],
    overlayClips: remotionOverlayClips,
    captionWords,
    showCaptions: captionsEnabled,
    fps: remotionFps,
    width: remotionDimensions.width,
    height: remotionDimensions.height,
    durationInFrames: remotionTotalDurationInFrames,
  }), [remotionScenes, masterAudioUrl, hasActNarration, actNarrationClips, remotionAudioClips, remotionOverlayClips, captionWords, captionsEnabled, remotionFps, remotionDimensions.width, remotionDimensions.height, remotionTotalDurationInFrames]);

  // Resolved from `scenes` rather than captured at toggle time, so edits to the
  // isolated scene (a duration change, a regenerated visual) show up live.
  const isolatedScene = useMemo(
    () => (isolatedSceneId ? remotionScenes.find(s => s.id === isolatedSceneId) ?? null : null),
    [isolatedSceneId, remotionScenes]
  );

  const isolatedDurationInFrames = useMemo(
    () => (isolatedScene ? Math.max(1, Math.round(isolatedScene.durationInSeconds * remotionFps)) : 1),
    [isolatedScene, remotionFps]
  );

  // The preview Player deliberately gets NO narration track and NO A1/A2 clips:
  // hidden native <audio> elements are the single source of both while editing, and
  // feeding the same files to the Player as well makes each play twice, out of sync.
  // Dropping only the audio fields lets the Player stay unmuted so V1 scene videos
  // keep their own soundtracks — which is otherwise silenced entirely, since the
  // per-scene <audio> fallback below only renders when there's no master narration.
  // The render payload keeps both; the editor is the only place they'd collide.
  const remotionPreviewProps: VideoCompositionProps = useMemo(() => {
    const base = { ...remotionInputProps, audioUrl: undefined, audioClips: undefined };
    if (!isolatedScene) return base;

    // A one-scene array puts that scene at frame 0, so the Player needs no knowledge
    // of where the scene sits on the real timeline — and `trimStartInSeconds` still
    // rides along on the scene itself, so the correct part of the source still plays.
    //
    // Overlay clips are dropped in this mode rather than re-based: their times are
    // absolute to the real timeline, so against a composition that now starts at the
    // isolated scene they would appear at meaningless moments (or not at all). The
    // isolated preview is for inspecting one scene's own visual, not the OV track.
    return {
      ...base,
      scenes: [isolatedScene],
      overlayClips: undefined,
      durationInFrames: isolatedDurationInFrames,
    };
  }, [remotionInputProps, isolatedScene, isolatedDurationInFrames]);

  // The sync effect bails out entirely in isolation mode, so nothing else would ever
  // start or stop the Player — drive it directly on the mode change instead.
  useEffect(() => {
    const player = remotionPlayerRef.current;
    if (!player) return;

    if (isolatedSceneId) {
      // Stop the timeline's own playhead loop; it has no meaning while a single
      // scene loops on its own clock.
      setIsPlaying(false);
      player.seekTo(0);
      player.play();
    } else {
      player.pause();
    }
  }, [isolatedSceneId]);

  // Deleting the isolated scene would otherwise strand the editor showing an empty
  // composition, with the only way out being a menu on a block that no longer exists.
  useEffect(() => {
    if (isolatedSceneId && !scenes.some(s => s.id === isolatedSceneId)) {
      setIsolatedSceneId(null);
    }
  }, [isolatedSceneId, scenes]);

  const statusChip = {
    exported: { label: 'Exported', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
    rendering: { label: 'Rendering', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Loader2 size={11} className="animate-spin" /> },
    failed: { label: 'Render failed', cls: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={11} /> },
    pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: <Clock size={11} /> },
    drafting: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Film size={11} /> },
    // Long-form audio-first phases. `narrated` means scenes and per-Act narration
    // exist but the visual pass has deliberately not run yet.
    narrated: { label: 'Review audio', cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: <Mic size={11} /> },
    approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
  }[projectStatus] ?? { label: 'Draft', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Film size={11} /> };

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      {/* Editor header. Lives here rather than in the server page so its actions can
          reach real editor state — that separation is why the old buttons were dead. */}
      <header className="flex items-center justify-between px-3 h-12 flex-none bg-white border-b border-gray-200 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          {/* Rendered as a non-interactive span mid-render rather than relying on the
              modal's coverage alone — defense in depth, so the header stays honest
              even if the overlay's stacking were ever imperfect. */}
          {isRendering ? (
            <span
              className="p-1.5 rounded-md text-gray-300 cursor-not-allowed shrink-0"
              title="Can't leave while exporting"
            >
              <ArrowLeft size={16} />
            </span>
          ) : (
            <Link
              href={`/workspaces/${workspaceId}`}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
              title="Back to workspace"
            >
              <ArrowLeft size={16} />
            </Link>
          )}
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
          {/* The Whiteboard nav link that used to sit here is gone — the Scene Board
              now opens as a modal over the editor, summoned from the A1 right-click
              menu, so reviewing the script no longer costs a page navigation. */}
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

      {/* Phase banner. V1 blocks exist and are correctly sized from the narration
          timings, but they carry no generated visual yet — that pass is withheld until
          the narration is approved. Saying so explicitly beats leaving the user to
          wonder why the video track looks empty. */}
      {hasActNarration && projectStatus === 'narrated' && (
        <div className="flex items-center gap-2 px-3 py-2 flex-none bg-purple-50 border-b border-purple-200">
          <Mic size={13} className="text-purple-600 flex-none" />
          <span className="text-[11px] font-bold text-purple-800">Audio review</span>
          <span className="text-[11px] text-purple-700/90">
            {actNarrations.length} acts narrated · click any act on A1 to re-record it on its own. Visuals are generated once you approve.
          </span>
        </div>
      )}

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
         {/* Per-Act narration (long-form). One element per act, positioned by the same
             data-start/data-duration contract the sync effect already drives every
             other native element with — no new playback plumbing needed. */}
         {actNarrations.map(act => (
           <audio
             key={`act-narration-${act.actNumber}`}
             src={act.audioUrl}
             preload="auto"
             ref={el => { mediaRefs.current[`act-narration-${act.actNumber}`] = el; }}
             data-start={act.startSeconds}
             data-duration={act.durationSeconds || 9999}
             data-track="A1"
             muted={trackStates.A1.muted}
           />
         ))}
         {/* Per-scene audio clips — used only when no master narration exists */}
         {!masterAudioUrl && !hasActNarration && scenes.map((scene, idx) => scene.audio_url && (
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

          {/* Auto-Captions — a whole-video setting, so it sits outside the tabs rather
              than inside Scene Info, which only renders when a scene is selected.
              Disabled until narration exists: the word timings come from the Deepgram
              pass inside generateFullNarration, and a toggle that flips but changes
              nothing would be worse than one that explains itself. */}
          <div className="px-3 py-2.5 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-1.5 rounded-md shrink-0 ${captionWords.length > 0 ? 'bg-purple-50' : 'bg-gray-100'}`}>
                  <Type size={14} className={captionWords.length > 0 ? 'text-purple-600' : 'text-gray-400'} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 leading-tight">Auto-Captions</p>
                  <p className="text-[10px] text-gray-500 leading-tight truncate">
                    {captionWords.length > 0
                      ? `${captionWords.length} words timed to narration`
                      : 'Generate narration to enable'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={captionsEnabled}
                disabled={captionWords.length === 0}
                onClick={async () => {
                  const next = !captionsEnabled;
                  setCaptionsEnabled(next);
                  const res = await updateProjectCaptionsEnabled(initialProject.id, next);
                  if (!res.success) {
                    // Revert rather than leave the editor showing captions that the
                    // next render would not include.
                    setCaptionsEnabled(!next);
                    setPersistenceWarning(
                      `Couldn't save the captions setting (${res.error}). Run db/add-caption-columns.sql if you haven't yet.`
                    );
                  }
                }}
                className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  captionsEnabled ? 'bg-purple-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    captionsEnabled ? 'translate-x-[21px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
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
                {selectedOverlayClip ? (
                  /* ── Overlay clip properties ──
                     Takes priority over the scene/audio-clip panels below: an
                     overlay clip is its own thing on its own track, so while one
                     is selected this panel is what the right-hand column shows. */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-fuchsia-100 text-fuchsia-700 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                          {selectedOverlayClip.kind === 'checklist-card' ? (
                            <CheckCircle2 size={18} />
                          ) : selectedOverlayClip.kind === 'title-cutout-card' ? (
                            <ImageIcon size={18} />
                          ) : selectedOverlayClip.kind === 'dim-scrim' ? (
                            <Contrast size={18} />
                          ) : selectedOverlayClip.kind === 'particles' ? (
                            <Sparkles size={18} />
                          ) : selectedOverlayClip.kind === 'light-beam' ? (
                            <Sunrise size={18} />
                          ) : selectedOverlayClip.kind === 'light-sweep' ? (
                            <ArrowRightLeft size={18} />
                          ) : selectedOverlayClip.kind === 'film-damage' ? (
                            <Film size={18} />
                          ) : (
                            <Type size={18} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm">
                            {selectedOverlayClip.kind === 'checklist-card'
                              ? 'Checklist Card'
                              : selectedOverlayClip.kind === 'title-cutout-card'
                              ? 'Title + Cutout Card'
                              : selectedOverlayClip.kind === 'dim-scrim'
                              ? 'Dim Scrim'
                              : selectedOverlayClip.kind === 'particles'
                              ? 'Floating Particles'
                              : selectedOverlayClip.kind === 'light-beam'
                              ? 'Light Beam'
                              : selectedOverlayClip.kind === 'light-sweep'
                              ? 'Light Sweep'
                              : selectedOverlayClip.kind === 'film-damage'
                              ? 'Old Film'
                              : 'Text Overlay'}
                          </h3>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {selectedOverlayClip.startTime.toFixed(1)}s · {selectedOverlayClip.duration.toFixed(1)}s long
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteOverlayClip(selectedOverlayClip.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        title="Delete this overlay"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {selectedOverlayClip.kind === 'checklist-card' ? (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Title</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-gray-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 rounded-lg p-2 text-sm text-gray-800 transition-all shadow-sm"
                            value={selectedOverlayClip.text}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'text', e.target.value, 'text', true)}
                            placeholder="e.g. 3 Reasons to Switch"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Accent Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedOverlayClip.color}
                                onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                              />
                              <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-0.5">Header bar &amp; checkmarks</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Text Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedChecklistTextColor}
                                onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { textColor: e.target.value })}
                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                              />
                              <span className="text-[10px] text-gray-500 font-mono">{selectedChecklistTextColor}</span>
                            </div>
                            <p className="text-[9px] text-gray-400 mt-0.5">Title wording</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Title Font Size</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{selectedOverlayClip.fontSize ?? 28}px</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_OVERLAY_FONT_SIZE}
                            max={MAX_OVERLAY_FONT_SIZE}
                            step={2}
                            value={selectedOverlayClip.fontSize ?? 28}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'fontSize', parseInt(e.target.value, 10), 'font_size', true)}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Sizes the title wording only.</p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Card Size</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedChecklistScale * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_OVERLAY_CARD_SCALE}
                            max={MAX_OVERLAY_CARD_SCALE}
                            step={0.05}
                            value={selectedChecklistScale}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { scale: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Scales the whole card. You can also drag the handle on it in the preview above.</p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bullets</label>
                            <button
                              onClick={() => updateOverlayClipTemplateData(selectedOverlayClip.id, { bullets: [...selectedChecklistBullets, 'New point'] })}
                              className="text-[10px] font-bold text-fuchsia-600 hover:text-fuchsia-700 transition-colors"
                            >
                              + Add bullet
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {selectedChecklistBullets.map((bullet, index) => (
                              <div key={index} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={bullet}
                                  onChange={(e) => {
                                    const bullets = [...selectedChecklistBullets];
                                    bullets[index] = e.target.value;
                                    updateOverlayClipTemplateData(selectedOverlayClip.id, { bullets });
                                  }}
                                  className="flex-1 bg-white border border-gray-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 rounded-lg p-1.5 text-xs text-gray-800 transition-all shadow-sm"
                                  placeholder="Bullet text"
                                />
                                <button
                                  onClick={() => updateOverlayClipTemplateData(selectedOverlayClip.id, { bullets: selectedChecklistBullets.filter((_, i) => i !== index) })}
                                  className="text-gray-300 hover:text-red-600 transition-colors shrink-0"
                                  title="Remove bullet"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                            {selectedChecklistBullets.length === 0 && (
                              <p className="text-[10px] text-gray-400 italic">No bullets yet — add one above.</p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : selectedOverlayClip.kind === 'title-cutout-card' ? (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Headline</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-gray-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 rounded-lg p-2 text-sm text-gray-800 transition-all shadow-sm"
                            value={selectedOverlayClip.text}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'text', e.target.value, 'text', true)}
                            placeholder="e.g. The Discovery"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Animation</label>
                            <select
                              value={selectedOverlayClip.preset}
                              onChange={(e: any) => updateOverlayClipField(selectedOverlayClip.id, 'preset', e.target.value, 'preset')}
                              className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                            >
                              {OVERLAY_PRESET_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Text Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedTitleCutoutData.textColor ?? '#FFFFFF'}
                                onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { textColor: e.target.value })}
                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                              />
                              <span className="text-[10px] text-gray-500 font-mono">{selectedTitleCutoutData.textColor ?? '#FFFFFF'}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Fallback Background Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-0.5">Used only when no background image is set below.</p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Headline Font Size</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{selectedOverlayClip.fontSize ?? 64}px</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_OVERLAY_FONT_SIZE}
                            max={MAX_OVERLAY_FONT_SIZE}
                            step={2}
                            value={selectedOverlayClip.fontSize ?? 64}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'fontSize', parseInt(e.target.value, 10), 'font_size', true)}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Sizes the headline wording only.</p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Card Size</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedTitleCutoutData.scale ?? 1) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_OVERLAY_CARD_SCALE}
                            max={MAX_OVERLAY_CARD_SCALE}
                            step={0.05}
                            value={selectedTitleCutoutData.scale ?? 1}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { scale: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Scales the whole card, images included. You can also drag the handle on it in the preview above.</p>
                        </div>

                        <OverlayImagePicker
                          label="Background Image"
                          images={projectImageAssets}
                          selectedUrl={selectedTitleCutoutData.backgroundImageUrl}
                          onSelect={(url) => updateOverlayClipTemplateData(selectedOverlayClip.id, { backgroundImageUrl: url })}
                        />
                        <OverlayImagePicker
                          label="Foreground Cutout"
                          images={projectImageAssets}
                          selectedUrl={selectedTitleCutoutData.foregroundImageUrl}
                          onSelect={(url) => updateOverlayClipTemplateData(selectedOverlayClip.id, { foregroundImageUrl: url })}
                        />
                      </>
                    ) : selectedOverlayClip.kind === 'dim-scrim' ? (
                      <>
                        <p className="text-[10px] text-gray-400 -mt-1">
                          A full-frame dim layer with its own timing — start it before your
                          text arrives, let it linger after, or fade it independently.
                        </p>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Scrim Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Opacity</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedDimScrimData.opacity ?? 0.45) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={selectedDimScrimData.opacity ?? 0.45}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade In</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedDimScrimData.fadeInSeconds ?? 0.3).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedDimScrimData.fadeInSeconds ?? 0.3}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeInSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade Out</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedDimScrimData.fadeOutSeconds ?? 0.3).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedDimScrimData.fadeOutSeconds ?? 0.3}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeOutSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>

                        <p className="text-[10px] text-gray-400">
                          Drag this clip on the OV track (or trim its edges) to control exactly when it starts and ends relative to your text.
                        </p>
                      </>
                    ) : selectedOverlayClip.kind === 'particles' ? (
                      <>
                        <p className="text-[10px] text-gray-400 -mt-1">
                          Drifting motes floating over the footage. Runs across scene cuts,
                          so let one clip span several scenes rather than adding one per scene.
                        </p>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Particle Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Count</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{selectedParticleData.count ?? 45}</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={200}
                            step={5}
                            value={selectedParticleData.count ?? 45}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { count: parseInt(e.target.value, 10) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Speed</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedParticleData.speed ?? 1).toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min={0.2}
                              max={3}
                              step={0.1}
                              value={selectedParticleData.speed ?? 1}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { speed: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Size</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedParticleData.sizeScale ?? 1) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0.3}
                              max={2.5}
                              step={0.1}
                              value={selectedParticleData.sizeScale ?? 1}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { sizeScale: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cluster</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">
                              {selectedParticleData.xBias === undefined ? 'Even' : `${Math.round(selectedParticleData.xBias)}%`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={selectedParticleData.xBias ?? 50}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { xBias: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <button
                            type="button"
                            onClick={() => updateOverlayClipTemplateData(selectedOverlayClip.id, { xBias: undefined })}
                            className="text-[9px] text-gray-400 hover:text-fuchsia-600 mt-0.5 transition-colors"
                          >
                            Spread evenly across the frame
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade In</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedParticleData.fadeInSeconds ?? 0.8).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedParticleData.fadeInSeconds ?? 0.8}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeInSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade Out</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedParticleData.fadeOutSeconds ?? 0.8).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedParticleData.fadeOutSeconds ?? 0.8}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeOutSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>
                      </>
                    ) : selectedOverlayClip.kind === 'light-beam' ? (
                      <>
                        <p className="text-[10px] text-gray-400 -mt-1">
                          A soft shaft of light. It only ever adds light — pair it with a Dim
                          Scrim clip underneath when the rest of the frame should fall off too.
                        </p>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Beam Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Position</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedLightBeamData.xPercent ?? 50)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={selectedLightBeamData.xPercent ?? 50}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { xPercent: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            The beam can&apos;t be blocked by anything in the footage, so it looks best
                            placed away from your subject rather than across them.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Width</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedLightBeamData.width ?? 14)}%</span>
                            </div>
                            <input
                              type="range"
                              min={2}
                              max={40}
                              step={1}
                              value={selectedLightBeamData.width ?? 14}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { width: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Intensity</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedLightBeamData.intensity ?? 0.75) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={selectedLightBeamData.intensity ?? 0.75}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { intensity: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade In</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedLightBeamData.fadeInSeconds ?? 0.6).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedLightBeamData.fadeInSeconds ?? 0.6}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeInSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade Out</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedLightBeamData.fadeOutSeconds ?? 0.6).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedLightBeamData.fadeOutSeconds ?? 0.6}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeOutSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>
                      </>
                    ) : selectedOverlayClip.kind === 'light-sweep' ? (
                      <>
                        <p className="text-[10px] text-gray-400 -mt-1">
                          A band of light raking across the frame, repeating on its own
                          cycle. Unlike a Light Beam it doesn&apos;t stay in one place — it
                          crosses edge to edge.
                        </p>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Sweep Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pass Every</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedLightSweepData.cycleSeconds ?? 4).toFixed(1)}s</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={12}
                            step={0.5}
                            value={selectedLightSweepData.cycleSeconds ?? 4}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { cycleSeconds: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            Set this to the clip&apos;s own length for a single pass instead of a repeat.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Width</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedLightSweepData.width ?? 12)}%</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={25}
                              step={0.5}
                              value={selectedLightSweepData.width ?? 5}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { width: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Intensity</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedLightSweepData.intensity ?? 0.6) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={selectedLightSweepData.intensity ?? 0.6}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { intensity: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lean</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedLightSweepData.angle ?? 100)}&deg;</span>
                          </div>
                          <input
                            type="range"
                            min={70}
                            max={110}
                            step={1}
                            value={selectedLightSweepData.angle ?? 100}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { angle: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">90&deg; is perfectly upright; either side of it tilts the band.</p>
                        </div>

                        <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg shadow-sm cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLightSweepData.reverse)}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { reverse: e.target.checked })}
                            className="accent-purple-600"
                          />
                          <span className="text-xs font-bold text-gray-700">Sweep right to left</span>
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade In</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedLightSweepData.fadeInSeconds ?? 0.5).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedLightSweepData.fadeInSeconds ?? 0.5}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeInSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade Out</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedLightSweepData.fadeOutSeconds ?? 0.5).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedLightSweepData.fadeOutSeconds ?? 0.5}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeOutSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>
                      </>
                    ) : selectedOverlayClip.kind === 'film-damage' ? (
                      <>
                        <p className="text-[10px] text-gray-400 -mt-1">
                          Old-film print wear: drifting scratch lines and emulsion grain.
                          This is the one overlay that sits <em>above</em> your text — damage
                          is on the film, so captions get scratched too.
                        </p>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Grain</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedFilmDamageData.grainAmount ?? 0.35) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={selectedFilmDamageData.grainAmount ?? 0.35}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { grainAmount: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Drop to 0 for scratches with no grain.</p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Grain Fineness</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedFilmDamageData.grainScale ?? 0.8).toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.2}
                            max={1.6}
                            step={0.05}
                            value={selectedFilmDamageData.grainScale ?? 0.8}
                            onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { grainScale: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">Lower is coarser, older stock. Higher is finer, more modern.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Scratches</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round(selectedFilmDamageData.scratchCount ?? 4)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={16}
                              step={1}
                              value={selectedFilmDamageData.scratchCount ?? 4}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { scratchCount: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Brightness</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{Math.round((selectedFilmDamageData.scratchIntensity ?? 0.5) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={selectedFilmDamageData.scratchIntensity ?? 0.5}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { scratchIntensity: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Scratch Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedOverlayClip.color}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                              className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-0.5">Grain stays neutral — this only tints the scratches.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade In</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedFilmDamageData.fadeInSeconds ?? 0.4).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedFilmDamageData.fadeInSeconds ?? 0.4}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeInSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fade Out</label>
                              <span className="text-[10px] font-bold text-gray-500 font-mono">{(selectedFilmDamageData.fadeOutSeconds ?? 0.4).toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={selectedFilmDamageData.fadeOutSeconds ?? 0.4}
                              onChange={(e) => updateOverlayClipTemplateData(selectedOverlayClip.id, { fadeOutSeconds: parseFloat(e.target.value) })}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Text</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-gray-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 rounded-lg p-2 text-sm text-gray-800 transition-all shadow-sm"
                            value={selectedOverlayClip.text}
                            // Debounced: this fires on every keystroke, and an
                            // un-debounced write per character would hammer the DB.
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'text', e.target.value, 'text', true)}
                            placeholder="e.g. The Discovery"
                          />
                        </div>

                        {selectedOverlayClip.preset === 'chapter-card' && (
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Kicker</label>
                            <input
                              type="text"
                              className="w-full bg-white border border-gray-200 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100 rounded-lg p-2 text-sm text-gray-800 transition-all shadow-sm"
                              value={selectedOverlayClip.kickerText || ''}
                              onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'kickerText', e.target.value, 'kicker_text', true)}
                              placeholder="e.g. CHAPTER 02"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Small label that animates in above the headline.</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Animation</label>
                            <select
                              value={selectedOverlayClip.preset}
                              onChange={(e: any) => updateOverlayClipField(selectedOverlayClip.id, 'preset', e.target.value, 'preset')}
                              className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                            >
                              {OVERLAY_PRESET_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedOverlayClip.color}
                                onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'color', e.target.value, 'color')}
                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                              />
                              <span className="text-[10px] text-gray-500 font-mono">{selectedOverlayClip.color}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Font Size</label>
                            <span className="text-[10px] font-bold text-gray-500 font-mono">{selectedOverlayClip.fontSize ?? 64}px</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_OVERLAY_FONT_SIZE}
                            max={MAX_OVERLAY_FONT_SIZE}
                            step={2}
                            value={selectedOverlayClip.fontSize ?? 64}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'fontSize', parseInt(e.target.value, 10), 'font_size', true)}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-600"
                          />
                          <p className="text-[10px] text-fuchsia-600 font-medium mt-1.5">
                            ✨ You can also drag the small handle on the text in the preview above to resize it.
                          </p>
                        </div>
                      </>
                    )}

                    {/* Neither applies to an environmental clip: they all cover the
                        whole frame rather than sitting at a "position", and dimming
                        the footage behind one is either redundant (the scrim IS the
                        dim) or self-defeating (particles and a beam add light; a dim
                        under them cancels out what they just added). The light
                        beam's own position lives in its template_data slider, since
                        it's a gradient-mask offset rather than a placed element. */}
                    {!isEnvironmentalKind(selectedOverlayClip.kind) && (
                      <>
                        <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg shadow-sm cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedOverlayClip.dimBackground}
                            onChange={(e) => updateOverlayClipField(selectedOverlayClip.id, 'dimBackground', e.target.checked, 'dim_background')}
                            className="accent-fuchsia-600"
                          />
                          <span className="text-xs font-bold text-gray-700">Dim background</span>
                        </label>

                        {/* Position — quick presets alongside the drag-on-preview
                            interaction, since "put it at the bottom" is faster to
                            click than to aim. */}
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Position — {Math.round(selectedOverlayClip.xPercent)}% / {Math.round(selectedOverlayClip.yPercent)}%
                          </label>
                          <div className="grid grid-cols-5 gap-1">
                            {POSITION_PRESETS.map(preset => (
                              <button
                                key={preset.label}
                                onClick={() => setOverlayClipPosition(selectedOverlayClip.id, preset.xPercent, preset.yPercent)}
                                className="px-1 py-1.5 rounded-md border border-gray-200 bg-white text-[9px] font-bold text-gray-600 hover:border-fuchsia-300 hover:bg-fuchsia-50/50 transition-colors"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-fuchsia-600 font-medium bg-fuchsia-50 border border-fuchsia-200 rounded-md px-2 py-1 mt-2">
                            ✨ Drag the text directly on the preview above to place it anywhere.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ) : selectedActNumber !== null && actNarrations.some(a => a.actNumber === selectedActNumber) ? (
                  /* Act inspector. An Act is a first-class selectable object here
                     precisely because it is the unit the user edits: re-record it and
                     nothing outside it is re-synthesised, re-transcribed or re-timed. */
                  (() => {
                    const act = actNarrations.find(a => a.actNumber === selectedActNumber)!;
                    const sceneCount = scenes.filter(sc => Number(sc.act_number ?? 1) === act.actNumber).length;
                    const isBusy = regeneratingActNumber === act.actNumber;
                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                          <div className="bg-purple-100 text-purple-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm">
                            <Mic size={18} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 text-sm">Act {act.actNumber} Narration</h3>
                            <p className="text-[11px] text-gray-500">
                              {act.durationSeconds.toFixed(1)}s · {sceneCount} scene{sceneCount === 1 ? '' : 's'} · starts at {act.startSeconds.toFixed(1)}s
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setCursorPosition(act.startSeconds * scale)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:border-purple-300 hover:bg-purple-50/50 transition-colors flex items-center justify-center gap-2"
                        >
                          <SkipBack size={13} /> Jump to this act
                        </button>

                        <div>
                          <button
                            onClick={() => handleRegenerateAct(act.actNumber)}
                            disabled={isBusy}
                            className="w-full px-3 py-2.5 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                          >
                            {isBusy
                              ? <><Loader2 size={13} className="animate-spin" /> Re-recording Act {act.actNumber}…</>
                              : <><Repeat size={13} /> Re-record this act</>}
                          </button>
                          <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                            Re-records <strong>only Act {act.actNumber}</strong> from its current wording. Every other act keeps its exact audio and scene timings — if this act changes length, the later ones simply shift.
                          </p>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-[10px] text-amber-800 leading-relaxed">
                            Edit the wording first in the <strong>Whiteboard</strong>, then come back and re-record. Re-recording reads whatever text is currently saved.
                          </p>
                        </div>
                      </div>
                    );
                  })()
                ) : selectedTimelineClip && (selectedSceneTrack === 'A1' || selectedSceneTrack === 'A2') ? (
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
                   /* Empty state only — the project-level controls that used to live
                      here now render below, outside this branch, so they survive a
                      selection instead of disappearing on the first block click. */
                   <div className="flex flex-col items-center justify-center text-center px-4 py-12 opacity-70">
                     <Layers size={40} className="text-gray-300 mb-4" />
                     <h3 className="text-sm font-semibold text-gray-600 mb-2">No Scene Selected</h3>
                     <p className="text-xs text-gray-500">Click a scene block on the timeline below to view and edit its properties.</p>
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
                     
                      {/* ── Visual Generation Accordion ──
                          flex-1 only while expanded: applied unconditionally, this
                          div would keep claiming the panel's remaining flex space even
                          collapsed to just its header button, leaving a tall blank box
                          above Voiceover/Overlay/Ken Burns/Transition. */}
                     <div ref={visualAccordionRef} className={`border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col ${isVisualExpanded ? 'flex-1' : ''}`}>
                        <button
                          onClick={() => setIsVisualExpanded(prev => !prev)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <ImageIcon size={14} className="text-blue-500" /> Visual Generation
                          </span>
                          {isVisualExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </button>
                        {isVisualExpanded && (() => {
                          // A scene's own mode wins; otherwise it inherits the project
                          // default. Same resolution order the generation handlers use,
                          // so the panel can never show controls for a mode that a
                          // click would not actually run.
                          const sceneMode = selectedScene.generation_mode || globalGenerationMode || 'ai_video';
                          const isAiMode = sceneMode === 'ai_video' || sceneMode === 'ai_image';

                          return (
                          <div className="p-3 bg-white border-t border-gray-100 space-y-3 flex-1 flex flex-col">

                           <div>
                              <label className="block text-[10px] font-bold text-gray-500 mb-1">How this scene is generated</label>
                              <select
                                value={sceneMode}
                                onChange={(e: any) => updateSceneDetails(selectedScene.id, 'generation_mode', e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                              >
                                <option value="ai_video">AI Video (Prompt)</option>
                                <option value="ai_image">AI Image (Prompt)</option>
                                <option value="project_media">Project Media (already uploaded / generated)</option>
                                <option value="stock_media">Stock Media (Pexels / Pixabay)</option>
                                <option value="static_theme">Static / Dark Theme</option>
                                <option value="lip_sync">AI Lip Sync (Avatar)</option>
                              </select>
                           </div>

                           {isAiMode && (
                            <>
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

                           {/* Media type. Generation still overwrites this from the
                               provider's kind — newly generated media genuinely is
                               whatever the model produced. This is here to correct an
                               asset that was mislabeled on the way in (an upload whose
                               type was misdetected), which previously left the scene
                               stuck rendering an <img> for a video or vice versa with
                               no way to fix it. */}
                           <div>
                              <label className="block text-[10px] font-bold text-gray-500 mb-1">Media Type</label>
                              <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-lg">
                                {(['video', 'image'] as const).map((mediaType) => {
                                  const isActive = (selectedScene.custom_media_type || 'video') === mediaType;
                                  return (
                                    <button
                                      key={mediaType}
                                      type="button"
                                      onClick={() => updateSceneDetails(selectedScene.id, 'custom_media_type', mediaType)}
                                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                                        isActive
                                          ? 'bg-white text-gray-900 shadow-sm'
                                          : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                    >
                                      {mediaType === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                                      {mediaType === 'video' ? 'Video' : 'Image'}
                                    </button>
                                  );
                                })}
                              </div>
                           </div>

                           <textarea
                             className="w-full bg-white border border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 rounded-lg p-3 text-sm text-gray-800 transition-all resize-none min-h-[200px] flex-1 shadow-sm"
                             value={selectedScene.final_video_prompt}
                             onChange={(e) => updateSceneDetails(selectedScene.id, 'final_video_prompt', e.target.value)}
                             onBlur={(e) => persistSceneFields(selectedScene.id, { final_video_prompt: e.target.value })}
                             placeholder="Describe the visual scene in detail..."
                           />
                            </>
                           )}

                           {/* ── Project Media picker ──
                               No provider call, no cost, no waiting: the asset already
                               exists, so a click is a field write. That's why there is
                               no "Apply" step and no Render button for this mode —
                               there is nothing to render. */}
                           {sceneMode === 'project_media' && (
                             <div className="space-y-2 flex-1 flex flex-col min-h-0">
                               {projectVisualAssets.length === 0 ? (
                                 <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2 border border-dashed border-gray-200 rounded-lg">
                                   <FolderOpen size={22} className="text-gray-300" />
                                   <p className="text-[11px] font-bold text-gray-600">No media in this project yet</p>
                                   <p className="text-[10px] text-gray-400 leading-relaxed">
                                     Upload files in the Media tab, or generate a visual, and it will show up here for any scene to reuse.
                                   </p>
                                 </div>
                               ) : (
                                 <>
                                   <div className="flex items-center justify-between">
                                     <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                       Pick a visual
                                     </label>
                                     <span className="text-[10px] text-gray-400">{projectVisualAssets.length} available</span>
                                   </div>

                                   <div className="grid grid-cols-3 gap-1.5 overflow-y-auto custom-scrollbar pr-0.5">
                                     {projectVisualAssets.map(asset => {
                                       const stagedHere = pendingProjectPick && pendingProjectPick.sceneId === selectedScene.id
                                         ? pendingProjectPick.asset
                                         : null;
                                       const isStaged = stagedHere?.id === asset.id;
                                       const isCurrent = !stagedHere && selectedScene.custom_media_url === (asset.persistedUrl || asset.url);
                                       // Everything that isn't the staged pick greys out, so the
                                       // one thing Apply would commit is unmistakable.
                                       const isDimmed = Boolean(stagedHere) && !isStaged;
                                       return (
                                         <button
                                           key={asset.id}
                                           type="button"
                                           onClick={() => setPendingProjectPick({ sceneId: selectedScene.id, asset })}
                                           title={`${asset.name} — click to preview on this scene`}
                                           className={`relative aspect-video rounded-md overflow-hidden border-2 bg-gray-100 group transition-all ${
                                             isStaged
                                               ? 'border-blue-500 ring-2 ring-blue-200'
                                               : isCurrent
                                                 ? 'border-emerald-400'
                                                 : 'border-gray-200 hover:border-blue-300'
                                           } ${isDimmed ? 'opacity-40 grayscale hover:opacity-70' : ''}`}
                                         >
                                           {asset.type === 'video' ? (
                                             /* muted+playsInline so the browser will paint a poster frame
                                                without autoplaying a wall of videos in the panel. */
                                             <video src={asset.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                                           ) : (
                                             <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                                           )}

                                           <span className="absolute top-0.5 left-0.5 bg-black/60 text-white rounded px-1 py-0.5 flex items-center">
                                             {asset.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                                           </span>

                                           {isStaged && (
                                             <span className="absolute top-0.5 right-0.5 bg-blue-500 text-white rounded-full p-0.5 flex items-center">
                                               <Check size={8} />
                                             </span>
                                           )}
                                           {/* Distinct from the staged marker on purpose: green means
                                               "already saved on this scene", blue means "about to be". */}
                                           {isCurrent && (
                                             <span className="absolute top-0.5 right-0.5 bg-emerald-500 text-white rounded-full p-0.5 flex items-center" title="Currently used by this scene">
                                               <Check size={8} />
                                             </span>
                                           )}

                                           <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[8px] font-bold truncate px-1 py-0.5 text-left">
                                             {asset.name}
                                           </span>
                                         </button>
                                       );
                                     })}
                                   </div>

                                   {pendingProjectPick && pendingProjectPick.sceneId === selectedScene.id ? (
                                     <div className="space-y-1.5">
                                       <div className="flex gap-1.5">
                                         <button
                                           onClick={() => applyProjectMediaToScene(selectedScene.id, pendingProjectPick.asset)}
                                           className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors"
                                         >
                                           <Check size={12} />
                                           Apply to Scene {selectedScene.sequence_number}
                                         </button>
                                         <button
                                           onClick={() => setPendingProjectPick(null)}
                                           title="Discard this pick"
                                           className="px-2.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-bold rounded-md transition-colors"
                                         >
                                           <X size={12} />
                                         </button>
                                       </div>
                                       <p className="text-[10px] text-amber-600 font-medium text-center">
                                         Previewing only — nothing is saved until you apply.
                                       </p>
                                     </div>
                                   ) : (
                                     <p className="text-[10px] text-gray-400 leading-relaxed">
                                       Click a thumbnail to preview it on this scene, then apply. No generation, no cost. Includes uploads as well as visuals generated for other scenes.
                                     </p>
                                   )}
                                 </>
                               )}
                             </div>
                           )}

                           {sceneMode === 'stock_media' && (
                             <div className="space-y-3">
                               <div className="grid grid-cols-2 gap-2">
                                 <div>
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1">Platform</label>
                                   <select
                                     value={globalStockProvider}
                                     onChange={(e: any) => { setGlobalStockProvider(e.target.value); setStockSearchResults(null); }}
                                     className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                   >
                                     <option value="pexels">Pexels</option>
                                     <option value="pixabay">Pixabay</option>
                                   </select>
                                 </div>
                                 <div>
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1">Media Type</label>
                                   <select
                                     value={globalStockType}
                                     onChange={(e: any) => { setGlobalStockType(e.target.value); setStockSearchResults(null); }}
                                     className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                   >
                                     <option value="video">Video</option>
                                     <option value="image">Image</option>
                                   </select>
                                 </div>
                               </div>

                               <div>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">Search</label>
                                 <div className="flex gap-2">
                                   <input
                                     type="text"
                                     placeholder="Falls back to this scene's AI prompt…"
                                     value={selectedScene.stock_search_query || ''}
                                     onChange={(e: any) => updateSceneDetails(selectedScene.id, 'stock_search_query', e.target.value)}
                                     onKeyDown={(e) => {
                                       if (e.key === 'Enter') {
                                         handleStockSearch(
                                           selectedScene.id,
                                           selectedScene.stock_search_query || selectedScene.final_video_prompt || ''
                                         );
                                       }
                                     }}
                                     className="w-full bg-white border border-gray-200 focus:border-blue-400 rounded-md p-2 text-xs text-gray-800 outline-none shadow-sm"
                                   />
                                   <button
                                     onClick={() => handleStockSearch(
                                       selectedScene.id,
                                       selectedScene.stock_search_query || selectedScene.final_video_prompt || ''
                                     )}
                                     disabled={isSearchingStock}
                                     className="px-3 bg-gray-100 border border-gray-200 rounded-md text-xs font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                   >
                                     {isSearchingStock ? <Loader2 size={12} className="animate-spin" /> : null}
                                     Search
                                   </button>
                                 </div>
                               </div>

                               {stockSearchResults && stockSearchResults.sceneId === selectedScene.id && (
                                 stockSearchResults.results.length > 0 ? (
                                   <div className="grid grid-cols-3 gap-2">
                                     {stockSearchResults.results.map((r) => {
                                       const isPending = !!pendingStockPick && pendingStockPick.sceneId === selectedScene.id && pendingStockPick.result.id === r.id;
                                       return (
                                         <button
                                           key={r.id}
                                           type="button"
                                           onClick={() => handleSelectStockResult(selectedScene.id, r)}
                                           title="Preview this for the scene"
                                           className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all group ${
                                             isPending ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
                                           }`}
                                         >
                                           {r.thumbnailUrl ? (
                                             <img src={r.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                           ) : (
                                             <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                               <Film size={14} className="text-gray-400" />
                                             </div>
                                           )}
                                           {isPending && (
                                             <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                                               <Check size={10} />
                                             </span>
                                           )}
                                           <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                         </button>
                                       );
                                     })}
                                   </div>
                                 ) : (
                                   <p className="text-[10px] text-gray-500 italic">No results — try a different search term.</p>
                                 )
                               )}

                               {pendingStockPick && pendingStockPick.sceneId === selectedScene.id && (
                                 <button
                                   onClick={() => handleApplyStockResult(selectedScene.id, pendingStockPick.result)}
                                   disabled={isApplyingStock}
                                   className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-md flex items-center justify-center gap-1.5"
                                 >
                                   {isApplyingStock ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                   {isApplyingStock ? 'Saving…' : 'Apply to Scene'}
                                 </button>
                               )}

                               <p className="text-[10px] text-gray-500 italic leading-relaxed">
                                 Free stock media. Click a result to preview it, then Apply to save it to this scene.
                               </p>
                             </div>
                           )}

                           {sceneMode === 'static_theme' && (
                             <p className="text-[10px] text-gray-500 italic leading-relaxed bg-gray-50 border border-gray-200 rounded-md px-2.5 py-2">
                               This scene renders as a solid dark theme — useful for text-only slides. Costs nothing to generate.
                             </p>
                           )}

                           {sceneMode === 'lip_sync' && (
                             <div className="space-y-2">
                               <div>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">Character Image URL</label>
                                 <input
                                   type="text"
                                   placeholder="https://… portrait image or video"
                                   value={selectedScene.lip_sync_character_url || ''}
                                   onChange={(e: any) => updateSceneDetails(selectedScene.id, 'lip_sync_character_url', e.target.value)}
                                   className="w-full bg-white border border-gray-200 rounded-md p-2 text-xs text-gray-800 outline-none shadow-sm"
                                 />
                               </div>
                               <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 leading-relaxed">
                                 No lip-sync provider is wired up yet, so this scene will be skipped by bulk generation.
                                 The plan is bytedance/latentsync via Replicate, driven by this scene&rsquo;s voiceover.
                               </p>
                             </div>
                           )}

                           <div className="flex flex-col gap-3 mt-2">
                              {/* Inline Toggle Switch */}
                              <div className="flex flex-col gap-1 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200/60">
                                <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-600">Apply this setup to all scenes</span>
                                <button
                                  onClick={() => {
                                    const turningOn = generateMode !== 'all';
                                    setGenerateMode(turningOn ? 'all' : 'individual');
                                    // Propagate on the way ON only. Flipping it back off
                                    // must not revert anything — the scenes have been
                                    // reconfigured, and silently undoing that would be a
                                    // worse surprise than leaving it.
                                    if (turningOn) applyVisualSetupToAllScenes(selectedScene);
                                  }}
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
                                {generateMode === 'all' && (
                                  <p className="text-[10px] text-purple-700 leading-relaxed">
                                    All {scenes.length} scenes now use <strong>{sceneMode.replace('_', ' ')}</strong>
                                    {isAiMode ? <> · <strong>{selectedScene.ai_model || selectedAiModel}</strong></> : null}.
                                    Durations and prompts are untouched.
                                  </p>
                                )}
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
                              ) : isAiMode ? (
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
                              ) : null}
                           </div>
                          </div>
                          );
                        })()}
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

                      {/* ── Ken Burns ──
                          A single checkbox rather than an accordion like Overlay and
                          Transition: there is nothing to expand into, the effect has
                          no sub-settings once it's on. Image-only — video scenes carry
                          their own motion, and the renderer ignores the flag for them.
                          Deliberately its own control and not a "Transition In" option:
                          transition is movement BETWEEN scenes, this is movement WITHIN
                          one, and a scene can have both at once. */}
                     {selectedScene.custom_media_type !== 'video' && (
                       <div className="relative">
                         <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg shadow-sm bg-gray-50 hover:bg-gray-100 transition-colors">
                           <label className="flex items-center gap-2 flex-1 cursor-pointer">
                             <input
                               type="checkbox"
                               checked={Boolean(selectedScene.ken_burns_enabled)}
                               onChange={(e) => updateSceneDetails(selectedScene.id, 'ken_burns_enabled', e.target.checked)}
                               className="accent-purple-600"
                             />
                             <span className="text-xs font-bold text-gray-700">Ken Burns pan &amp; zoom</span>
                           </label>
                           {/* Bulk sibling of the checkbox above: that one edits THIS
                               scene, this menu applies the setting to every image scene
                               in the project in a single action. */}
                           <button
                             type="button"
                             onClick={() => setShowKenBurnsMenu(prev => !prev)}
                             className="flex items-center gap-0.5 text-[10px] font-bold text-gray-400 hover:text-purple-600 transition-colors shrink-0"
                             title="Apply to all image scenes"
                           >
                             Bulk <ChevronDown size={12} />
                           </button>
                         </div>

                         {showKenBurnsMenu && (
                           <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
                             <button
                               onClick={() => applyKenBurnsToAllImageScenes(true)}
                               className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                             >
                               Enable for all image scenes
                             </button>
                             <button
                               onClick={() => applyKenBurnsToAllImageScenes(false)}
                               className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                             >
                               Disable for all image scenes
                             </button>
                           </div>
                         )}
                       </div>
                     )}

                      {/* ── Transition Accordion ──
                          The transition belongs to the scene it plays INTO, so the
                          first scene has nothing to configure. */}
                     {(() => {
                       const sceneIndex = scenes.findIndex(s => s.id === selectedScene.id);
                       const isFirstScene = sceneIndex <= 0;
                       const transitionType = (selectedScene.transition_type || 'none') as TransitionType;
                       const maxSeconds = maxTransitionSeconds(remotionScenes, sceneIndex, remotionFps);
                       const currentSeconds =
                         typeof selectedScene.transition_duration === 'number'
                           ? selectedScene.transition_duration
                           : 0.5;

                       return (
                         <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                           <button
                             onClick={() => setIsTransitionExpanded(prev => !prev)}
                             className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                           >
                             <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                               <Layers size={14} className="text-purple-500" /> Transition In
                             </span>
                             {isTransitionExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                           </button>
                           {isTransitionExpanded && (
                             <div className="p-3 bg-white border-t border-gray-100 space-y-2.5">
                               {/* Drag source, independent of `isFirstScene` below on
                                   purpose: these cards target whichever scene block they
                                   land on, not necessarily this selected one, so they
                                   stay usable even while scene 1 (which can't itself take
                                   a transition) is selected. A click still applies to
                                   THIS scene as a one-step alternative to the dropdown —
                                   same target and same first-scene rule as it has. */}
                               <div>
                                 <label className="block text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1.5">
                                   Visual Transition
                                 </label>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">
                                   Drag onto any scene, or click to apply to this one
                                 </label>
                                 <div className="grid grid-cols-3 gap-1.5">
                                   {TRANSITION_CARDS.map((card) => {
                                     const isActive = !isFirstScene && transitionType === card.type;
                                     return (
                                       <button
                                         key={card.type}
                                         type="button"
                                         draggable
                                         onDragStart={(e) => {
                                           e.dataTransfer.setData(
                                             'text/plain',
                                             JSON.stringify({ type: 'transition', transitionType: card.type })
                                           );
                                           // A second, dedicated MIME type purely as a marker: dataTransfer
                                           // payloads set via 'text/plain' can't be READ during dragover
                                           // (browsers only expose that during drop, for security), but
                                           // `.types` — which type names are present — IS readable during
                                           // dragover. The V1 scene blocks check for this type name to know
                                           // "a transition card is over me" and light up their drop-target
                                           // ring, without needing to decode the JSON early.
                                           e.dataTransfer.setData('application/x-transition-card', card.type);
                                           e.dataTransfer.effectAllowed = 'copy';
                                         }}
                                         onDragEnd={() => setTransitionDragOverSceneId(null)}
                                         onClick={() => {
                                           if (isFirstScene) return;
                                           applyTransitionToScene(selectedScene.id, card.type);
                                         }}
                                         title={
                                           isFirstScene
                                             ? 'The first scene has no preceding scene to transition from — drag this onto a later scene instead'
                                             : `Click to apply to Scene ${sceneIndex + 1}, or drag onto any scene on the timeline`
                                         }
                                         className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-md border text-center cursor-grab active:cursor-grabbing transition-colors ${
                                           isActive
                                             ? 'border-purple-400 bg-purple-50 text-purple-700'
                                             : 'border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:bg-purple-50/40'
                                         }`}
                                       >
                                         <card.icon size={16} style={{ animation: card.sampleAnimation }} />
                                         <span className="text-[9px] font-bold leading-tight">{card.label}</span>
                                       </button>
                                     );
                                   })}
                                 </div>
                               </div>

                               {isFirstScene ? (
                                 <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-2 leading-relaxed">
                                   The first scene has no preceding scene to transition from.
                                 </p>
                               ) : (
                                 <>
                                   <div>
                                     <label className="block text-[10px] font-bold text-gray-500 mb-1">Style</label>
                                     <select
                                       value={transitionType}
                                       onChange={(e) => updateSceneDetails(selectedScene.id, 'transition_type', e.target.value)}
                                       className="w-full bg-white border border-gray-200 rounded-md p-1.5 text-xs text-gray-800 outline-none font-medium shadow-sm"
                                     >
                                       <option value="none">Cut (no transition)</option>
                                       <option value="crossfade">Crossfade / Dissolve</option>
                                       <option value="slide">Slide / Push</option>
                                       <option value="zoom">Smooth Zoom</option>
                                       <option value="glitch">Glitch</option>
                                       <option value="light-leak">Wipe / Light Leak</option>
                                     </select>
                                   </div>

                                   {transitionType !== 'none' && (
                                     <div>
                                       <div className="flex items-center justify-between mb-1">
                                         <label className="text-[10px] font-bold text-gray-500">Duration</label>
                                         <span className="text-[10px] font-bold text-purple-600">
                                           {Math.min(currentSeconds, maxSeconds).toFixed(2)}s
                                         </span>
                                       </div>
                                       {/* Max comes from the same clamp the renderer applies, so the
                                           slider can never offer a value that would be silently
                                           reduced at render time. */}
                                       <input
                                         type="range"
                                         min={0.1}
                                         max={Math.max(0.1, maxSeconds)}
                                         step={0.05}
                                         value={Math.min(currentSeconds, Math.max(0.1, maxSeconds))}
                                         onChange={(e) => updateSceneDetails(selectedScene.id, 'transition_duration', Number(e.target.value))}
                                         className="w-full accent-purple-600"
                                       />
                                       <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                                         Capped at half the shorter neighbouring scene ({maxSeconds.toFixed(2)}s here).
                                         Transitions never change total video length.
                                       </p>
                                     </div>
                                   )}
                                 </>
                               )}

                               {/* ── Transition Sound ──
                                   Deliberately separated from Visual Transition above by
                                   its own heading and a divider, not folded into the same
                                   grid — these are a different kind of thing (an audio
                                   stinger on A2, not a per-scene field) with a different
                                   drop target. Drag-only, same as the visual cards' drag
                                   path: there's no "click to apply to this scene" here,
                                   because a transition SOUND isn't scoped to a scene at
                                   all — it belongs to whichever cut you drop it on, which
                                   is why it stays draggable from this panel no matter
                                   which scene (including the first) happens to be
                                   selected. */}
                               <div className="pt-2.5 border-t border-gray-100">
                                 <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">
                                   Transition Sound
                                 </label>
                                 <label className="block text-[10px] font-bold text-gray-500 mb-1">
                                   Drag onto A2, centered on a scene cut. Click to preview.
                                 </label>
                                 <div className="grid grid-cols-3 gap-1.5">
                                   {TRANSITION_MUSIC_PRESETS.map((preset) => (
                                     <button
                                       key={preset.key}
                                       type="button"
                                       draggable
                                       onDragStart={(e) => {
                                         e.dataTransfer.setData(
                                           'text/plain',
                                           JSON.stringify({ type: 'transition-music', presetKey: preset.key })
                                         );
                                         // Marker MIME so A2's onDragOver can tell a music-preset
                                         // drag is in flight without decoding JSON on every event —
                                         // same reasoning as the visual cards' own marker type.
                                         e.dataTransfer.setData('application/x-transition-music', preset.key);
                                         e.dataTransfer.effectAllowed = 'copy';
                                         setIsDraggingMusicPreset(true);
                                       }}
                                       onDragEnd={() => {
                                         setIsDraggingMusicPreset(false);
                                         setMusicDragNearestBoundaryIdx(null);
                                       }}
                                       onClick={() => {
                                         // Preview only — applying happens via drag, since a
                                         // transition sound has no "currently selected scene" to
                                         // apply to on click the way a visual transition does.
                                         new Audio(preset.url).play().catch(() => {});
                                       }}
                                       title={`Preview "${preset.label}", or drag onto A2 to apply it to a scene cut`}
                                       className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-md border border-gray-200 bg-white text-gray-600 text-center cursor-grab active:cursor-grabbing hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                                     >
                                       <Music size={16} />
                                       <span className="text-[9px] font-bold leading-tight">{preset.label}</span>
                                     </button>
                                   ))}
                                 </div>
                               </div>
                             </div>
                           )}
                         </div>
                       );
                     })()}

                   </div>
                )}

                {/* ── Project (whole-video) accordion ──
                    Sibling of the selection branches above, not part of any of
                    them, so summary/voice/narration stay reachable no matter what
                    is selected. mt-auto pins it to the bottom of the panel when a
                    scene's expanded Visual Generation accordion claims flex-1;
                    shrink-0 stops it collapsing when that content is tall. */}
                <div className="mt-auto pt-4 shrink-0">
                  <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <button
                      onClick={() => setIsProjectExpanded(prev => !prev)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                        <Layers size={14} className="text-purple-500" /> Project
                      </span>
                      <span className="flex items-center gap-2">
                        {/* Status stays visible while collapsed — the whole point of
                            the badge is answering "is narration done?" at a glance. */}
                        {masterAudioUrl && !isProjectExpanded && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-none" />
                            <span className="text-[10px] font-bold text-green-700">
                              {masterAudioDuration > 0 ? `${Math.round(masterAudioDuration)}s` : 'Ready'}
                            </span>
                          </span>
                        )}
                        {isProjectExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      </span>
                    </button>

                    {isProjectExpanded && (
                      <div className="p-3 bg-white border-t border-gray-100">
                        <p className="text-sm text-gray-800 font-bold mb-1 line-clamp-2">{initialProject.topic}</p>
                        <p className="text-xs text-gray-500 mb-3 font-medium">{scenes.length} Scenes • {Math.round(contentDuration)} seconds</p>

                        {hasActNarration ? (
                          <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-purple-500 flex-none" />
                              <span className="text-[10px] font-bold text-purple-700 truncate">
                                {actNarrations.length} acts narrated · {Math.round(actNarrationDuration)}s
                              </span>
                            </div>
                            <p className="text-[10px] text-purple-600/80 mt-1 leading-relaxed">
                              Click any act on A1 to re-record it on its own.
                            </p>
                          </div>
                        ) : masterAudioUrl && (
                          <div className="flex items-center gap-2 mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-green-500 flex-none" />
                            <span className="text-[10px] font-bold text-green-700 truncate">
                              Narration ready{masterAudioDuration > 0 ? ` · ${Math.round(masterAudioDuration)}s` : ' · on A1'}
                            </span>
                          </div>
                        )}

                        {/* The approval gate. Until this runs, scenes carry no
                            final_video_prompt — around 2 provider calls per scene are
                            deliberately withheld so that rewriting an act costs only
                            that act's narration. It also runs the Casting Director
                            once across every act, which is the only way one character
                            can look the same in Act 1 and Act 9. */}
                        {hasActNarration && projectStatus === 'narrated' && (
                          <div className="mb-3">
                            <button
                              onClick={handleApproveAndGenerateVisuals}
                              disabled={isApproving}
                              className="w-full py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {isApproving
                                ? <><Loader2 size={16} className="animate-spin" /> Generating visuals…</>
                                : <><CheckCircle2 size={16} /> Approve &amp; generate visuals</>}
                            </button>
                            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                              Locks in the narration and builds a visual prompt for all {scenes.length} scenes, casting characters once across every act so they stay consistent. Takes a while — do this once the audio is right.
                            </p>
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

                        {/* Primary purple only for the first run. Once narration
                            exists this overwrites it and costs another TTS pass, so
                            it drops to a secondary outline rather than staying the
                            loudest thing in the panel. */}
                        {!hasActNarration && (
                        <>
                        <button
                          onClick={handleGenerateFullNarration}
                          disabled={isGeneratingNarration}
                          className={`w-full py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-2 ${
                            masterAudioUrl && !isGeneratingNarration
                              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                        >
                          {isGeneratingNarration ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                          {isGeneratingNarration
                            ? 'Generating Narration…'
                            : masterAudioUrl
                              ? 'Re-generate Narration'
                              : 'Generate Full Narration'}
                        </button>
                        <p className="text-[10px] text-gray-400 text-center">One continuous audio on A1 · align V1 b-roll to match</p>
                        </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Discoverability for the new Escape binding — shown only when
                      there is actually a selection to clear. */}
                  {(selectedScene || selectedTimelineClip || selectedOverlayClip) && (
                    <p className="text-[10px] text-gray-400 text-center mt-2">
                      Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[9px]">Esc</kbd> to deselect
                    </p>
                  )}
                </div>
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
                        <div className="flex flex-col gap-3">
                          <a
                            href={renderOutputPath}
                            download={toExportFileName(initialProject.topic)}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                          >
                            <Download size={18} /> Download Video
                          </a>
                        </div>
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
                  <div className="absolute inset-0" ref={playerStageRef}>
                    {isolatedScene && (
                      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-3 bg-purple-600/95 backdrop-blur-sm text-white rounded-lg px-3 py-2 shadow-lg">
                        <span className="text-[11px] font-bold flex items-center gap-2 min-w-0">
                          <Repeat size={13} className="shrink-0" />
                          <span className="truncate">
                            Previewing scene {scenes.findIndex(s => s.id === isolatedSceneId) + 1} only — looping
                          </span>
                        </span>
                        <button
                          onClick={() => setIsolatedSceneId(null)}
                          className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors shrink-0"
                        >
                          Exit
                        </button>
                      </div>
                    )}
                    <Player
                      ref={remotionPlayerRef}
                      component={VideoComposition}
                      inputProps={remotionPreviewProps}
                      durationInFrames={isolatedScene ? isolatedDurationInFrames : remotionTotalDurationInFrames}
                      compositionWidth={remotionDimensions.width}
                      compositionHeight={remotionDimensions.height}
                      fps={remotionFps}
                      style={{ width: '100%', height: '100%' }}
                      controls={false}
                      autoPlay={false}
                      // Looping is what makes isolation useful for inspecting a single
                      // scene; the full timeline must not loop or it would fight the
                      // playhead's own end-of-timeline stop.
                      loop={Boolean(isolatedScene)}
                      // Remotion's Player has no `muted` prop — only `initiallyMuted`,
                      // plus imperative mute()/unmute() applied in the sync effect.
                      // The Player supplies V1 scene-video audio only (narration is
                      // stripped from remotionPreviewProps), so the V1 mute button drives it.
                      initiallyMuted={trackStates.V1.muted}
                    />

                    {/* ── Drag-to-position layer ──
                        Only mounted while an overlay clip is selected, and sized
                        to the VIDEO's letterboxed rect rather than this
                        container, so a percentage here means the same thing it
                        means in the render. Deliberately not shown in isolation
                        mode, where overlay clips aren't rendered at all. */}
                    {selectedOverlayClip && !isEnvironmentalKind(selectedOverlayClip.kind) && !isolatedScene && playerStageRect.width > 0 && (
                      <div
                        className="absolute z-20"
                        style={{
                          left: playerStageRect.left,
                          top: playerStageRect.top,
                          width: playerStageRect.width,
                          height: playerStageRect.height,
                          // The layer itself must not swallow clicks meant for the
                          // player; only the handle below is interactive.
                          pointerEvents: 'none',
                        }}
                      >
                        {/* Snap guides, shown only while this overlay is sitting
                            on one — a permanent grid would just be noise. */}
                        {SNAP_TARGETS.includes(Math.round(selectedOverlayClip.xPercent)) && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-gray-300/60"
                            style={{ left: `${selectedOverlayClip.xPercent}%` }}
                          />
                        )}
                        {SNAP_TARGETS.includes(Math.round(selectedOverlayClip.yPercent)) && (
                          <div
                            className="absolute left-0 right-0 h-px bg-gray-300/60"
                            style={{ top: `${selectedOverlayClip.yPercent}%` }}
                          />
                        )}

                        {/* Invisible drag-to-reposition region, sized to roughly cover
                            the actual rendered content (not a fixed dot at the exact
                            centre point) so grabbing anywhere near the visible text/card
                            works, not just one precise spot. No visible fill/border at
                            rest — now that selecting a clip seeks the playhead into its
                            own time range (see seekIntoOverlayClip), the real render is
                            already on screen right here, so drawing a badge on top of it
                            would just duplicate what's already visible. The resize handle
                            only appears on hover, at the estimated box's corner. */}
                        {(() => {
                          const fontSize = selectedOverlayClip.fontSize ?? 64;
                          const cardScale = (selectedOverlayClip.templateData as { scale?: number } | undefined)?.scale ?? 1;
                          let boxWidth: number;
                          let boxHeight: number;
                          if (selectedOverlayClip.kind === 'checklist-card') {
                            const bulletCount = ((selectedOverlayClip.templateData as ChecklistCardData)?.bullets ?? []).length;
                            boxWidth = 420 * cardScale;
                            boxHeight = (60 + bulletCount * 36 + 32) * cardScale;
                          } else if (selectedOverlayClip.kind === 'title-cutout-card') {
                            boxWidth = 400 * cardScale;
                            boxHeight = 500 * cardScale;
                          } else {
                            boxWidth = Math.max(80, selectedOverlayClip.text.length * fontSize * 0.55);
                            boxHeight = fontSize * 1.4;
                          }
                          // These widths/heights are real-composition pixels (e.g. against a
                          // 1080-wide export); scale them down to the preview's on-screen size.
                          const scaleX = remotionDimensions.width > 0 ? playerStageRect.width / remotionDimensions.width : 1;
                          const scaleY = remotionDimensions.height > 0 ? playerStageRect.height / remotionDimensions.height : 1;
                          const widthPx = boxWidth * scaleX;
                          const heightPx = boxHeight * scaleY;

                          return (
                            <div
                              onPointerDown={(e) => handleOverlayPositionDragStart(e, selectedOverlayClip)}
                              className="absolute group cursor-move select-none"
                              style={{
                                left: `${selectedOverlayClip.xPercent}%`,
                                top: `${selectedOverlayClip.yPercent}%`,
                                width: widthPx,
                                height: heightPx,
                                transform: 'translate(-50%, -50%)',
                                pointerEvents: 'auto',
                              }}
                              title="Drag to reposition this overlay"
                            >
                              {/* Resize handle — drag to grow/shrink this overlay directly on
                                  the preview, instead of only via the properties panel slider
                                  (font size for plain text, card scale for a graphic card — see
                                  handleOverlayResizeDragStart). Hidden until hover so it isn't
                                  visual noise at rest. Its own onPointerDown stops propagation
                                  (first line of handleOverlayResizeDragStart) so it doesn't also
                                  start the parent region's move-drag. */}
                              <div
                                onPointerDown={(e) => handleOverlayResizeDragStart(e, selectedOverlayClip)}
                                className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full bg-white border-2 border-gray-500 shadow-sm cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Drag to resize"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
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
                       {pendingPickFor(selectedScene.id) ? (
                         pendingPickFor(selectedScene.id)!.type === 'video' ? (
                           <video src={pendingPickFor(selectedScene.id)!.mediaUrl} className="w-full h-full object-contain" muted preload="metadata" />
                         ) : (
                           <img src={pendingPickFor(selectedScene.id)!.mediaUrl} className="w-full h-full object-contain" alt="Pending scene pick" />
                         )
                       ) : selectedScene.custom_media_url ? (
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
                       {pendingPickFor(selectedScene.id) && (
                         <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-amber-500/90 backdrop-blur-sm rounded text-[9px] text-white font-bold">
                           Preview — not saved yet
                         </div>
                       )}
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

              {/* OV-to-V1 alignment guide — CapCut-style: while dragging or
                  trimming an overlay clip, if either of its edges lands within
                  snapping distance of a V1 scene boundary, that edge snaps to
                  it and this line lights up at that exact time, spanning every
                  track so it's obvious the two are lined up. */}
              {overlaySnapGuideTime !== null && (
                <div
                  className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
                  style={{ left: `calc(8rem + ${overlaySnapGuideTime * scale}px)`, transform: 'translateX(-50%)' }}
                >
                  <div className="w-px h-full bg-gray-300/80 shadow-[0_0_6px_rgba(0,0,0,0.15)]"></div>
                </div>
              )}

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

              {/* ── Overlay Track (OV) ──
                  Above V1 because overlays paint on top of everything, matching
                  the V2-above-V1 convention every NLE uses. Unlike V1/A1/A2 this
                  is a track GROUP: it grows extra lanes on its own whenever two
                  clips overlap in time (see packOverlayLanes), so simultaneous
                  overlays never render stacked on one another. */}
              <div className="flex items-stretch group relative">
                 <div className="w-32 shrink-0 sticky left-0 z-[52] bg-white px-5 flex items-center justify-between border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-400">
                    <span
                      className="text-[13px] font-bold text-gray-600 cursor-pointer hover:text-purple-600 transition-colors"
                      title="Text overlay track"
                    >
                      OV
                    </span>
                    <div className="relative">
                      <button
                        ref={addOverlayButtonRef}
                        onClick={() => {
                          if (!showAddOverlayMenu && addOverlayButtonRef.current) {
                            const rect = addOverlayButtonRef.current.getBoundingClientRect();
                            const GAP = 4;
                            const spaceBelow = window.innerHeight - rect.bottom - GAP;
                            const spaceAbove = rect.top - GAP;
                            // The OV row sits low in the timeline, so in practice
                            // there is never room below and this always flips up —
                            // but it's measured rather than hard-coded so the menu
                            // still behaves on a short viewport or if the track
                            // moves. Whichever side wins, `maxHeight` keeps the menu
                            // inside the viewport instead of letting the last items
                            // fall off the edge unreachable.
                            const openUpward = spaceBelow < Math.min(spaceAbove, 260);
                            setAddOverlayMenuPos({
                              left: rect.left,
                              ...(openUpward
                                ? { bottom: window.innerHeight - rect.top + GAP }
                                : { top: rect.bottom + GAP }),
                              maxHeight: Math.max(120, (openUpward ? spaceAbove : spaceBelow) - GAP),
                            });
                          }
                          setShowAddOverlayMenu(prev => !prev);
                        }}
                        className="flex items-center gap-0.5 text-[10px] font-bold text-gray-500 hover:text-purple-600 transition-colors"
                        title="Add an overlay at the playhead"
                      >
                        <Type size={14} /> Add <ChevronDown size={10} />
                      </button>
                      {showAddOverlayMenu && addOverlayMenuPos && createPortal(
                        <>
                          {/* Full-screen click-catcher, closes the menu on outside click —
                              needed now that the menu itself is fixed/detached from this
                              button's own DOM subtree, so it no longer sits "inside" the
                              button's hover/click area. */}
                          <div className="fixed inset-0 z-[59]" onClick={() => setShowAddOverlayMenu(false)} />
                          <div
                            className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[60] overflow-y-auto"
                            style={{
                              top: addOverlayMenuPos.top,
                              bottom: addOverlayMenuPos.bottom,
                              left: addOverlayMenuPos.left,
                              maxHeight: addOverlayMenuPos.maxHeight,
                            }}
                          >
                            <button
                              onClick={() => { handleAddOverlayClip('text'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <Type size={13} className="text-gray-400" /> Add Text
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('checklist-card'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <CheckCircle2 size={13} className="text-gray-400" /> Add Checklist Card
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('title-cutout-card'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <ImageIcon size={13} className="text-gray-400" /> Add Title Card
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('dim-scrim'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <Contrast size={13} className="text-gray-400" /> Add Dim Scrim
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('particles'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <Sparkles size={13} className="text-gray-400" /> Add Particles
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('light-beam'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <Sunrise size={13} className="text-gray-400" /> Add Light Beam
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('light-sweep'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <ArrowRightLeft size={13} className="text-gray-400" /> Add Light Sweep
                            </button>
                            <button
                              onClick={() => { handleAddOverlayClip('film-damage'); setShowAddOverlayMenu(false); }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <Film size={13} className="text-gray-400" /> Add Old Film
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                 </div>
                 <div
                   className="flex flex-1 relative rounded-r-md border border-dashed border-gray-200 bg-gray-50 transition-colors"
                   style={{
                     width: `${timelineDuration * scale}px`,
                     // One lane is 40px; the row grows as lanes are added rather
                     // than squeezing clips into a fixed height.
                     height: `${overlayLaneCount * 40}px`,
                   }}
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     setCursorPosition(e.clientX - rect.left);
                     setSelectedOverlayClipId(null);
                   }}
                 >
                    {overlayClips.length === 0 && (
                      <div className="absolute inset-0 flex items-center px-4 pointer-events-none opacity-50">
                        <Type size={12} className="mr-2 text-gray-500" />
                        <span className="text-[10px] text-gray-500 font-bold italic">
                          Add a text overlay — it can sit anywhere, across any scene
                        </span>
                      </div>
                    )}

                    {overlayClips.map((clip) => {
                      const lane = overlayLaneByClipId[clip.id] ?? 0;
                      const isSelected = selectedOverlayClipId === clip.id;
                      const accent = OVERLAY_KIND_ACCENT[clip.kind] ?? OVERLAY_KIND_ACCENT.text;
                      return (
                        <Rnd
                          key={clip.id}
                          bounds="parent"
                          dragAxis="x"
                          minWidth={0.5 * scale}
                          enableResizing={false}
                          disableDragging={true}
                          size={{ width: clip.duration * scale, height: 32 }}
                          position={{ x: clip.startTime * scale, y: lane * 40 + 4 }}
                          className={`rounded-md border overflow-hidden shadow-sm px-1 transition-[filter,background-color,border-color] ${
                            isSelected
                              ? 'border-white ring-2 ring-white/80 ring-offset-1 ring-offset-gray-900 bg-gray-800/45 z-30'
                              : 'border-gray-700 bg-gray-900/30 hover:bg-gray-900/45 z-20'
                          }`}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            setSelectedOverlayClipId(clip.id);
                            // An overlay clip isn't a scene or an A1/A2 clip, so clear
                            // both — otherwise the right panel would still be showing
                            // whichever of those was last selected.
                            setSelectedScene(null);
                            setSelectedTimelineClip(null);
                            setSelectedSceneKeys([]);
                            setSelectedAsset(null);
                            setActiveTab('scene');
                            // So the <Player> is actually showing this clip's real
                            // render (not just the drag badge) the moment its panel
                            // opens for editing.
                            seekIntoOverlayClip(clip);
                          }}
                          onContextMenu={(e: any) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedOverlayClipId(clip.id);
                            setContextMenu({ x: e.pageX, y: e.pageY, type: 'overlay', id: clip.id });
                          }}
                        >
                          {/* Move handle. Same split as A1/A2 clips: the label drags
                              the clip, the edge handles trim it. */}
                          <div
                            className="flex items-center gap-1 h-full cursor-move text-gray-100 overflow-hidden"
                            onPointerDown={(e) => handleOverlayDragStart(e, clip)}
                          >
                            {clip.kind === 'dim-scrim' ? (
                              <Contrast size={10} className={`shrink-0 ${accent.icon}`} />
                            ) : clip.kind === 'particles' ? (
                              <Sparkles size={10} className={`shrink-0 ${accent.icon}`} />
                            ) : clip.kind === 'light-beam' ? (
                              <Sunrise size={10} className={`shrink-0 ${accent.icon}`} />
                            ) : clip.kind === 'light-sweep' ? (
                              <ArrowRightLeft size={10} className={`shrink-0 ${accent.icon}`} />
                            ) : clip.kind === 'film-damage' ? (
                              <Film size={10} className={`shrink-0 ${accent.icon}`} />
                            ) : (
                              <Type size={10} className={`shrink-0 ${accent.icon}`} />
                            )}
                            <span className="text-[9px] font-bold truncate">
                              {/* The environmental kinds carry no text, so they're
                                  labelled by what they ARE — a `clip.text` fallback
                                  would label all three "Text". */}
                              {OVERLAY_KIND_BLOCK_LABEL[clip.kind] ?? (clip.text || 'Text')}
                            </span>
                          </div>

                          {/* Trim handles double as the kind's color identity — tinted
                              with this clip's accent instead of a flat gray, since they're
                              already visible at rest at both ends of every clip regardless
                              of kind. */}
                          <div
                            className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize ${accent.stripe} opacity-80 hover:opacity-100 z-50 rounded-l-md flex items-center justify-center`}
                            title="Drag to change when this overlay starts"
                            onPointerDown={(e) => handleOverlayResizeStart(e, clip, 'left')}
                          >
                            <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                          </div>
                          <div
                            className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize ${accent.stripe} opacity-80 hover:opacity-100 z-50 rounded-r-md flex items-center justify-center`}
                            title="Drag to change how long this overlay lasts"
                            onPointerDown={(e) => handleOverlayResizeStart(e, clip, 'right')}
                          >
                            <div className="w-0.5 h-3 bg-white/80 rounded-full" />
                          </div>
                        </Rnd>
                      );
                    })}
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
                   className={`flex flex-1 relative h-16 rounded-r-md items-center border-y border-r shadow-sm transition-colors ${trackStates.V1.locked ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60 grayscale' : 'bg-white border-gray-100 cursor-pointer'}`}
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
                    {scenes.map((scene, idx) => {
                      const leftPx = getSceneLeftPosition('V1', idx);
                      const isSelected = selectedSceneKeys.includes(`${scene.id}_V1`)
                        || (selectedScene?.id === scene.id && selectedSceneTrack === 'V1' && selectedSceneKeys.length === 0);
                      // Frozen mid-trim so resizing doesn't mount and unmount <video>
                      // elements — each new one fires a range request for its poster frame.
                      const stripCount = frozenStrip && frozenStrip.sceneId === scene.id
                        ? frozenStrip.count
                        : filmstripCount(getSceneDuration(scene));
                      // The block being dragged is hidden and follows the cursor, so only
                      // the ones making room for it animate.
                      const slidesAside = isReordering && draggingScene?.id !== scene.id;
                      // An unapplied pick previews here too, so the strip you're
                      // scrubbing matches what Apply would actually save.
                      const pendingHere = pendingPickFor(scene.id);
                      const previewMediaUrl = pendingHere ? pendingHere.mediaUrl : scene.custom_media_url;
                      const previewMediaType = pendingHere ? pendingHere.type : scene.custom_media_type;
                      const ringClass = isSelected
                        ? 'ring-2 ring-purple-500 ring-offset-1 z-20 bg-purple-500/20'
                        : 'hover:brightness-95 z-10';
                      const hasTransition = idx > 0 && Boolean(scene.transition_type) && scene.transition_type !== 'none';
                      // The seam this scene's incoming transition lives at is its own
                      // LEFT edge (it borders the previous scene, contiguous blocks having
                      // no gap between them). One indicator, three states, boundary-only —
                      // never the whole block: a static line once a transition exists, a
                      // brighter "drop here" glow while a card is being dragged over this
                      // exact seam, and a brief pulse right after either lands.
                      const seamIndicator: 'drag-over' | 'just-applied' | 'set' | null =
                        transitionDragOverSceneId === scene.id
                          ? 'drag-over'
                          : transitionJustAppliedId === scene.id
                            ? 'just-applied'
                            : hasTransition
                              ? 'set'
                              : null;
                      return (
                       <div
                         key={`video-${scene.id}`}
                         ref={el => { blockRefs.current[`${scene.id}_V1`] = el; }}
                         data-base-left={leftPx}
                         data-scaled={isSelected ? '1' : '0'}
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
                         // Lights up the amber drop-target ring while a transition card is
                         // over THIS block specifically. Only `.types` is readable during
                         // dragover (see the card's onDragStart comment), so this checks
                         // for the marker MIME type rather than decoding the JSON payload.
                         onDragOver={(e) => {
                           if (trackStates.V1.locked || idx === 0) return;
                           if (e.dataTransfer.types.includes('application/x-transition-card')) {
                             e.preventDefault();
                             if (transitionDragOverSceneId !== scene.id) setTransitionDragOverSceneId(scene.id);
                           }
                         }}
                         onDragLeave={(e) => {
                           if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                             setTransitionDragOverSceneId(prev => (prev === scene.id ? null : prev));
                           }
                         }}
                         // Precise transition-card targeting: dropping a card from the
                         // Transition In accordion onto THIS scene sets its transition,
                         // no matter which scene (if any) is currently selected. Stops
                         // propagation so the track's own onDrop — which otherwise reads
                         // every drop as "insert a new scene near this X position" —
                         // never sees it. Any other payload (a Media panel asset, a
                         // scene being reordered) is left alone to bubble up as before.
                         onDrop={(e) => {
                           if (trackStates.V1.locked) return;
                           const dataStr = e.dataTransfer.getData('text/plain');
                           if (!dataStr) return;
                           let data: any;
                           try {
                             data = JSON.parse(dataStr);
                           } catch {
                             return;
                           }
                           if (data.type !== 'transition') return;
                           e.preventDefault();
                           e.stopPropagation();
                           setTransitionDragOverSceneId(null);
                           // Transition belongs to the incoming scene; the first scene
                           // has no preceding scene to transition from, matching the
                           // accordion's own rule for it.
                           if (idx === 0) return;
                           applyTransitionToScene(scene.id, data.transitionType);
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
                         className={`h-[80%] absolute top-[10%] left-0 rounded-md border ${getSceneColor(scene.generation_status)} cursor-pointer transition-colors overflow-hidden group/block shadow-sm ${ringClass}`}
                         style={{
                           // Positioned by transform rather than `left` so a move stays on
                           // the compositor instead of forcing layout on the whole track.
                           // The selection "pop" rides along in the same transform — an
                           // inline one would override Tailwind's scale-* class outright.
                           transform: blockTransform(leftPx, isSelected),
                           width: `${getSceneDuration(scene) * scale}px`,
                           opacity: draggingScene?.id === scene.id ? 0.001 : 1,
                           transition: slidesAside ? REORDER_SLIDE : undefined
                         }}
                       >
                         <div className="w-full h-full p-1.5 flex flex-col relative">
                            <div className={`flex items-center gap-1.5 mb-1 opacity-100 z-10 ${previewMediaUrl ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] bg-black/30 w-fit px-1.5 py-0.5 rounded-sm' : 'opacity-90'}`}>
                               {previewMediaType === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
                               <span className="text-[9px] font-bold truncate">Sc {getVisualSequenceNumber('V1', idx)} {previewMediaUrl ? `(${scene.voice_over_beat})` : ''}</span>
                               {pendingHere && (
                                 <span className="text-[8px] font-bold text-amber-300">•preview</span>
                               )}
                            </div>
                            {previewMediaUrl && (
                               <div className="absolute inset-0 z-0 flex overflow-hidden rounded-md pointer-events-none">
                                  {previewMediaType === 'video' ? (
                                     Array.from({ length: stripCount }).map((_, i, arr) => (
                                        <video
                                          key={i}
                                          src={`${previewMediaUrl}#t=${(scene.trim_start || 0) + (getSceneDuration(scene) / arr.length) * i + 0.1}`}
                                          className="h-full object-cover shrink-0 border-r border-black/20"
                                          style={{ width: `${100 / arr.length}%` }}
                                          preload="metadata"
                                          muted
                                        />
                                     ))
                                  ) : (
                                     Array.from({ length: stripCount }).map((_, i, arr) => (
                                        <img
                                          key={i}
                                          src={previewMediaUrl}
                                          className="h-full object-cover shrink-0 border-r border-black/20"
                                          style={{ width: `${100 / arr.length}%` }}
                                        />
                                     ))
                                  )}
                               </div>
                            )}
                         </div>
                         {/* Transition seam indicator — lives ON THE BOUNDARY between this
                             scene and the previous one, never a glow around the whole
                             block (that read as "this scene is selected", which isn't
                             what's being communicated). Extends slightly past the block's
                             own top/bottom so it reads as a small opening right at the
                             seam, exactly where you'd drag a card to. */}
                         {seamIndicator && (
                           <div
                             className={`absolute -left-[3px] -top-1 -bottom-1 w-1.5 rounded-full z-40 pointer-events-none ${
                               seamIndicator === 'drag-over'
                                 ? 'bg-amber-400 shadow-[0_0_10px_3px_rgba(251,191,36,0.9)] animate-pulse'
                                 : seamIndicator === 'just-applied'
                                   // White with a dark outline ring, not just a glow — the
                                   // glow alone washed out against the lighter scene-status
                                   // backgrounds (amber-50/emerald-50 etc.), where a white
                                   // line with no outline nearly disappears.
                                   ? 'bg-white animate-pulse shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_10px_3px_rgba(255,255,255,0.95)]'
                                   : 'bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_4px_1px_rgba(255,255,255,0.8)]'
                             }`}
                             title={hasTransition ? `Transition in: ${scene.transition_type}` : 'Drop a transition card here'}
                           />
                         )}
                         {/* Resize Handles */}
                         {!trackStates.V1.locked && selectedScene?.id === scene.id && selectedSceneTrack === 'V1' && (
                            <>
                              <div
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-l-md transition-colors"
                                onPointerDown={(e) => handleResizeStart(e, scene.id, 'V1', 'left', getSceneDuration(scene), scene.trim_start || 0)}
                              />
                              <div
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-r-md transition-colors"
                                onPointerDown={(e) => handleResizeStart(e, scene.id, 'V1', 'right', getSceneDuration(scene), scene.trim_start || 0)}
                              />
                            </>
                         )}
                       </div>
                      );
                    })}

                    {v1DragInsertIndex !== null && (draggingAsset || (draggingScene && draggingScene.track === 'V1')) && (
                        <div 
                           className="h-[80%] absolute top-[10%] left-0 rounded-md border-2 border-dashed border-purple-400 bg-purple-100/50 z-0 pointer-events-none flex items-center justify-center overflow-hidden"
                           style={{
                              // Slides between slots on the same curve as the blocks it
                              // sits among — a teleporting ghost among sliding blocks
                              // reads as a rendering bug.
                              transform: blockTransform(getUnshiftedLeftPosition('V1', v1DragInsertIndex), false),
                              width: `${(draggingAsset?.duration || draggingScene?.duration || 5) * scale}px`,
                              transition: REORDER_SLIDE
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
                        className="rounded-md border border-blue-400 bg-blue-100/90 cursor-grab active:cursor-grabbing overflow-hidden z-20 shadow-sm hover:brightness-95 transition-[filter,background-color,border-color]"
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
                   className={`flex flex-1 relative h-14 rounded-r-md items-center border-y border-r shadow-sm transition-colors ${trackStates.A1.locked ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60 grayscale' : 'bg-white border-gray-100 cursor-pointer'}`}
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
                   {/* ─ PER-ACT NARRATION BLOCKS (long-form) ─
                       Chunked by Act, not by scene: these are the units the user
                       reviews and re-records. Clicking one selects it; the Inspector
                       then offers "re-record this act", which replaces only this
                       block's audio and slides the later acts by the difference. */}
                   {hasActNarration ? (
                     <>
                     {actNarrations.map(act => {
                       const isSelected = selectedActNumber === act.actNumber;
                       const isBusy = regeneratingActNumber === act.actNumber;
                       return (
                         <div
                           key={`act-block-${act.actNumber}`}
                           onClick={() => {
                             setSelectedActNumber(isSelected ? null : act.actNumber);
                             // Acts are their own selection kind — clear the scene and
                             // clip selections so the Inspector cannot show two things.
                             setSelectedScene(null);
                             setSelectedTimelineClip(null);
                             setSelectedSceneTrack('A1');
                           }}
                           onDoubleClick={() => setCursorPosition(act.startSeconds * scale)}
                           title={`Act ${act.actNumber} — ${act.durationSeconds.toFixed(1)}s. Click to select, double-click to jump here.`}
                           className={`absolute rounded-md border overflow-hidden shadow-sm cursor-pointer transition-all ${
                             isSelected
                               ? 'border-purple-600 ring-2 ring-purple-400 bg-gradient-to-r from-purple-200 to-purple-100 text-purple-900'
                               : 'border-purple-500 bg-gradient-to-r from-purple-100 to-purple-50 text-purple-900 hover:from-purple-150'
                           } ${isBusy ? 'opacity-60 animate-pulse' : ''}`}
                           style={{
                             left: act.startSeconds * scale,
                             // 1px gutter so neighbouring acts read as separate blocks
                             // rather than one continuous bar.
                             width: Math.max(2, act.durationSeconds * scale - 1),
                             top: '15%',
                             height: '70%',
                           }}
                         >
                           <div className="flex items-center gap-1.5 p-1 opacity-90">
                             {isBusy
                               ? <Loader2 size={9} className="flex-none animate-spin" />
                               : <Volume2 size={9} className="flex-none" />}
                             <span className="text-[8px] font-bold truncate">
                               Act {act.actNumber}
                               {act.durationSeconds > 0 ? ` · ${Math.round(act.durationSeconds)}s` : ''}
                             </span>
                           </div>
                           <div className="absolute inset-x-1 bottom-1 top-4 opacity-60 flex items-center overflow-hidden pointer-events-none">
                             <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100" suppressHydrationWarning>
                               <path suppressHydrationWarning
                                 d={Array.from({length: 250}).map((_, i) => { const h = 8 + Math.abs(Math.sin((i + act.actNumber * 7) * 0.3) * Math.cos(i * 1.7)) * 40; return `M${i * 4 + 2},${50 - h} L${i * 4 + 2},${50 + h}`; }).join(' ')}
                                 stroke="#9333ea" strokeWidth="2.5" strokeLinecap="round"
                               />
                             </svg>
                           </div>
                         </div>
                       );
                     })}
                     </>
                   ) : masterAudioUrl ? (
                     /* Grabbable, but anchored. The bar follows the cursor so A1 does
                        not feel dead, then springs back to 0 on release: the master
                        narration defines the timeline's clock, and every caption word
                        is timed from its start, so moving it is not a thing this
                        editor supports. Nothing downstream reads a start offset. */
                     <Rnd
                       ref={masterNarrationRndRef}
                       dragAxis="x"
                       enableResizing={false}
                       disableDragging={trackStates.A1.locked}
                       // Falls back to the full ruler width when duration hasn't loaded
                       // yet, so the bar doesn't collapse to nothing mid-load.
                       size={{ width: (masterAudioDuration || timelineDuration) * scale, height: '70%' }}
                       position={{ x: 0, y: 0 }}
                       onDragStop={() => {
                         // `position` is already {x:0} on every render, so React sees no
                         // prop change and Rnd would keep the transform it applied during
                         // the drag. Reset its internal position explicitly.
                         masterNarrationRndRef.current?.updatePosition({ x: 0, y: 0 });
                       }}
                       style={{ top: '15%' }}
                       className={`rounded-md border border-purple-600 bg-gradient-to-r from-purple-100 to-purple-50 text-purple-900 overflow-hidden shadow-sm transition-transform ${
                         trackStates.A1.locked ? '' : 'cursor-grab active:cursor-grabbing'
                       }`}
                       title="The full narration is anchored to the start of the timeline"
                       // Right-click reaches the Scene Board from here. Without this the
                       // board would be unreachable whenever master narration exists,
                       // since this bar replaces the per-scene A1 blocks entirely.
                       onContextMenu={(e: any) => {
                         e.preventDefault();
                         if (trackStates.A1.locked) return;
                         setContextMenu({ x: e.pageX, y: e.pageY, type: 'narration', id: 'master-narration', trackId: 'A1' });
                       }}
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
                     </Rnd>
                   ) : (
                     /* ─ PER-SCENE clips (shown only when no master narration) ─ */
                     <>
                     {scenes.map((scene, idx) => {
                        const leftPx = getSceneLeftPosition('A1', idx);
                        const isSelected = selectedSceneKeys.includes(`${scene.id}_A1`)
                          || (selectedScene?.id === scene.id && selectedSceneTrack === 'A1' && selectedSceneKeys.length === 0);
                        return (
                        <div
                          key={`audio-${scene.id}`}
                          ref={el => { blockRefs.current[`${scene.id}_A1`] = el; }}
                          data-base-left={leftPx}
                          data-scaled={isSelected ? '1' : '0'}
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
                          className={`h-[70%] absolute top-[15%] left-0 rounded-md border border-gray-800 bg-purple-50 text-purple-800 cursor-pointer transition-colors overflow-hidden p-1 shadow-sm ${
                            isSelected
                              ? 'ring-2 ring-gray-900 ring-offset-1 z-20 bg-purple-200'
                              : 'hover:bg-purple-100 z-10'
                          }`}
                          style={{
                            transform: blockTransform(leftPx, isSelected),
                            width: `${(scene.video_duration || 5) * scale}px`,
                            opacity: draggingScene?.id === scene.id ? 0.001 : 1,
                            transition: isReordering && draggingScene?.id !== scene.id ? REORDER_SLIDE : undefined
                          }}
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
                              <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-l-md" onPointerDown={(e) => handleResizeStart(e, scene.id, 'A1', 'left', scene.video_duration || 5, scene.trim_start || 0)} />
                              <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-purple-500/80 hover:bg-purple-400 z-50 rounded-r-md" onPointerDown={(e) => handleResizeStart(e, scene.id, 'A1', 'right', scene.video_duration || 5, scene.trim_start || 0)} />
                            </>
                          )}
                        </div>
                        );
                     })}

                     {a1DragInsertIndex !== null && draggingScene?.track === 'A1' && (
                        <div 
                           className="h-[70%] absolute top-[15%] left-0 rounded-md border-2 border-dashed border-purple-400 bg-purple-100/50 z-0 pointer-events-none flex items-center justify-center overflow-hidden"
                           style={{
                              transform: blockTransform(getUnshiftedLeftPosition('A1', a1DragInsertIndex), false),
                              width: `${(draggingScene.duration || 5) * scale}px`,
                              transition: REORDER_SLIDE
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
                        className={`rounded-md border border-blue-400 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm hover:brightness-95 transition-[filter,background-color,border-color] p-1 ${
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
                   className={`flex flex-1 relative h-12 rounded-r-md items-center border transition-colors ${trackStates.A2.locked ? 'bg-gray-100 border-gray-200 border-solid cursor-not-allowed opacity-60 grayscale' : 'bg-gray-50 border-gray-200 border-dashed hover:bg-gray-100 cursor-pointer'}`}
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
                     // A transition-music card in flight: find the scene boundary
                     // nearest the cursor so the guide lines below know which one to
                     // light up. Checked via `.types` rather than decoding the JSON
                     // payload — `getData` isn't readable during dragover.
                     if (e.dataTransfer.types.includes('application/x-transition-music')) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const timeAtCursor = (e.clientX - rect.left) / scale;
                        const nearestIdx = findNearestSceneBoundaryIdx(timeAtCursor);
                        if (nearestIdx !== musicDragNearestBoundaryIdx) {
                           setMusicDragNearestBoundaryIdx(nearestIdx);
                        }
                     }
                   }}
                   onDragLeave={(e) => {
                     if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setMusicDragNearestBoundaryIdx(null);
                     }
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

                    {/* Scene-boundary guide lines — only while a transition-music card
                        is being dragged. One faint tick per internal scene cut; the
                        nearest one to the cursor (tracked by the onDragOver above)
                        brightens to show where a drop would land. */}
                    {isDraggingMusicPreset && scenes.length >= 2 && (
                       Array.from({ length: scenes.length - 1 }, (_, k) => k + 1).map((boundaryIdx) => (
                          <div
                             key={`music-guide-${boundaryIdx}`}
                             className={`absolute top-0 bottom-0 w-0.5 pointer-events-none z-20 transition-colors ${
                                musicDragNearestBoundaryIdx === boundaryIdx
                                   ? 'bg-amber-400 shadow-[0_0_10px_3px_rgba(251,191,36,0.9)]'
                                   : 'bg-purple-300/50'
                             }`}
                             style={{ left: `${sceneOffsets[boundaryIdx] * scale}px` }}
                          />
                       ))
                    )}

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
                        className={`rounded-md border border-blue-400 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm hover:brightness-95 transition-[filter,background-color,border-color] p-1 ${
                          (selectedTimelineClip?.id === clip.id && selectedSceneTrack === 'A2') || selectedSceneKeys.includes(`${clip.id}_A2`)
                            ? 'ring-2 ring-blue-600 ring-offset-1 z-30 scale-[1.02] bg-blue-200'
                            : 'bg-blue-100/90 z-20'
                        } ${
                          // Brief "yes, that landed" confirmation right after a
                          // transition-music preset is dropped — same 900ms pulse
                          // pattern as the V1 transition seam indicator.
                          musicJustAppliedClipId === clip.id
                            ? 'animate-pulse shadow-[0_0_10px_3px_rgba(96,165,250,0.85)]'
                            : ''
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
        const isNarrationOnly =
          contextMenu.type === 'narration' ||
          (contextMenu.type === 'scene' && contextMenu.trackId === 'A1');

        const label = isBulk
          ? `Delete ${selectedSceneKeys.length} items`
          : isNarrationOnly
            ? 'Remove narration'
            : contextMenu.type === 'scene'
              ? 'Delete scene'
              : contextMenu.type === 'overlay'
                ? 'Delete overlay'
                : 'Delete clip';

        // The scene-scoped actions only make sense for a single scene's visual: A1 is
        // the same scene row viewed as narration, and clips carry a library asset
        // rather than a generated visual.
        const isSingleV1Scene =
          contextMenu.type === 'scene' && contextMenu.trackId === 'V1' && !isBulk;
        const isCurrentlyIsolated = isolatedSceneId === contextMenu.id;

        // A1 is the narration track, and the Scene Board is where narration is
        // written — so the script lives one right-click away from the audio it
        // produced. Offered on A1 rows only; V1 and the clip tracks have no such
        // relationship to the board.
        const isNarrationRow = contextMenu.trackId === 'A1';

        // The clamp used to hardcode 60px, which was exactly one item — a taller menu
        // ran off the bottom of the viewport with no way to reach the lower entries.
        const MENU_ITEM_HEIGHT = 37;
        const MENU_SEPARATOR_HEIGHT = 9;
        const MENU_VERTICAL_PADDING = 8;
        const estimatedMenuHeight =
          MENU_VERTICAL_PADDING +
          MENU_ITEM_HEIGHT +
          (isSingleV1Scene ? MENU_ITEM_HEIGHT * 2 + MENU_SEPARATOR_HEIGHT : 0) +
          (isNarrationRow ? MENU_ITEM_HEIGHT + MENU_SEPARATOR_HEIGHT : 0);

        return (
          <div
            className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[9999] min-w-[190px] animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - estimatedMenuHeight - 8)),
              left: Math.min(contextMenu.x, window.innerWidth - 200),
            }}
          >
            {isNarrationRow && (
              <>
                <button
                  className="w-full text-left px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-2.5 transition-colors"
                  onClick={(e) => {
                    // A global window click listener closes this menu, so every item
                    // has to stop propagation or it unmounts before its own handler runs.
                    e.stopPropagation();
                    openSceneBoard();
                  }}
                >
                  <Clapperboard size={15} className="text-purple-600" />
                  <span className="flex-1">Open Scene Board</span>
                </button>
                <div className="h-px bg-gray-100 mx-1 my-1" />
              </>
            )}
            {isSingleV1Scene && (
              <>
                <button
                  className="w-full text-left px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-2.5 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    focusSceneVisualGeneration(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <ImageIcon size={15} className="text-blue-500" />
                  <span className="flex-1">Replace media</span>
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-2.5 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsolatedSceneId(isCurrentlyIsolated ? null : contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Repeat size={15} className="text-purple-500" />
                  <span className="flex-1">
                    {isCurrentlyIsolated ? 'Exit scene preview' : 'Preview this scene only'}
                  </span>
                </button>
                <div className="h-px bg-gray-100 mx-1 my-1" />
              </>
            )}
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

      {/* ── Scene Board modal ──
          Sits below the context menu (z-[9999]) and the export overlay (z-[10000]),
          above everything else. Backdrop click and Escape both close it; unlike the
          export overlay there is nothing irreversible running behind it, so it is
          freely dismissible. */}
      {isSceneBoardOpen && (
        <div
          className="fixed inset-0 z-[9990] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto"
          onClick={() => setIsSceneBoardOpen(false)}
        >
          <div
            className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden"
            /* The board is full of buttons and textareas; without this every click
               inside it would bubble to the backdrop and close the modal. */
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="flex items-center gap-2 min-w-0">
                <Clapperboard size={16} className="text-purple-600 shrink-0" />
                <h2 className="text-sm font-bold text-gray-900 truncate">Scene Board</h2>
              </div>
              <button
                onClick={() => setIsSceneBoardOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {isLoadingSceneBoard ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 size={22} className="animate-spin text-purple-600" />
                  <p className="text-xs font-medium text-gray-500">Loading the Scene Board…</p>
                </div>
              ) : sceneBoardError ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
                  <AlertTriangle size={22} className="text-amber-500" />
                  <p className="text-xs font-medium text-gray-600">{sceneBoardError}</p>
                  <button
                    onClick={() => { setSceneBoardError(null); openSceneBoard(); }}
                    className="text-xs font-bold text-purple-600 hover:text-purple-700"
                  >
                    Try again
                  </button>
                </div>
              ) : sceneBoardData ? (
                <SceneBoard
                  projectId={sceneBoardData.projectId}
                  workspaceId={sceneBoardData.workspaceId}
                  acts={sceneBoardData.acts.map((act) => act.outline)}
                  workspaceTheme={sceneBoardData.workspaceTheme}
                  topic={sceneBoardData.topic}
                  narrativeArc={sceneBoardData.narrativeArc}
                  scriptHook={sceneBoardData.scriptHook}
                  visualAesthetic={sceneBoardData.visualAesthetic}
                  targetDuration={sceneBoardData.targetDuration}
                  isSinglePass={sceneBoardData.isSinglePass}
                  resumedActs={sceneBoardData.acts}
                  /* Approving here must not push to the Timeline route — we are
                     already on it. Close instead, drop the cached payload so a
                     reopen refetches, and refresh so the editor's server-loaded
                     scenes reflect what was just approved. */
                  onFinalized={() => {
                    setIsSceneBoardOpen(false);
                    setSceneBoardData(null);
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Blocking export overlay.
          Rendered last and at z-[10000] so it sits above every other layer in this
          component — including the editor page's own `fixed inset-0 z-50` shell, the
          persistence toast at z-[200], and the context menu at z-[9999]. Follows the
          app's existing modal convention (VoiceCloningModal: fixed inset-0, dimmed
          backdrop, backdrop-blur, centered card).

          Deliberately has no close button and no backdrop-click handler: the render
          cannot be cancelled server-side, so offering a dismiss would only hide
          progress for work that is still running. */}
      {isRendering && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">
            <div className="flex items-center justify-center gap-2.5 mb-5">
              <Loader2 size={18} className="animate-spin text-purple-600" />
              <h2 className="text-sm font-bold text-gray-900">Exporting video</h2>
            </div>

            <div className="text-5xl font-extrabold text-gray-900 tabular-nums mb-1">
              {Math.round(renderProgress * 100)}%
            </div>
            <p className="text-xs font-medium text-gray-500 mb-5">
              {humanizeRenderStage(renderStage)}
            </p>

            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-5">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-300"
                style={{ width: `${Math.max(2, Math.round(renderProgress * 100))}%` }}
              />
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Please keep this window open until the export finishes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
