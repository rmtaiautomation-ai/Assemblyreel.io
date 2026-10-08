'use client';
import React from 'react';
import type { PresentationEnvelope, PresentationAsset } from '../../../lib/presentations/schema';
import type { PresentationSceneReference } from '../../../lib/presentations/phase-5-validation';
import { AdvancedMapEditor } from './AdvancedMapEditor';
import { AdvancedImageEditor } from './AdvancedImageEditor';
import { AdvancedTextEditor } from './AdvancedTextEditor';
import { ChartEditor } from './ChartEditor';

export function Phase5ContentEditor(props: { draft: PresentationEnvelope; assets: PresentationAsset[]; references: readonly PresentationSceneReference[]; sceneId?: string; onChange: (draft: PresentationEnvelope) => void }) {
  const { draft } = props;
  if (draft.templateId === 'journey-map' || draft.templateId === 'territory-change') return <AdvancedMapEditor draft={draft} onChange={props.onChange} />;
  if (draft.templateId === 'animated-chart') return <ChartEditor draft={draft} onChange={props.onChange} />;
  if (['manuscript-comparison','evidence-board','competing-explanations'].includes(draft.templateId)) return <AdvancedTextEditor draft={draft} onChange={props.onChange} />;
  return <AdvancedImageEditor {...props} />;
}
