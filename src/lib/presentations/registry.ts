/** Version 1 definitions remain available when later rendering versions are added. */
export const DOCUMENTARY_COMPOSITION_ID = 'MainVideo-Documentary-v1';
export const DOCUMENTARY_V2_COMPOSITION_ID = 'MainVideo-Documentary-v2';
export const DOCUMENTARY_V3_COMPOSITION_ID = 'MainVideo-Documentary-v3';
export const PHASE_4_FAMILIES = ['cause-effect', 'scale-comparison', 'fact-reveal', 'claim-evidence'] as const;
export const DOCUMENTARY_V4_COMPOSITION_ID = 'MainVideo-Documentary-v4';
export const PHASE_5_FAMILIES = ['journey-map', 'territory-change', 'then-now', 'layered-parallax', 'structure-cutaway', 'manuscript-comparison', 'evidence-board', 'animated-chart', 'competing-explanations', 'chapter-recap'] as const;

/** Older Lambda bundles must fail rather than silently omit attached presentations. */
export function presentationCompositionId(scenes: readonly { presentation?: unknown }[]) {
  if (scenes.some(scene => PHASE_5_FAMILIES.some(id => id === (scene.presentation as { envelope?: { templateId?: string } } | undefined)?.envelope?.templateId))) return DOCUMENTARY_V4_COMPOSITION_ID;
  if (scenes.some(scene => {
    const value = scene.presentation as { envelope?: { templateId?: string } } | undefined;
    return PHASE_4_FAMILIES.some(id => id === value?.envelope?.templateId);
  })) return DOCUMENTARY_V3_COMPOSITION_ID;
  if (scenes.some(scene => {
    const value = scene.presentation as { envelope?: { theme?: { version?: number } } } | undefined;
    return value?.envelope?.theme?.version === 2;
  })) return DOCUMENTARY_V2_COMPOSITION_ID;
  return scenes.some(scene => Boolean(scene.presentation)) ? DOCUMENTARY_COMPOSITION_ID : 'MainVideo';
}

export const IMAGE_COMPARISON_V1 = {
  id: 'image-comparison', version: 1, name: 'Image Comparison',
  purpose: 'Compare two places, objects, or source images. Each image keeps its own crop and credit.',
  ratios: ['16:9', '9:16', '1:1'], assetsRequired: 2,
  minimumHoldSeconds: 2.5, typicalDurationSeconds: [5, 9],
} as const;

