import React from 'react';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import type { StageStyle } from './Stage';
import { AdvancedMap } from './AdvancedMaps';
import { AdvancedImageFamily } from './AdvancedImages';
import { AdvancedSourceFamily } from './AdvancedSources';
import { AnimatedChart } from './AnimatedChart';

export function Phase5Family(props: { envelope: PresentationEnvelope; presentation: ResolvedPresentation; style: StageStyle }) {
  const { envelope, style } = props;
  if (envelope.templateId === 'journey-map' || envelope.templateId === 'territory-change') return <AdvancedMap envelope={envelope} style={style} />;
  if (envelope.templateId === 'animated-chart') return <AnimatedChart envelope={envelope} style={style} />;
  if (['manuscript-comparison','evidence-board','competing-explanations'].includes(envelope.templateId)) return <AdvancedSourceFamily {...props} />;
  return <AdvancedImageFamily {...props} />;
}
