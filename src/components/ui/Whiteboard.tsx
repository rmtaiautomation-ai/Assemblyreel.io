"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  finalizeProjectScript,
  generateAct,
  regenerateActVisuals,
  updateSceneVoiceover,
  type ActOutline,
  type GeneratedActScene,
} from "@/app/actions/whiteboard-actions";

type ActStatus = "queued" | "generating" | "complete" | "failed";

interface ActCardState {
  outline: ActOutline;
  status: ActStatus;
  scriptLines: string[];
  scenes: GeneratedActScene[];
  warnings: string[];
  error?: string;
}

/** A previously generated Act, as returned by `loadProjectForWhiteboard`. */
export interface ResumedAct {
  outline: ActOutline;
  scriptLines: string[];
  scenes: GeneratedActScene[];
}

export interface WhiteboardProps {
  projectId: string;
  workspaceId: string;
  acts: ActOutline[];
  workspaceTheme: string;
  topic: string;
  narrativeArc: string;
  scriptHook: string;
  visualAesthetic: string;
  targetDuration: string;
  isSinglePass: boolean;
  /**
   * Acts already generated in a previous session. When present, seeds each matching
   * card as "complete" instead of "queued" so mounting this component again — after a
   * refresh, or navigating back from the Timeline — does not re-run acts that already
   * have scenes and burn more of the same rate-limited quota for nothing.
   */
  resumedActs?: ResumedAct[];
  /**
   * Overrides the post-approval navigation. The default behavior pushes to the
   * Timeline route, which is right when this board owns the page — but wrong when
   * it is rendered as a modal from inside the Timeline editor, where that push
   * targets the URL already open and the editor would keep showing pre-approval
   * scenes. The modal passes this to close itself and resync instead.
   */
  onFinalized?: () => void;
}

