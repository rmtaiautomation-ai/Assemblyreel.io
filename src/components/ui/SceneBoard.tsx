"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Film,
  Lightbulb,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trees,
  Users,
  X,
} from "lucide-react";
import {
  approveActVisuals,
  generateAct,
  regenerateActNarration,
  regenerateActVisuals,
  replaceActScenes,
  rewriteActWithAI,
  updateSceneVoiceover,
} from "@/app/actions/whiteboard-actions";
import { getAvailableVoices } from "@/app/actions/audio-actions";
import type { SceneBoardAct, SceneBoardData, SceneBoardScene } from "@/app/actions/scene-board-actions";

/**
 * The Scene Board — see implementation_plans/19-scene-board-workspace.md.
 *
 * Three panes on a fixed-height desktop shell: the Act rail (where am I in 25
 * minutes), the board itself (what does my video look like), and the inspector (what
 * did the agents decide about this scene). Deliberately no `max-width` and no mobile
 * breakpoints — this is a wide-monitor review surface.
 *
 * Everything the inspector shows besides narration is READ-ONLY on purpose. The whole
 * point of a 7-agent chain is not hand-writing camera directions; when the output is
 * consistently wrong the fix belongs in the agent's prompt, where it corrects every
 * scene at once, rather than in a text box that corrects one. Narration stays editable
 * because rewriting the words is a genuine authoring act, and because the visual agents
 * are built to rebuild from whatever `voice_over_beat` currently holds.
 */

export interface SceneBoardProps {
  data: SceneBoardData;
}

type ViewMode = "board" | "script";
type SceneFilter = "all" | "needs-visuals" | "no-media" | "failed";

const FILTERS: Array<{ id: SceneFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs-visuals", label: "Needs visuals" },
  { id: "no-media", label: "No media" },
  { id: "failed", label: "Failed" },
];

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One plain-text block for every scene in an act — narration + assembled visual prompt. */
function buildActCopyText(act: SceneBoardAct): string {
  const header = act.outline.title
    ? `Act ${act.outline.actNumber} — ${act.outline.title}`
    : `Act ${act.outline.actNumber}`;
  const scenes = act.scenes
    .map((scene) =>
      [
        `Scene ${scene.sequenceNumber}`,
        `Narration: ${scene.voiceOverText || "(none)"}`,
        `Visual Prompt: ${scene.finalVideoPrompt || "(not built yet)"}`,
      ].join("\n")
    )
    .join("\n\n");
  return `${header}\n\n${scenes}`;
}

/**
 * The inverse of `buildActCopyText` — parses a pasted act back into scenes. Tolerant of
 * an external LLM's small formatting drift (extra blank lines, re-wrapped paragraphs,
 * a missing header) because the round trip goes through a rewrite step outside this
 * app; it only requires each scene to still start on its own "Scene N" line and carry
 * a "Narration:" line, matching what Copy produces.
 *
 * Scene numbers in the pasted text are read for splitting only, then discarded — the
 * caller renumbers by array position, so a skipped or repeated number does not corrupt
 * the result. A block with no narration is dropped rather than saved as a silent blank
 * scene.
 */
function parseActPasteText(text: string): Array<{ voiceOverText: string; visualPrompt: string }> {
  const body = text.replace(/^\s*Act\s+\d+[^\n]*\n+/i, "");
  const blocks = body.split(/\n(?=\s*Scene\s+\d+\s*(?:\n|$))/i);

  return blocks.flatMap((block) => {
    const narrationMatch = block.match(/Narration:\s*([\s\S]*?)(?=\n\s*Visual Prompt:|$)/i);
    const visualMatch = block.match(/Visual Prompt:\s*([\s\S]*)$/i);

    const voiceOverText = narrationMatch?.[1]?.trim() ?? "";
    const visualPrompt = visualMatch?.[1]?.trim() ?? "";

    if (!voiceOverText || voiceOverText === "(none)") return [];
    return [{ voiceOverText, visualPrompt: visualPrompt === "(not built yet)" ? "" : visualPrompt }];
  });
}

function matchesFilter(scene: SceneBoardScene, filter: SceneFilter): boolean {
  switch (filter) {
    case "needs-visuals":
      return scene.finalVideoPrompt.trim().length === 0;
    case "no-media":
      return !scene.mediaUrl;
    case "failed":
      return /fail|error/i.test(scene.generationStatus);
    default:
      return true;
  }
}

/**
 * Seconds since `active` became true, reset to 0 the moment it goes false.
 *
 * Generation is a single blocking server action — Script Writer then Scene Slicer, two
 * sequential LLM calls with no server-side streaming — so there is no real progress
 * fraction to report. An honest elapsed timer plus a best-effort stage label is what
 * this can actually give: proof the request is alive, not a fabricated percentage.
 */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

/** Best-effort stage guess for the two-agent script pass, from typical call timing. */
function scriptStageLabel(seconds: number): string {
  return seconds < 12 ? "Writing narration" : "Slicing into scenes";
}

