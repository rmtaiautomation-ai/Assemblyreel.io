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
import type { SceneOverlay, VideoCompositionProps } from '../types';
import { layoutScenes } from '../timeline';
import { SceneTransition } from '../transitions/SceneTransition';
import { CaptionTrack } from '../captions/CaptionTrack';
import { SlideIn } from '../overlays/SlideIn';
import { PopIn } from '../overlays/PopIn';
import { Typewriter } from '../overlays/Typewriter';
import { LowerThird } from '../overlays/LowerThird';

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
  captionWords,
  showCaptions,
}) => {
  const { fps } = useVideoConfig();

  const { segments } = layoutScenes(scenes, fps);

  const renderOverlay = (overlay: SceneOverlay, nominalDurationInFrames: number) => {
    const props = {
      text: overlay.text,
      color: overlay.color,
      fontSize: overlay.fontSize,
      durationInFrames: nominalDurationInFrames,
    };

    switch (overlay.preset) {
      case 'slide':
        return <SlideIn {...props} />;
      case 'pop':
        return <PopIn {...props} />;
      case 'typewriter':
        return <Typewriter {...props} />;
      case 'lower-third':
        return <LowerThird {...props} />;
      default:
        return null;
    }
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

      {/* Auto-captions. Rendered AFTER the scene sequences so they paint above every
          scene and above scene overlays — a caption hidden behind a transition or a
          lower-third would be worse than no caption at all. Timed to the narration's
          own absolute timeline, so transitions (which never move nominal scene
          boundaries) cannot desync them. */}
      {showCaptions && captionWords && captionWords.length > 0 && (
        <CaptionTrack words={captionWords} />
      )}

      {/* Global audio track (voiceover / narration) — always starts at frame 0 */}
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