export default function Whiteboard({
  projectId,
  workspaceId,
  acts,
  workspaceTheme,
  topic,
  narrativeArc,
  scriptHook,
  visualAesthetic,
  targetDuration,
  isSinglePass,
  resumedActs,
  onFinalized,
}: WhiteboardProps) {
  const router = useRouter();
  const [cards, setCards] = useState<ActCardState[]>(() =>
    acts.map((outline) => {
      const resumed = resumedActs?.find((r) => r.outline.actNumber === outline.actNumber);
      return {
        outline,
        status: resumed && resumed.scenes.length > 0 ? "complete" : "queued",
        scriptLines: resumed?.scriptLines ?? [],
        scenes: resumed?.scenes ?? [],
        warnings: [],
      };
    })
  );
  const [expandedActs, setExpandedActs] = useState<Set<number>>(new Set([1]));
  const [isRunning, setIsRunning] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);

  // Guards React 18 StrictMode's double-effect in dev from launching the whole
  // pipeline twice — which would double every Gemini call and the DB rows.
  const hasStartedRef = useRef(false);

  // `runAllActs` needs each act's *current* status to skip already-resumed ones, but
  // adding `cards` to its own dependency array would recreate it — and the mount
  // effect that calls it — on every generation tick. A ref sidesteps that.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const completedCount = cards.filter((card) => card.status === "complete").length;
  const failedCount = cards.filter((card) => card.status === "failed").length;
  const totalScenes = cards.reduce((sum, card) => sum + card.scenes.length, 0);
  const fallbackScenes = cards.reduce(
    (sum, card) => sum + card.scenes.filter((scene) => scene.usedFallback).length,
    0
  );
  const progressPercent = Math.round((completedCount / Math.max(1, cards.length)) * 100);

  const runActAtIndex = useCallback(
    async (index: number, startingSequenceNumber: number): Promise<number> => {
      setCards((prev) =>
        prev.map((card, i) => (i === index ? { ...card, status: "generating", error: undefined } : card))
      );

      const result = await generateAct({
        projectId,
        workspaceTheme,
        topic,
        narrativeArc,
        scriptHook,
        visualAesthetic,
        targetDuration,
        startingSequenceNumber,
        actNumber: acts[index].actNumber,
        ...(isSinglePass ? {} : { act: acts[index] }),
      });

      setCards((prev) =>
        prev.map((card, i) =>
          i === index
            ? {
                ...card,
                status: result.success ? "complete" : "failed",
                scriptLines: result.scriptLines ?? card.scriptLines,
                scenes: result.scenes ?? [],
                warnings: result.warnings,
                error: result.error,
              }
            : card
        )
      );

      return result.scenes?.length ?? 0;
    },
    [
      projectId,
      workspaceTheme,
      topic,
      narrativeArc,
      scriptHook,
      visualAesthetic,
      targetDuration,
      isSinglePass,
      acts,
    ]
  );

  const runAllActs = useCallback(async () => {
    setIsRunning(true);
    let sequenceNumber = 1;

    // Sequential on purpose: acts share the same Gemini quota, and running them in
    // parallel would multiply the rate-limit pressure that already forces scenes to
    // fall back to unenriched prompts.
    for (let i = 0; i < acts.length; i++) {
      const existingCard = cardsRef.current[i];

      // Resumed acts already have their scenes — skip regenerating them, but still
      // count their scenes toward sequence numbering so a later, genuinely-queued act
      // doesn't collide with sequence_number values this act already wrote.
      if (existingCard?.status === "complete") {
        sequenceNumber += existingCard.scenes.length;
        continue;
      }

      const sceneCount = await runActAtIndex(i, sequenceNumber);
      sequenceNumber += sceneCount;
    }

    setIsRunning(false);
  }, [acts.length, runActAtIndex]);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // A fully resumed session (every act already has scenes) has nothing to generate
    // — skip the run entirely rather than a no-op pass through every act.
    const allActsAlreadyComplete = cardsRef.current.every((card) => card.status === "complete");
    if (allActsAlreadyComplete) return;

    void runAllActs();
  }, [runAllActs]);

  const handleRetryAct = async (index: number) => {
    setIsRunning(true);
    // Resume numbering after every act before this one, so a retry cannot collide with
    // sequence numbers already written by its predecessors.
    const priorScenes = cards
      .slice(0, index)
      .reduce((sum, card) => sum + card.scenes.length, 0);
    await runActAtIndex(index, priorScenes + 1);
    setIsRunning(false);
  };

  // Which completed act, if any, is currently having its visuals redone. Separate
  // from `status` on purpose: `status` describes the FULL act (script + slice +
  // visuals), and flipping a complete act back to "generating" would show the
  // full-card "Running the 7-agent chain" spinner, implying the narration is being
  // rewritten when it deliberately is not.
  const [regeneratingVisualsIndex, setRegeneratingVisualsIndex] = useState<number | null>(null);

  const handleRegenerateVisuals = async (index: number) => {
    const card = cards[index];
    if (!card || card.scenes.length === 0) return;

    setRegeneratingVisualsIndex(index);

    const result = await regenerateActVisuals({
      projectId,
      actNumber: card.outline.actNumber,
      topic,
      visualAesthetic,
      nicheTheme: workspaceTheme,
    });

    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        if (result.success && result.scenes) {
          return { ...c, scenes: result.scenes, warnings: result.warnings };
        }
        return { ...c, warnings: [...c.warnings, result.error ?? "Visual regeneration failed."] };
      })
    );

    setRegeneratingVisualsIndex(null);
  };

  const handleApproveAll = async () => {
    const result = await finalizeProjectScript({
      projectId,
      acts: cards.map((card) => ({
        actNumber: card.outline.actNumber,
        title: card.outline.title,
        scriptLines: card.scriptLines,
      })),
    });

    if (result.success) {
      setIsFinalized(true);
      if (onFinalized) {
        onFinalized();
      } else {
        router.push(`/workspaces/${workspaceId}/videos/${projectId}`);
      }
    }
  };

  const toggleAct = (actNumber: number) => {
    setExpandedActs((prev) => {
      const next = new Set(prev);
      if (next.has(actNumber)) {
        next.delete(actNumber);
      } else {
        next.add(actNumber);
      }
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Progress header */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="text-purple-600" size={22} />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scene Board</h2>
              <p className="text-xs text-gray-500">
                {isSinglePass ? "Single-pass generation" : `${acts.length} Acts`} ·{" "}
                {totalScenes} scenes generated
              </p>
            </div>
          </div>

          <button
            onClick={handleApproveAll}
            disabled={isRunning || completedCount === 0 || isFinalized}
            className="bg-gray-900 hover:bg-gray-800 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            {isFinalized ? "Approved" : onFinalized ? "Approve & Close" : "Approve & Open Timeline"}
          </button>
        </div>

        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-medium text-gray-600">
            {completedCount} of {cards.length} acts complete
            {failedCount > 0 && ` · ${failedCount} failed`}
          </span>
          <span className="text-xs font-bold text-purple-600">{progressPercent}%</span>
        </div>

        {fallbackScenes > 0 && (
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <strong>{fallbackScenes} of {totalScenes} scenes</strong> kept the basic slicer
              prompt because the full agent chain could not run — almost always the Gemini
              free-tier limit of 5 requests/minute. Those scenes still work, but skipped the
              Casting Director, Cinematic Director and Safety Officer.
            </p>
          </div>
        )}
      </div>

      {/* Act cards */}
      {cards.map((card, index) => {
        const isExpanded = expandedActs.has(card.outline.actNumber);
        return (
          <div
            key={card.outline.actNumber}
            className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
          >
            <button
              onClick={() => toggleAct(card.outline.actNumber)}
              className="w-full flex items-center justify-between gap-4 p-5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {isExpanded ? (
                  <ChevronDown size={18} className="text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight size={18} className="text-gray-400 shrink-0" />
                )}
                <StatusBadge status={card.status} />
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">
                    {isSinglePass ? card.outline.title : `Act ${card.outline.actNumber}: ${card.outline.title}`}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">{card.outline.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {card.scenes.length > 0 && (
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                    {card.scenes.length} scenes
                  </span>
                )}
                {card.status === "complete" && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Redo this act's visuals using its current scene text — narration edits are kept, only agents 3-7 (casting, camera, safety) re-run"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (regeneratingVisualsIndex === null && !isRunning) {
                        void handleRegenerateVisuals(index);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && regeneratingVisualsIndex === null && !isRunning) {
                        e.stopPropagation();
                        void handleRegenerateVisuals(index);
                      }
                    }}
                    aria-disabled={regeneratingVisualsIndex !== null || isRunning}
                    className={`text-xs border px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 ${
                      regeneratingVisualsIndex !== null || isRunning
                        ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 cursor-pointer"
                    }`}
                  >
                    {regeneratingVisualsIndex === index ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {regeneratingVisualsIndex === index ? "Regenerating…" : "Regenerate visuals"}
                  </span>
                )}
                {card.status === "failed" && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRetryAct(index);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        void handleRetryAct(index);
                      }
                    }}
                    className="text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    Retry
                  </span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/40">
                {card.error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
                    {card.error}
                  </div>
                )}

                {card.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3 space-y-1">
                    {card.warnings.map((warning, i) => (
                      <p key={i}>· {warning}</p>
                    ))}
                  </div>
                )}

                {card.status === "generating" && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                    <Loader2 size={16} className="animate-spin text-purple-600" />
                    Running the 7-agent chain for this act…
                  </div>
                )}

                {card.scenes.length > 0 && (
                  <ActScenes scenes={card.scenes} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: ActStatus }) {
  const config = {
    queued: { label: "Queued", className: "bg-gray-100 text-gray-600", icon: null },
    generating: {
      label: "Generating",
      className: "bg-purple-100 text-purple-700",
      icon: <Loader2 size={11} className="animate-spin" />,
    },
    complete: {
      label: "Complete",
      className: "bg-green-100 text-green-700",
      icon: <Check size={11} />,
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-700",
      icon: <AlertTriangle size={11} />,
    },
  }[status];

  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1 shrink-0 ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/**
 * Scene rows are the narration the user will hear, so the voiceover text is editable
 * and saved per scene — editing one scene never touches its neighbours.
 */
function ActScenes({ scenes }: { scenes: GeneratedActScene[] }) {
  const [showPrompts, setShowPrompts] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Narration &amp; Scenes
        </h4>
        <button
          onClick={() => setShowPrompts((prev) => !prev)}
          className="text-[11px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
        >
          <Sparkles size={11} />
          {showPrompts ? "Hide" : "Show"} AI visual prompts
        </button>
      </div>

      {scenes.map((scene) => (
        <SceneRow key={scene.id} scene={scene} showPrompt={showPrompts} />
      ))}
    </div>
  );
}

