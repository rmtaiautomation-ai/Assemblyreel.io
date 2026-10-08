import type { PresentationEnvelope } from './schema';
type Graph = Extract<PresentationEnvelope, { templateId: 'relationship-diagram' }>['content'];
/** Deterministic bounded layouts; invalid graphs are rejected, never silently simplified. */
export function diagramPositions(graph: Graph, vertical: boolean) {
  const points = new Map<string, { x: number; y: number }>();
  if (graph.layout === 'chain') {
    graph.nodes.forEach((node, index) => points.set(node.id, vertical ? { x: .5, y: (index + .5) / graph.nodes.length } : { x: (index + .5) / graph.nodes.length, y: .5 }));
  } else if (graph.layout === 'hub') {
    points.set(graph.nodes[0].id, { x: .5, y: .5 });
    graph.nodes.slice(1).forEach((node, index, nodes) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / nodes.length;
      points.set(node.id, { x: .5 + Math.cos(angle) * .34, y: .5 + Math.sin(angle) * .36 });
    });
  } else {
    const root = graph.nodes.find(node => !graph.edges.some(edge => edge.to === node.id));
    const levels: string[][] = root ? [[root.id]] : [];
    const seen = new Set(root ? [root.id] : []);
    while (levels.length && levels.at(-1)?.length) {
      const next = graph.edges.filter(edge => levels.at(-1)?.includes(edge.from) && !seen.has(edge.to)).map(edge => edge.to);
      if (!next.length) break;
      next.forEach(id => seen.add(id)); levels.push(next);
    }
    levels.forEach((nodes, depth) => nodes.forEach((id, index) => points.set(id, { x: (index + 1) / (nodes.length + 1), y: (depth + .5) / levels.length })));
  }
  return points;
}
