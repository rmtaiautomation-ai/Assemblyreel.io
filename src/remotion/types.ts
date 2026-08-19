/**
 * Shared types for Remotion compositions.
 * These mirror the scene data from the Timeline Editor.
 */

export type OverlayPreset =
  | 'slide'
  | 'pop'
  | 'typewriter'
  | 'lower-third'
  // Kinetic-typography presets. Unlike the four above — each one animation on a
  // single text block — these animate per word or per character.
  | 'cinematic-reveal'
  | 'line-wipe'
  | 'letter-collapse'
  | 'chapter-card'
  | 'none';

export interface SceneOverlay {
  text: string;
  preset: OverlayPreset;
  color: string;
  fontSize?: number;
  position?: 'center' | 'bottom' | 'top';
}

/**
 * Which kind of clip an OV-track row is. 'text' is the original plain
 * kinetic-text overlay; 'checklist-card'/'title-cutout-card' are designed
 * graphic-card templates; 'dim-scrim', 'particles', 'light-beam',
 * 'light-sweep' and 'film-damage' are the environmental kinds — full-frame
 * atmospheric layers with their own independent timing. ('dim-scrim' is
 * distinct from the `dimBackground` checkbox, which dims for exactly a
 * text/card clip's own duration.) All are just rows on the same track. Adding
 * a kind is a code change, not a migration, same convention as
 * `OverlayPreset`.
 */
export type OverlayClipKind =
  | 'text'
  | 'checklist-card'
  | 'title-cutout-card'
  | 'dim-scrim'
  | 'particles'
  | 'light-beam'
  | 'light-sweep'
  | 'film-damage';

/**
 * The full-frame atmospheric kinds. They share two behaviours that separate
 * them from text/card kinds: they skip `OverlayFrame` entirely (no 9-slot
 * placement, so no position controls in the inspector), and they get their own
 * timeline lane pool away from the content clips.
 *
 * They do NOT all share a render z-order. Most sort below text, but
 * 'film-damage' sorts above it — see `zRank` in `VideoComposition`, which owns
 * that distinction. This predicate is about placement, not paint order.
 *
 * Exported as one predicate deliberately — the render path
 * (`VideoComposition`) and the timeline lane packing (`TimelineEditor`)
 * previously each hard-coded their own `=== 'dim-scrim'` check, which meant
 * adding a kind silently broke both in different ways. One definition, so
 * they cannot drift apart again.
 */
export const isEnvironmentalKind = (kind: OverlayClipKind): boolean =>
  kind === 'dim-scrim' ||
  kind === 'particles' ||
  kind === 'light-beam' ||
  kind === 'light-sweep' ||
  kind === 'film-damage';

/** `template_data` shape for the `checklist-card` kind. */
export interface ChecklistCardData {
  bullets: string[];
  /** Header title text color. Defaults to white. `color` itself is the header bar / checkmark accent, not the text. */
  textColor?: string;
  /** Uniform scale of the whole card (header + bullets). Defaults to 1. Independent of `fontSize`, which only sizes the header title text. */
  scale?: number;
}

/** `template_data` shape for the `title-cutout-card` kind. */
export interface TitleCutoutCardData {
  backgroundImageUrl?: string;
  foregroundImageUrl?: string;
  /** Headline text color. Defaults to white. `color` itself is the fallback background, not the text. */
  textColor?: string;
  /** Uniform scale of the whole card, images included. Defaults to 1. Independent of `fontSize`, which only sizes the headline text. */
  scale?: number;
}

