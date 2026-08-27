"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Mic, MonitorPlay, Send, Sparkles } from "lucide-react";
import {
  ART_STYLES,
  ASPECT_RATIOS,
  DESTINATIONS,
  DURATIONS,
  LANGUAGES,
  NICHES,
} from "@/lib/workspace-options";
import {
  saveWorkspaceChannelSettings,
  type WorkspaceChannelSettings,
} from "@/app/actions/workspace-actions";
import { getAvailableVoices } from "@/app/actions/audio-actions";

/**
 * The Channel tab of Workspace Settings — the first editor these columns have ever had.
 *
 * Replaces the Appearance and Providers tabs. Those two looked like the settings a
 * channel needs (a colour palette, a "master aesthetic prompt", provider dropdowns) but
 * nothing on either one was persisted, no provider was ever chosen from the UI (the TTS
 * provider comes from `TTS_PROVIDER`, the image and LLM providers from their own env
 * keys), and the aesthetic prompt duplicated Channel Format's Prompt Style Tag, which IS
 * saved and IS read by the pipeline. Two tabs of controls that silently discarded every
 * edit taught the user that this page doesn't work; deleting them and shipping the real
 * fields in their place is the point of this pass.
 *
 * Everything on this tab writes a column the generation pipeline actually reads at the
 * moment a new video is created.
 */

/* -------------------------------------------------------------------------- */
/*                                   Chrome                                   */
/* -------------------------------------------------------------------------- */

const inputClass =
  "ed-field px-3 py-2 text-sm";
const labelClass = "block mb-1.5 text-sm font-medium text-ed-text";
const hintClass = "text-xs text-ed-text-dim mt-1";

