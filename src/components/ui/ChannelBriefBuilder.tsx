"use client";

import React, { useState } from "react";
import { CHANNEL_BRIEF_BOXES, CHANNEL_BRIEF_LLM_PROMPT } from "@/lib/ai/channel-brief";
import { generateFormatFromBrief } from "@/app/actions/format-actions";
import { addExtractedFacts } from "@/app/actions/fact-actions";
import type { FormatProfile } from "@/lib/ai/format-profile";

/**
 * Builds a channel's whole format from a written brief.
 *
 * The Channel Format tab below this shipped as twenty-five empty controls, which asks the
 * user to hand-derive a format spec from a blank form — research work, not settings work.
 * This is the way in: paste research or a brainstorm, get a complete profile, review it in
 * the form underneath.
 *
 * Laid out as two columns on desktop — the paste box and the six-box guide side by side,
 * rather than the guide hidden behind a toggle below the box. The settings-page redesign
 * freed enough width that there's no longer a reason to hide the guide by default; showing
 * it removes a click for a first-time user who genuinely doesn't know what to write.
 *
 * ## Gaps, and why answering them re-runs the whole analysis
 *
 * The analyst reports every field it had to infer rather than extract. Answering a gap
 * appends the question and answer to the source text and calls the SAME action again,
 * rather than patching the single field the gap named. That is deliberate: an answer about
 * how videos end can legitimately change the cold open and the act cycle too, and a targeted
 * patch would leave those stale. Re-running keeps one code path and one source of truth, and
 * the analysis is cheap enough that the extra call does not matter.
 *
 * ## "Use AI's guesses"
 *
 * The guessed values are already sitting in the profile the moment generation finishes —
 * `onGenerated` applies the full profile immediately, gaps are reported alongside it, not
 * instead of it, and Save works regardless of whether any gap was ever answered. So this
 * button needs no server call and no new state beyond "the gap panel is dismissed": it is
 * exactly as valid a choice as answering, just faster when the guesses are already good.
 */

const inputClass =
  "ed-field px-3 py-2 text-sm";

export interface ChannelBriefBuilderProps {
  workspaceId: string;
  /** Called with the generated profile so the form below can adopt it for review. */
  onGenerated: (profile: FormatProfile) => void;
  /** True when db/add-channel-blueprint.sql has not run — generation works, saving will not. */
  disabled?: boolean;
}

/**
 * One reported gap, plus a row id.
 *
 * `boxId` is NOT unique: one brief box routinely yields several gaps — cold open duration,
 * re-hook interval, terminal revelation and required beats are all "chapter". Keying the
 * inputs by boxId collided every one of them onto a single answer, so typing in one chapter
 * field filled all the others, and React saw duplicate keys.
 */
interface Gap {
  boxId: string;
  followUp: string;
  uid: string;
}