/** `template_data` shape for the `dim-scrim` kind. */
export interface DimScrimData {
  /** Peak opacity, 0-1. Defaults to 0.45 — matches the `dimBackground` checkbox's own fixed dim elsewhere in this app. */
  opacity?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/**
 * `template_data` shape for the `particles` kind — a field of drifting motes
 * ("dust particles" / "bokeh overlay" in stock-footage terms), generated
 * procedurally rather than from a stock video.
 */
export interface ParticleFieldData {
  /** How many motes. Defaults to 45. */
  count?: number;
  /** Vertical drift multiplier. Defaults to 1. */
  speed?: number;
  /** Uniform size multiplier. Defaults to 1. */
  sizeScale?: number;
  /** 0-100 horizontal cluster centre. Omitted = spread evenly across the frame. */
  xBias?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/**
 * `template_data` shape for the `light-beam` kind — a soft god-ray shaft
 * ("light rays" in Resolve, Trapcode Shine in After Effects).
 *
 * Carries its own `xPercent` rather than reusing `OverlayClipData.xPercent`
 * because this kind skips `OverlayFrame`: the shaft is positioned by its own
 * gradient mask (and animated within it), not by the 9-slot placement grid.
 */
export interface LightBeamData {
  /** Shaft centre as a percentage of frame width. Defaults to 50. */
  xPercent?: number;
  /** Half-width of the bright core, as a percentage of frame width. Defaults to 14. */
  width?: number;
  /** Peak brightness, 0-1. Defaults to 0.75. */
  intensity?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/**
 * `template_data` shape for the `light-sweep` kind — a band of light raking
 * across the frame ("CC Light Sweep" in After Effects).
 *
 * Distinct from `light-beam`: a beam holds its position in the scene, a sweep
 * crosses the whole frame edge to edge and repeats on its own cycle.
 */
export interface LightSweepData {
  /** Half-width of the band, as a percentage of frame width. Defaults to 5 — the gradient spans 2x this either side. */
  width?: number;
  /** Peak brightness, 0-1. Defaults to 0.5. */
  intensity?: number;
  /** Seconds for one edge-to-edge pass. Defaults to 4. */
  cycleSeconds?: number;
  /** Gradient angle in degrees; 90 is perfectly vertical. Defaults to 100 for a raking lean. */
  angle?: number;
  /** Sweep right-to-left instead of left-to-right. */
  reverse?: boolean;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/**
 * `template_data` shape for the `film-damage` kind — old-film print damage:
 * drifting vertical scratch lines plus emulsion grain. The look sold as an
 * "old film overlay" in stock packs, generated procedurally here.
 *
 * Both sub-effects live on one kind because the look needs both together —
 * grain alone reads as video noise, scratches alone as a glitch. Either can be
 * dialled to zero to isolate the other.
 *
 * Unlike the other environmental kinds this paints ABOVE text: print damage
 * sits on the film, so burned-in captions are scratched and grained too.
 */
export interface FilmDamageData {
  /** Grain strength, 0-1. Defaults to 0.35. 0 skips the grain layer entirely. */
  grainAmount?: number;
  /** Grain coarseness; higher is finer. Defaults to 0.8. */
  grainScale?: number;
  /** How many scratches can be visible at once. Defaults to 4. 0 skips the scratch layer. */
  scratchCount?: number;
  /** Scratch brightness, 0-1. Defaults to 0.5. */
  scratchIntensity?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

/**
 * A text overlay that owns its own timing and screen position, instead of being
 * welded to one scene the way `SceneOverlay` is.
 *
 * The two coexist deliberately: `SceneOverlay` stays the simple "one label on
 * this scene" path, while these are timeline clips that can start and end
 * anywhere, span a scene cut, or overlap each other. Both render.
 */
export interface OverlayClipData {
  id: string;
  /** Defaults to 'text' for every row written before this field existed. */
  kind: OverlayClipKind;
  text: string;
  /** Small label above the headline. Only read by the 'chapter-card' preset. */
  kickerText?: string;
  preset: OverlayPreset;
  color: string;
  fontSize?: number;
  /**
   * Centre of the overlay as a percentage of frame width/height. Percentages
   * rather than pixels so a single value is correct in 16:9, 9:16 and 1:1, and
   * identical between the editor's scaled-down <Player> and the full-res render.
   *
   * For a graphic-card kind, this centres the whole card (checklist-card) or
   * the headline+cutout group (title-cutout-card) — see the `kind`-specific
   * data types above for what else that kind reads.
   */
  xPercent: number;
  yPercent: number;
  /** Darkens the footage behind this clip, for the length of this clip only. */
  dimBackground?: boolean;
  startInSeconds: number;
  durationInSeconds: number;
  /**
   * Kind-specific fields, unenforced JSON — `kind` and `templateData` must
   * always agree (e.g. a 'checklist-card' row should carry `ChecklistCardData`
   * shaped data, never `TitleCutoutCardData`). Render paths must guard on
   * `kind` before reading fields off this rather than assume they're present.
   */
  templateData?:
    | ChecklistCardData
    | TitleCutoutCardData
    | DimScrimData
    | ParticleFieldData
    | LightBeamData
    | LightSweepData
    | FilmDamageData
    | Record<string, never>;
}

export type TransitionType =
  | 'none'
  | 'crossfade'
  | 'slide'
  | 'zoom'
  | 'glitch'
  | 'light-leak';

export interface SceneTransitionConfig {
  type: TransitionType;
  /**
   * The user's REQUESTED length. Clamped against neighbour scene durations by
   * `layoutScenes` at render time, never on write — the legal maximum changes every
   * time an adjacent scene is resized, so a value clamped on write goes stale with
   * no event that would recompute it.
   */
  durationInSeconds: number;
}

export interface CompositionScene {
  id: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  durationInSeconds: number;
  trimStartInSeconds: number;
  overlay?: SceneOverlay;
  /**
   * The transition INTO this scene (between the previous scene and this one).
   * Ignored for the first scene, which has nothing to transition from.
   */
  transition?: SceneTransitionConfig;
  /**
   * Opt-in slow pan/zoom over a static image, so an image scene isn't a frozen frame
   * for its whole on-screen life. Ignored when `mediaType !== 'image'` — video already
   * carries its own motion.
   *
   * Independent of `transition`: that governs movement BETWEEN two scenes, this is
   * movement WITHIN one. A scene can legitimately have both.
   *
   * Carries no direction/variant — `KenBurns` derives that from `id`, so the same
   * scene animates identically on every preview and export.
   */
  kenBurnsEnabled?: boolean;
}

/**
 * An audio clip dragged onto the A1/A2 tracks from the Media panel.
 *
 * Distinct from `audioUrl` (the single master narration track, which always starts
 * at frame 0): these are positioned anywhere on the timeline and carry their own
 * trim and volume. Until this existed, the render payload had no field for them at
 * all, so dragged-in music was audible while editing and silently absent from the
 * exported .mp4.
 */
export interface CompositionAudioClip {
  id: string;
  /**
   * MUST be a server-fetchable URL. A `blob:` URL is meaningless to the headless
   * renderer, so the editor resolves this from the asset's persisted URL and drops
   * (loudly) any clip that doesn't have one yet.
   */
  src: string;
  /** Seconds from the start of the timeline at which this clip begins. */
  startInSeconds: number;
  durationInSeconds: number;
  /** Seconds skipped from the head of the source file. */
  trimStartInSeconds: number;
  /** 0-1, with the owning track's volume already folded in. */
  volume: number;
}

/**
 * One spoken word with its timing, from the Deepgram pass that already runs during
 * narration generation.
 *
 * Deliberately minimal and provider-neutral — `@remotion/captions` wants a richer
 * `Caption` shape (with confidence and a midpoint timestamp), but those fields are
 * reconstructible, so storing them would just be denormalised weight in the database.
 */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Declared as a `type` alias, not an `interface`, on purpose.
 *
 * Remotion's `<Composition>` and `<Player>` constrain their component's props to
 * `Record<string, unknown>`. TypeScript gives object *type aliases* an implicit
 * index signature but withholds one from interfaces (an interface can be reopened
 * by declaration merging, so its keys aren't final). Switching to a type alias is
 * what makes `component={VideoComposition}` assignable — and it's also what lets
 * `calculateMetadata` in Root.tsx infer real prop types instead of `{}`.
 */
export type VideoCompositionProps = {
  scenes: CompositionScene[];
  audioUrl?: string;
  /**
   * Deliberately omitted from the live preview's props: the editor already plays
   * these through hidden native <audio> elements, so feeding them to the <Player>
   * as well makes every clip play twice, slightly out of sync. Render payload only.
   */
  audioClips?: CompositionAudioClip[];
  /**
   * Independent text-overlay clips (the OV track). Included in the live preview
   * for the same reason captions are: they're picture, not sound, so there's no
   * double-playback hazard the way there is with `audioClips`.
   */
  overlayClips?: OverlayClipData[];
  /**
   * Word-level narration timings driving auto-captions. Unlike `audioClips`, these
   * ARE included in the live preview — captions are picture, not sound, so showing
   * them in the Player cannot double up with the editor's native <audio> elements.
   */
  captionWords?: CaptionWord[];
  /** Global on/off. Captions render only when this is true AND words are present. */
  showCaptions?: boolean;
  fps: number;
  width: number;
  height: number;
  durationInFrames?: number;
};
