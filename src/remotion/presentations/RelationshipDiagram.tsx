import React from 'react';
import type { PresentationEnvelope, ResolvedPresentation } from '../../lib/presentations/schema';
import { diagramPositions } from '../../lib/presentations/graph';
import { Heading, Copy, reveal, type StageStyle } from './Stage';
import { SourceImage } from './CoreFamilies';

export function RelationshipDiagram({ envelope, style, presentation }: { envelope: Extract<PresentationEnvelope, { templateId: 'relationship-diagram' }>; style: StageStyle; presentation: ResolvedPresentation }) {
  const graph = envelope.content, points = diagramPositions(graph, style.portrait);
  const nodeWidth = graph.layout === 'chain' ? style.portrait ? 60 : Math.min(22, 78 / graph.nodes.length) : graph.layout === 'tree' ? 20 : 22;
  const nodeHeight = graph.nodes.length > 4 ? 12 : 17;
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 22 * style.unit }}><Heading style={style}>{graph.heading}</Heading><Copy style={style} size={28}>{graph.context}</Copy>
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', width: '100%', height: '100%' }}><defs><marker id="relationship-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6Z" fill={style.theme.accentLine} /></marker></defs>{graph.edges.map(edge => {
        const a = points.get(edge.from), b = points.get(edge.to); if (!a || !b) return null;
        const dx = b.x-a.x,dy = b.y-a.y,trim = Math.min((nodeWidth/200+.015)/Math.abs(dx || .00001),(nodeHeight/200+.015)/Math.abs(dy || .00001));
        return <path key={edge.id} d={`M${a.x*100},${a.y*100} L${(b.x-dx*trim)*100},${(b.y-dy*trim)*100}`} fill="none" stroke={style.theme.accentLine} strokeWidth=".35" markerEnd={edge.type === 'influence' ? 'url(#relationship-arrow)' : undefined} strokeDasharray={edge.type === 'uncertain' ? '1 1' : undefined} opacity={reveal(style.frame,style.fps,edge.cueSeconds)} />;
      })}</svg>
      {graph.nodes.map(node => { const point = points.get(node.id); return point ? <div key={node.id} data-fit data-collision style={{ position: 'absolute', left: `${point.x * 100}%`, top: `${point.y * 100}%`, transform: 'translate(-50%, -50%)', width: `${nodeWidth}%`, minHeight: `${nodeHeight}%`, boxSizing: 'border-box', padding: 13 * style.unit, background: style.theme.surface, border: `${2 * style.unit}px solid ${style.theme.accent}`, display: 'flex', flexDirection: 'column', gap: 8 * style.unit, alignItems: 'center', justifyContent: 'center', fontSize: 28 * style.unit, lineHeight: 1.15, textAlign: 'center', overflowWrap: 'anywhere' }}>{node.image && <div style={{ width: '100%',height: 85*style.unit }}><SourceImage image={node.image} presentation={presentation} style={style} /></div>}{node.label}</div> : null; })}
      {graph.edges.map((edge, index) => { const a = points.get(edge.from), b = points.get(edge.to); return a && b ? <div key={edge.id} data-fit style={{ position: 'absolute', left: `${(a.x + b.x) * 50}%`, top: `${(a.y + b.y) * 50}%`, transform: 'translate(-50%, -50%)', background: style.theme.background, padding: 5 * style.unit, fontSize: 24 * style.unit, maxWidth: graph.layout === 'chain' && !style.portrait ? '10%' : '24%', lineHeight: 1.15, textAlign: 'center', overflowWrap: 'anywhere', opacity: reveal(style.frame, style.fps, edge.cueSeconds) }}>{index + 1}</div> : null; })}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: style.portrait ? '1fr' : '1fr 1fr', gap: 10 * style.unit }}>{graph.edges.map((edge, index) => <div key={edge.id}><Copy style={style} size={28}>{index + 1} · {edge.label} · {edge.type}</Copy></div>)}</div>
  </div>;
}
