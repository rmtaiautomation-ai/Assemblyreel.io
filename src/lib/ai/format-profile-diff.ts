/**
 * Builds the workspace's stored override from a fully-populated FormatProfile the
 * settings form is editing. (implementation_plans/18-channel-blueprint.md, Phase 5)
 *
 * `workspaces.format_blueprint` stores ONLY the diff from the preset — see
 * `format-profile.ts`'s comment on that column. The settings form, by contrast, needs a
 * complete `FormatProfile` to bind its inputs to (there is no such thing as an input
 * bound to "undefined, deferring to the preset"). This is the boundary between the two:
 * the form edits a full profile, and this function reduces it back to a diff on save.
 *
 * Pure and client-safe — no `"use server"`, no I/O — so the settings component can call
 * it synchronously on every keystroke to render "modified from preset" badges, not just
 * once on save.
 */

import type { FormatProfile, FormatProfileOverride } from "./format-profile";

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * True when `value` differs from what the preset alone would produce at this path.
 * Exported so the settings form can drive its per-field "modified" badge from the exact
 * same check `diffFormatProfile` uses to decide what gets saved — one definition of
 * "different", not two that could quietly disagree.
 */
export function isFieldModified<T>(value: T, presetValue: T): boolean {
  if (Array.isArray(value) && Array.isArray(presetValue)) {
    return !arraysEqual(value as readonly string[], presetValue as readonly string[]);
  }
  return value !== presetValue;
}

/**
 * Mirrors `mergeFormatProfile`'s section shape exactly (see format-profile.ts): if a
 * merge nests an object there, this must diff it here too, or a field genuinely
 * different from its preset would silently be dropped on save.
 */
