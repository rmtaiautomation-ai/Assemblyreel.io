import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './compositions/VideoComposition';
import type { VideoCompositionProps, CompositionScene } from './types';

/**
 * Remotion Root — registers all compositions.
 * This is used by the Remotion CLI/Studio for preview and by the renderer.
 */

const defaultScene: CompositionScene = {
  id: 'placeholder',
  mediaUrl: '',
  mediaType: 'image',
  durationInSeconds: 5,
  trimStartInSeconds: 0,
  overlay: {
    text: 'Hello World',
    preset: 'pop',
    color: '#FFFFFF',
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainVideo"
        component={VideoComposition}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={({ props }) => {
          const fps = props.fps || 30;
          const width = props.width || 1080;
          const height = props.height || 1920;

          if (props.durationInFrames) {
            return { durationInFrames: props.durationInFrames, fps, width, height };
          }

          let totalFrames = 0;
          if (props.scenes) {
            props.scenes.forEach(scene => {
              totalFrames += Math.round((scene.durationInSeconds || 0) * fps);
            });
          }
          return {
            durationInFrames: Math.max(1, totalFrames),
            fps,
            width,
            height,
          };
        }}
        defaultProps={{
          scenes: [defaultScene],
          fps: 30,
          width: 1080,
          height: 1920,
        } satisfies VideoCompositionProps}
      />
    </>
  );
};
