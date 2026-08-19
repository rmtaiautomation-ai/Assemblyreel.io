import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  Img,
  OffthreadVideo,
  Audio,
  interpolate,
} from 'remotion';
import type { ChecklistCardData, DimScrimData, FilmDamageData, LightBeamData, LightSweepData, OverlayClipData, OverlayClipKind, OverlayPreset, ParticleFieldData, SceneOverlay, TitleCutoutCardData, VideoCompositionProps } from '../types';
import { isEnvironmentalKind } from '../types';
import { layoutScenes } from '../timeline';
import { SceneTransition } from '../transitions/SceneTransition';
import { CaptionTrack } from '../captions/CaptionTrack';
import { KenBurns } from '../effects/KenBurns';
import { SlideIn } from '../overlays/SlideIn';
import { PopIn } from '../overlays/PopIn';
import { Typewriter } from '../overlays/Typewriter';
import { LowerThird } from '../overlays/LowerThird';
import { CinematicReveal } from '../overlays/CinematicReveal';
import { LineWipe } from '../overlays/LineWipe';
import { LetterCollapse } from '../overlays/LetterCollapse';
import { ChapterCard } from '../overlays/ChapterCard';
import { OverlayFrame, defaultAlignForPreset } from '../overlays/OverlayFrame';
import { ChecklistCard } from '../templates/ChecklistCard';
import { TitleCutoutCard } from '../templates/TitleCutoutCard';
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

  const { segments } = layoutScenes(scenes, fps);

  /**
   * Picks the animation component for a preset. Returns only the moving text —
   * placement is applied by the `OverlayFrame` each caller wraps this in, which
   * is what lets the same eight presets serve both the scene-scoped overlay
   * (fixed default position) and a freely-dragged overlay clip.
   */
  const renderPreset = (
    preset: OverlayPreset,
    props: { text: string; color?: string; fontSize?: number; durationInFrames: number },
    kickerText?: string
  ) => {
    switch (preset) {
      case 'slide':
        return <SlideIn {...props} />;
      case 'pop':
        return <PopIn {...props} />;
      case 'typewriter':
        return <Typewriter {...props} />;
      case 'lower-third':
        return <LowerThird {...props} />;
      case 'cinematic-reveal':
        return <CinematicReveal {...props} />;
      case 'line-wipe':
        return <LineWipe {...props} />;
      case 'letter-collapse':
        return <LetterCollapse {...props} />;
      case 'chapter-card':
        return <ChapterCard {...props} kickerText={kickerText} />;
      default:
        return null;
    }
  };

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
   * WHAT renders inside the OverlayFrame for a given clip — the only thing
   * that branches on `kind`. Timing, positioning, the scrim, and persistence
   * are all handled once in `renderOverlayClip` below regardless of kind.
   */
  const renderOverlayClipContent = (clip: OverlayClipData, durationInFrames: number) => {
    if (clip.kind === 'checklist-card') {
      // `template_data` is unenforced JSON — a row with a missing/wrongly-typed
      // `bullets` still renders (as header-only), it never throws.
      const data = clip.templateData as ChecklistCardData | undefined;
      const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
      return (
        <ChecklistCard
          text={clip.text}
          bullets={bullets}
          color={clip.color}
          textColor={data?.textColor}
          fontSize={clip.fontSize}
          scale={data?.scale}
          durationInFrames={durationInFrames}
        />
      );
    }

    if (clip.kind === 'title-cutout-card') {
      const data = clip.templateData as TitleCutoutCardData | undefined;
      return (
        <TitleCutoutCard
          backgroundImageUrl={data?.backgroundImageUrl}
          foregroundImageUrl={data?.foregroundImageUrl}
          color={clip.color}
          scale={data?.scale}
          renderHeadline={() =>
            renderPreset(
              clip.preset,
              // The headline never reads `clip.color` — that field means
              // "fallback background color" for this kind (see the OverlayClipData
              // field-mapping notes). Its own text color is the independent
              // `template_data.textColor`, defaulting white like every preset does.
              { text: clip.text, color: data?.textColor, fontSize: clip.fontSize, durationInFrames },
              clip.kickerText
            )
          }
        />
      );
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

    return (
      <Sequence key={`overlay-${clip.id}`} from={from} durationInFrames={durationInFrames}>
        {/* Scrim sized to THIS clip, not to a scene: the whole point of the OV
            track is that a clip's life doesn't line up with scene boundaries,
            so the dimming can't either. */}
        {clip.dimBackground && (
          <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
        )}
        <OverlayFrame xPercent={clip.xPercent} yPercent={clip.yPercent}>
          {renderOverlayClipContent(clip, durationInFrames)}
        </OverlayFrame>
      </Sequence>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Scene sequences */}
      {segments.map((segment) => {
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
      })}

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
