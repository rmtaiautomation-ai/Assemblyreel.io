"use client";

import React, { useMemo, useState } from "react";
import {
  FORMAT_PRESETS,
  SELECTABLE_FORMAT_PRESET_KEYS,
  mergeFormatProfile,
  type FormatPresetKey,
  type FormatProfile,
} from "@/lib/ai/format-profile";
import ChannelBriefBuilder from "@/components/ui/ChannelBriefBuilder";
import { diffFormatProfile, isFieldModified } from "@/lib/ai/format-profile-diff";
import { buildActStructureRules, buildScriptWriterSystemInstruction } from "@/lib/ai/format-prompt";
import { SCENE_TYPES, type SceneType } from "@/lib/ai/generation-rules";
import type { ChannelFact } from "@/lib/ai/channel-facts";
import { saveWorkspaceFormatProfile } from "@/app/actions/format-actions";

/**
 * The editable Channel Blueprint tab. (implementation_plans/18-channel-blueprint.md, Phase 5)
 *
 * The form edits a COMPLETE `FormatProfile` — there is no such thing as an input bound
 * to "undefined, deferring to the preset". `diffFormatProfile` reduces that back to the
 * diff-only shape `workspaces.format_blueprint` actually stores, at save time and for
 * every "modified from preset" badge. See that module's doc comment for why the two
 * shapes have to stay in sync section by section.
 */

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Splits a textarea's lines into a trimmed, non-empty string array for list fields. */
function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Arc beats as one editable line each: `position | id | instruction`.
 *
 * A textarea rather than a repeater of three inputs per beat, to match every other list
 * field on this page — and because the ordering that matters here is the `position`
 * number, not the row order, so drag-to-reorder would be a lie.
 */
function arcBeatsToText(beats: FormatProfile["structure"]["arcBeats"]): string {
  return beats.map((b) => `${b.position} | ${b.id} | ${b.instruction}`).join("\n");
}

function textToArcBeats(text: string): FormatProfile["structure"]["arcBeats"] {
  return linesToList(text).flatMap((line) => {
    // Split on the first two separators only: an instruction is free prose and may well
    // contain a pipe of its own.
    const [rawPosition, rawId, ...rest] = line.split("|");
    const instruction = rest.join("|").trim();
    const position = Number(rawPosition?.trim());

    // Drop a half-typed row rather than writing a NaN position or an empty instruction
    // into the profile — assignArcBeats clamps NaN to Act 1, which would silently move a
    // beat rather than showing the user their line is incomplete.
    if (!Number.isFinite(position) || !rawId?.trim() || !instruction) return [];

    return [{ position, id: rawId.trim(), instruction }];
  });
}

/**
 * Beats as one editable line each: `id | weight | apparatus | signpost | instruction`.
 *
 * Row order IS the meaning here — unlike `arcBeats`, whose fractional positions make the
 * textarea's order a lie — so this is the one list on the page where moving a line moves
 * the beat. Split on the first four separators only: an instruction is free prose and will
 * contain punctuation of its own.
 */
function beatSheetToText(beats: FormatProfile["structure"]["beatSheet"]): string {
  return beats
    .map((b) =>
      [b.id, b.weight ?? 1, b.apparatus ? "A" : "-", b.signpost ?? "", b.instruction].join(" | ")
    )
    .join("\n");
}

function textToBeatSheet(text: string): FormatProfile["structure"]["beatSheet"] {
  return linesToList(text).flatMap((line) => {
    const [rawId, rawWeight, rawApparatus, rawSignpost, ...rest] = line.split("|");
    const instruction = rest.join("|").trim();
    const id = rawId?.trim();

    // Drop a half-typed row rather than writing an empty instruction into the profile: a
    // beat with no instruction still consumes an Act's slot and would silently produce a
    // stretch of narration with nothing telling it what to do.
    if (!id || !instruction) return [];

    const weight = Number(rawWeight?.trim());
    const signpost = rawSignpost?.trim();

    return [
      {
        id,
        instruction,
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
        apparatus: rawApparatus?.trim().toUpperCase() === "A",
        ...(signpost ? { signpost } : {}),
      },
    ];
  });
}

