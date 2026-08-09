import type { CompositionScene, TransitionType } from './types';

/**
 * The single place scene frame math happens.
 *
 * This calculation was previously duplicated four ways with two different rounding
 * strategies — `VideoComposition` and `Root` round per scene then sum, while
 * `TimelineEditor` summed seconds then rounded once — which can disagree by up to N/2
 * frames across N scenes. The `<Player>`'s `durationInFrames` and the composition's
 * actual last frame were therefore never quite the same number.
 */

export interface SceneLayout {
  scene: CompositionScene;
  index: number;
  /** Nominal start frame — the untouched running accumulator. Narration syncs to THIS. */
  from: number;
  /** Nominal length in frames. What overlays are anchored to. */
  durationInFrames: number;
  /** Resolved type: 'none' whenever the clamped duration collapsed to zero. */
  transitionType: TransitionType;
  /** Clamped, integer. 0 for index 0, for type 'none', or when neighbours are too short. */
  transitionInFrames: number;
  /**
   * The NEXT scene's `transitionInFrames`, or 0 for the last scene. Unused today; it
   * is the hook a real "push" (where the outgoing scene also moves) would need.
   */
  transitionOutFrames: number;
  /** What actually goes on `<Sequence from>`. */
  renderFrom: number;
  /** What actually goes on `<Sequence durationInFrames>`. */
  renderDurationInFrames: number;
}

export interface SceneLayoutResult {
  segments: SceneLayout[];
  /** Sum of NOMINAL durations. Transitions never change this — that is the point. */
  totalDurationInFrames: number;
}

/**
 * Lays scenes out on the timeline, resolving each scene's incoming transition.
 *
 * The load-bearing property: a scene with a transition starts `D` frames EARLY and is
 * `D` frames LONGER, so `(from - D) + (duration + D) === from + duration`. Its end
 * frame — and therefore every subsequent scene's start, and the total length — is
 * unchanged. This is what lets transitions exist at all without drifting the picture
 * against the fixed master narration track, which is pinned at frame 0 and knows
 * nothing about scene layout.
 */
export function layoutScenes(
  scenes: CompositionScene[],
  fps: number
): SceneLayoutResult {
  const durations = scenes.map((scene) =>
    Math.max(1, Math.round((scene.durationInSeconds || 0) * fps))
  );

  const transitionInFrames = scenes.map((scene, i) => {
    // Nothing to transition from. This single guard is the whole reason the field
    // means "transition INTO this scene" rather than "out of it".
    if (i === 0) return 0;

    const transition = scene.transition;
    if (!transition || transition.type === 'none') return 0;

    const requested = Math.round((transition.durationInSeconds || 0) * fps);
    if (requested < 1) return 0;

    // Correctness alone only needs `requested <= durations[i - 1] - 1`: any longer and
    // the incoming scene would cover its predecessor before that predecessor was ever
    // fully visible. The half rule is deliberately stricter — it is what Premiere and
    // CapCut enforce, and it guarantees a steady-state hold on BOTH sides even when
    // consecutive scenes both carry transitions, since it implies
    // D(i) + D(i+1) <= dur(i). A 1-frame scene yields floor(1/2) = 0, so the
    // transition auto-disables rather than producing something degenerate.
    const maxFrames = Math.floor(Math.min(durations[i - 1], durations[i]) / 2);
    return Math.max(0, Math.min(requested, maxFrames));
  });

  let cumulative = 0;
  const segments: SceneLayout[] = scenes.map((scene, i) => {
    const from = cumulative;
    cumulative += durations[i];

    const tin = transitionInFrames[i];

    return {
      scene,
      index: i,
      from,
      durationInFrames: durations[i],
      // Collapse the type too when the clamp zeroed the duration, so the renderer
      // never has to re-derive "is this transition actually active".
      transitionType: tin > 0 ? scene.transition?.type ?? 'none' : 'none',
      transitionInFrames: tin,
      transitionOutFrames: transitionInFrames[i + 1] ?? 0,
      renderFrom: from - tin,
      renderDurationInFrames: durations[i] + tin,
    };
  });

  return { segments, totalDurationInFrames: Math.max(1, cumulative) };
}

/**
 * The longest transition this scene can actually use, in seconds — for driving a
 * slider's `max` in the editor so the UI cannot offer a value that would be silently
 * clamped away at render time.
 */
export function maxTransitionSeconds(
  scenes: CompositionScene[],
  index: number,
  fps: number
): number {
  if (index <= 0) return 0;

  const frames = (i: number) =>
    Math.max(1, Math.round((scenes[i]?.durationInSeconds || 0) * fps));

  return Math.floor(Math.min(frames(index - 1), frames(index)) / 2) / fps;
}