export function diffFormatProfile(
  current: FormatProfile,
  preset: FormatProfile
): FormatProfileOverride {
  const override: FormatProfileOverride = {};

  const identity: NonNullable<FormatProfileOverride["identity"]> = {};
  if (isFieldModified(current.identity.narratorPersona, preset.identity.narratorPersona)) {
    identity.narratorPersona = current.identity.narratorPersona;
  }
  if (isFieldModified(current.identity.explanatoryMethod, preset.identity.explanatoryMethod)) {
    identity.explanatoryMethod = current.identity.explanatoryMethod;
  }
  if (isFieldModified(current.identity.register, preset.identity.register)) {
    identity.register = current.identity.register;
  }
  if (isFieldModified(current.identity.forbiddenRegisters, preset.identity.forbiddenRegisters)) {
    identity.forbiddenRegisters = current.identity.forbiddenRegisters;
  }
  if (isFieldModified(current.identity.audienceStance, preset.identity.audienceStance)) {
    identity.audienceStance = current.identity.audienceStance;
  }
  if (Object.keys(identity).length) override.identity = identity;

  const elevenlabs: NonNullable<
    NonNullable<FormatProfileOverride["delivery"]>["elevenlabs"]
  > = {};
  if (isFieldModified(current.delivery.elevenlabs.stability, preset.delivery.elevenlabs.stability)) {
    elevenlabs.stability = current.delivery.elevenlabs.stability;
  }
  if (
    isFieldModified(
      current.delivery.elevenlabs.similarityBoost,
      preset.delivery.elevenlabs.similarityBoost
    )
  ) {
    elevenlabs.similarityBoost = current.delivery.elevenlabs.similarityBoost;
  }
  if (isFieldModified(current.delivery.elevenlabs.style, preset.delivery.elevenlabs.style)) {
    elevenlabs.style = current.delivery.elevenlabs.style;
  }

  // `localTts` was missing here while `mergeFormatProfile` already merged it, so a speed
  // edit resolved correctly in memory and then vanished on save — the diff simply never
  // emitted the key. It matters more than the ElevenLabs block above, since TTS_PROVIDER
  // defaults to "local".
  const localTts: NonNullable<
    NonNullable<FormatProfileOverride["delivery"]>["localTts"]
  > = {};
  if (isFieldModified(current.delivery.localTts.speed, preset.delivery.localTts.speed)) {
    localTts.speed = current.delivery.localTts.speed;
  }

  const delivery: NonNullable<FormatProfileOverride["delivery"]> = {};
  if (isFieldModified(current.delivery.wordsPerMinute, preset.delivery.wordsPerMinute)) {
    delivery.wordsPerMinute = current.delivery.wordsPerMinute;
  }
  if (Object.keys(elevenlabs).length) delivery.elevenlabs = elevenlabs;
  if (Object.keys(localTts).length) delivery.localTts = localTts;
  if (Object.keys(delivery).length) override.delivery = delivery;

  const coldOpen: NonNullable<NonNullable<FormatProfileOverride["structure"]>["coldOpen"]> = {};
  if (
    isFieldModified(current.structure.coldOpen.maxSeconds, preset.structure.coldOpen.maxSeconds)
  ) {
    coldOpen.maxSeconds = current.structure.coldOpen.maxSeconds;
  }
  if (
    isFieldModified(
      current.structure.coldOpen.payoffDeadlineSeconds,
      preset.structure.coldOpen.payoffDeadlineSeconds
    )
  ) {
    coldOpen.payoffDeadlineSeconds = current.structure.coldOpen.payoffDeadlineSeconds;
  }
  if (
    isFieldModified(
      current.structure.coldOpen.bannedOpenings,
      preset.structure.coldOpen.bannedOpenings
    )
  ) {
    coldOpen.bannedOpenings = current.structure.coldOpen.bannedOpenings;
  }

  const structure: NonNullable<FormatProfileOverride["structure"]> = {};
  if (isFieldModified(current.structure.actCycle, preset.structure.actCycle)) {
    structure.actCycle = current.structure.actCycle;
  }
  if (isFieldModified(current.structure.arcBeats, preset.structure.arcBeats)) {
    structure.arcBeats = current.structure.arcBeats;
  }
  if (
    isFieldModified(current.structure.terminalRevelation, preset.structure.terminalRevelation)
  ) {
    structure.terminalRevelation = current.structure.terminalRevelation;
  }
  if (
    isFieldModified(
      current.structure.reHookIntervalSeconds,
      preset.structure.reHookIntervalSeconds
    )
  ) {
    structure.reHookIntervalSeconds = current.structure.reHookIntervalSeconds;
  }
  if (isFieldModified(current.structure.closer, preset.structure.closer)) {
    structure.closer = current.structure.closer;
  }
  if (Object.keys(coldOpen).length) structure.coldOpen = coldOpen;
  if (Object.keys(structure).length) override.structure = structure;

  const content: NonNullable<FormatProfileOverride["content"]> = {};
  if (isFieldModified(current.content.lineComposition, preset.content.lineComposition)) {
    content.lineComposition = current.content.lineComposition;
  }
  if (isFieldModified(current.content.readingLevel, preset.content.readingLevel)) {
    content.readingLevel = current.content.readingLevel;
  }
  if (isFieldModified(current.content.requiredBeats, preset.content.requiredBeats)) {
    content.requiredBeats = current.content.requiredBeats;
  }
  if (isFieldModified(current.content.sourcingRule, preset.content.sourcingRule)) {
    content.sourcingRule = current.content.sourcingRule;
  }
  if (isFieldModified(current.content.rotatingDevices, preset.content.rotatingDevices)) {
    content.rotatingDevices = current.content.rotatingDevices;
  }
  if (Object.keys(content).length) override.content = content;

  const visual: NonNullable<FormatProfileOverride["visual"]> = {};
  if (isFieldModified(current.visual.visualBias, preset.visual.visualBias)) {
    visual.visualBias = current.visual.visualBias;
  }
  if (isFieldModified(current.visual.promptStyleTag, preset.visual.promptStyleTag)) {
    visual.promptStyleTag = current.visual.promptStyleTag;
  }
  if (
    isFieldModified(current.visual.preferredSceneTypes, preset.visual.preferredSceneTypes)
  ) {
    visual.preferredSceneTypes = current.visual.preferredSceneTypes;
  }
  if (isFieldModified(current.visual.stillTreatment, preset.visual.stillTreatment)) {
    visual.stillTreatment = current.visual.stillTreatment;
  }
  if (Object.keys(visual).length) override.visual = visual;

  if (isFieldModified(current.additionalDirection ?? "", preset.additionalDirection ?? "")) {
    override.additionalDirection = current.additionalDirection;
  }

  // Provenance, not a setting: carried so the source text survives a save/resolve round
  // trip and stays visible next to the format it produced.
  if (isFieldModified(current.sourceBrief ?? "", preset.sourceBrief ?? "")) {
    override.sourceBrief = current.sourceBrief;
  }

  return override;
}
