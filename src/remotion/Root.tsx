import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './compositions/VideoComposition';
import { StyleSheet, type StyleSheetProps } from './dev/StyleSheet';
import type { VideoCompositionProps, CompositionScene } from './types';
import { layoutScenes } from './timeline';

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

          // The editor always sends durationInFrames, so this short-circuit is the
          // live path and the branch below only runs in Remotion Studio.
          if (props.durationInFrames) {
            return { durationInFrames: props.durationInFrames, fps, width, height };
          }

          // Shares `layoutScenes` with the composition and the editor rather than
          // re-deriving the sum here, so all three agree on rounding. Transitions do
          // not change this total — a scene that starts early is lengthened to match.
          const { totalDurationInFrames } = layoutScenes(props.scenes ?? [], fps);

          return {
            durationInFrames: totalDurationInFrames,
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

      {/*
        Design harness for the card style library. Not used by the app — the
        editor only ever renders "MainVideo" — but registered here so a single
        style can be rendered as a still at any size for review. See the
        docstring in dev/StyleSheet.tsx.
      */}
      <Composition
        id="StyleSheet"
        component={StyleSheet}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ styleId: 'broadcast-bar' } satisfies StyleSheetProps}
      />
    </>
  );
};
