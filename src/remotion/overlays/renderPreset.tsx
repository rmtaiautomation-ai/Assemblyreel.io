import React from 'react';
import type { OverlayPreset } from '../types';
import { SlideIn } from './SlideIn';
import { PopIn } from './PopIn';
import { Typewriter } from './Typewriter';
import { LowerThird } from './LowerThird';
import { CinematicReveal } from './CinematicReveal';
import { LineWipe } from './LineWipe';
import { LetterCollapse } from './LetterCollapse';
import { ChapterCard } from './ChapterCard';

export interface RenderPresetProps {
  text: string;
  color?: string;
  fontSize?: number;
  durationInFrames: number;
}

/**
 * Picks the animation component for a preset. Returns only the moving text —
 * placement is applied by the `OverlayFrame` each caller wraps this in, which
 * is what lets the same eight presets serve the scene-scoped overlay (fixed
 * default position), a freely-dragged overlay clip, and a graphic-card
 * template that wants animated type inside its own layout.
 *
 * This lives in its own leaf module rather than inside `VideoComposition`
 * (where it used to be defined) for two reasons:
 *
 *  1. It closes over nothing from that component's scope — it is a pure
 *     function of its arguments — so being declared in a component body meant
 *     it was reallocated on every rendered frame for no benefit.
 *
 *  2. Card templates need it. While it lived inside `VideoComposition`, a
 *     template could only reach it by accepting a render prop, because
 *     importing `VideoComposition` from a template it renders would be
 *     circular. `TitleCutoutCard` carried exactly such a `renderHeadline`
 *     prop. As a leaf module the dependency graph is strictly layered —
 *     `overlays/ ← templates/ ← registry ← VideoComposition` — and templates
 *     import this directly, so no style needs a function-valued prop just to
 *     animate its own text.
 */
export const renderPreset = (
  preset: OverlayPreset,
  props: RenderPresetProps,
  kickerText?: string
): React.ReactNode => {
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
