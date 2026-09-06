import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import type { OverlayClipData } from '../types';
import { CARD_STYLES, CARD_STYLE_ORDER, type CardStyleId } from '../templates/card-registry';
import { CARD_STYLE_COMPONENTS } from '../templates/card-styles';

/**
 * ── Design harness for the card style library (development only) ─────────
 *
 * Renders ONE card style over a stand-in background so a design can be
 * inspected as a still at any frame, at any composition size, without
 * building a project in the editor and without AWS.
 *
 * Not referenced by the app — `VideoComposition` never imports this. It is
 * registered as its own composition in `Root.tsx` so `remotion still` can
 * target it:
 *
 *     npx remotion still src/remotion/index.ts StyleSheet out.png \
 *       --props='{"styleId":"dossier-stamp"}' --frame=45
 *
 * Kept in the repo rather than thrown away because the per-style verification
 * this feature needs — does the design hold at 1080x1920, 1920x1080 and
 * 1080x1080? does the reveal land in time? — has to be repeatable every time a
 * style is touched, and the alternative is checking twelve designs by hand in
 * the editor.
 */

/**
 * A type alias, not an interface: Remotion's `<Composition>` requires props
 * assignable to `Record<string, unknown>`, and an interface gets no implicit
 * index signature.
 */
export type StyleSheetProps = {
  styleId: CardStyleId;
};

/** Stand-in content, chosen to expose layout problems rather than flatter them. */
const SAMPLE_TEXT: Record<'title' | 'list', string> = {
  // Long enough to wrap and to force StackWipe into three lines.
  title: 'The Archangel Who Holds The Record',
  list: 'Three Things The Text Says',
};

const SAMPLE_BULLETS = [
  'The scribe is named, not anonymous',
  'The record is kept continuously',
  'Nothing in it can be revised',
];

export const StyleSheet: React.FC<StyleSheetProps> = ({ styleId }) => {
  const { durationInFrames } = useVideoConfig();
  const style = CARD_STYLES[styleId] ?? CARD_STYLES[CARD_STYLE_ORDER[0]];
  const StyleComponent = CARD_STYLE_COMPONENTS[style.id];

  const isList = style.kind === 'checklist-card';

  const clip: OverlayClipData = {
    id: 'preview',
    kind: style.kind,
    text: isList ? SAMPLE_TEXT.list : SAMPLE_TEXT.title,
    preset: 'cinematic-reveal',
    // A warm archival accent — the documentary register these styles target.
    color: '#C9A227',
    xPercent: 50,
    yPercent: 50,
    startInSeconds: 0,
    durationInSeconds: durationInFrames / 30,
    templateData: {
      styleId: style.id,
      ...style.defaults,
      ...(isList ? { bullets: SAMPLE_BULLETS } : {}),
    },
  };

  return (
    <AbsoluteFill>
      {/* A mid-tone gradient rather than flat black: a card that only reads
          against pure black is not actually legible over footage. */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #2b2f3a 0%, #14161c 55%, #3a2f24 100%)',
        }}
      />
      <Sequence durationInFrames={durationInFrames}>
        {style.fullBleed ? (
          <AbsoluteFill>
            <StyleComponent clip={clip} durationInFrames={durationInFrames} />
          </AbsoluteFill>
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <StyleComponent clip={clip} durationInFrames={durationInFrames} />
          </AbsoluteFill>
        )}
      </Sequence>
    </AbsoluteFill>
  );
};
