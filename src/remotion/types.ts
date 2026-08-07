/**
 * Shared types for Remotion compositions.
 * These mirror the scene data from the Timeline Editor.
 */

export type OverlayPreset = 'slide' | 'pop' | 'typewriter' | 'lower-third' | 'none';

export interface SceneOverlay {
  text: string;
  preset: OverlayPreset;
  color: string;
  fontSize?: number;
  position?: 'center' | 'bottom' | 'top';
}

export interface CompositionScene {
  id: string;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  durationInSeconds: number;
  trimStartInSeconds: number;
  overlay?: SceneOverlay;
}

export interface VideoCompositionProps {
  scenes: CompositionScene[];
  audioUrl?: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames?: number;
}
