/**
 * Single source of truth for the generation rules described in
 * `implementation_plans/07_AI_GENERATION_PLAN.md` — the Niche/Tone Matrix and the
 * duration-based scripting & pacing tiers.
 *
 * These rules are deliberately centralised: the Script Writer, the Scene Slicer and
 * (later) the Visual Architect all need the same profile for a given project, and
 * previously each re-derived it with its own copy of a fragile `String.includes`
 * chain. Those copies had already drifted out of sync with the actual UI values.
 */

/** Plan 07 assumes ~150 words per minute of finished narration. */
export const NARRATION_WORDS_PER_MINUTE = 150;

/**
 * Declared as a const tuple (not annotated `readonly SceneType[]`) so the literal
 * member types survive — `z.enum(SCENE_TYPES)` needs them to build its union.
 */
export const SCENE_TYPES = [
  "ESTABLISH",
  "ACTION",
  "DIALOGUE",
  "DIVINE",
  "CLOSEUP",
  "MACRO",
  "WIDE",
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

/* -------------------------------------------------------------------------- */
/*                              Niche / Tone Matrix                            */
/* -------------------------------------------------------------------------- */

export type NicheKey = "mythology" | "true-crime" | "dark-psychology" | "general";

export interface NicheProfile {
  key: NicheKey;
  /** Injected into the Script Writer to steer prose style. */
  scriptTone: string;
  /** Injected into the Scene Slicer and Visual Architect to steer shot selection. */
  visualBias: string;
  /**
   * Short visual keywords appended to the assembled image/video prompt.
   *
   * Deliberately separate from `scriptTone`: that field is prose guidance ("NLT Bible
   * style") which is meaningless to a diffusion model and can be rendered literally.
   * Only this field is safe to concatenate into a generation prompt.
   */
  promptStyleTag: string;
  /** Scene types this niche should favour when slicing. */
  preferredSceneTypes: readonly SceneType[];
}

const NICHE_PROFILES: Record<NicheKey, NicheProfile> = {
  mythology: {
    key: "mythology",
    scriptTone: "Epic, NLT Bible style, grandiose, and poetic scale.",
    visualBias:
      "Favor 'ESTABLISH' and 'DIVINE' scene types for epic scale — wide sweeping vistas, god rays, and overwhelming sense of scale.",
    promptStyleTag: "epic mythic scale, volumetric god rays, painterly grandeur",
    preferredSceneTypes: ["ESTABLISH", "DIVINE", "WIDE"],
  },
  "true-crime": {
    key: "true-crime",
    scriptTone: "Grounded, suspenseful, analytical, and gripping.",
    visualBias:
      "Favor 'ACTION' and 'DIALOGUE' scene types — intimate close-ups, handheld camera logic, and evidence shots.",
    promptStyleTag: "grounded documentary realism, desaturated palette, handheld grain",
    preferredSceneTypes: ["ACTION", "DIALOGUE", "CLOSEUP"],
  },
  "dark-psychology": {
    key: "dark-psychology",
    scriptTone: "Intense, psychological, slow-burn, and thought-provoking.",
    visualBias:
      "Favor high contrast and chiaroscuro lighting with slow dolly pushes. Use subtle 'ESTABLISH' scenes that linger.",
    promptStyleTag: "high-contrast chiaroscuro, deep shadow falloff, cold muted tones",
    preferredSceneTypes: ["ESTABLISH", "CLOSEUP", "MACRO"],
  },
  general: {
    key: "general",
    scriptTone: "Epic, dramatic, and direct.",
    visualBias: "Balance wide establishing shots with closer character-driven coverage.",
    promptStyleTag: "cinematic colour grade, natural depth of field",
    preferredSceneTypes: ["ESTABLISH", "ACTION", "CLOSEUP"],
  },
};

/**
 * Keywords that route a free-text niche onto a profile. Order matters: the first
 * profile with a matching keyword wins.
 *
 * Niche arrives as `workspace.content_theme`, which users type freely, so this stays
 * a keyword match rather than an exact lookup. Duration, by contrast, comes from a
 * fixed `<select>` and is mapped exactly — see DURATION_PROFILES_BY_FORM_VALUE.
 */
const NICHE_KEYWORDS: readonly (readonly [NicheKey, readonly string[]])[] = [
  ["mythology", ["mythology", "ancient", "religion", "lore", "bible", "god"]],
  ["true-crime", ["crime", "investigation", "detective", "murder", "mystery"]],
  ["dark-psychology", ["psychology", "dark", "behavior", "behaviour", "mind"]],
] as const;

export function resolveNicheProfile(nicheTheme?: string | null): NicheProfile {
  if (!nicheTheme) return NICHE_PROFILES.general;

  const normalized = nicheTheme.toLowerCase();
  const match = NICHE_KEYWORDS.find(([, keywords]) =>
    keywords.some((keyword) => normalized.includes(keyword))
  );

  return match ? NICHE_PROFILES[match[0]] : NICHE_PROFILES.general;
}

/* -------------------------------------------------------------------------- */
/*                          Duration / Pacing Tiers                            */
/* -------------------------------------------------------------------------- */

export type DurationTier =
  | "short-form"
  | "mid-form-short"
  | "mid-form-long"
  | "long-form";

export interface DurationProfile {
  tier: DurationTier;
  /** Human-readable label, used in prompts and logs. */
  label: string;
  targetWordCount: { min: number; max: number };
  /** Narration lines the Script Writer should emit for a single request. */
  targetLineCount: { min: number; max: number };
  /** Number of Acts. Long-form scales this with runtime; others are single-pass. */
  actCount: number;
  /** True when the pipeline should generate Act-by-Act instead of in one shot. */
  isLongForm: boolean;
  /** Act structure summary injected into the Script Writer prompt. */
  structureRule: string;
  /** Pacing instruction injected into the Scene Slicer prompt. */
  pacingRule: string;
  /** Intended on-screen duration of a single sliced scene. */
  sceneDurationSeconds: { min: number; max: number };
}

/**
 * Exact map from the `target_duration` values emitted by `NewVideoForm`.
 *
 * Keep these keys byte-identical to the form's option values. They were previously
 * matched with substrings like `"2-3"` and `"mid-form long"` taken from plan 07's
 * tier *names*, which no form value ever contained — so "Mid (2-5m)" matched nothing
 * and silently fell back to a ~70-second script.
 */
const DURATION_PROFILES_BY_FORM_VALUE: Record<string, DurationProfile> = {
  "Short (< 60s)": {
    tier: "short-form",
    label: "Short-Form (30s - 60s)",
    targetWordCount: { min: 75, max: 150 },
    targetLineCount: { min: 6, max: 10 },
    actCount: 1,
    isLongForm: false,
    structureRule: "Single Act: Hook → Core Concept → Climax + CTA.",
    pacingRule:
      "Hyper-fast pacing. Slice sentences into very short fragments (2-4 seconds each) for high retention.",
    sceneDurationSeconds: { min: 2, max: 4 },
  },
  "Mid (2-3m)": {
    tier: "mid-form-short",
    label: "Mid-Form Short (2m - 3m)",
    targetWordCount: { min: 300, max: 450 },
    targetLineCount: { min: 20, max: 25 },
    actCount: 3,
    isLongForm: false,
    structureRule:
      "3 Acts: Hook & Context (25%) → The Deep Dive (50%) → Conclusion & CTA (25%).",
    pacingRule: "Moderate-fast pacing. Clips change every 4-6 seconds.",
    sceneDurationSeconds: { min: 4, max: 6 },
  },
  "Mid (4-5m)": {
    tier: "mid-form-long",
    label: "Mid-Form Long (4m - 5m)",
    targetWordCount: { min: 600, max: 750 },
    targetLineCount: { min: 35, max: 45 },
    actCount: 3,
    isLongForm: false,
    structureRule:
      "3 Acts: Hook & Context (20%) → The Deep Dive (60%) → Conclusion & CTA (20%).",
    pacingRule:
      "Moderate pacing. Clips change every 5-8 seconds to allow for more visual breathing room.",
    sceneDurationSeconds: { min: 5, max: 8 },
  },
  "Long (10-15m)": buildLongFormProfile("Long-Form (10m - 15m)", 5, 1500, 2250),
  "Long (15-20m)": buildLongFormProfile("Long-Form (15m - 20m)", 7, 2250, 3000),
  "Long (20-25m)": buildLongFormProfile("Long-Form (20m - 25m)", 9, 3000, 3750),
  "Long (25-30m)": buildLongFormProfile("Long-Form (25m - 30m)", 11, 3750, 4500),
};

function buildLongFormProfile(
  label: string,
  actCount: number,
  minWords: number,
  maxWords: number
): DurationProfile {
  return {
    tier: "long-form",
    label,
    targetWordCount: { min: minWords, max: maxWords },
    // Long-form is generated one Act at a time, so the line target is per-Act.
    targetLineCount: { min: 15, max: 25 },
    actCount,
    isLongForm: true,
    structureRule: `${actCount}-Act modular/chapterised documentary structure: Forbidden Hook & Context → Rising Threat → Deep Dive / Revelation → Implications & Climax → Aftermath & CTA.`,
    pacingRule:
      "Slow, cinematic pacing. Clips linger for 6-12 seconds. Use subtle Ken Burns motion and looping ambient B-Roll. Do not over-slice.",
    sceneDurationSeconds: { min: 6, max: 12 },
  };
}

/** Fallback when a project predates the current form or stores an unknown value. */
const DEFAULT_DURATION_PROFILE = DURATION_PROFILES_BY_FORM_VALUE["Short (< 60s)"];

export function resolveDurationProfile(targetDuration?: string | null): DurationProfile {
  if (!targetDuration) return DEFAULT_DURATION_PROFILE;

  const exactMatch = DURATION_PROFILES_BY_FORM_VALUE[targetDuration];
  if (exactMatch) return exactMatch;

  // Legacy rows may hold the old collapsed "Mid (2-5m)" option, or a hand-edited
  // value. Degrade to the nearest tier rather than silently emitting a 60s script.
  const normalized = targetDuration.toLowerCase();
  if (normalized.includes("mid")) return DURATION_PROFILES_BY_FORM_VALUE["Mid (2-3m)"];
  if (normalized.includes("long")) return DURATION_PROFILES_BY_FORM_VALUE["Long (10-15m)"];

  return DEFAULT_DURATION_PROFILE;
}

/** Every duration value the UI is allowed to offer, in ascending runtime order. */
export const DURATION_FORM_VALUES: readonly string[] = Object.keys(
  DURATION_PROFILES_BY_FORM_VALUE
);
