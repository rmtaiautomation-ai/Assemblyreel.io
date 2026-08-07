import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  Img,
  OffthreadVideo,
  Audio,
} from 'remotion';
import type { VideoCompositionProps } from '../types';
import { SlideIn } from '../overlays/SlideIn';
import { PopIn } from '../overlays/PopIn';
import { Typewriter } from '../overlays/Typewriter';
import { LowerThird } from '../overlays/LowerThird';

/**
 * Main Remotion composition that sequences all scenes, overlays, and audio.
 * Each scene is placed into a <Sequence> at the correct frame offset.
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  audioUrl,
}) => {
  const { fps } = useVideoConfig();

  // Calculate cumulative frame offsets for each scene
  let cumulativeFrames = 0;
  const sceneSegments = scenes.map((scene) => {
    const durationInFrames = Math.round(scene.durationInSeconds * fps);
    const from = cumulativeFrames;
    cumulativeFrames += durationInFrames;
    return { ...scene, from, durationInFrames };
  });

  const renderOverlay = (scene: typeof sceneSegments[0]) => {
    if (!scene.overlay || scene.overlay.preset === 'none') return null;

    const props = {
      text: scene.overlay.text,
      color: scene.overlay.color,
      fontSize: scene.overlay.fontSize,
      durationInFrames: scene.durationInFrames,
    };

    switch (scene.overlay.preset) {
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
      {sceneSegments.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
        >
          <AbsoluteFill>
            {/* Media layer */}
            {scene.mediaType === 'video' && scene.mediaUrl ? (
              <OffthreadVideo
                src={scene.mediaUrl}
                startFrom={Math.round((scene.trimStartInSeconds || 0) * fps)}
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

            {/* Overlay layer */}
            {renderOverlay(scene)}
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Global audio track (voiceover / narration) */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} />
      )}
    </AbsoluteFill>
  );
};
