import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  Img,
  OffthreadVideo,
  Audio,
  interpolate,
  delayRender,
  continueRender,
} from 'remotion';
import { waitForFonts } from '../fonts';
import type { DimScrimData, FilmDamageData, LightBeamData, LightSweepData, OverlayClipData, OverlayClipKind, ParticleFieldData, SceneOverlay, VideoCompositionProps } from '../types';
import { isEnvironmentalKind } from '../types';
import { layoutScenes } from '../timeline';
import { SceneTransition } from '../transitions/SceneTransition';
import { CaptionTrack } from '../captions/CaptionTrack';
import { KenBurns } from '../effects/KenBurns';
import { renderPreset } from '../overlays/renderPreset';
import { OverlayFrame, defaultAlignForPreset } from '../overlays/OverlayFrame';
import { isCardKind, readStyleId, resolveCardStyle } from '../templates/card-registry';
import { CARD_STYLE_COMPONENTS, UnknownCardStyle } from '../templates/card-styles';
import { DimScrim } from '../templates/DimScrim';
import { ParticleField } from '../templates/ParticleField';
import { LightBeam } from '../templates/LightBeam';
import { LightSweep } from '../templates/LightSweep';
import { FilmDamage } from '../templates/FilmDamage';

/**
 * Paint order within the OV track. A scrim must sit under the light it's
 * paired with, and both must sit under text: a lower-third lit or dimmed by an
 * atmospheric layer looks like a bug, not an effect.
 *
 * This replaced a two-bucket `dim-scrim` vs. everything-else split, which
 * quietly put a beam in the same bucket as text and left array creation order
 * to decide whether it washed over the captions.
 *
 * The branch ORDER is load-bearing: both special cases must be tested before
 * the general `isEnvironmentalKind` fallthrough, or they collapse into rank 1.
 * Tidying either of them below it compiles fine and silently misplaces a layer.
 */
const zRank = (kind: OverlayClipKind): number => {
  if (kind === 'dim-scrim') return 0;
  // The one environmental kind that paints ABOVE text rather than below it.
  // Print damage sits on the film, so anything composited into the shot is
  // scratched and grained too — captions floating pristine over grain is the
  // single most obvious tell that the effect is fake.
  if (kind === 'film-damage') return 3;
  if (isEnvironmentalKind(kind)) return 1;
  return 2;
};

