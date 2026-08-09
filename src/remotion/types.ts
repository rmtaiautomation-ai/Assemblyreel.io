/**
 * Shared types for Remotion compositions.
 * These mirror the scene data from the Timeline Editor.
 */

export type OverlayPreset = 'slide' | 'pop' | 'typewriter' | 'lower-third' | 'none';

export interface SceneOverlay {
  text: string;
  preset: OverlayPreset;
  color: string;
  fontSize?: number;
  position?: 'center' | 'bottom' | 'top';
}

export interface CompositionScene {
  id: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  durationInSeconds: number;
  trimStartInSeconds: number;
  overlay?: SceneOverlay;
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
  fps: number;
  width: number;
  height: number;
  durationInFrames?: number;
};