export const DOCUMENTARY_TEMPLATES = [
  { id: 'historical-timeline', code: 'D01', name: 'Historical Timeline', purpose: 'Explain when events happened; exact and approximate dates stay distinct.', assetsRequired: 0, minimumHoldSeconds: 4, typicalDurationSeconds: [6, 12] },
  { id: 'person-introduction', code: 'D02', name: 'Person Introduction', purpose: 'Introduce a scholar or historical figure with a portrait and credentials.', assetsRequired: 0, minimumHoldSeconds: 3, typicalDurationSeconds: [4, 7] },
  { ...IMAGE_COMPARISON_V1, code: 'D03' },
  { id: 'archival-explainer', code: 'D04', name: 'Archival Explainer', purpose: 'Explain a source in a paper card; highlight exact passages, not a fabricated document.', assetsRequired: 0, minimumHoldSeconds: 4, typicalDurationSeconds: [7, 15] },
  { id: 'map-locator', code: 'D05', name: 'Map Locator', purpose: 'Locate places in West Asia on a modern reference map, without implying ancient borders.', assetsRequired: 0, minimumHoldSeconds: 3, typicalDurationSeconds: [5, 9] },
  { id: 'artifact-spotlight', code: 'D06', name: 'Artifact Spotlight', purpose: 'Show an actual object image with supplied date, material, catalogue or institution.', assetsRequired: 1, minimumHoldSeconds: 3, typicalDurationSeconds: [5, 9] },
  { id: 'detail-annotation', code: 'D07', name: 'Detail Zoom / Annotation', purpose: 'Point to authored regions of an image, then show a source-faithful detail.', assetsRequired: 1, minimumHoldSeconds: 4, typicalDurationSeconds: [6, 12] },
  { id: 'manuscript-highlight', code: 'D08', name: 'Manuscript Highlight', purpose: 'Show a real page or folio with a selected region and supplied excerpt.', assetsRequired: 1, minimumHoldSeconds: 4, typicalDurationSeconds: [7, 12] },
  { id: 'text-translation', code: 'D09', name: 'Original Text → Translation', purpose: 'Present supplied original text and translation with explicit script and attribution.', assetsRequired: 0, minimumHoldSeconds: 4, typicalDurationSeconds: [7, 12] },
  { id: 'relationship-diagram', code: 'D10', name: 'Relationship Diagram', purpose: 'Explain a small source-labelled chain, tree or hub—not an automatic genealogy.', assetsRequired: 0, minimumHoldSeconds: 4, typicalDurationSeconds: [6, 12] },
  { id: 'cause-effect', code: 'D11', name: 'Cause and Effect', purpose: 'Explain 2–4 ordered steps. Causal links need supplied support; sequence alone is not causation.', assetsRequired: 0, minimumHoldSeconds: 4, typicalDurationSeconds: [7, 15] },
  { id: 'scale-comparison', code: 'D12', name: 'Scale Comparison', purpose: 'Compare supplied lengths or heights using converted units and an honest common baseline.', assetsRequired: 0, minimumHoldSeconds: 3, typicalDurationSeconds: [5, 10] },
  { id: 'fact-reveal', code: 'D13', name: 'Fact Reveal', purpose: 'Emphasize one sourced quantity, date or range while retaining its qualifier and exact display.', assetsRequired: 0, minimumHoldSeconds: 3, typicalDurationSeconds: [4, 8] },
  { id: 'claim-evidence', code: 'D14', name: 'Claim and Evidence', purpose: 'Separate a claim, supplied evidence, interpretation and limits. Attribution is not verification.', assetsRequired: 0, minimumHoldSeconds: 5, typicalDurationSeconds: [9, 18] },
  { id: 'journey-map', code: 'D15', name: 'Animated Journey Map', purpose: 'Trace supplied West Asia stops or a sourced route. Unknown travel paths stay explicitly schematic.', assetsRequired: 0, minimumHoldSeconds: 5, typicalDurationSeconds: [8, 15] },
  { id: 'territory-change', code: 'D16', name: 'Territory Change Map', purpose: 'Reveal discrete dated, sourced simple polygons, never invented intermediate borders.', assetsRequired: 0, minimumHoldSeconds: 6, typicalDurationSeconds: [10, 20] },
  { id: 'then-now', code: 'D17', name: 'Then and Now Reveal', purpose: 'Wipe between reviewed aligned crops or explicitly use side-by-side for unaligned images.', assetsRequired: 2, minimumHoldSeconds: 4, typicalDurationSeconds: [6, 12] },
  { id: 'layered-parallax', code: 'D18', name: 'Layered Parallax Scene', purpose: 'Move 2–4 prepared co-registered depth layers; requires a complete opaque plate and transparent foregrounds.', assetsRequired: 2, minimumHoldSeconds: 4, typicalDurationSeconds: [6, 12] },
  { id: 'structure-cutaway', code: 'D19', name: 'Structure Cutaway', purpose: 'Expose numbered sections of an existing authored cutaway diagram, not an invented interior.', assetsRequired: 1, minimumHoldSeconds: 5, typicalDurationSeconds: [8, 16] },
  { id: 'manuscript-comparison', code: 'D20', name: 'Manuscript Version Comparison', purpose: 'Compare exact supplied passages with authored paired difference highlights and script-aware fonts.', assetsRequired: 0, minimumHoldSeconds: 6, typicalDurationSeconds: [10, 20] },
  { id: 'evidence-board', code: 'D21', name: 'Evidence Board', purpose: 'Connect 3–5 credited cards through explicitly explained relationships, not decorative conspiracy lines.', assetsRequired: 0, minimumHoldSeconds: 6, typicalDurationSeconds: [10, 20] },
  { id: 'animated-chart', code: 'D22', name: 'Animated Chart', purpose: 'Show supplied non-negative values on a zero baseline, with missing data and uncertainty retained.', assetsRequired: 0, minimumHoldSeconds: 5, typicalDurationSeconds: [7, 15] },
  { id: 'competing-explanations', code: 'D23', name: 'Competing Explanations', purpose: 'Give 2–3 attributed explanations equal space for support and limitations, without invented probabilities.', assetsRequired: 0, minimumHoldSeconds: 6, typicalDurationSeconds: [10, 20] },
  { id: 'chapter-recap', code: 'D24', name: 'Chapter Recap Montage', purpose: 'Recall 2–4 earlier owned scene images and approved takeaways without recursive video compositions.', assetsRequired: 2, minimumHoldSeconds: 5, typicalDurationSeconds: [8, 16] },
] as const;
export type PresentationTemplateId = (typeof DOCUMENTARY_TEMPLATES)[number]['id'];

export function presentationDefinition(id: string, version: number) {
  if (version !== 1) return undefined;
  if (id === 'clean') return { id: 'clean', version: 1, name: 'Clean media', assetsRequired: 0 } as const;
  return DOCUMENTARY_TEMPLATES.find(item => item.id === id);
}