/**
 * Main Remotion composition that sequences all scenes, overlays, and audio.
 *
 * Scene placement comes from `layoutScenes`, which is shared with the editor so the
 * Player's reported length and the composition's actual last frame can't disagree.
 * A scene carrying a transition is started early and lengthened by the same amount,
 * leaving its end frame — and therefore the whole timeline — unchanged.
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  audioUrl,
  audioClips,
  overlayClips,
  captionWords,
  showCaptions,
}) => {
  const { fps } = useVideoConfig();

  /**
   * Holds the render open until every typeface in `fonts.ts` has actually
   * loaded.
   *
   * Without this, Lambda — which renders a job as independent chunks on
   * separate workers — can capture frames before a face resolves, so part of
   * the video draws in fallback metrics and part in the real font. It changes
   * mid-video, and nothing errors. The Player is unaffected either way, which
   * is precisely what makes the bug easy to ship.
   *
   * `useState` for the handle so it is created exactly once per mount; this
   * component re-runs on every frame.
   */
  const [fontHandle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    let cancelled = false;
    waitForFonts()
      .then(() => {
        if (!cancelled) continueRender(fontHandle);
      })
      .catch((err) => {
        // Never strand the render on a font failure — a video in fallback type
        // beats a job that hangs until it times out.
        console.error('[VideoComposition] Font loading failed:', err);
        continueRender(fontHandle);
      });
    return () => {
      cancelled = true;
    };
  }, [fontHandle]);

  // The Player re-invokes this whole component on every frame during playback (that's
  // how Remotion works — frame-driven, not incremental), so an unmemoized layoutScenes
  // pass over every scene ran 30-60x/sec regardless of scene count. Invisible on a
  // handful of short-form scenes; on a 200+ scene long-form project this was the actual
  // cost behind visible playback jank. `scenes` doesn't change frame-to-frame, so this
  // only needs to recompute when the project's scene list itself changes.
  const { segments } = useMemo(() => layoutScenes(scenes, fps), [scenes, fps]);

  const renderOverlay = (overlay: SceneOverlay, nominalDurationInFrames: number) => (
    <OverlayFrame defaultAlign={defaultAlignForPreset(overlay.preset)}>
      {renderPreset(overlay.preset, {
        text: overlay.text,
        color: overlay.color,
        fontSize: overlay.fontSize,
        durationInFrames: nominalDurationInFrames,
      })}
    </OverlayFrame>
  );

  /**
   * WHAT renders inside the OverlayFrame for a given clip.
   *
   * Graphic-card kinds resolve through the style registry rather than being
   * branched on here, so adding a design touches the registry only and never
   * this file. Everything else — timing, positioning, the scrim — is handled
   * once in `renderOverlayClip` below regardless of kind.
   */
  const renderOverlayClipContent = (clip: OverlayClipData, durationInFrames: number) => {
    if (isCardKind(clip.kind)) {
      const styleId = readStyleId(clip.templateData);
      const style = resolveCardStyle(clip.kind, styleId);
      // Unresolvable means this build doesn't have the style — realistically a
      // stale Lambda bundle. Render a loud marker, never a quiet substitute;
      // see `UnknownCardStyle` for why that distinction matters.
      if (!style) return <UnknownCardStyle styleId={styleId} />;
      const StyleComponent = CARD_STYLE_COMPONENTS[style.id];
      return <StyleComponent clip={clip} durationInFrames={durationInFrames} />;
    }

    return renderPreset(
      clip.preset,
      {
        text: clip.text,
        color: clip.color,
        fontSize: clip.fontSize,
        durationInFrames,
      },
      clip.kickerText
    );
  };

  /**
   * WHAT renders for a full-frame environmental clip. Same "guard on `kind`
   * before reading `templateData`" contract as `renderOverlayClipContent` —
   * `template_data` is unenforced JSON, so every field is read optionally and
   * falls back to the component's own default rather than throwing.
   */
  const renderEnvironmentalClip = (clip: OverlayClipData, durationInFrames: number) => {
    if (clip.kind === 'particles') {
      const data = clip.templateData as ParticleFieldData | undefined;
      return (
        <ParticleField
          count={data?.count}
          color={clip.color}
          speed={data?.speed}
          sizeScale={data?.sizeScale}
          xBias={data?.xBias}
          fadeInSeconds={data?.fadeInSeconds}
          fadeOutSeconds={data?.fadeOutSeconds}
          durationInFrames={durationInFrames}
        />
      );
    }

    if (clip.kind === 'light-beam') {
      const data = clip.templateData as LightBeamData | undefined;
      return (
        <LightBeam
          xPercent={data?.xPercent}
          width={data?.width}
          intensity={data?.intensity}
          color={clip.color}
          fadeInSeconds={data?.fadeInSeconds}
          fadeOutSeconds={data?.fadeOutSeconds}
          durationInFrames={durationInFrames}
        />
      );
    }

    if (clip.kind === 'light-sweep') {
      const data = clip.templateData as LightSweepData | undefined;
      return (
        <LightSweep
          width={data?.width}
          intensity={data?.intensity}
          cycleSeconds={data?.cycleSeconds}
          angle={data?.angle}
          reverse={data?.reverse}
          color={clip.color}
          fadeInSeconds={data?.fadeInSeconds}
          fadeOutSeconds={data?.fadeOutSeconds}
          durationInFrames={durationInFrames}
        />
      );
    }

    if (clip.kind === 'film-damage') {
      const data = clip.templateData as FilmDamageData | undefined;
      return (
        <FilmDamage
          grainAmount={data?.grainAmount}
          grainScale={data?.grainScale}
          scratchCount={data?.scratchCount}
          scratchIntensity={data?.scratchIntensity}
          color={clip.color}
          fadeInSeconds={data?.fadeInSeconds}
          fadeOutSeconds={data?.fadeOutSeconds}
          durationInFrames={durationInFrames}
        />
      );
    }

    const data = clip.templateData as DimScrimData | undefined;
    return (
      <DimScrim
        color={clip.color}
        opacity={data?.opacity}
        fadeInSeconds={data?.fadeInSeconds}
        fadeOutSeconds={data?.fadeOutSeconds}
        durationInFrames={durationInFrames}
      />
    );
  };

  /**
   * An overlay clip from the OV track — its own timing and its own position,
   * unrelated to whatever scene happens to be underneath it.
   */
  const renderOverlayClip = (clip: OverlayClipData) => {
    const from = Math.max(0, Math.round(clip.startInSeconds * fps));
    const durationInFrames = Math.max(1, Math.round(clip.durationInSeconds * fps));

    // The environmental kinds are full-frame atmospheric layers with no
    // text/card content, so they skip OverlayFrame entirely rather than being
    // centred like every other kind. Note they skip it for DIFFERENT reasons:
    // a scrim, a particle field and film damage genuinely have no position,
    // while a light beam does — it just needs continuous animated positioning
    // through its own gradient mask, which the 9-slot grid cannot express.
    if (isEnvironmentalKind(clip.kind)) {
      return (
        <Sequence key={`overlay-${clip.id}`} from={from} durationInFrames={durationInFrames}>
          {renderEnvironmentalClip(clip, durationInFrames)}
        </Sequence>
      );
    }

    // A full-bleed card style paints to the frame edges and positions itself —
    // a chapter plate covering the shot, or a list anchored to a frame edge.
    // OverlayFrame would centre it on xPercent/yPercent AND clamp it to 90%
    // width, which puts a margin of undimmed footage around a layer whose job
    // is to cover, and pulls an edge-anchored rail off its edge. So these skip
    // it, for the same reason (and by the same mechanism) the environmental
    // kinds above do.
    const cardStyle = isCardKind(clip.kind)
      ? resolveCardStyle(clip.kind, readStyleId(clip.templateData))
      : null;

    return (
      <Sequence key={`overlay-${clip.id}`} from={from} durationInFrames={durationInFrames}>
        {/* Scrim sized to THIS clip, not to a scene: the whole point of the OV
            track is that a clip's life doesn't line up with scene boundaries,
            so the dimming can't either. */}
        {clip.dimBackground && (
          <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
        )}
        {cardStyle?.fullBleed ? (
          <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {renderOverlayClipContent(clip, durationInFrames)}
          </AbsoluteFill>
        ) : (
          <OverlayFrame xPercent={clip.xPercent} yPercent={clip.yPercent}>
            {renderOverlayClipContent(clip, durationInFrames)}
          </OverlayFrame>
        )}
      </Sequence>
    );
  };

  // Same reasoning as the layoutScenes memo above: this creates a `<Sequence>` subtree
  // per scene (207 of them on a long-form project), and without memoization the Player
  // rebuilt and re-diffed all of them on every frame during playback even though only
  // one Sequence is ever actually visible at a time. Frame-reactive behavior inside
  // (KenBurns, OffthreadVideo, SceneTransition, the overlay) still updates correctly —
  // those subscribe to Remotion's own current-frame context directly, independent of
  // whether this parent array was rebuilt.
  const sceneSequences = useMemo(
    () =>
      segments.map((segment) => {
        const { scene, transitionInFrames } = segment;
        const hasOverlay = Boolean(scene.overlay && scene.overlay.preset !== 'none');

        return (
          <Sequence
            key={scene.id}
            from={segment.renderFrom}
            durationInFrames={segment.renderDurationInFrames}
          >
            <SceneTransition
              type={segment.transitionType}
              durationInFrames={transitionInFrames}
              sceneId={scene.id}
            >
              <AbsoluteFill>
                {/* Media layer */}
                {scene.mediaType === 'video' && scene.mediaUrl ? (
                  <OffthreadVideo
                    src={scene.mediaUrl}
                    // `startFrom` is deprecated in Remotion 4.x in favour of `trimBefore`.
                    //
                    // Pulled back by `transitionInFrames`: OffthreadVideo shows source
                    // frame `trimBefore + sequenceLocalFrame`, and this sequence starts
                    // that many frames early, so without the correction the clip would
                    // already be that far in by the time the scene's nominal start
                    // arrives. Spending the transition on the clip's own pre-roll handle
                    // is what an NLE does. Clamped at 0, so an untrimmed clip simply
                    // plays from its first frame and gives up the handle.
                    trimBefore={Math.max(
                      0,
                      Math.round((scene.trimStartInSeconds || 0) * fps) - transitionInFrames
                    )}
                    // The clip's own soundtrack would otherwise hard-cut in early, on
                    // top of the outgoing scene's. Ramp it with the picture. Guarded
                    // because interpolate() throws on a zero-width input range, which
                    // is the (common) no-transition case.
                    volume={
                      transitionInFrames > 0
                        ? (f: number) =>
                          interpolate(f, [0, transitionInFrames], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                          })
                        : 1
                    }
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : scene.mediaUrl && scene.kenBurnsEnabled ? (
                  // Handed the RENDER duration, not the nominal one, so the pan is
                  // already in motion at the moment a transition finishes revealing
                  // the scene rather than starting from a standstill on the nominal
                  // boundary — the same reasoning as OffthreadVideo's pre-roll above.
                  <KenBurns
                    src={scene.mediaUrl}
                    sceneId={scene.id}
                    durationInFrames={segment.renderDurationInFrames}
                  />
                ) : scene.mediaUrl ? (
                  <Img
                    src={scene.mediaUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  // Fallback: dark gradient placeholder
                  <AbsoluteFill
                    style={{
                      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
                    }}
                  />
                )}

                {/* Overlay layer, re-anchored to the scene's NOMINAL bounds.
                    The outer Sequence starts `transitionInFrames` early, which moves
                    useCurrentFrame()'s origin — that would drag every overlay's entry
                    forward and compute its durationInFrames-relative exit against the
                    wrong end frame. This inner Sequence puts frame 0 back on the
                    nominal scene start and hands the overlay the nominal length, so
                    overlay timing is identical with or without a transition, and no
                    overlay component needs to know transitions exist. */}
                {hasOverlay && scene.overlay && (
                  <Sequence
                    from={transitionInFrames}
                    durationInFrames={segment.durationInFrames}
                    layout="none"
                  >
                    {renderOverlay(scene.overlay, segment.durationInFrames)}
                  </Sequence>
                )}
              </AbsoluteFill>
            </SceneTransition>
          </Sequence>
        );
      }),
    [segments, fps]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Scene sequences */}
      {sceneSequences}

      {/* OV track — independent overlay clips. Rendered after the scene
          sequences (so they paint above every scene, its own overlay, and any
          transition) but BEFORE captions, which stay the topmost layer.
          Within the track, `zRank` decides paint order rather than array
          order: array order is just whatever order clips happened to be
          created in, not a deliberate z-order the user controls. Sorted with a
          copy — `overlayClips` is a prop and sorting in place would mutate the
          caller's array. */}
      {[...(overlayClips ?? [])]
        .sort((a, b) => zRank(a.kind) - zRank(b.kind))
        .map(renderOverlayClip)}

      {/* Auto-captions. Rendered AFTER the scene sequences so they paint above every
          scene and above scene overlays — a caption hidden behind a transition or a
          lower-third would be worse than no caption at all. Timed to the narration's
          own absolute timeline, so transitions (which never move nominal scene
          boundaries) cannot desync them. */}
      {showCaptions && captionWords && captionWords.length > 0 && (
        <CaptionTrack words={captionWords} />
      )}

      {/* Global audio track (voiceover / narration) — always starts at frame 0.
          The A1 bar can be grabbed in the editor but springs back to 0, so there is
          deliberately no offset to honor here. */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} />
      )}

      {/* A1/A2 clips dragged in from the Media panel.
          Each is wrapped in its own <Sequence> so it starts at its timeline
          position; `trimBefore` then offsets playback within the source file, so
          at timeline frame `from` the clip is heard from `trimStartInSeconds`. */}
      {(audioClips ?? []).map((clip) => (
        <Sequence
          key={`clip-${clip.id}`}
          from={Math.max(0, Math.round(clip.startInSeconds * fps))}
          durationInFrames={Math.max(1, Math.round(clip.durationInSeconds * fps))}
        >
          <Audio
            src={clip.src}
            trimBefore={Math.max(0, Math.round(clip.trimStartInSeconds * fps))}
            volume={clip.volume}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