export default function SceneBoard({ data }: SceneBoardProps) {
  const router = useRouter();

  /* Server truth re-seeds local state whenever the route refreshes. A mounted client
     component does NOT re-seed `useState` from new props on its own — the same trap
     `handleRegenerateAct` documents in TimelineEditor, where freshly-aligned durations
     sat in the database while the UI kept showing the old ones. */
  const [acts, setActs] = useState<SceneBoardAct[]>(data.acts);
  useEffect(() => setActs(data.acts), [data.acts]);

  const [viewMode, setViewMode] = useState<ViewMode>("script");
  const [filter, setFilter] = useState<SceneFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  /**
   * Fetched purely to resolve `data.narrationVoiceId` to a human-readable name for the
   * Inspector's read-only display — this component never synthesises audio itself, so
   * unlike TimelineEditor's "Voice Artist" override, nothing here is ever sent as a
   * voiceId. An unreachable Voice Studio just leaves this empty and the Inspector falls
   * back to showing the raw id.
   */
  const [voices, setVoices] = useState<Array<{ id: string; name?: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    getAvailableVoices().then((res) => {
      if (!cancelled && res.success && res.voices) setVoices(res.voices);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Which act each long-running action is currently working on, so only its button spins. */
  const [scriptingAct, setScriptingAct] = useState<number | null>(null);
  const [recordingAct, setRecordingAct] = useState<number | null>(null);
  const [visualsAct, setVisualsAct] = useState<number | null>(null);
  /** True while the batch script pass is walking the acts. */
  const [writingAll, setWritingAll] = useState(false);
  /** Which act of how many the batch pass is currently on — null outside a batch run. */
  const [writingAllProgress, setWritingAllProgress] = useState<{ index: number; total: number } | null>(null);

  /** Act number showing "Copied" after its bulk-copy button was clicked; resets after 2s. */
  const [copiedAct, setCopiedAct] = useState<number | null>(null);
  const handleCopyAct = (act: SceneBoardAct) => {
    void navigator.clipboard.writeText(buildActCopyText(act)).then(() => {
      setCopiedAct(act.outline.actNumber);
      setTimeout(() => setCopiedAct((current) => (current === act.outline.actNumber ? null : current)), 2000);
    });
  };

  /** Act number whose paste panel is open — null everywhere else. Only one at a time. */
  const [pastingAct, setPastingAct] = useState<number | null>(null);
  const [pasteDraft, setPasteDraft] = useState("");
  const [pasteBusyAct, setPasteBusyAct] = useState<number | null>(null);

  const openPasteAct = (actNumber: number) => {
    setPastingAct(actNumber);
    setPasteDraft("");
  };

  const handleReplaceAct = async (actNumber: number) => {
    const scenes = parseActPasteText(pasteDraft);
    if (scenes.length === 0) {
      alert(
        "Couldn't find any scenes in that text. Paste it in the same format Copy produces — each scene starting with \"Scene N\" and a \"Narration:\" line."
      );
      return;
    }

    setPasteBusyAct(actNumber);
    try {
      const res = await replaceActScenes(data.projectId, actNumber, scenes);
      if (!res.success) {
        alert(res.error || `Replacing Act ${actNumber} failed.`);
        return;
      }
      setPastingAct(null);
      setPasteDraft("");
      router.refresh();
    } finally {
      setPasteBusyAct(null);
    }
  };

  /** Acts whose scenes are hidden from the board. Ephemeral UI state — not persisted. */
  // Every act starts collapsed on a first visit, same as switching into Script mode —
  // this is that same "closed list of act titles" default, just applying to Board mode
  // too now rather than only on a mode switch.
  const [collapsedActs, setCollapsedActs] = useState<Set<number>>(
    () => new Set(data.acts.map((a) => a.outline.actNumber))
  );
  const toggleActCollapsed = (actNumber: number) => {
    setCollapsedActs((prev) => {
      const next = new Set(prev);
      if (next.has(actNumber)) next.delete(actNumber);
      else next.add(actNumber);
      return next;
    });
  };

  /**
   * Script mode always opens as a closed list of act titles, not the full text of
   * every act at once — the reading column runs at 15px with real line height, so nine
   * expanded acts is a long, undifferentiated scroll rather than something scannable.
   * Board mode's compact thumbnail grid has no equivalent problem and keeps its normal
   * expand-by-default behaviour.
   *
   * Re-collapses on every switch INTO script, not only the first time — the guard
   * below is solely to make re-clicking a tab you are already on a no-op, so it never
   * discards acts you deliberately opened during the current visit.
   */
  const handleViewMode = (mode: ViewMode) => {
    if (mode === "script" && viewMode !== "script") {
      setCollapsedActs(new Set(acts.map((a) => a.outline.actNumber)));
    }
    setViewMode(mode);
  };

  /** The act whose narration is playing, and how far into it — drives the karaoke highlight. */
  const [playingAct, setPlayingAct] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const actRefs = useRef<Map<number, HTMLElement>>(new Map());

  const allScenes = useMemo(() => acts.flatMap((a) => a.scenes), [acts]);

  const visibleSceneIds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return new Set(
      allScenes
        .filter((s) => matchesFilter(s, filter))
        .filter((s) => (needle ? s.voiceOverText.toLowerCase().includes(needle) : true))
        .map((s) => s.id)
    );
  }, [allScenes, filter, query]);

  const visibleScenes = useMemo(
    () => allScenes.filter((s) => visibleSceneIds.has(s.id)),
    [allScenes, visibleSceneIds]
  );

  const selectedScene = useMemo(
    () => allScenes.find((s) => s.id === selectedSceneId) ?? null,
    [allScenes, selectedSceneId]
  );

  /**
   * The scene currently being spoken in the playing act.
   *
   * Derived from each scene's own `video_duration` rather than `act_narrations.word_timings`.
   * Those durations are written by the alignment pass at record time, so walking them
   * cumulatively lands on the same boundaries the renderer will use — and it needs no
   * word-to-scene mapping, which the timings alone cannot provide.
   */
  const speakingSceneId = useMemo(() => {
    if (playingAct === null) return null;
    const act = acts.find((a) => a.outline.actNumber === playingAct);
    if (!act) return null;
    let elapsed = 0;
    for (const scene of act.scenes) {
      elapsed += scene.durationSeconds;
      if (playhead < elapsed) return scene.id;
    }
    return act.scenes[act.scenes.length - 1]?.id ?? null;
  }, [acts, playingAct, playhead]);

  const scrollToAct = useCallback((actNumber: number) => {
    actRefs.current.get(actNumber)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ── Act-level actions ──────────────────────────────────────────────────────
     Each calls the same server action the Timeline inspector calls. No client state
     is shared between the two surfaces — the server actions are already the boundary,
     and re-reading from the database on navigation is the correct behavior. */

  const runWithRefresh = async (
    setBusy: (n: number | null) => void,
    actNumber: number,
    fn: () => Promise<{ success: boolean; error?: string; warnings?: string[] }>
  ) => {
    setBusy(actNumber);
    try {
      const res = await fn();
      if (!res.success) {
        alert(res.error || `Act ${actNumber} failed.`);
        return;
      }
      router.refresh();
      if (res.warnings && res.warnings.length > 0) alert(res.warnings.join("\n\n"));
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateScript = (act: SceneBoardAct) => {
    // Sequence numbers continue after every act before this one, so a late generation
    // cannot collide with rows an earlier act already wrote.
    const priorScenes = acts
      .filter((a) => a.outline.actNumber < act.outline.actNumber)
      .reduce((sum, a) => sum + a.scenes.length, 0);

    void runWithRefresh(setScriptingAct, act.outline.actNumber, () =>
      generateAct({
        projectId: data.projectId,
        workspaceTheme: data.workspaceTheme,
        topic: data.topic,
        narrativeArc: data.narrativeArc,
        scriptHook: data.scriptHook,
        visualAesthetic: data.visualAesthetic,
        targetDuration: data.targetDuration,
        startingSequenceNumber: priorScenes + 1,
        actNumber: act.outline.actNumber,
        ...(data.isSinglePass ? {} : { act: act.outline }),
      })
    );
  };

  /**
   * Regenerates an already-written act against whatever the channel's format settings
   * say right now — for testing a blueprint change on one act without rebuilding the
   * whole project. `startingSequenceNumber` here is provisional; `rewriteActWithAI`
   * computes the real one server-side and renumbers the whole project afterward, so a
   * rewrite is safe to run even while later acts already have scenes of their own.
   */
  const handleRewriteAct = (act: SceneBoardAct) => {
    if (
      !window.confirm(
        `Rewrite Act ${act.outline.actNumber} using the current channel format settings? This replaces its narration and visual prompts. Its audio and rendered visuals will need Re-record / Regenerate Visuals afterward.`
      )
    ) {
      return;
    }

    void runWithRefresh(setScriptingAct, act.outline.actNumber, () =>
      rewriteActWithAI({
        projectId: data.projectId,
        workspaceTheme: data.workspaceTheme,
        topic: data.topic,
        narrativeArc: data.narrativeArc,
        scriptHook: data.scriptHook,
        visualAesthetic: data.visualAesthetic,
        targetDuration: data.targetDuration,
        startingSequenceNumber: 1,
        actNumber: act.outline.actNumber,
        ...(data.isSinglePass ? {} : { act: act.outline }),
      })
    );
  };

  /**
   * Writes every act that has no script yet, in order.
   *
   * Plan 16's shape is "write all the scripts, then approve audio and visuals per Act"
   * — the pause the user wants is at the audio/visual gate, not between chapters of a
   * script nobody has read yet. Making the script stage per-act only would mean nine
   * clicks before there is anything to read at all.
   *
   * Sequential rather than parallel: the acts share one Gemini quota, and running them
   * together multiplies the rate-limit pressure that already forces scenes to fall back
   * to unenriched prompts. Sequence numbering is carried in a local counter because
   * `acts` state does not update until the refresh at the end, so reading scene counts
   * from it mid-loop would hand every act the same starting number.
   */
  const handleWriteAllActs = async () => {
    setWritingAll(true);
    const unwritten = acts.filter((a) => a.scenes.length === 0);
    let done = 0;
    setWritingAllProgress({ index: 0, total: unwritten.length });
    try {
      let sequenceNumber =
        acts.reduce((sum, a) => sum + a.scenes.length, 0) + 1;

      for (const act of acts) {
        if (act.scenes.length > 0) continue; // Already written — never regenerate silently.

        setScriptingAct(act.outline.actNumber);
        setWritingAllProgress({ index: done + 1, total: unwritten.length });
        const res = await generateAct({
          projectId: data.projectId,
          workspaceTheme: data.workspaceTheme,
          topic: data.topic,
          narrativeArc: data.narrativeArc,
          scriptHook: data.scriptHook,
          visualAesthetic: data.visualAesthetic,
          targetDuration: data.targetDuration,
          startingSequenceNumber: sequenceNumber,
          actNumber: act.outline.actNumber,
          ...(data.isSinglePass ? {} : { act: act.outline }),
        });

        if (!res.success) {
          alert(res.error || `Act ${act.outline.actNumber} failed. The acts before it were saved.`);
          break;
        }
        sequenceNumber += res.scenes?.length ?? 0;
        done += 1;
      }
    } finally {
      setScriptingAct(null);
      setWritingAll(false);
      setWritingAllProgress(null);
      router.refresh();
    }
  };

  const handleRecordAudio = (actNumber: number) =>
    void runWithRefresh(setRecordingAct, actNumber, () =>
      regenerateActNarration({ projectId: data.projectId, actNumber })
    );

  const handleApproveVisuals = (actNumber: number) =>
    void runWithRefresh(setVisualsAct, actNumber, () =>
      approveActVisuals({
        projectId: data.projectId,
        actNumber,
        topic: data.topic,
        visualAesthetic: data.visualAesthetic || "Cinematic",
      })
    );

  const handleRegenerateVisuals = (actNumber: number) =>
    void runWithRefresh(setVisualsAct, actNumber, () =>
      regenerateActVisuals({
        projectId: data.projectId,
        actNumber,
        topic: data.topic,
        visualAesthetic: data.visualAesthetic || "Cinematic",
      })
    );

  const handleNarrationSaved = (sceneId: string, text: string) => {
    setActs((prev) =>
      prev.map((act) => ({
        ...act,
        scenes: act.scenes.map((s) => (s.id === sceneId ? { ...s, voiceOverText: text } : s)),
      }))
    );
  };

  /* ── Keyboard navigation ────────────────────────────────────────────────────
     Desktop-only, so single-letter shortcuts are safe — but never while the user is
     typing into the narration textarea or the search box. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        if (isTyping) target?.blur();
        else setSelectedSceneId(null);
        return;
      }

      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === "j" || e.key === "k") {
        if (visibleScenes.length === 0) return;
        e.preventDefault();
        const index = visibleScenes.findIndex((s) => s.id === selectedSceneId);
        const next =
          e.key === "j"
            ? Math.min(visibleScenes.length - 1, index + 1)
            : Math.max(0, index === -1 ? 0 : index - 1);
        setSelectedSceneId(visibleScenes[next].id);
        document
          .querySelector(`[data-scene-id="${visibleScenes[next].id}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visibleScenes, selectedSceneId]);

  const sceneCount = allScenes.length;
  const unwrittenActs = acts.filter((a) => a.scenes.length === 0).length;
  const approvedActs = acts.filter((a) => a.progress.isApproved).length;

  // Drives the global status pill below. Stays true across a whole "Write all acts"
  // batch — scriptingAct changes value between acts but never passes through null — so
  // the timer reads as total time in the batch rather than resetting every act.
  const anyBusy = scriptingAct !== null || recordingAct !== null || visualsAct !== null;
  const globalElapsed = useElapsedSeconds(anyBusy);
  const busyVisualsAct = visualsAct !== null ? acts.find((a) => a.outline.actNumber === visualsAct) : null;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-ed-base">
      {/* ══ Left: Act rail ══════════════════════════════════════════════════ */}
      <aside className="w-[240px] shrink-0 border-r border-ed-border bg-ed-chrome flex flex-col overflow-y-auto ed-scroll">
        <div className="px-3 py-3 border-b border-ed-border">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ed-text-dim">
            {data.isSinglePass ? "Structure" : `${acts.length} Acts`}
          </p>
          <p className="text-[12px] text-ed-text-dim mt-0.5">
            {approvedActs} of {acts.length} approved · {sceneCount} scenes
          </p>
        </div>

        <nav className="p-2 space-y-1">
          {acts.map((act) => (
            <ActRailItem
              key={act.outline.actNumber}
              act={act}
              isSinglePass={data.isSinglePass}
              onClick={() => scrollToAct(act.outline.actNumber)}
            />
          ))}
        </nav>

        <CastStrip cast={data.cast} />
      </aside>

      {/* ══ Center: board ═══════════════════════════════════════════════════ */}
      <main className="flex-1 min-w-0 flex flex-col">
        <BoardToolbar
          viewMode={viewMode}
          onViewMode={handleViewMode}
          filter={filter}
          onFilter={setFilter}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          shownCount={visibleScenes.length}
          totalCount={sceneCount}
          unwrittenActs={unwrittenActs}
          writingAll={writingAll}
          scriptingAct={scriptingAct}
          onWriteAll={() => void handleWriteAllActs()}
        />

        {data.warnings.length > 0 && (
          <div className="px-4 py-2 bg-ed-warn-soft border-b border-ed-warn-border space-y-1">
            {data.warnings.map((w) => (
              <p key={w} className="text-[11px] text-ed-warn flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                {w}
              </p>
            ))}
          </div>
        )}

        <div ref={boardRef} className="flex-1 overflow-y-auto ed-scroll bg-ed-base">
          {acts.map((act) => {
            const shown = act.scenes.filter((s) => visibleSceneIds.has(s.id));
            const isCollapsed = collapsedActs.has(act.outline.actNumber);
            const isWriting = scriptingAct === act.outline.actNumber;
            return (
              <section
                key={act.outline.actNumber}
                ref={(el: HTMLElement | null) => {
                  if (el) actRefs.current.set(act.outline.actNumber, el);
                }}
              >
                <ActHeader
                  act={act}
                  isSinglePass={data.isSinglePass}
                  scriptingAct={scriptingAct}
                  recordingAct={recordingAct}
                  visualsAct={visualsAct}
                  playingAct={playingAct}
                  collapsed={isCollapsed}
                  copied={copiedAct === act.outline.actNumber}
                  onToggleCollapse={() => toggleActCollapsed(act.outline.actNumber)}
                  onGenerateScript={() => handleGenerateScript(act)}
                  onRecordAudio={() => handleRecordAudio(act.outline.actNumber)}
                  onApproveVisuals={() => handleApproveVisuals(act.outline.actNumber)}
                  onRegenerateVisuals={() => handleRegenerateVisuals(act.outline.actNumber)}
                  onCopyAct={() => handleCopyAct(act)}
                  onOpenPaste={() => openPasteAct(act.outline.actNumber)}
                  onRewriteAct={() => handleRewriteAct(act)}
                  onPlayState={(isPlaying) => {
                    setPlayingAct(isPlaying ? act.outline.actNumber : null);
                    if (!isPlaying) setPlayhead(0);
                  }}
                  onPlayhead={setPlayhead}
                />

                {pastingAct === act.outline.actNumber && (
                  <div className="px-4 py-3 bg-ed-well border-b border-ed-border space-y-2">
                    <p className="text-[11px] text-ed-text-dim leading-relaxed">
                      Paste a rewritten Act {act.outline.actNumber} below, in the same format
                      Copy produces. This replaces every scene in this act — narration and
                      visual prompts. Other acts are untouched. Re-record and regenerate
                      visuals afterward to hear and see the change.
                    </p>
                    <textarea
                      autoFocus
                      value={pasteDraft}
                      onChange={(e) => setPasteDraft(e.target.value)}
                      placeholder={`Scene 1\nNarration: ...\nVisual Prompt: ...\n\nScene 2\nNarration: ...\nVisual Prompt: ...`}
                      rows={8}
                      className="ed-field p-3 text-[13px] leading-relaxed font-mono resize-y w-full"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleReplaceAct(act.outline.actNumber)}
                        disabled={pasteBusyAct === act.outline.actNumber || !pasteDraft.trim()}
                        className="flex items-center gap-1.5 text-[12px] font-bold text-ed-base bg-ed-accent hover:bg-ed-accent-hover px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
                      >
                        {pasteBusyAct === act.outline.actNumber ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Clipboard size={13} />
                        )}
                        {pasteBusyAct === act.outline.actNumber ? "Replacing…" : `Replace Act ${act.outline.actNumber}`}
                      </button>
                      <button
                        onClick={() => {
                          setPastingAct(null);
                          setPasteDraft("");
                        }}
                        disabled={pasteBusyAct === act.outline.actNumber}
                        className="text-[12px] font-medium text-ed-text-dim hover:text-ed-text px-2 py-1.5 rounded-md transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isCollapsed ? null : viewMode === "board" ? (
                  <div className="px-4 py-4">
                    {shown.length === 0 ? (
                      <EmptyActBody act={act} filtered={act.scenes.length > 0} isWriting={isWriting} />
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                        {shown.map((scene) => (
                          <SceneCard
                            key={scene.id}
                            scene={scene}
                            isSelected={scene.id === selectedSceneId}
                            isSpeaking={scene.id === speakingSceneId}
                            onSelect={() => setSelectedSceneId(scene.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <ScriptView
                    scenes={shown}
                    selectedSceneId={selectedSceneId}
                    speakingSceneId={speakingSceneId}
                    isWriting={isWriting}
                    onSelect={setSelectedSceneId}
                  />
                )}
              </section>
            );
          })}

          <div className="h-24" />
        </div>
      </main>

      {/* ══ Right: inspector ════════════════════════════════════════════════ */}
      <Inspector
        scene={selectedScene}
        onClose={() => setSelectedSceneId(null)}
        onNarrationSaved={handleNarrationSaved}
        narrationVoiceId={data.narrationVoiceId}
        voices={voices}
      />

      {/* Fixed rather than sticky-in-scroll: a batch write walks every act in order, so
          the act currently being written is routinely scrolled out of view by the time
          it finishes. This stays visible regardless of scroll position — the "signal
          it's actually working" this board otherwise gave no way to see. */}
      {anyBusy && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full border border-ed-border bg-ed-surface/95 backdrop-blur-sm px-4 py-2.5 shadow-lg">
          <Loader2 size={14} className="animate-spin text-ed-accent shrink-0" />
          <span className="text-[12px] font-medium text-ed-text">
            {writingAll && writingAllProgress
              ? `Writing scripts — Act ${writingAllProgress.index} of ${writingAllProgress.total} · ${scriptStageLabel(globalElapsed)}…`
              : scriptingAct !== null
                ? `Writing Act ${scriptingAct} · ${scriptStageLabel(globalElapsed)}…`
                : recordingAct !== null
                  ? `Generating audio — Act ${recordingAct}…`
                  : visualsAct !== null
                    ? `${busyVisualsAct?.progress.isApproved ? "Rebuilding" : "Building"} visuals — Act ${visualsAct}…`
                    : ""}
          </span>
          <span className="text-[11px] font-mono text-ed-text-faint tabular-nums shrink-0">
            {globalElapsed}s
          </span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Act rail                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Four dots: Script → Audio → Visuals → Approved. The at-a-glance answer nothing gave before. */
function PipelineDots({ progress }: { progress: SceneBoardAct["progress"] }) {
  const stages: Array<{ on: boolean; title: string; color: string }> = [
    { on: progress.hasScript, title: "Script written", color: "bg-ed-accent" },
    { on: progress.hasAudio, title: "Narration recorded", color: "bg-ed-a1" },
    { on: progress.hasVisuals, title: "Visuals started", color: "bg-ed-info" },
    { on: progress.isApproved, title: "Fully approved", color: "bg-ed-ok" },
  ];
  return (
    <span className="flex items-center gap-1.5">
      {stages.map((stage) => (
        <span
          key={stage.title}
          title={stage.title}
          className={`w-2 h-2 rounded-full ${stage.on ? stage.color : "bg-ed-border-strong"}`}
        />
      ))}
    </span>
  );
}

function ActRailItem({
  act,
  isSinglePass,
  onClick,
}: {
  act: SceneBoardAct;
  isSinglePass: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-ed-hover transition-colors group"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ed-text truncate">
          {isSinglePass ? act.outline.title || "Script" : `Act ${act.outline.actNumber}`}
        </span>
        <span className="text-[11px] font-mono text-ed-text-dim shrink-0">
          {act.narration ? formatClock(act.narration.durationSeconds) : "—"}
        </span>
      </div>
      {!isSinglePass && act.outline.title && (
        <p className="text-[11px] text-ed-text-dim truncate mt-0.5">{act.outline.title}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <PipelineDots progress={act.progress} />
        <span className="text-[11px] text-ed-text-dim">
          {act.scenes.length > 0 ? `${act.scenes.length} sc` : "empty"}
        </span>
      </div>
    </button>
  );
}

/**
 * Agent 3's output, rendered for the first time anywhere in the app.
 *
 * Read-only by design: a blueprint is project-wide, so one edit here would silently
 * restyle every scene in the video. Scene-level mistakes are cheap to fix; this is not.
 */
function CastStrip({ cast }: { cast: SceneBoardData["cast"] }) {
  const [openName, setOpenName] = useState<string | null>(null);

  return (
    <div className="mt-auto border-t border-ed-border p-2">
      <p className="px-1 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ed-text-dim flex items-center gap-1.5">
        <Users size={12} />
        Cast {cast.length > 0 && `· ${cast.length}`}
      </p>

      {cast.length === 0 ? (
        <p className="px-1 pb-1 text-[11px] text-ed-text-dim leading-relaxed">
          Casting runs once, when you approve the first act's visuals.
        </p>
      ) : (
        <div className="space-y-0.5">
          {cast.map((member) => {
            const isOpen = openName === member.name;
            return (
              <div key={member.name}>
                <button
                  onClick={() => setOpenName(isOpen ? null : member.name)}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-ed-hover text-left"
                >
                  {isOpen ? (
                    <ChevronDown size={12} className="text-ed-text-dim shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-ed-text-dim shrink-0" />
                  )}
                  <span className="text-[12px] font-medium text-ed-text-dim truncate">
                    {member.name}
                  </span>
                </button>
                {isOpen && (
                  <dl className="pl-6 pr-1 pb-2 space-y-1.5">
                    {[
                      ["Appearance", member.appearance],
                      ["Wardrobe", member.wardrobe],
                      ["Demeanor", member.demeanor],
                    ].map(([label, value]) =>
                      value ? (
                        <div key={label}>
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-ed-text-dim">
                            {label}
                          </dt>
                          <dd className="text-[11px] text-ed-text-dim leading-relaxed">{value}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Board toolbar                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

function BoardToolbar({
  viewMode,
  onViewMode,
  filter,
  onFilter,
  query,
  onQuery,
  searchRef,
  shownCount,
  totalCount,
  unwrittenActs,
  writingAll,
  scriptingAct,
  onWriteAll,
}: {
  viewMode: ViewMode;
  onViewMode: (v: ViewMode) => void;
  filter: SceneFilter;
  onFilter: (f: SceneFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  shownCount: number;
  totalCount: number;
  unwrittenActs: number;
  writingAll: boolean;
  scriptingAct: number | null;
  onWriteAll: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-ed-border bg-ed-surface shrink-0">
      <div className="flex items-center gap-0.5 bg-ed-well rounded-md p-0.5">
        {(["board", "script"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewMode(mode)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded capitalize transition-colors ${
              viewMode === mode ? "bg-ed-raised text-ed-text shadow-sm" : "text-ed-text-dim hover:text-ed-text"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-ed-border" />

      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onFilter(f.id)}
            className={`text-[12px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${
              filter === f.id
                ? "bg-ed-accent-soft text-ed-accent-text font-bold"
                : "text-ed-text-dim hover:text-ed-text hover:bg-ed-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {shownCount !== totalCount && (
        <span className="text-[12px] text-ed-text-dim">
          {shownCount} of {totalCount}
        </span>
      )}

      {unwrittenActs > 0 && (
        <button
          onClick={onWriteAll}
          disabled={writingAll}
          className="flex items-center gap-1.5 text-[12px] font-bold text-ed-base bg-ed-accent hover:bg-ed-accent-hover disabled:opacity-60 px-3 py-1.5 rounded-md transition-colors"
          title="Writes every act that has no script yet, one after another"
        >
          {writingAll ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {writingAll
            ? scriptingAct !== null
              ? `Writing Act ${scriptingAct}…`
              : "Writing…"
            : `Write ${unwrittenActs} act${unwrittenActs === 1 ? "" : "s"}`}
        </button>
      )}

      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ed-text-faint" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search narration  /"
          className="ed-field w-56 pl-8 pr-2 py-1.5 text-[12px] rounded-md"
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Act header — carries the per-Act pipeline controls                         */
/* ══════════════════════════════════════════════════════════════════════════ */

function ActHeader({
  act,
  isSinglePass,
  scriptingAct,
  recordingAct,
  visualsAct,
  playingAct,
  collapsed,
  copied,
  onToggleCollapse,
  onGenerateScript,
  onRecordAudio,
  onApproveVisuals,
  onRegenerateVisuals,
  onCopyAct,
  onOpenPaste,
  onRewriteAct,
  onPlayState,
  onPlayhead,
}: {
  act: SceneBoardAct;
  isSinglePass: boolean;
  scriptingAct: number | null;
  recordingAct: number | null;
  visualsAct: number | null;
  playingAct: number | null;
  collapsed: boolean;
  copied: boolean;
  onToggleCollapse: () => void;
  onGenerateScript: () => void;
  onRecordAudio: () => void;
  onApproveVisuals: () => void;
  onRegenerateVisuals: () => void;
  onCopyAct: () => void;
  onOpenPaste: () => void;
  onRewriteAct: () => void;
  onPlayState: (isPlaying: boolean) => void;
  onPlayhead: (t: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const actNumber = act.outline.actNumber;
  const isPlaying = playingAct === actNumber;

  const isScripting = scriptingAct === actNumber;
  const isRecording = recordingAct === actNumber;
  const isVisualing = visualsAct === actNumber;
  const busy = isScripting || isRecording || isVisualing;

  // Per-act elapsed timers — each resets independently the moment this act's own flag
  // flips false, whether that's a solo action or its turn ending inside a batch write.
  const scriptElapsed = useElapsedSeconds(isScripting);
  const audioElapsed = useElapsedSeconds(isRecording);
  const visualsElapsed = useElapsedSeconds(isVisualing);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  // Local to this Act's own scrubber — separate from the parent's `playhead`, which
  // only tracks whichever Act is currently playing and resets to 0 the moment it
  // isn't. This one keeps its position so the bar doesn't jump to zero on pause.
  const [scrubTime, setScrubTime] = useState(0);

  // A re-record swaps the audio URL under the same Act — reset to the start rather
  // than showing a scrub position that belonged to the narration that no longer exists.
  useEffect(() => {
    setScrubTime(0);
  }, [act.narration?.audioUrl]);

  const seekTo = (seconds: number) => {
    const el = audioRef.current;
    if (!el || !act.narration) return;
    const clamped = Math.max(0, Math.min(seconds, act.narration.durationSeconds));
    el.currentTime = clamped;
    setScrubTime(clamped);
    if (el.paused) void el.play();
  };

  // Where each scene starts within this Act's narration, walked cumulatively from each
  // scene's own recorded duration — the same boundaries `speakingSceneId` (in the parent)
  // derives its highlight from, so the tick marks land exactly where the highlight moves.
  const sceneStarts = useMemo(() => {
    let elapsed = 0;
    return act.scenes.map((scene) => {
      const startSeconds = elapsed;
      elapsed += scene.durationSeconds;
      return { id: scene.id, sequenceNumber: scene.sequenceNumber, startSeconds };
    });
  }, [act.scenes]);

  // Single-pass (short/mid-form) projects have exactly one "Script" section, so there
  // is nothing to focus on by collapsing it — the whole-row toggle stays Act-only, same
  // as the chevron did before it.
  const collapsible = !isSinglePass;

  return (
    <div
      onClick={collapsible ? onToggleCollapse : undefined}
      title={collapsible ? (collapsed ? "Expand this act's scenes" : "Collapse this act's scenes") : undefined}
      className={`sticky top-0 z-20 backdrop-blur-sm border-b border-ed-border px-4 py-2.5 transition-colors ${
        collapsible ? "cursor-pointer bg-ed-surface/95 hover:bg-ed-hover" : "bg-ed-surface/95"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex items-center gap-2.5">
          {!isSinglePass && (
            // Purely a state indicator now — the whole header row above is the click
            // target, so a second nested button here would double-toggle on click (it
            // fires, then bubbles to the row's own handler right behind it).
            <span className="shrink-0 text-ed-text-dim">
              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-ed-text-dim bg-ed-well px-1.5 py-0.5 rounded shrink-0">
            {isSinglePass ? "Script" : `Act ${actNumber}`}
          </span>
          <h2 className="text-[15px] font-bold text-ed-text truncate">{act.outline.title}</h2>
          {act.scenes.length > 0 && (
            <span className="text-[11px] text-ed-text-dim shrink-0">
              {act.scenes.length} scene{act.scenes.length === 1 ? "" : "s"}
            </span>
          )}
          {act.scenes.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyAct();
              }}
              className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-ed-text-dim hover:text-ed-text px-1.5 py-0.5 rounded transition-colors"
              title="Copy every scene's narration and visual prompt in this act"
            >
              {copied ? <Check size={11} className="text-ed-ok" /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenPaste();
            }}
            className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-ed-text-dim hover:text-ed-text px-1.5 py-0.5 rounded transition-colors"
            title="Paste a rewritten version of this act back in — same Scene / Narration / Visual Prompt format Copy produces"
          >
            <Clipboard size={11} />
            Paste
          </button>
          {act.narration && (
            <span className="text-[12px] font-mono text-ed-text-dim shrink-0">
              {formatClock(act.narration.durationSeconds)}
            </span>
          )}
          {act.progress.isApproved && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-ed-ok bg-ed-ok-soft border border-ed-ok-border px-2 py-0.5 rounded-full shrink-0">
              <CheckCircle2 size={12} />
              Approved
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Audio: play what exists, or record it for the first time. */}
          {act.narration ? (
            <>
              <button
                onClick={togglePlay}
                className="flex items-center gap-1.5 text-[12px] font-bold text-ed-text bg-ed-raised hover:bg-ed-hover px-3 py-1.5 rounded-md transition-colors"
                title="Play this act's narration"
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? "Pause" : "Play"}
              </button>
              <audio
                ref={audioRef}
                src={act.narration.audioUrl}
                onPlay={() => onPlayState(true)}
                onPause={() => onPlayState(false)}
                onEnded={() => onPlayState(false)}
                onTimeUpdate={(e) => {
                  setScrubTime(e.currentTarget.currentTime);
                  if (playingAct === actNumber) onPlayhead(e.currentTarget.currentTime);
                }}
                className="hidden"
              />
              <button
                onClick={onRecordAudio}
                disabled={busy}
                className="flex items-center gap-1.5 text-[12px] font-medium text-ed-text-dim hover:text-ed-text px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40"
                title="Re-record from the current wording"
              >
                {isRecording ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                {isRecording ? `Re-recording… ${audioElapsed}s` : "Re-record"}
              </button>
            </>
          ) : act.scenes.length > 0 ? (
            <button
              onClick={onRecordAudio}
              disabled={busy}
              className="flex items-center gap-1.5 text-[13px] font-bold text-ed-base bg-ed-accent hover:bg-ed-accent-hover px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
            >
              {isRecording ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
              {isRecording ? `Generating audio… ${audioElapsed}s` : "Generate audio"}
            </button>
          ) : (
            <button
              onClick={onGenerateScript}
              disabled={busy}
              className="flex items-center gap-1.5 text-[13px] font-bold text-ed-base bg-ed-accent hover:bg-ed-accent-hover px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
            >
              {isScripting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {isScripting ? `${scriptStageLabel(scriptElapsed)}… ${scriptElapsed}s` : "Write this act"}
            </button>
          )}

          {act.scenes.length > 0 && (
            <button
              onClick={onRewriteAct}
              disabled={busy}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ed-text-dim hover:text-ed-text px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40"
              title="Regenerate this act's script and visual prompts using the channel's current format settings"
            >
              {isScripting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {isScripting ? "Rewriting…" : "Rewrite with AI"}
            </button>
          )}

          {/* Visuals stay locked until narration exists, so real timing drives them. */}
          {act.narration &&
            (act.progress.isApproved ? (
              <button
                onClick={onRegenerateVisuals}
                disabled={busy}
                className="flex items-center gap-1.5 text-[12px] font-medium text-ed-text-dim hover:text-ed-text px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40"
              >
                {isVisualing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {isVisualing ? `Rebuilding visuals… ${visualsElapsed}s` : "Regenerate visuals"}
              </button>
            ) : (
              <button
                onClick={onApproveVisuals}
                disabled={busy}
                className="flex items-center gap-1.5 text-[13px] font-bold text-ed-base bg-ed-ok hover:brightness-110 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
              >
                {isVisualing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {isVisualing ? `Building visuals… ${visualsElapsed}s` : "Approve visuals"}
              </button>
            ))}
        </div>
      </div>

      {act.narration && (
        <div
          className="flex items-center gap-2 mt-2"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] font-mono text-ed-text-dim tabular-nums w-8 text-right shrink-0">
            {formatClock(scrubTime)}
          </span>
          <div className="relative flex-1 h-4 flex items-center">
            {sceneStarts.map(({ id, sequenceNumber, startSeconds }, i) =>
              i === 0 || !act.narration ? null : (
                <button
                  key={id}
                  type="button"
                  onClick={() => seekTo(startSeconds)}
                  title={`Jump to Scene ${sequenceNumber}`}
                  style={{ left: `${(startSeconds / act.narration.durationSeconds) * 100}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-ed-text-faint hover:bg-ed-accent hover:h-3.5 transition-all z-10"
                />
              )
            )}
            <input
              type="range"
              min={0}
              max={act.narration.durationSeconds}
              step={0.01}
              value={scrubTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              title="Scrub this act's narration"
              className="w-full h-1 accent-ed-accent cursor-pointer relative"
            />
          </div>
          <span className="text-[10px] font-mono text-ed-text-dim tabular-nums w-8 shrink-0">
            {formatClock(act.narration.durationSeconds)}
          </span>
        </div>
      )}

      {act.outline.description && (
        <p className="text-[13px] leading-snug text-ed-text-dim mt-1.5 line-clamp-2">
          {act.outline.description}
        </p>
      )}
    </div>
  );
}

function EmptyActBody({
  act,
  filtered,
  isWriting,
}: {
  act: SceneBoardAct;
  filtered: boolean;
  isWriting: boolean;
}) {
  const elapsed = useElapsedSeconds(isWriting);

  if (isWriting) {
    return (
      <div className="rounded-xl border border-dashed border-ed-border py-14 flex flex-col items-center justify-center gap-2.5">
        <Loader2 size={22} className="animate-spin text-ed-accent" />
        <p className="text-[13px] font-medium text-ed-text-dim">{scriptStageLabel(elapsed)}…</p>
        <p className="text-[11px] font-mono text-ed-text-faint tabular-nums">{elapsed}s</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-ed-border py-10 text-center">
      <p className="text-[13px] text-ed-text-dim">
        {filtered
          ? "No scenes in this act match the current filter."
          : act.outline.description
            ? "Not written yet — use “Write this act”."
            : "No scenes yet."}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Scene card                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

function SceneCard({
  scene,
  isSelected,
  isSpeaking,
  onSelect,
}: {
  scene: SceneBoardScene;
  isSelected: boolean;
  isSpeaking: boolean;
  onSelect: () => void;
}) {
  const hasVisuals = scene.finalVideoPrompt.trim().length > 0;
  const failed = /fail|error/i.test(scene.generationStatus);

  const ring = isSelected
    ? "ring-2 ring-ed-accent border-ed-accent"
    : isSpeaking
      ? "ring-2 ring-ed-a1 border-ed-a1"
      : failed
        ? "border-ed-danger/60"
        : hasVisuals
          ? "border-ed-ok/30"
          : "border-ed-border";

  return (
    <button
      data-scene-id={scene.id}
      onClick={onSelect}
      className={`group text-left rounded-xl border bg-ed-raised overflow-hidden transition-all hover:border-ed-border-strong ${ring}`}
    >
      <div className="relative aspect-video bg-ed-media">
        {scene.mediaUrl ? (
          scene.mediaType === "image" ? (
            <img
              src={scene.mediaUrl}
              alt={`Scene ${scene.sequenceNumber}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <video src={scene.mediaUrl} preload="metadata" muted className="w-full h-full object-cover" />
          )
        ) : (
          /* No media yet — say what the scene IS rather than showing a grey box. */
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <Film size={16} className="text-ed-text-faint" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ed-text-dim">
              {scene.sceneType || "scene"}
            </span>
          </div>
        )}

        <span className="absolute top-1.5 left-1.5 bg-ed-base/80 text-ed-text text-[11px] font-bold font-mono px-1.5 py-0.5 rounded">
          {scene.sequenceNumber}
        </span>

        {scene.durationSeconds > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-ed-base/80 text-ed-text-dim text-[11px] font-mono px-1.5 py-0.5 rounded">
            {scene.durationSeconds.toFixed(1)}s
          </span>
        )}

        {failed && (
          <span className="absolute top-1.5 right-1.5 text-ed-danger" title={scene.generationStatus}>
            <AlertTriangle size={12} />
          </span>
        )}
        {!failed && hasVisuals && (
          <span className="absolute top-1.5 right-1.5 text-ed-ok" title="Visual prompt built">
            <Check size={12} />
          </span>
        )}
      </div>

      <p className="px-2.5 py-2.5 text-[12px] leading-snug text-ed-text-dim line-clamp-2 group-hover:text-ed-text transition-colors">
        {scene.voiceOverText || <span className="italic text-ed-text-faint">No narration</span>}
      </p>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Script view — the same scenes as a reading column                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function ScriptView({
  scenes,
  selectedSceneId,
  speakingSceneId,
  isWriting,
  onSelect,
}: {
  scenes: SceneBoardScene[];
  selectedSceneId: string | null;
  speakingSceneId: string | null;
  isWriting: boolean;
  onSelect: (id: string) => void;
}) {
  const words = scenes.reduce((sum, s) => sum + s.voiceOverText.trim().split(/\s+/).filter(Boolean).length, 0);
  const elapsed = useElapsedSeconds(isWriting);

  return (
    <div className="px-8 py-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ed-text-dim mb-3">
        {words} words · {scenes.length} scenes
      </p>

      {scenes.length === 0 ? (
        isWriting ? (
          <div className="rounded-xl border border-dashed border-ed-border py-14 max-w-3xl flex flex-col items-center justify-center gap-2.5">
            <Loader2 size={22} className="animate-spin text-ed-accent" />
            <p className="text-[13px] font-medium text-ed-text-dim">{scriptStageLabel(elapsed)}…</p>
            <p className="text-[11px] font-mono text-ed-text-faint tabular-nums">{elapsed}s</p>
          </div>
        ) : (
          // Previously this rendered nothing below the "0 words · 0 scenes" line — a bare
          // heading over dead space, easy to mistake for a rendering bug rather than an act
          // that simply has not been written yet.
          <div className="rounded-xl border border-dashed border-ed-border py-10 text-center max-w-3xl">
            <p className="text-[13px] text-ed-text-dim">Not written yet — use “Write this act” above.</p>
          </div>
        )
      ) : (
        <div className="max-w-4xl space-y-1.5">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              data-scene-id={scene.id}
              onClick={() => onSelect(scene.id)}
              className={`w-full text-left flex gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                scene.id === selectedSceneId
                  ? "bg-ed-accent-soft ring-1 ring-ed-accent-border"
                  : scene.id === speakingSceneId
                    ? "bg-ed-info-soft"
                    : "hover:bg-ed-raised"
              }`}
            >
              <span className="text-[11px] font-mono text-ed-text-dim pt-0.5 w-6 shrink-0">
                {scene.sequenceNumber}
              </span>
              {/* The actual script — the reason this view exists — was rendered at the
                  same 13px as meta labels elsewhere on the board and on the token that
                  fails contrast. This is the primary reading content of the whole page. */}
              <span className="text-[15px] leading-[1.7] text-ed-text">
                {scene.voiceOverText || <span className="italic text-ed-text-faint">No narration</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Inspector                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

function Inspector({
  scene,
  onClose,
  onNarrationSaved,
  narrationVoiceId,
  voices,
}: {
  scene: SceneBoardScene | null;
  onClose: () => void;
  onNarrationSaved: (sceneId: string, text: string) => void;
  /** The channel's saved voice — see `resolveNarrationSettings` in audio-actions.ts. */
  narrationVoiceId: string;
  voices: Array<{ id: string; name?: string }>;
}) {
  if (!scene) {
    return (
      <aside className="w-[340px] shrink-0 border-l border-ed-border bg-ed-surface flex items-center justify-center">
        <div className="text-center px-8">
          <Film size={22} className="mx-auto text-ed-text-dim mb-2" />
          <p className="text-[13px] text-ed-text-dim leading-relaxed">
            Select a scene to see its narration and everything the agents decided about it.
          </p>
          <p className="text-[11px] text-ed-text-dim mt-3">
            <kbd className="font-sans font-medium bg-ed-raised border border-ed-border rounded px-1.5">j</kbd>{" "}
            /{" "}
            <kbd className="font-sans font-medium bg-ed-raised border border-ed-border rounded px-1.5">k</kbd>{" "}
            to step through
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[340px] shrink-0 border-l border-ed-border bg-ed-surface flex flex-col overflow-y-auto ed-scroll">
      <div className="flex items-center justify-between px-4 h-11 border-b border-ed-border sticky top-0 bg-ed-surface z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-bold text-ed-text">Scene {scene.sequenceNumber}</span>
          {scene.sceneType && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-ed-info bg-ed-info-soft px-1.5 py-0.5 rounded">
              {scene.sceneType}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-ed-text-faint hover:text-ed-text hover:bg-ed-hover transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        <div className="rounded-lg overflow-hidden bg-ed-media aspect-video">
          {scene.mediaUrl ? (
            scene.mediaType === "image" ? (
              <img src={scene.mediaUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <video src={scene.mediaUrl} controls className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-[11px] text-ed-text-dim">No media generated yet</span>
            </div>
          )}
        </div>

        <NarrationEditor scene={scene} onSaved={onNarrationSaved} />

        {/*
          Read-only: this is what "Generate audio" / "Re-record" on this act actually
          uses — set on Settings > Channel, not per-scene or per-project. Shown here so
          reviewing a scene doesn't require leaving the board to confirm which voice its
          audio will come out in.
        */}
        <div className="flex items-center justify-between text-[11px] font-medium text-ed-text-dim bg-ed-well border border-ed-border rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5">
            <Mic size={12} />
            Channel narration voice
          </span>
          <span className="font-bold text-ed-text">
            {narrationVoiceId
              ? (voices.find((v) => v.id === narrationVoiceId)?.name ?? narrationVoiceId)
              : "Auto (Voice Studio default)"}
          </span>
        </div>

        {/* ── Agent output, read-only ──────────────────────────────────────
            Written by the pipeline on every run and, before this panel, displayed
            nowhere. Not editable: see the note at the top of this file. */}
        <AgentField
          icon={<Sparkles size={12} />}
          label="Visual prompt"
          sub="Agent 6 · Prompt Assembler"
          value={scene.finalVideoPrompt}
          empty="Built when you approve this act's visuals."
        />
        <AgentField
          icon={<Trees size={12} />}
          label="Environment"
          sub="Agent 4 · Visual Architect"
          value={scene.environment}
        />
        <AgentField
          icon={<Lightbulb size={12} />}
          label="Lighting"
          sub="Agent 4 · Visual Architect"
          value={scene.lighting}
        />
        <AgentField
          icon={<Camera size={12} />}
          label="Camera"
          sub="Agent 5 · Cinematic Director"
          value={scene.cameraDirection}
        />

        {scene.castNames.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ed-text-dim flex items-center gap-1.5 mb-1.5">
              <Users size={12} />
              Cast in this scene
            </p>
            <div className="flex flex-wrap gap-1">
              {scene.castNames.map((name) => (
                <span
                  key={name}
                  className="text-[11px] font-medium text-ed-text-dim bg-ed-raised border border-ed-border px-2 py-0.5 rounded"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 flex items-center justify-between text-[11px] text-ed-text-dim border-t border-ed-border">
          <span className="pt-2">Status</span>
          <span className="pt-2 font-medium text-ed-text">{scene.generationStatus}</span>
        </div>
      </div>
    </aside>
  );
}

function AgentField({
  icon,
  label,
  sub,
  value,
  empty = "Appears once this act's visuals are approved.",
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  value: string | null;
  empty?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ed-text-dim flex items-center gap-1.5">
          {icon}
          {label}
        </p>
        <span className="text-[10px] text-ed-text-faint shrink-0">{sub}</span>
      </div>
      {value ? (
        <p className="text-[13px] leading-relaxed text-ed-text-dim bg-ed-well border border-ed-border rounded-lg p-3">
          {value}
        </p>
      ) : (
        <p className="text-[11px] italic text-ed-text-faint px-0.5">{empty}</p>
      )}
    </div>
  );
}

/** The one editable field on the board. Saves on blur, same contract as before. */
function NarrationEditor({
  scene,
  onSaved,
}: {
  scene: SceneBoardScene;
  onSaved: (sceneId: string, text: string) => void;
}) {
  const [text, setText] = useState(scene.voiceOverText);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  // Selecting a different scene must reload the textarea; without this the panel would
  // keep showing the previously selected scene's words.
  useEffect(() => {
    setText(scene.voiceOverText);
    setState("idle");
  }, [scene.id, scene.voiceOverText]);

  const handleBlur = async () => {
    if (text === scene.voiceOverText) return;
    setState("saving");
    const result = await updateSceneVoiceover(scene.id, text);
    if (result.success) {
      setState("saved");
      onSaved(scene.id, text);
    } else {
      setState("idle");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ed-text-dim flex items-center gap-1.5">
          <Mic size={12} />
          Narration
        </p>
        {state === "saving" && <Loader2 size={12} className="animate-spin text-ed-text-faint" />}
        {state === "saved" && (
          <span className="text-[11px] font-bold text-ed-ok flex items-center gap-1">
            <Check size={11} />
            Saved
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        onBlur={handleBlur}
        rows={4}
        className="ed-field p-3 text-[14px] leading-relaxed resize-none"
      />
      <p className="text-[11px] text-ed-text-dim mt-1.5 leading-relaxed">
        Re-record this act to hear the change, then regenerate its visuals to rebuild prompts
        from the new wording.
      </p>
    </div>
  );
}