function Card({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ed-border bg-ed-surface p-6 shadow-glass">
      <div className="mb-5">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ed-text">
          <span className="text-ed-accent">{icon}</span>
          {title}
        </h3>
        <p className="text-sm text-ed-text-dim mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * A select that never silently drops the value already in the database.
 *
 * Rows predating `workspace-options.ts` hold values these lists don't contain — the
 * column default `16:9` rather than `Horizontal 16:9`, or a niche typed before the
 * curated list existed. A plain select renders an unmatched value as blank, so opening
 * Settings and pressing Save would quietly rewrite the channel's aspect ratio to
 * whatever happened to sit first in the list. Carrying the current value as an extra
 * option keeps Save a no-op for fields the user didn't touch.
 */
function ForgivingSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const isLegacy = value !== "" && !options.includes(value);
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {isLegacy && <option value={value}>{value} (current)</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** Selectable chip row — used where the option set is short enough to show at once. */
function ChipGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  const legacy = value !== "" && !options.includes(value) ? [value] : [];
  return (
    <div className="flex flex-wrap gap-2">
      {[...legacy, ...options].map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-ed-accent bg-ed-accent/10 text-ed-accent"
                : "border-ed-border bg-ed-surface text-ed-text-dim hover:border-ed-border-strong hover:text-ed-text"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** The proportions each stored aspect-ratio string draws as. */
const RATIO_BOX: Record<string, string> = {
  "Vertical 9:16": "w-7 h-12",
  "Horizontal 16:9": "w-12 h-7",
  "Square 1:1": "w-10 h-10",
};

/* -------------------------------------------------------------------------- */
/*                                  Section                                   */
/* -------------------------------------------------------------------------- */

interface VoiceOption {
  id: string;
  name?: string;
  engine?: string;
  gender?: string;
}

export interface ChannelIdentitySectionProps {
  workspaceId: string;
  initialSettings: WorkspaceChannelSettings;
}

export default function ChannelIdentitySection({
  workspaceId,
  initialSettings,
}: ChannelIdentitySectionProps) {
  const [settings, setSettings] = useState<WorkspaceChannelSettings>(initialSettings);
  // The last successfully persisted state. Compared against `settings` to decide whether
  // the save bar is shown at all — a settings page with a permanently enabled Save button
  // gives no signal about whether anything is actually pending.
  const [saved, setSaved] = useState<WorkspaceChannelSettings>(initialSettings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // "loading" is distinct from an empty list: Voice Studio runs on the user's own
  // machine, so an empty result almost always means it isn't running rather than that
  // the channel has no voices, and those two states need different copy.
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceState, setVoiceState] = useState<"loading" | "ready" | "unreachable">("loading");

  useEffect(() => {
    let cancelled = false;
    getAvailableVoices()
      .then((result) => {
        if (cancelled) return;
        const list: VoiceOption[] = result.success ? (result.voices ?? []) : [];
        setVoices(list);
        setVoiceState(list.length > 0 ? "ready" : "unreachable");
      })
      .catch(() => {
        if (!cancelled) setVoiceState("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof WorkspaceChannelSettings>(
    key: K,
    value: WorkspaceChannelSettings[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
  }

  const dirtyFields = useMemo(
    () =>
      (Object.keys(settings) as Array<keyof WorkspaceChannelSettings>).filter(
        (key) => settings[key] !== saved[key]
      ),
    [settings, saved]
  );
  const isDirty = dirtyFields.length > 0;

  const selectedNiche = useMemo(
    () => NICHES.find((niche) => niche.title === settings.contentTheme),
    [settings.contentTheme]
  );

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const snapshot = settings;
    const result = await saveWorkspaceChannelSettings(workspaceId, snapshot);
    if (result.success) {
      setSaved(snapshot);
      setSaveState("idle");
    } else {
      setSaveState("error");
      setSaveError(result.error ?? "Save failed.");
    }
  }

  return (
    <div className="pb-24">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
        {/* --- Left column: what the channel is, and what it looks like --------- */}
        <div className="space-y-6 min-w-0">
          <Card
            title="Channel"
            icon={<Sparkles size={18} />}
            description="What this channel is and where its videos are headed."
          >
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Channel name</label>
                <input
                  className={inputClass}
                  value={settings.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Forgotten Archives"
                />
                <p className={hintClass}>
                  Shown across the dashboard. Renaming affects nothing else.
                </p>
              </div>

              <div>
                <label className={labelClass}>Niche</label>
                <ForgivingSelect
                  value={settings.contentTheme}
                  options={NICHES.map((niche) => niche.title)}
                  onChange={(next) => update("contentTheme", next)}
                  placeholder="Select a niche…"
                />
                {selectedNiche ? (
                  <p className={hintClass}>{selectedNiche.prompt}</p>
                ) : (
                  <p className={hintClass}>
                    Seeds topic suggestions and the legacy tone matrix. The Format tab
                    overrides it wherever the two disagree.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Send size={14} className="text-ed-text-dim" />
                    Destination
                  </span>
                </label>
                <ForgivingSelect
                  value={settings.destination}
                  options={DESTINATIONS}
                  onChange={(next) => update("destination", next)}
                  placeholder="Select a destination…"
                />
              </div>
            </div>
          </Card>

          <Card
            title="Look & output"
            icon={<MonitorPlay size={18} />}
            description="The defaults every new video in this channel starts from."
          >
            <div className="space-y-6">
              <div>
                <label className={labelClass}>Art style</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {ART_STYLES.map((style) => {
                    const active = settings.visualAesthetic === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => update("visualAesthetic", style)}
                        className={`relative rounded-lg border-2 px-2 py-4 text-sm font-medium transition-all ${
                          active
                            ? "border-ed-accent bg-ed-accent/5 text-ed-accent"
                            : "border-ed-border bg-ed-well text-ed-text-dim hover:border-ed-border-strong hover:text-ed-text"
                        }`}
                      >
                        {active && <Check size={13} className="absolute top-1.5 right-1.5" />}
                        {style}
                      </button>
                    );
                  })}
                </div>
                <p className={hintClass}>
                  Feeds the image prompts. For finer control use Prompt Style Tag on the
                  Format tab.
                </p>
              </div>

              <div>
                <label className={labelClass}>Aspect ratio</label>
                <div className="flex flex-wrap gap-3">
                  {ASPECT_RATIOS.map((ratio) => {
                    const active = settings.aspectRatio === ratio;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => update("aspectRatio", ratio)}
                        className={`flex flex-1 min-w-[140px] flex-col items-center gap-3 rounded-xl border-2 px-4 py-4 transition-all ${
                          active
                            ? "border-ed-accent bg-ed-accent/5"
                            : "border-ed-border bg-ed-surface hover:border-ed-border-strong"
                        }`}
                      >
                        <span
                          className={`rounded-md border-2 ${RATIO_BOX[ratio] ?? "w-10 h-10"} ${
                            active ? "border-ed-accent" : "border-ed-border-strong"
                          }`}
                        />
                        <span
                          className={`text-sm font-semibold ${
                            active ? "text-ed-accent" : "text-ed-text-dim"
                          }`}
                        >
                          {ratio}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {settings.aspectRatio !== "" &&
                  !ASPECT_RATIOS.includes(
                    settings.aspectRatio as (typeof ASPECT_RATIOS)[number]
                  ) && (
                    <p className={hintClass}>
                      Currently set to <strong>{settings.aspectRatio}</strong>, from before
                      these presets existed. Picking one above replaces it.
                    </p>
                  )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>Target length</label>
                  <ChipGroup
                    value={settings.durationPref}
                    options={DURATIONS}
                    onChange={(next) => update("durationPref", next)}
                  />
                  <p className={hintClass}>
                    A default only — each video picks its own runtime tier at creation.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Language</label>
                  <ForgivingSelect
                    value={settings.videoLanguage}
                    options={LANGUAGES}
                    onChange={(next) => update("videoLanguage", next)}
                    placeholder="Select a language…"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* --- Right column: narration voice ------------------------------------ */}
        {/*
          Sticky, like the Format tab's prompt preview: the voice list is the one thing on
          this tab that comes from outside the app, so keeping it visible while the left
          column is edited makes it obvious when Voice Studio isn't running.
        */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <Card
            title="Narration voice"
            icon={<Mic size={18} />}
            description="The default voice for new videos, read live from your local Voice Studio."
          >
            {voiceState === "loading" && (
              <p className="text-sm text-ed-text-dim">Looking for Voice Studio…</p>
            )}

            {voiceState === "unreachable" && (
              <div className="rounded-lg border border-ed-warn-border bg-ed-warn-soft px-4 py-3 text-sm text-ed-warn">
                <strong>Voice Studio isn&apos;t reachable.</strong> Voices are synthesised on
                your own machine, so this list stays empty until it is running at{" "}
                <code className="font-mono text-xs">VOICE_STUDIO_URL</code>. Your saved
                choice is kept either way — start it and reload to change it.
                {settings.narrationVoiceId && (
                  <p className="mt-2">
                    Currently saved:{" "}
                    <code className="font-mono text-xs">{settings.narrationVoiceId}</code>
                  </p>
                )}
              </div>
            )}

            {voiceState === "ready" && (
              <>
                <div className="max-h-[420px] overflow-y-auto rounded-lg border border-ed-border">
                  <button
                    type="button"
                    onClick={() => update("narrationVoiceId", "")}
                    className={`flex w-full items-center justify-between border-b border-ed-border px-4 py-3 text-left transition-colors ${
                      settings.narrationVoiceId === ""
                        ? "bg-ed-accent/5"
                        : "hover:bg-ed-well"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ed-text">Auto</span>
                      <span className="block text-xs text-ed-text-dim">
                        Whatever Voice Studio&apos;s active engine defaults to
                      </span>
                    </span>
                    {settings.narrationVoiceId === "" && (
                      <Check size={18} className="text-ed-accent shrink-0" />
                    )}
                  </button>

                  {voices.map((voice) => {
                    const active = settings.narrationVoiceId === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => update("narrationVoiceId", voice.id)}
                        className={`flex w-full items-center justify-between border-b border-ed-border px-4 py-3 text-left transition-colors last:border-0 ${
                          active ? "bg-ed-accent/5" : "hover:bg-ed-well"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-ed-text">
                            {voice.name ?? voice.id}
                          </span>
                          <span className="block text-xs text-ed-text-dim">
                            {[voice.engine, voice.gender].filter(Boolean).join(" · ") ||
                              voice.id}
                          </span>
                        </span>
                        {active && <Check size={18} className="text-ed-accent shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/*
                  A voice id saved before this picker existed (the creation wizard offered a
                  hardcoded list of Cartesia-style ids that Voice Studio has never served)
                  will not appear in the list above, so say so rather than showing nothing
                  selected.
                */}
                {settings.narrationVoiceId !== "" &&
                  !voices.some((voice) => voice.id === settings.narrationVoiceId) && (
                    <p className={hintClass}>
                      This channel is saved against{" "}
                      <code className="font-mono">{settings.narrationVoiceId}</code>, which
                      your Voice Studio doesn&apos;t serve. Pick one above to replace it.
                    </p>
                  )}

                <p className={hintClass}>
                  How the voice is <em>performed</em> — pace and speed — lives on the Format
                  tab under Delivery.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      {/*
        Save bar, fixed to the viewport rather than sitting at the end of the page. Both
        columns scroll independently and the left one is long; a button at the bottom of
        the document would be off screen for most of the editing session. It appears only
        when something is actually unsaved, so it never becomes a permanently docked bar
        that stops meaning anything.
      */}
      {(isDirty || saveState === "error") && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ed-border bg-ed-surface/95 backdrop-blur">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 px-8 py-4">
            <div className="text-sm">
              {saveState === "error" ? (
                <span className="text-ed-danger">{saveError}</span>
              ) : (
                <span className="text-ed-text-dim">
                  {dirtyFields.length} unsaved change{dirtyFields.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={saveState === "saving"}
                onClick={() => {
                  setSettings(saved);
                  setSaveState("idle");
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saveState === "saving" || !isDirty}
                onClick={handleSave}
              >
                {saveState === "saving" ? "Saving…" : "Save channel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
