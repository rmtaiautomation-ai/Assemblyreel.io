/**
 * The 6 "transition sound" presets draggable onto the A2 track — short SFX
 * stingers centered on a scene cut, the audio sibling of the V1 transition
 * cards. Plain data (no UI imports) so both the Timeline Editor (card labels)
 * and the `getOrCreatePresetMedia` server action (resolving a media row) can
 * import it without a UI -> server or server -> UI dependency either way.
 *
 * `url` points at placeholder WAV files under public/audio/transitions/ —
 * swapping in real SFX later is a file replacement, not a code change, as
 * long as the replacement keeps the same filename and roughly the same
 * duration (a big duration mismatch would throw off the "centered on the
 * cut" math downstream, since `durationSeconds` here is what's used to
 * compute where a dropped clip's start time lands).
 */
export interface TransitionMusicPreset {
  key: string;
  label: string;
  url: string;
  durationSeconds: number;
}

export const TRANSITION_MUSIC_PRESETS: TransitionMusicPreset[] = [
  { key: 'preset-1', label: 'Whoosh', url: '/audio/transitions/preset-1.wav', durationSeconds: 1.5 },
  { key: 'preset-2', label: 'Swipe', url: '/audio/transitions/preset-2.wav', durationSeconds: 1.5 },
  { key: 'preset-3', label: 'Riser', url: '/audio/transitions/preset-3.wav', durationSeconds: 2 },
  { key: 'preset-4', label: 'Impact', url: '/audio/transitions/preset-4.wav', durationSeconds: 1.5 },
  { key: 'preset-5', label: 'Sweep', url: '/audio/transitions/preset-5.wav', durationSeconds: 2 },
  { key: 'preset-6', label: 'Pulse', url: '/audio/transitions/preset-6.wav', durationSeconds: 1.5 },
];

export const getTransitionMusicPreset = (key: string): TransitionMusicPreset | undefined =>
  TRANSITION_MUSIC_PRESETS.find((p) => p.key === key);