export default function ChannelBriefBuilder({
  workspaceId,
  onGenerated,
  disabled = false,
}: ChannelBriefBuilderProps) {
  const [source, setSource] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [gapsDismissed, setGapsDismissed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [factCount, setFactCount] = useState(0);
  const [factsError, setFactsError] = useState<string | null>(null);

  async function run(text: string) {
    setState("working");
    setError(null);

    const result = await generateFormatFromBrief(workspaceId, text);

    if (!result.success || !result.profile) {
      setState("error");
      setError(result.error ?? "Could not build a format from that text.");
      return;
    }

    onGenerated(result.profile);
    setGaps((result.gaps ?? []).map((gap, i) => ({ ...gap, uid: `${i}-${gap.boxId}` })));
    setGapsDismissed(false);
    setAnswers({});

    // The same paste feeds the Fact Archivist, and what it found is persisted right here
    // rather than waiting on the Save below. Two reasons: every extracted row lands
    // unverified, so nothing it writes can reach a script until a human ticks it — and
    // answering a gap re-runs this whole function, which would otherwise discard the
    // extraction each time. `addExtractedFacts` appends and de-duplicates by name, so a
    // rebuild adds only what the revised brief newly mentions.
    if (result.facts?.length) {
      const saved = await addExtractedFacts(workspaceId, result.facts);
      setFactCount(saved.success ? result.facts.length : 0);
      setFactsError(saved.success ? null : saved.error ?? null);
    } else {
      setFactCount(0);
      setFactsError(result.factsError ?? null);
    }

    setState("done");
  }

  function handleCopyPrompt() {
    navigator.clipboard.writeText(CHANNEL_BRIEF_LLM_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /**
   * Folds the answered gaps back into the source as plain Q&A prose.
   *
   * The analyst reads prose, so appending it in the same register as the rest of the brief
   * needs no special parsing on the way back in — and it means the stored `sourceBrief`
   * accumulates the user's clarifications rather than losing them.
   */
  function handleAnswerGaps() {
    const answered = gaps
      .filter((gap) => (answers[gap.uid] ?? "").trim())
      .map((gap) => `${gap.followUp}\n${answers[gap.uid].trim()}`);

    if (!answered.length) return;

    const enriched = `${source.trim()}\n\nAdditional detail:\n\n${answered.join("\n\n")}`;
    setSource(enriched);
    void run(enriched);
  }

  const answeredCount = gaps.filter((gap) => (answers[gap.uid] ?? "").trim()).length;
  const working = state === "working";
  const showGapPanel = state === "done" && gaps.length > 0 && !gapsDismissed;

  return (
    <div className="mb-8 rounded-xl border border-ed-accent/25 bg-ed-accent/[0.04] p-6">
      <h3 className="text-lg font-bold text-ed-text mb-1">Build this channel&apos;s format</h3>
      <p className="text-sm text-ed-text-dim mb-4">
        Paste your research, your notes, or a brainstorm from another AI. This fills in
        everything below — you review it, correct anything wrong, then save. You only do this
        once per channel.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        <div>
          <textarea
            className={`${inputClass} font-normal`}
            rows={12}
            value={source}
            disabled={working}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. The channel unveils suppressed knowledge. The narrator is an archivist working through recovered documents, never a preacher. Every chapter opens on a physical artifact, states what it contains, names who removed it and when…"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void run(source)}
              disabled={working || source.trim().length < 80}
              className="rounded-lg bg-ed-accent px-4 py-2 text-sm font-semibold text-ed-base disabled:opacity-40"
            >
              {working ? "Reading your brief…" : "Build my channel format"}
            </button>

            {source.trim().length > 0 && source.trim().length < 80 && (
              <span className="text-xs text-ed-text-dim">
                A few paragraphs, please — there is not enough here to build a format from.
              </span>
            )}
          </div>

          {state === "error" && error && (
            <p className="mt-3 rounded-lg border border-ed-danger-border bg-ed-danger-soft px-3 py-2 text-sm text-ed-danger">
              {error}
            </p>
          )}

          {state === "done" && (
            <>
              <p className="mt-3 rounded-lg border border-ed-ok-border bg-ed-ok-soft px-3 py-2 text-sm text-ed-ok">
                Format built and filled in below.{" "}
                {gaps.length === 0
                  ? "Your brief covered everything — review it and save."
                  : gapsDismissed
                    ? "Using the AI's guesses for what your brief didn't cover."
                    : "Read it through, answer the questions below, then save."}
              </p>

              {factCount > 0 && (
                <p className="mt-2 rounded-lg border border-ed-border bg-ed-surface px-3 py-2 text-sm text-ed-text-dim">
                  Also found{" "}
                  <strong className="text-ed-text">
                    {factCount === 1 ? "1 named source" : `${factCount} named sources`}
                  </strong>{" "}
                  in this brief. They are waiting in the <strong>Facts</strong> tab, switched
                  off until you confirm each one is real — until then your scripts name
                  nobody.
                </p>
              )}

              {factsError && (
                <p className="mt-2 rounded-lg border border-ed-warn-border bg-ed-warn-soft px-3 py-2 text-sm text-ed-warn">
                  The format is fine, but the source list could not be built: {factsError}
                </p>
              )}
            </>
          )}
        </div>

        {/* --- The six-box guide, visible by default beside the paste box --------- */}
        <div className="rounded-lg border border-ed-border bg-ed-surface p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-sm text-ed-text-dim">
              Your brief should answer these six. Anything you miss, the AI will guess and
              then ask you about.
            </p>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="shrink-0 rounded-lg border border-ed-accent px-3 py-1.5 text-xs font-semibold text-ed-accent"
            >
              {copied ? "Copied" : "Copy prompt for ChatGPT"}
            </button>
          </div>

          <ol className="space-y-3">
            {CHANNEL_BRIEF_BOXES.map((box, i) => (
              <li key={box.id} className="text-sm">
                <span className="font-semibold text-ed-text">
                  {i + 1}. {box.label}
                </span>
                <span className="text-ed-text-dim"> — {box.question}</span>
                <p className="mt-0.5 text-xs text-ed-text-dim italic">
                  e.g. &ldquo;{box.example}&rdquo;
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* --- Gap follow-ups, full width below both columns ---------------------- */}
      {showGapPanel && (
        <div className="mt-4 rounded-lg border border-ed-warn-border bg-ed-warn-soft p-4">
          <p className="text-sm font-semibold text-ed-warn mb-1">
            {gaps.length === 1
              ? "Your brief didn't cover one thing, so I guessed:"
              : `Your brief didn't cover ${gaps.length} things, so I guessed:`}
          </p>
          <p className="text-xs text-ed-warn mb-3">
            The format below already works. Answer any of these to replace a guess with your
            own decision, or skip straight to saving.
          </p>

          {/* Short answers (seconds, yes/no, one sentence), so a 2-3 column grid fits
              more on screen than one full-width input per question. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {gaps.map((gap) => (
              <div key={gap.uid}>
                <label className="block mb-1 text-sm font-medium text-ed-warn">
                  {gap.followUp}
                </label>
                <input
                  type="text"
                  className={inputClass}
                  value={answers[gap.uid] ?? ""}
                  disabled={working}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [gap.uid]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleAnswerGaps}
              disabled={working || answeredCount === 0}
              className="rounded-lg bg-ed-warn px-4 py-2 text-sm font-semibold text-ed-base disabled:opacity-40"
            >
              {working
                ? "Rebuilding…"
                : answeredCount === 0
                  ? "Answer at least one to rebuild"
                  : `Rebuild with ${answeredCount === 1 ? "this answer" : `these ${answeredCount} answers`}`}
            </button>

            <button
              type="button"
              onClick={() => setGapsDismissed(true)}
              disabled={working}
              className="rounded-lg border border-ed-warn-border px-4 py-2 text-sm font-semibold text-ed-warn disabled:opacity-40"
            >
              Use AI&apos;s guesses
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
