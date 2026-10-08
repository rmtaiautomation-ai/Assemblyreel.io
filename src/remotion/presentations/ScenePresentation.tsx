import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { ResolvedPresentation } from '../../lib/presentations/schema';
import { ImageComparison } from './ImageComparison';
import { Stage } from './Stage';
import { CoreFamily } from './CoreFamilies';
import { SourceFamily } from './SourceFamilies';
import { MapLocator } from './MapLocator';
import { RelationshipDiagram } from './RelationshipDiagram';
import { HistoricalTimeline } from './HistoricalTimeline';
import { PHASE_4_FAMILIES, PHASE_5_FAMILIES } from '../../lib/presentations/registry';
import { Phase4Family } from './Phase4Families';
import { Phase5Family } from './Phase5Families';

export function ScenePresentation({ presentation, captions, preRollFrames = 0 }: { presentation: ResolvedPresentation; captions: boolean; preRollFrames?: number }) {
  const rawFrame = useCurrentFrame() - preRollFrames - presentation.startFrame;
  const { envelope } = presentation;
  if (envelope.templateId === 'clean') return null;
  if (envelope.templateId === 'image-comparison') return <ImageComparison presentation={presentation} captions={captions} preRollFrames={preRollFrames} />;
  if (rawFrame >= presentation.durationInFrames || (rawFrame < 0 && presentation.startFrame > 0)) return null;
  return <Stage key={JSON.stringify(PHASE_5_FAMILIES.some(id => id === envelope.templateId) ? { envelope, assets: presentation.assets } : envelope)} envelope={envelope} captions={captions} frame={Math.max(0, rawFrame)} duration={presentation.durationInFrames}>{style => {
    if (PHASE_5_FAMILIES.some(id => id === envelope.templateId)) return <Phase5Family envelope={envelope} presentation={presentation} style={style} />;
    if (PHASE_4_FAMILIES.some(id => id === envelope.templateId)) return <Phase4Family envelope={envelope} presentation={presentation} style={style} />;
    if (envelope.templateId === 'historical-timeline') return <HistoricalTimeline envelope={envelope} presentation={presentation} style={style} />;
    if (envelope.templateId === 'map-locator') return <MapLocator envelope={envelope} style={style} />;
    if (envelope.templateId === 'relationship-diagram') return <RelationshipDiagram envelope={envelope} presentation={presentation} style={style} />;
    if (['detail-annotation', 'manuscript-highlight', 'text-translation'].includes(envelope.templateId)) return <SourceFamily envelope={envelope} presentation={presentation} style={style} />;
    return <CoreFamily envelope={envelope} presentation={presentation} style={style} />;
  }}</Stage>;
}
