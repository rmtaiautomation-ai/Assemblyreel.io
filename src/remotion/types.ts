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
 * A text overlay that owns its own timing and screen position, instead of being
 * welded to one scene the way `SceneOverlay` is.
 *
 * The two coexist deliberately: `SceneOverlay` stays the simple "one label on
 * this scene" path, while these are timeline clips that can start and end
 * anywhere, span a scene cut, or overlap each other. Both render.
 */
export interface OverlayClipData {
  id: string;
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
   */
  xPercent: number;
  yPercent: number;
  /** Darkens the footage behind this clip, for the length of this clip only. */
  dimBackground?: boolean;
  startInSeconds: number;
  durationInSeconds: number;
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
