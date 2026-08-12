import React from 'react';
import { AbsoluteFill } from 'remotion';

/**
 * Owns WHERE an overlay sits, so the preset components can own only HOW it
 * moves.
 *
 * Before this existed every preset wrapped itself in a centering `AbsoluteFill`
 * (and LowerThird in a bottom-left absolute box), which made free positioning
 * impossible — a dragged position had nowhere to go, since the preset always
 * overrode it. Pulling placement out into one component is what lets overlay
 * clips be dragged anywhere while the older scene-scoped overlays keep landing
 * exactly where they always have.
 *
 * Two modes, deliberately:
 *   - `xPercent`/`yPercent` given → free positioning, the box CENTRED on that
 *     point. Used by overlay clips, whose position is user-dragged data.
 *   - neither given → `defaultAlign` reproduces the pre-existing layout for the
 *     scene-scoped `SceneOverlay` path, which has no position data of its own.
 *     This is why that path can't regress: it never takes the new code path.
 */
export type OverlayAlign = 'center' | 'bottom-left';

interface OverlayFrameProps {
  xPercent?: number;
  yPercent?: number;
  defaultAlign?: OverlayAlign;
  children: React.ReactNode;
}

export const OverlayFrame: React.FC<OverlayFrameProps> = ({
  xPercent,
  yPercent,
  defaultAlign = 'center',
  children,
}) => {
  const isFreePositioned = xPercent !== undefined && yPercent !== undefined;

  if (isFreePositioned) {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: `${xPercent}%`,
            top: `${yPercent}%`,
            // The stored percentage is the overlay's CENTRE, not its top-left
            // corner — that's what makes "drop it in the middle of the frame"
            // land where the user expects regardless of how long the text is.
            transform: 'translate(-50%, -50%)',
            // Keeps a long headline from running off-frame at extreme
            // positions; the text wraps instead.
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    );
  }

  if (defaultAlign === 'bottom-left') {
    // Byte-for-byte the geometry LowerThird used to apply to itself.
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', bottom: '12%', left: '6%' }}>{children}</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * Which default layout a preset expects when it has no explicit position —
 * i.e. when rendered through the scene-scoped overlay path.
 *
 * Only LowerThird differs: a lower third that renders dead-centre isn't a lower
 * third. Everything else has always centred.
 */
export const defaultAlignForPreset = (preset: string): OverlayAlign =>
  preset === 'lower-third' ? 'bottom-left' : 'center';
