import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';

/**
 * How far past full-frame the image sits for the pan variants.
 *
 * This is the whole no-revealed-edges budget: at 1.15 there is (1.15 - 1) / 2 = 7.5%
 * of the frame hidden beyond each edge, and any pan has to stay inside that or the
 * backdrop shows through as a moving black band.
 */
const BASE_SCALE = 1.15;

/** Single-axis pan distance, as a percentage of frame size. Must stay under 7.5%. */
const PAN = 6;

/**
 * Per-axis distance for the diagonal variants. Each axis has its own independent 7.5%
 * of headroom, so this doesn't strictly need to be smaller than PAN — it is anyway,
 * because a diagonal covering the full PAN on both axes travels ~1.4x as far and reads
 * as a noticeably faster drift than the straight pans.
 */
const DIAGONAL_PAN = 4.5;

/** Scale endpoints for the zoom variants. Both are >= 1, so no edge can be revealed. */
const ZOOM_MIN = 1.05;
const ZOOM_MAX = 1.25;

interface Motion {
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
  fromScale: number;
  toScale: number;
}

/**
 * The eight motions, in a fixed order — the index is what the scene id hashes onto, so
 * reordering this array silently re-rolls the motion of every existing scene. Append
 * rather than insert.
 *
 * All values are percentages of frame size or unitless scale factors, never pixels, so
 * a 1080x1920 export and a 1920x1080 one get proportionally identical motion, and a
 * 30fps -> 60fps switch changes nothing (progress is normalised over the scene's own
 * frame count below).
 */
const MOTIONS: Motion[] = [
  // Pan left: the frame travels left, i.e. the image slides right-to-left past it.
  { fromX: PAN, toX: -PAN, fromY: 0, toY: 0, fromScale: BASE_SCALE, toScale: BASE_SCALE },
  // Pan right
  { fromX: -PAN, toX: PAN, fromY: 0, toY: 0, fromScale: BASE_SCALE, toScale: BASE_SCALE },
  // Pan up
  { fromX: 0, toX: 0, fromY: PAN, toY: -PAN, fromScale: BASE_SCALE, toScale: BASE_SCALE },
  // Pan down
  { fromX: 0, toX: 0, fromY: -PAN, toY: PAN, fromScale: BASE_SCALE, toScale: BASE_SCALE },
  // Zoom in
  { fromX: 0, toX: 0, fromY: 0, toY: 0, fromScale: ZOOM_MIN, toScale: ZOOM_MAX },
  // Zoom out
  { fromX: 0, toX: 0, fromY: 0, toY: 0, fromScale: ZOOM_MAX, toScale: ZOOM_MIN },
  // Diagonal, drifting up-and-right
  {
    fromX: -DIAGONAL_PAN,
    toX: DIAGONAL_PAN,
    fromY: DIAGONAL_PAN,
    toY: -DIAGONAL_PAN,
    fromScale: BASE_SCALE,
    toScale: BASE_SCALE,
  },
  // Diagonal, drifting down-and-left
  {
    fromX: DIAGONAL_PAN,
    toX: -DIAGONAL_PAN,
    fromY: -DIAGONAL_PAN,
    toY: DIAGONAL_PAN,
    fromScale: BASE_SCALE,
    toScale: BASE_SCALE,
  },
];

/**
 * djb2. Any stable string hash would do — the requirement is only that it is a pure
 * function of the id, so the picked motion survives a re-render, a page reload, and the
 * jump from the editor's <Player> to the headless renderer. `Math.random()` would
 * re-roll on every one of those.
 */
const hashString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    // >>> 0 keeps this in unsigned 32-bit range; without it the value goes negative
    // and the modulo below can return a negative index.
    hash = (((hash << 5) + hash + value.charCodeAt(i)) & 0xffffffff) >>> 0;
  }
  return hash;
};

export const pickMotion = (sceneId: string): Motion =>
  MOTIONS[hashString(sceneId) % MOTIONS.length];

export interface KenBurnsProps {
  src: string;
  /** Drives the deterministic motion pick. Any stable per-scene string works. */
  sceneId: string;
  /**
   * The length the image is actually on screen for — pass the segment's RENDER
   * duration, transition pre-roll included, so the motion is already underway when a
   * transition finishes revealing the scene rather than starting from a standstill at
   * the nominal boundary.
   */
  durationInFrames: number;
}

/**
 * A slow pan or zoom over a static image, for the length of one scene.
 *
 * Frame-driven off the local `useCurrentFrame()`, which is safe here without the
 * re-anchoring <Sequence> the overlays need: this sits at exactly the nesting level the
 * plain <Img> sits at today, and its caller hands it the matching render duration, so
 * local frame 0 and the animation's start are the same instant by construction.
 */
export const KenBurns: React.FC<KenBurnsProps> = ({ src, sceneId, durationInFrames }) => {
  const frame = useCurrentFrame();
  const motion = pickMotion(sceneId);

  // `layoutScenes` guarantees >= 1 frame, which would still leave interpolate() with a
  // zero-width [0, 0] input range and a thrown error. Clamping the span (not the
  // duration) keeps a 1-frame scene on its start pose instead.
  const span = Math.max(1, durationInFrames - 1);

  const progress = interpolate(frame, [0, span], [0, 1], {
    // Soft at both ends, near-constant through the middle: a linear pan reads as a
    // mechanical slide, and a one-sided ease looks like the motion was cut off.
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const x = interpolate(progress, [0, 1], [motion.fromX, motion.toX]);
  const y = interpolate(progress, [0, 1], [motion.fromY, motion.toY]);
  const scale = interpolate(progress, [0, 1], [motion.fromScale, motion.toScale]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Order matters: with translate FIRST in the list, its percentages resolve
          // against the untransformed box and are not multiplied by the scale, so the
          // pan constants above stay directly comparable to the overscan budget.
          transform: `translate(${x}%, ${y}%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      />
    </AbsoluteFill>
  );
};