/**
 * The Act the read-only preview renders, and out of how many.
 *
 * Fixed rather than derived, because a format is edited here once for the whole channel
 * while Act count is chosen per video (5 for a 10-15m runtime, 11 for 25-30m). Five is the
 * smallest long-form tier, so every arc beat a channel declares is guaranteed to have
 * somewhere to land in the preview.
 */
const PREVIEW_ACT_COUNT = 5;
const PREVIEW_ACT_NUMBER = 3;

const inputClass =
  "ed-field px-3 py-2 text-sm";
const labelClass = "block mb-1.5 text-sm font-medium text-ed-text";
const hintClass = "text-xs text-ed-text-dim mt-1";
const groupClass = "space-y-4";
const subheadingClass = "text-lg font-bold text-ed-text mb-1";

function ModifiedBadge({ modified }: { modified: boolean }) {
  if (!modified) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-ed-accent/10 px-2 py-0.5 text-[11px] font-semibold text-ed-accent align-middle">
      modified from preset
    </span>
  );
}

function Field({
  label,
  modified,
  hint,
  children,
}: {
  label: string;
  modified: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        <ModifiedBadge modified={modified} />
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

export interface ChannelFormatSectionProps {
  workspaceId: string;
  /** Resolved on the server via getWorkspaceFormatProfile — preset + override merged. */
  initialProfile: FormatProfile;
  initialPresetKey: string | null;
  /** True when db/add-channel-blueprint.sql has not been run against this database yet. */
  migrationPending: boolean;
  /**
   * The channel's VERIFIED facts, for the preview only.
   *
   * The preview panel below claims to show "the exact system instruction", and without
   * these it silently omits the NAMED SOURCES block that generation actually sends —
   * the largest block in the prompt for a channel with a populated ledger. The ledger is
   * edited on the Facts tab, not here; this is read-only context so the preview does not
   * lie about what the writer receives.
   */
  verifiedFacts?: readonly ChannelFact[];
}

export default function ChannelFormatSection({
  workspaceId,
  initialProfile,
  initialPresetKey,
  migrationPending,
  verifiedFacts,
}: ChannelFormatSectionProps) {
  // The starting preset for "modified from preset" comparisons. Does NOT change when
  // the user edits fields — only when they explicitly pick a different preset from the
  // dropdown, which also resets `profile` below to match.
  const [presetKey, setPresetKey] = useState<FormatPresetKey>(
    (initialPresetKey && initialPresetKey in FORMAT_PRESETS
      ? initialPresetKey
      : initialProfile.key) as FormatPresetKey
  );
  const [profile, setProfile] = useState<FormatProfile>(() => deepClone(initialProfile));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const preset = FORMAT_PRESETS[presetKey];

  function update(mutate: (draft: FormatProfile) => void) {
    setProfile((prev) => {
      const draft = deepClone(prev);
      mutate(draft);
      return draft;
    });
    setSaveState("idle");
  }

  function handlePresetChange(nextKey: FormatPresetKey) {
    setPresetKey(nextKey);
    setProfile(deepClone(FORMAT_PRESETS[nextKey]));
    setSaveState("idle");
  }

  /**
   * Adopts a profile the Format Analyst just built.
   *
   * Switches the comparison preset to `custom` as well as the form state, so the "modified
   * from preset" badges compare against custom's near-empty base rather than against
   * whichever shipped preset happened to be selected before. Without that every single
   * field would light up as modified, which tells the user nothing.
   *
   * Nothing is written here — the user still has to press Save, which is the whole point of
   * generating into a review screen rather than straight into the database.
   */
  function handleGenerated(generated: FormatProfile) {
    setPresetKey("custom");
    setProfile(deepClone(generated));
    setSaveState("idle");
    setSaveError(null);
  }

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const override = diffFormatProfile(profile, preset);
    const result = await saveWorkspaceFormatProfile(workspaceId, {
      presetKey,
      blueprintOverride: override,
    });
    if (result.success) {
      setSaveState("saved");
    } else {
      setSaveState("error");
      setSaveError(result.error ?? "Save failed.");
    }
  }

  // Preview reflects the resolved profile it would ACTUALLY produce (preset + this
  // session's unsaved edits merged), not the raw form state — the two only differ for
  // fields the user cleared back to empty, where merge would fall through to the preset.
  const previewProfile = useMemo(
    () => mergeFormatProfile(preset, diffFormatProfile(profile, preset)),
    [profile, preset]
  );
  const previewInstruction = useMemo(
    () =>
      buildScriptWriterSystemInstruction(previewProfile, {
        lengthRule: "[the runtime-tier word budget the user picks per video]",
        facts: verifiedFacts,
        // A middle Act rather than the first or last, because it is the only position that
        // shows BOTH halves of the once-only machinery at once: Act 3 of 5 carries no arc
        // beat itself, so every beat the channel declares appears in its "belongs to other
        // Acts" list. Previewing Act 1 would hide most of them behind a beat it happens to
        // own. See PREVIEW_ACT_COUNT for why the count is fixed.
        actNumber: PREVIEW_ACT_NUMBER,
        actCount: PREVIEW_ACT_COUNT,
      }),
    [previewProfile, verifiedFacts]
  );
  const previewActRules = useMemo(
    () => buildActStructureRules(previewProfile, PREVIEW_ACT_COUNT),
    [previewProfile]
  );

  return (
    <section className="glass-panel p-8">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-xl font-bold text-ed-text">Channel Format</h2>
          <p className="text-muted mb-2">
            The narrator, structure and rules every video this channel generates follows.
            Edits here reach the Script Writer, Scene Slicer and voice settings directly —
            nothing about this format is hardcoded in the app.
          </p>
        </div>
      </div>

      {migrationPending && (
        <div className="mb-6 rounded-lg border border-ed-warn-border bg-ed-warn-soft px-4 py-3 text-sm text-ed-warn">
          <strong>Not yet enabled for this database.</strong> Run{" "}
          <code className="font-mono">db/add-channel-blueprint.sql</code> in the Supabase
          SQL editor, then reload this page — until then this channel keeps generating
          under its legacy niche-keyword behaviour and this tab cannot save.
        </div>
      )}

      <ChannelBriefBuilder
        workspaceId={workspaceId}
        onGenerated={handleGenerated}
        disabled={migrationPending}
      />

      <div className="mb-8">
        <label className={labelClass}>Starting Preset</label>
        <select
          className={inputClass}
          value={presetKey}
          onChange={(e) => handlePresetChange(e.target.value as FormatPresetKey)}
        >
          {/* `custom` is never offered here — it is not a format you pick, it is where a
              generated one lands. Selecting it would reset the form to general's empty
              defaults, the opposite of what its label promises. It still renders as the
              current value below when the workspace is on it. */}
          {SELECTABLE_FORMAT_PRESET_KEYS.map((key) => (
            <option key={key} value={key}>
              {FORMAT_PRESETS[key].label}
            </option>
          ))}
          {presetKey === "custom" && (
            <option value="custom">{FORMAT_PRESETS.custom.label}</option>
          )}
        </select>
        <p className={hintClass}>
          {presetKey === "custom"
            ? "This channel runs a format built from your own brief. Picking a shipped preset here replaces it."
            : "Resets every field below to this preset's defaults. Pick one, then edit only what this channel should do differently."}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8 items-start">
      <div className="space-y-10 min-w-0">
        {/* --- Identity --------------------------------------------------------- */}
        <div className={groupClass}>
          <h3 className={subheadingClass}>Identity</h3>
          <Field
            label="Narrator Persona"
            modified={isFieldModified(profile.identity.narratorPersona, preset.identity.narratorPersona)}
            hint="Who is speaking. Left blank, the Script Writer gets no persona instruction at all."
          >
            <input
              className={inputClass}
              value={profile.identity.narratorPersona}
              onChange={(e) => update((d) => (d.identity.narratorPersona = e.target.value))}
              placeholder="e.g. an archivist working through recovered documents"
            />
          </Field>
          <Field
            label="How This Narrator Explains"
            modified={isFieldModified(
              profile.identity.explanatoryMethod,
              preset.identity.explanatoryMethod
            )}
            hint="The reasoning move repeated for every claim. This decides what gets SAID, not how it sounds — a channel with no explanatory method produces generic narration in your narrator's voice."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.explanatoryMethod}
              onChange={(e) => update((d) => (d.identity.explanatoryMethod = e.target.value))}
              placeholder="e.g. Explain by evidence chain: point at an object, say what it contains, name who removed it and when, then show what it resembles today."
            />
          </Field>
          <Field
            label="How This Narrator Speaks To You"
            modified={isFieldModified(
              profile.identity.audienceStance,
              preset.identity.audienceStance
            )}
            hint={
              'The narrator\'s relationship to the VIEWER — confiding and direct, or purely expository. A narrator can get persona, reasoning and register all right and still read as a report if this is blank: nothing in the script speaks TO whoever is listening. Compiled with a fixed rule that "you" and "we" must recur every Act, not just once.'
            }
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.audienceStance}
              onChange={(e) => update((d) => (d.identity.audienceStance = e.target.value))}
              placeholder='e.g. Speak to the viewer directly as "you" throughout, and frame the shared work as "we" — an investigation the two of you are running together. When a claim would make a skeptical viewer doubt it, state its truth plainly before they can raise the doubt themselves.'
            />
          </Field>
          <Field
            label="Register"
            modified={isFieldModified(profile.identity.register, preset.identity.register)}
            hint="The tone every line is written in — the single highest-leverage field here."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.register}
              onChange={(e) => update((d) => (d.identity.register = e.target.value))}
            />
          </Field>
          <Field
            label="How The Source Sounds"
            modified={isFieldModified(
              profile.identity.sourceRegister,
              preset.identity.sourceRegister
            )}
            hint="Register describes the NARRATOR. This describes the voice they are quoting. Leave blank unless the two genuinely differ — but an urgent narrator reading a deadpan source is a different thing from one voice doing both, and without this the model writes the source with the narrator's urgency."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.sourceRegister}
              onChange={(e) => update((d) => (d.identity.sourceRegister = e.target.value))}
            />
          </Field>
          <Field
            label="What A Named Person Is For"
            modified={isFieldModified(
              profile.identity.characterRule,
              preset.identity.characterRule
            )}
            hint="Without this a channel with a source ledger produces a bibliography: every name correct, no name doing anything. State what a name must carry — a choice, a motive, a consequence."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.characterRule}
              onChange={(e) => update((d) => (d.identity.characterRule = e.target.value))}
            />
          </Field>
          <Field
            label="Registers To Avoid"
            modified={isFieldModified(
              profile.identity.forbiddenRegisters,
              preset.identity.forbiddenRegisters
            )}
            hint="One per line. Negative constraints — what the narration must never sound like."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.identity.forbiddenRegisters.join("\n")}
              onChange={(e) =>
                update((d) => (d.identity.forbiddenRegisters = linesToList(e.target.value)))
              }
            />
          </Field>
        </div>

        {/* --- Delivery -------------------------------------------------------- */}
        {/*
          Split out of Identity on purpose, mirroring the DeliverySpec / FormatIdentity
          split in format-profile.ts: Register above is prose the writer reads, these two
          are numbers a synthesiser and the Scene Slicer read. They live here rather than
          on the Channel tab because they describe how the narration is PERFORMED, which
          is a property of the format, not of the channel's default voice.

          Only the two fields that are actually honoured today are exposed. The
          ElevenLabs stability/similarity knobs are omitted because TTS_PROVIDER defaults
          to "local"; pauseBeforeRevelationMs and quotationStyle are omitted because
          format-profile.ts documents them as not yet applied, and a control that changes
          nothing is worse than no control.
        */}
        <div className={groupClass}>
          <h3 className={subheadingClass}>Delivery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Narration Pace (words per minute)"
              modified={isFieldModified(
                profile.delivery.wordsPerMinute,
                preset.delivery.wordsPerMinute
              )}
              hint="How the Scene Slicer converts a line of script into an estimated on-screen duration. Lower it for a slower, heavier read."
            >
              <input
                type="number"
                min={60}
                max={260}
                className={inputClass}
                value={profile.delivery.wordsPerMinute}
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.delivery.wordsPerMinute =
                        Number(e.target.value) || preset.delivery.wordsPerMinute)
                  )
                }
              />
            </Field>
            <Field
              label="Voice Speed"
              modified={isFieldModified(
                profile.delivery.localTts.speed,
                preset.delivery.localTts.speed
              )}
              hint="Passed straight to your local Voice Studio. 1.0 is the engine's natural rate; leave blank to let the engine decide."
            >
              <input
                type="number"
                min={0.5}
                max={1.5}
                step={0.05}
                className={inputClass}
                value={profile.delivery.localTts.speed ?? ""}
                placeholder="engine default"
                onChange={(e) =>
                  update((d) => {
                    // Empty means "don't send a speed at all", which is a different
                    // instruction from 0 — Number("") is 0 and would synthesise silence.
                    const raw = e.target.value.trim();
                    d.delivery.localTts.speed = raw === "" ? undefined : Number(raw);
                  })
                }
              />
            </Field>
          </div>
        </div>

        {/* --- Structure (advanced) ------------------------------------------------ */}
        {/*
          Collapsed by default. These fields genuinely work and the preset's values apply
          whether or not the drawer is ever opened — but they are the per-Act beat machine,
          which most channels set once from a brief and never touch again. Leaving them
          expanded made a page of twenty-five controls read as a form demanding input.
          `<details>` rather than a state-driven panel: no new component, no useState, and
          it stays open across a re-render for free.
        */}
        <details className="group rounded-xl border border-ed-border p-5">
          <summary className="cursor-pointer list-none">
            <span className={subheadingClass}>Advanced structure</span>
            <span className="ml-2 text-xs text-ed-text-dim">
              (click to open — the per-Act beat machine)
            </span>
            <p className={hintClass}>
              Your preset&apos;s values apply whether or not you open this.
            </p>
          </summary>
          <div className={`${groupClass} mt-5`}>
          <Field
            label="Beat Sheet"
            modified={isFieldModified(profile.structure.beatSheet, preset.structure.beatSheet)}
            hint="The video's spine, in order — one beat per line as: id | weight | apparatus | signpost | instruction. Weight is that beat's share of runtime (1 is normal, 3 is triple). Apparatus is A to allow manuscript/edition/translator talk in that beat, or - to ban it. Signpost is the verbatim line that opens the beat, and may be left blank. Beats are split across Acts in order, so each Act does something the others do not — this REPLACES the cycle and once-only beats above whenever it has any rows."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "160px" }}
              value={beatSheetToText(profile.structure.beatSheet)}
              onChange={(e) =>
                update((d) => (d.structure.beatSheet = textToBeatSheet(e.target.value)))
              }
            />
          </Field>
          <Field
            label="Per-Act Cycle"
            modified={isFieldModified(profile.structure.actCycle, preset.structure.actCycle)}
            hint="One beat per line, in order — these repeat in EVERY Act. Leave empty to use one hook for the whole video instead of one per Act."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "110px" }}
              value={profile.structure.actCycle.join("\n")}
              onChange={(e) => update((d) => (d.structure.actCycle = linesToList(e.target.value)))}
            />
          </Field>
          <Field
            label="Once-Only Beats"
            modified={isFieldModified(profile.structure.arcBeats, preset.structure.arcBeats)}
            hint="Beats spent ONCE per video, not in every Act. One per line as: position | id | instruction — position runs 0 (first Act) to 1 (last). Put a beat here and only its Act writes it; every other Act is told to leave it alone. A beat like 'name who suppressed the text' left in the cycle above produces nine of them in a nine-Act video."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "110px" }}
              value={arcBeatsToText(profile.structure.arcBeats)}
              onChange={(e) =>
                update((d) => (d.structure.arcBeats = textToArcBeats(e.target.value)))
              }
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Cold Open — Max Seconds"
              modified={isFieldModified(
                profile.structure.coldOpen.maxSeconds,
                preset.structure.coldOpen.maxSeconds
              )}
            >
              <input
                type="number"
                min={0}
                className={inputClass}
                value={profile.structure.coldOpen.maxSeconds}
                onChange={(e) =>
                  update(
                    (d) => (d.structure.coldOpen.maxSeconds = Number(e.target.value) || 0)
                  )
                }
              />
            </Field>
            <Field
              label="Cold Open — Payoff Deadline (s)"
              modified={isFieldModified(
                profile.structure.coldOpen.payoffDeadlineSeconds,
                preset.structure.coldOpen.payoffDeadlineSeconds
              )}
            >
              <input
                type="number"
                min={0}
                className={inputClass}
                value={profile.structure.coldOpen.payoffDeadlineSeconds}
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.structure.coldOpen.payoffDeadlineSeconds = Number(e.target.value) || 0)
                  )
                }
              />
            </Field>
          </div>
          <Field
            label="Cold Open — Opening Sequence"
            modified={isFieldModified(
              profile.structure.coldOpen.sequence,
              preset.structure.coldOpen.sequence
            )}
            hint="One step per line, in order — the positive half of the cold open. Banned Openings below can only say what the opening must not be; this says what it is. Sent to the Act holding the cold-open beat and to no other."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "110px" }}
              value={profile.structure.coldOpen.sequence.join("\n")}
              onChange={(e) =>
                update((d) => (d.structure.coldOpen.sequence = linesToList(e.target.value)))
              }
            />
          </Field>
          <Field
            label="Banned Openings"
            modified={isFieldModified(
              profile.structure.coldOpen.bannedOpenings,
              preset.structure.coldOpen.bannedOpenings
            )}
            hint="One per line."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.structure.coldOpen.bannedOpenings.join("\n")}
              onChange={(e) =>
                update((d) => (d.structure.coldOpen.bannedOpenings = linesToList(e.target.value)))
              }
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <Field
              label="Re-hook Interval (s)"
              modified={isFieldModified(
                profile.structure.reHookIntervalSeconds,
                preset.structure.reHookIntervalSeconds
              )}
              hint="0 disables the instruction."
            >
              <input
                type="number"
                min={0}
                className={inputClass}
                value={profile.structure.reHookIntervalSeconds}
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.structure.reHookIntervalSeconds = Number(e.target.value) || 0)
                  )
                }
              />
            </Field>
            <Field
              label="Terminal Revelation"
              modified={isFieldModified(
                profile.structure.terminalRevelation,
                preset.structure.terminalRevelation
              )}
            >
              <label className="flex items-center gap-2 text-sm text-ed-text h-[38px]">
                <input
                  type="checkbox"
                  checked={profile.structure.terminalRevelation}
                  onChange={(e) =>
                    update((d) => (d.structure.terminalRevelation = e.target.checked))
                  }
                />
                Hold the biggest reveal for the final Act
              </label>
            </Field>
            </div>
          </div>
        </details>

        {/* --- Content rules -------------------------------------------------------- */}
        <div className={groupClass}>
          <h3 className={subheadingClass}>Content Rules</h3>
          {/*
            `closer` lives on `structure` in the type but is rendered here on purpose: it is
            CRITICAL RULE 4 and rewrites the final line of every script ever generated, so
            burying it in a collapsed drawer would hide the most consequential single choice
            on the page behind a disclosure triangle.
          */}
            <Field
              label="Closer"
              modified={isFieldModified(profile.structure.closer, preset.structure.closer)}
            >
              <select
                className={inputClass}
                value={profile.structure.closer}
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.structure.closer = e.target.value as FormatProfile["structure"]["closer"])
                  )
                }
              >
                <option value="cta">CTA (visual summary + call to action)</option>
                <option value="open-door">Open Door (restate the unanswered question)</option>
                <option value="summary">Summary (one sentence, no CTA)</option>
              </select>
            </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Line Composition"
              modified={isFieldModified(
                profile.content.lineComposition,
                preset.content.lineComposition
              )}
              hint="Camera-ready forces a visible subject/action/location in every line. Documentary allows dates, sources and institutions with nothing on screen."
            >
              <select
                className={inputClass}
                value={profile.content.lineComposition}
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.content.lineComposition = e.target
                        .value as FormatProfile["content"]["lineComposition"])
                  )
                }
              >
                <option value="camera-ready">Camera-Ready</option>
                <option value="documentary">Documentary</option>
              </select>
            </Field>
            <Field
              label="Reading Level"
              modified={isFieldModified(profile.content.readingLevel, preset.content.readingLevel)}
            >
              <input
                className={inputClass}
                value={profile.content.readingLevel}
                onChange={(e) => update((d) => (d.content.readingLevel = e.target.value))}
              />
            </Field>
          </div>
          <Field
            label="Required Beats"
            modified={isFieldModified(profile.content.requiredBeats, preset.content.requiredBeats)}
            hint="One per line. Things the whole script must contain."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.requiredBeats.join("\n")}
              onChange={(e) => update((d) => (d.content.requiredBeats = linesToList(e.target.value)))}
            />
          </Field>
          <Field
            label="Where Evidence Talk Belongs"
            modified={isFieldModified(profile.content.apparatusRule, preset.content.apparatusRule)}
            hint="Manuscripts, folios, catalogue numbers, editions and translators are this format's credibility layer and also what kills it when spread evenly. Sourcing Rule below says what may be NAMED; this says where naming may HAPPEN."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.apparatusRule}
              onChange={(e) => update((d) => (d.content.apparatusRule = e.target.value))}
            />
          </Field>
          <Field
            label="What The Listener Feels"
            modified={isFieldModified(profile.content.sensoryRule, preset.content.sensoryRule)}
            hint="Sensation in the spoken line, not only in the image prompt. A script can look rich on the page and give a listener nothing to feel, because the voice is the only channel they have."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.sensoryRule}
              onChange={(e) => update((d) => (d.content.sensoryRule = e.target.value))}
            />
          </Field>
          <Field
            label="Rhythm"
            modified={isFieldModified(profile.content.fragmentRule, preset.content.fragmentRule)}
            hint="How line length breaks. Name the specific short form you want — uniform line length is the loudest sign a script was not written by a person, and a vague instruction to 'vary your rhythm' loses to the word-count target every time."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.fragmentRule}
              onChange={(e) => update((d) => (d.content.fragmentRule = e.target.value))}
            />
          </Field>
          <Field
            label="Numbers"
            modified={isFieldModified(profile.content.scaleRule, preset.content.scaleRule)}
            hint="How figures are converted into something a listener can picture. A number with no comparison beside it has been mentioned, not delivered."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.scaleRule}
              onChange={(e) => update((d) => (d.content.scaleRule = e.target.value))}
            />
          </Field>
          <Field
            label="Transition Phrases"
            modified={isFieldModified(
              profile.content.transitionPhrases,
              preset.content.transitionPhrases
            )}
            hint="One per line — the Act-to-Act handoffs, used verbatim and never twice in a video. Separate from a beat's own signpost, which is spent inside that beat. Without these, Acts hand off with neutral questions and nothing tells the listener the next thing is worse than the last."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "90px" }}
              value={profile.content.transitionPhrases.join("\n")}
              onChange={(e) =>
                update((d) => (d.content.transitionPhrases = linesToList(e.target.value)))
              }
            />
          </Field>
          <Field
            label="Sourcing Rule"
            modified={isFieldModified(profile.content.sourcingRule, preset.content.sourcingRule)}
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.content.sourcingRule}
              onChange={(e) => update((d) => (d.content.sourcingRule = e.target.value))}
            />
          </Field>
          <Field
            label="Rotating Framing Devices"
            modified={isFieldModified(
              profile.content.rotatingDevices,
              preset.content.rotatingDevices
            )}
            hint="One per line. The writer picks exactly one per video, so the channel doesn't open the same way every time."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "110px" }}
              value={profile.content.rotatingDevices.join("\n")}
              onChange={(e) =>
                update((d) => (d.content.rotatingDevices = linesToList(e.target.value)))
              }
            />
          </Field>
        </div>

        {/* --- Visual grammar -------------------------------------------------------- */}
        <div className={groupClass}>
          <h3 className={subheadingClass}>Visual Grammar</h3>
          <Field
            label="Visual Bias"
            modified={isFieldModified(profile.visual.visualBias, preset.visual.visualBias)}
            hint="Shot-selection guidance for the Scene Slicer."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.visual.visualBias}
              onChange={(e) => update((d) => (d.visual.visualBias = e.target.value))}
            />
          </Field>
          <Field
            label="Prompt Style Tag"
            modified={isFieldModified(profile.visual.promptStyleTag, preset.visual.promptStyleTag)}
            hint="Short keywords appended to every generated image/video prompt."
          >
            <input
              className={inputClass}
              value={profile.visual.promptStyleTag}
              onChange={(e) => update((d) => (d.visual.promptStyleTag = e.target.value))}
            />
          </Field>
          <Field
            label="Preferred Scene Types"
            modified={isFieldModified(
              profile.visual.preferredSceneTypes,
              preset.visual.preferredSceneTypes
            )}
          >
            <div className="flex flex-wrap gap-3">
              {SCENE_TYPES.map((type) => {
                const checked = profile.visual.preferredSceneTypes.includes(type);
                return (
                  <label
                    key={type}
                    className="flex items-center gap-1.5 text-sm text-ed-text rounded-lg border border-ed-border px-2.5 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        update((d) => {
                          const set = new Set<SceneType>(d.visual.preferredSceneTypes);
                          if (e.target.checked) set.add(type);
                          else set.delete(type);
                          d.visual.preferredSceneTypes = Array.from(set);
                        })
                      }
                    />
                    {type}
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Still Treatment"
              modified={isFieldModified(profile.visual.stillTreatment, preset.visual.stillTreatment)}
            >
              <textarea
                className={inputClass}
                style={{ minHeight: "70px" }}
                value={profile.visual.stillTreatment}
                onChange={(e) => update((d) => (d.visual.stillTreatment = e.target.value))}
              />
            </Field>
            <Field
              label="Content-Aware Slicing"
              modified={isFieldModified(
                profile.visual.contentAwareSlicing,
                preset.visual.contentAwareSlicing
              )}
              hint="Off by default for every channel. On, the Scene Slicer cuts on what a line actually shows instead of a target seconds-per-scene — one image per idea the words affirm, none for an idea they deny ('not a trial, not a choir' gets neither on screen)."
            >
              <label className="flex items-center gap-2 text-sm text-ed-text h-[38px]">
                <input
                  type="checkbox"
                  checked={profile.visual.contentAwareSlicing}
                  onChange={(e) =>
                    update((d) => (d.visual.contentAwareSlicing = e.target.checked))
                  }
                />
                Cut scenes by content, not by target duration
              </label>
            </Field>
          </div>
        </div>

        {/* --- Escape hatch -------------------------------------------------------- */}
        <div className={groupClass}>
          <h3 className={subheadingClass}>Additional Direction</h3>
          <Field
            label="Freeform notes"
            modified={isFieldModified(
              profile.additionalDirection ?? "",
              preset.additionalDirection ?? ""
            )}
            hint="Appended last, after every structured field above. Use this only for what the structured fields genuinely can't express — everything here is unstructured prose the model weighs unpredictably."
          >
            <textarea
              className={inputClass}
              style={{ minHeight: "70px" }}
              value={profile.additionalDirection ?? ""}
              onChange={(e) => update((d) => (d.additionalDirection = e.target.value))}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {saveState === "saved" && (
            <span className="text-sm text-ed-ok">Saved.</span>
          )}
          {saveState === "error" && (
            <span className="text-sm text-ed-danger">{saveError}</span>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={saveState === "saving" || migrationPending}
            onClick={handleSave}
          >
            {saveState === "saving" ? "Saving…" : "Save Channel Format"}
          </button>
        </div>
      </div>

      {/* --- Preview, right pane -------------------------------------------------- */}
      {/*
        Sticky rather than fixed at the page bottom: this was previously the LAST thing
        on the page, after 20+ fields of scroll, which meant checking what a single edit
        actually did required scrolling all the way down and back up every time. Pinned
        beside the fields, it updates live as you type in the left pane with zero
        scrolling — the biggest usability change in this redesign. `top-6` keeps a small
        gap under the page header once it sticks; `max-h-[calc(100vh-3rem)]` plus its own
        internal scroll stops the pane itself from ever exceeding the viewport.
      */}
      <div className="xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
        <div className={`${groupClass} rounded-xl border border-ed-border bg-ed-well p-5`}>
          <h3 className={subheadingClass}>Preview — what the Script Writer receives</h3>
          <p className={hintClass}>
            Read-only. This is the exact system instruction `format-prompt.ts` assembles
            from the fields on the left, shown as Act {PREVIEW_ACT_NUMBER} of a{" "}
            {PREVIEW_ACT_COUNT}-Act video, plus that video&apos;s Act structure rules. Act
            count varies with the duration chosen per video, so the Act each once-only beat
            lands in moves with it.
          </p>
          <pre className="whitespace-pre-wrap rounded-lg border border-ed-border bg-ed-surface p-4 text-xs text-ed-text font-mono max-h-[70vh] overflow-y-auto">
            {previewInstruction}
            {"\n\n--- Act Outliner structure rules (5-Act example) ---\n\n"}
            {previewActRules}
          </pre>
        </div>
      </div>
    </div>
    </section>
  );
}