function SceneRow({ scene, showPrompt }: { scene: GeneratedActScene; showPrompt: boolean }) {
  const [text, setText] = useState(scene.voiceOverText);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const handleBlur = async () => {
    if (text === scene.voiceOverText) return;
    setSaveState("saving");
    const result = await updateSceneVoiceover(scene.id, text);
    setSaveState(result.success ? "saved" : "idle");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-gray-100 text-gray-600 text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-md shrink-0">
          {scene.sequenceNumber}
        </span>
        {scene.sceneType && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            {scene.sceneType}
          </span>
        )}
        <span className="text-[10px] text-gray-400">
          {scene.estimatedDurationSeconds}s
        </span>
        {scene.usedFallback && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            Basic prompt
          </span>
        )}
        {saveState === "saving" && (
          <Loader2 size={11} className="animate-spin text-gray-400" />
        )}
        {saveState === "saved" && <Check size={11} className="text-green-600" />}
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaveState("idle");
        }}
        onBlur={handleBlur}
        rows={2}
        className="w-full bg-gray-50/60 border border-gray-200 rounded-lg p-2.5 text-sm text-gray-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 resize-none"
      />

      {showPrompt && (
        <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-2.5">
          <span className="font-bold text-gray-600">Visual prompt: </span>
          {scene.finalVideoPrompt || "(none)"}
        </p>
      )}
    </div>
  );
}
