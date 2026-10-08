# 26 — Documentary Scene Template Library and AI Presentation Direction

> **Created / repository review:** 2026-10-06 (Asia/Manila)
>
> **Status:** Phases 0–5 are implemented and locally/isolated-tested (2026-10-08). Phase 5 expands the catalog to twenty-four families, with ten advanced families explicitly opt-in and constrained to supplied sources, geometry or prepared assets. Source-constrained AI review and protected selective Apply remain in place. Paid AI activation, approved billing policy, live provider suitability, hosted v4 rendering, remote database activation and approved channel pilots remain open.
>
> **Original planning deliverable:** This Markdown specification. The user subsequently authorized Phases 0–5; see [Phase 0 readiness](../docs/presentations/phase-0-readiness.md), [Phase 1 readiness](../docs/presentations/phase-1-readiness.md), [Phase 2 readiness](../docs/presentations/phase-2-readiness.md), [Phase 3 readiness](../docs/presentations/phase-3-readiness.md), [Phase 4 readiness](../docs/presentations/phase-4-readiness.md) and [Phase 5 readiness](../docs/presentations/phase-5-readiness.md) for completed local changes, evidence and remaining activation checks.
>
> **Initial channels:** Mesopotamia and Enoch. Templates must also support other documentary and educational niches through content and theme configuration.
>
> **Recommended first release:** Ten documentary template families, two coordinated visual themes, manual editing, reliable scene attachment, and AI suggestions with review.

**Reading guide:** Start with the catalog and UI to review the product direction, then the architecture and phases to review implementation scope.

- [Current repository findings](#3-current-repository-findings)
- [Complete template catalog](#4-complete-template-catalog)
- [First-release family specifications](#5-first-release-family-specifications)
- [Later families](#6-specifications-for-later-families)
- [Visual system and motion](#7-visual-system-and-motion-language)
- [Architecture](#8-proposed-architecture)
- [Persistence and contracts](#9-persistence-and-contracts)
- [Timing and scene lifecycle](#10-timing-and-scene-lifecycle)
- [AI selection](#11-ai-selection-and-generation-workflow)
- [UI and interaction design](#12-ui-and-interaction-design)
- [Rendering and assets](#13-rendering-and-asset-pipeline)
- [Channel examples](#14-channel-specific-application-and-sample-sequences)
- [Implementation file map](#15-concrete-implementation-file-map)
- [Delivery phases](#16-delivery-phases-and-acceptance-gates)
- [Verification](#17-verification-plan)
- [Review decisions](#19-open-review-decisions-with-proposed-defaults)

## 1. Product intent

AssemblyReel should turn narration into a deliberate sequence of footage, objects, documents, maps, text, and explanatory graphics. A viewer should understand where something happened, what a source says, how people or ideas connect, and why a detail matters.

The AI selects a presentation because of the scene's meaning and available evidence. It fills a bounded, editable template with validated content. Remotion renders that same configuration in the editor and final export.

The product promise is a coherent documentary visual language across a whole video. Template count alone is not the quality target. Readability, source accuracy, pacing, visual continuity, dependable editing, and export parity are part of this module.

### 1.1 Vocabulary

| Term | Meaning in this module | Example |
|---|---|---|
| Scene | A timed unit of narration and visuals already present in the project. | A passage describing a manuscript's discovery. |
| Background media / B-roll | The footage, still, or illustration supporting narration. | A photograph of the discovery site. |
| Template family | A reusable way to explain a kind of information. | Timeline, map locator, comparison, translation. |
| Layout variant | A supported arrangement within one family. | Horizontal comparison versus stacked comparison. |
| Theme | Shared typography, colors, surfaces, and restrained environmental styling. | Parchment Archive or Dark Documentary. |
| Motion preset | A bounded entrance, emphasis, or exit behavior. | Fade-rise, directional slide, restrained scale reveal. |
| Scene transition | The handoff between scenes. Separate from animation inside a template. | Crossfade into a map. |
| Scene presentation | One saved family/content/theme/timing choice attached to a scene. | Artifact Spotlight using a particular image and labels. |

A template may fill the screen or sit over media. It is therefore more accurate to call this a scene presentation library than to treat every result as a B-roll clip.

### 1.2 User requirements captured from this thread

- Analyze reference images before building; implementation requires a later instruction.
- Support both short and long videos, with intentional portrait and landscape layouts.
- Let AI select a suitable template for specific scenes.
- Make templates understandable and editable by the creator.
- Include all four screenshot concepts and all twenty additional recommendations.
- Include concrete editor UI, architecture, data contracts, phased work, and verification criteria.
- Prioritize the documentary library before unrelated new features.

Screenshot descriptions below describe observed layouts and the user's account of their motion. A still image does not establish the original animation timing, easing, software, or exact implementation. The proposed animations are original design specifications inspired by those references.

## 2. Research and design direction

Official product pages were reviewed for feature and design references. This was a review of public documentation and catalogs, not a hands-on benchmark or a claim that the competitors lack any particular feature.

| Reference | Observed capability | Implication for AssemblyReel |
|---|---|---|
| [Pictory visual selection](https://kb.pictory.ai/en/articles/8468834-how-to-turn-off-automatic-ai-based-visual-selection) | Selects scene visuals using text context; allows manual selection. | Contextual selection and creator override are baseline expectations. |
| [InVideo AI](https://invideo.io/make/ai-video-generator/) | Combines scripts, stock/generated media, voiceover, subtitles, and editing. | Differentiate through coherent, editable documentary presentation. |
| [Jitter template library](https://jitter.video/templates/) | Offers text, cards, galleries, backgrounds, charts, and other motion design categories. | Study timing and composition variety; build original Remotion assets. |
| [GEOlayers](https://aescripts.com/geolayers/) | Supports labels, region highlights, routes, and geographic features. | Geography should be a first-class storytelling family. |
| [Motion Array documentary template](https://motionarray.com/after-effects-templates/the-documentary-181236/) | A documentary title package with editable text, color, and media. | Use consistent title and archive treatments across an episode. |
| [Flourish visualization library](https://flourish.studio/visualisations/) | Provides a broad visualization catalog. | Use established explanatory patterns for later chart and diagram families. |

**Recommendation:** Make maps, artifacts, and manuscript explanations the signature of the initial library. Pair them with timelines, introductions, comparisons, and relationship diagrams. This is a product judgment, not an externally measured market ranking.

These links are references for study, not purchase or integration decisions. After Effects templates and GEOlayers projects are not direct Remotion imports. Any later reused media or template assets need rights appropriate to the intended SaaS use; the implementation should begin with original designs and suitable bundled assets.

## 3. Current repository findings

The following describes inspected source on 2026-10-06. No running UI, production database, or live render was verified during this planning pass. Existing uncommitted billing work belongs to the user and is outside this module.

| Area | Actual current foundation | Relevant files |
|---|---|---|
| AI selection | Eight combo IDs: `title_reveal`, `motion_text`, `checklist`, `quote`, `chapter_open`, `divine`, `archive`, `clean`. | `src/lib/ai/agents/edit-director.ts` |
| Combo construction | Builds multiple independent overlay rows from a choice. | `src/lib/combo-templates.ts`, `src/features/timeline-editor/server/combo-actions.ts` |
| Card library | Twelve style IDs across title and checklist kinds; a data registry and separate component map. | `src/remotion/templates/card-registry.ts`, `card-styles.tsx` |
| Existing title styles | Cutout hero, broadcast bar, dossier stamp, serif plate, stack wipe, quote card. | `src/remotion/templates/titles/*`, `TitleCutoutCard.tsx` |
| Existing list styles | Legacy checklist, ledger, numbered stack, tick sheet, side rail, evidence list. | `src/remotion/templates/lists/*`, `ChecklistCard.tsx` |
| Rendering | One shared `VideoComposition`; scene transitions, free overlays, captions, and environmental effects already exist. | `src/remotion/compositions/VideoComposition.tsx`, `src/remotion/types.ts` |
| Scene timing | `layoutScenes` provides frame-rounded durations and transitions without changing nominal narration timing. | `src/remotion/timeline.ts` |
| Narration | Act-relative word timings are stored and combined into project timings. | `src/features/audio/server/audio-actions.ts` |
| Timeline UI | Scene inspector has a combo dropdown; OV clips have a style picker and editable properties. | `src/features/timeline-editor/components/TimelineEditor.tsx` |
| Scene Board | An existing route with scene cards, act workflow, and inspector; read model currently lacks scene presentation data. | `src/features/scene-board/components/SceneBoard.tsx`, `server/scene-board-actions.ts` |
| Channel format | Typed format profile and per-project frozen snapshot already exist. | `src/lib/ai/format-profile.ts`, `src/features/channel-settings/server/format-actions.ts` |
| Sources | Fact ledger includes verification and source notes; projects can hold a fact snapshot. It is not a document annotation store. | `src/lib/ai/channel-facts.ts`, `src/features/channel-settings/server/fact-actions.ts` |
| Media | Durable `media` records support upload/generated/stock assets and project ownership. | `db/create-media-and-timeline-items.sql` |
| Export | Local caching and Lambda S3 sync cover top-level scene/audio media. | `src/server/rendering/{render-payload,local-renderer,s3-sync}.ts` |
| Font system | Inter, Oswald, Source Serif 4, and JetBrains Mono are explicitly loaded, currently using Latin subsets. | `src/remotion/fonts.ts` |

### 3.1 Integration issues this module must address

1. **Card content contract mismatch.** The combo builder uses `templateData.style`, `templateData.text`, and checklist `items`. The renderer registry expects `styleId`, the clip's top-level `text`, and checklist `bullets`. `applyComboToScene` sets non-text clips' top-level text to an empty string. Confirm the visible failures with fixtures before repairing; do not propagate these mismatches into the new registry.
2. **Scene identity is not persisted on combo overlays.** `applyComboToScene` receives `sceneId` but does not store it in the overlay payload. The editor infers ownership from time ranges and sometimes from clip kinds. That is unreliable after reorder, trim, or overlapping manual graphics.
3. **Replacement is not atomic.** The action deletes requested old clips before creating replacements and can return success after partial creation. A failed application can leave an incomplete design.
4. **Global pacing rules are only prompt instructions.** Each scene is directed in an independent model call. The model cannot reliably enforce the prompt's approximately 40% clean-scene target or avoid repetition across neighboring scenes without sequence context and a deterministic final pass.
5. **Autopilot has placeholder timing.** `src/trigger/autopilot.ts` applies combos at start `0`, duration `3`, despite receiving `anchorPhrase`. It hardcodes landscape media procurement and queries `script`, whereas the normal editor reads `voice_over_beat`. Treat this as a legacy integration requiring reconciliation, not a production reference path.
6. **Nested template assets are outside current render preparation.** Background/foreground card URLs are passed through, but the current URL normalization/cache/S3 walkers do not traverse them. New templates must not multiply this gap.
7. **Source and annotation data are insufficient for evidence templates.** A verified fact label alone does not provide a quoted passage, document image, highlighted region, translation, geographic coordinate, or image license.
8. **Captions have a fixed placement today.** The caption track uses a bottom offset of 18%; new layouts need a shared content/caption exclusion area rather than assuming the bottom is available.
9. **Original-language text needs explicit font coverage.** Latin-only font loading cannot be assumed to support Hebrew, Syriac, Ethiopic, Greek, or cuneiform. Support must be declared per language/script and tested.

### 3.2 Relationship to earlier plans

- Extend plans 12–15: retain text presets, card registry, OV editing, and environmental effects.
- Respect plans 16–17: real narration timing and per-act review remain authoritative.
- Extend plans 18 and 22: channel styling and source references use project snapshots.
- Extend plan 19: use the existing Scene Board route and shared editor components.
- Coordinate with plans 23–24 for cloud render performance and durable hosted jobs/assets.
- Coordinate with plan 25 for authenticated project access and metered provider calls; do not invent a separate quota or billing system here.
- `docs/architecture/REMOTION_ARCHITECTURE.md` describes an older aspirational arbitrary JSON styling engine. For this module, recommend bounded family schemas and shared primitives. Arbitrary AI-generated CSS, JSX, or layout programs would be much harder to validate and review.
- The existing Scout comment referring to “Plan 26” predates this file and is not evidence that this specification has already been implemented.

## 4. Complete template catalog

`D01`–`D24` are stable catalog references, not database IDs. The original first-release scope is D01–D10; subsequent authorized phases locally implement D11–D24. Advanced D15–D24 are selectable manually but excluded from default AI allowed-family settings, require supplied content/assets, and expose explicit readiness/repair gates. The family descriptions below include the original ambitions; the Phase 5 section and readiness report specify the bounded implemented v1 behavior.

| Ref | Family / proposed ID | Purpose | Delivery group |
|---|---|---|---|
| D01 | Historical Timeline — `historical-timeline` | Explain chronological milestones and elapsed time. | First release; screenshot 1 |
| D02 | Person Introduction — `person-introduction` | Introduce a person with portrait, name, and role. | First release; screenshot 2 |
| D03 | Image Comparison — `image-comparison` | Place two labeled subjects in visual comparison. | First release; screenshot 3 |
| D04 | Archival Document Explainer — `archival-explainer` | Present a concise editorial explanation with highlights. | First release; screenshot 4 |
| D05 | Map Locator — `map-locator` | Establish where a place or event is located. | First release |
| D06 | Artifact Spotlight — `artifact-spotlight` | Introduce a physical object and its identifying information. | First release |
| D07 | Detail Zoom and Annotation — `detail-annotation` | Direct attention to a particular image region. | First release |
| D08 | Manuscript Highlight — `manuscript-highlight` | Connect narration to a passage on an actual document. | First release |
| D09 | Original Text to Translation — `text-translation` | Explain a word or passage and its translation. | First release |
| D10 | Relationship Diagram — `relationship-diagram` | Explain named relationships between entities. | First release |
| D11 | Cause-and-Effect Sequence — `cause-effect` | Explain how one development leads to another. | Phase 4; locally implemented |
| D12 | Scale Comparison — `scale-comparison` | Make physical size or distance understandable. | Phase 4; locally implemented |
| D13 | Large Fact or Number Reveal — `fact-reveal` | Emphasize a supported quantity, date, or duration. | Phase 4; locally implemented |
| D14 | Claim and Evidence Card — `claim-evidence` | Show a claim, its support, and what the source establishes. | Phase 4; locally implemented |
| D15 | Animated Journey Map — `journey-map` | Trace travel, migration, trade, or transmission. | Phase 5; locally implemented, opt-in |
| D16 | Territory Change Map — `territory-change` | Show a region changing over time. | Phase 5; locally implemented, opt-in |
| D17 | Then-and-Now Reveal — `then-now` | Compare aligned older/current or ruin/reconstruction views. | Phase 5; locally implemented, opt-in |
| D18 | Layered Parallax Scene — `layered-parallax` | Add depth to a layered illustration or photograph. | Phase 5; locally implemented, opt-in |
| D19 | Structure Cutaway — `structure-cutaway` | Explain interiors, construction, or physical layers. | Phase 5; locally implemented, opt-in |
| D20 | Manuscript Version Comparison — `manuscript-comparison` | Compare passages, editions, or translations. | Phase 5; locally implemented, opt-in |
| D21 | Evidence Board — `evidence-board` | Bring related sources and objects into one explained view. | Phase 5; locally implemented, opt-in |
| D22 | Animated Chart — `animated-chart` | Explain supported quantitative comparisons or trends. | Phase 5; locally implemented, opt-in |
| D23 | Competing Explanations — `competing-explanations` | Present explanations with evidence and unresolved questions. | Phase 5; locally implemented, opt-in |
| D24 | Chapter Recap Montage — `chapter-recap` | Recall earlier visuals and summarize the chapter. | Phase 5; locally implemented, opt-in |

### 4.1 Existing essentials to refine and retain

| Existing capability | Required refinement |
|---|---|
| Quote cards | Preserve exact excerpt and attribution; allow a short source line and avoid silently paraphrasing quoted text. |
| Chapter titles | Consistent chapter number, title, and optional kicker; support restrained theme styling. |
| Kinetic text | Short emphasis phrases; controlled word/line reveals; avoid copying whole narration paragraphs. |
| Lists and checklists | Correct `bullets` contract; readable limits; distinguish a list from a factual verification checklist. |
| Lower thirds | Identify a person, place, object, or source with caption-safe placement. |
| Clean media | Keep a deliberate media-only option and current Ken Burns behavior. A saved clean choice can be locked against later AI changes. |
| Environmental effects | Reuse dimming, particles, light beams, sweeps, and film treatment with bounded intensity. |
| Scene transitions | Reuse existing transition support; default documentary channels to restrained crossfades or cuts. |

These are not eight additional new documentary families. They are reusable existing capabilities that the library should expose consistently.

## 5. First-release family specifications

The durations and content limits below are initial design targets, not verified performance or retention findings. A template must fit the actual scene duration; it cannot silently extend narration or shorten a quotation to meet a layout limit.

### D01 — Historical Timeline

- **Visual:** A line, ordered milestones, date plates, brief labels, and optional elapsed-time bracket. The reference uses a dark grid with warm text and a slightly tilted view.
- **Motion:** Draw the line, reveal the first milestone, then move the emphasis to later milestones on narration cues. Use a slow camera drift only when it aids reading.
- **Inputs:** 2–5 events, stable event IDs, display date, structured sortable date/range where known, label, optional source reference and image, optional span label.
- **Layouts:** Horizontal landscape; vertical portrait; compact square. Long timelines are not squeezed into tiny text.
- **Timing target:** 6–12 seconds for a small sequence; more events require more narration time or an explicitly reviewed split.
- **Controls:** Event editor, date text, chronological/proportional spacing, current-event emphasis, date convention, background.
- **Rules:** Handle BCE/CE without a year-zero mistake. Preserve approximate/range labels. Proportional spacing requires numeric dates; equally spaced milestones must not suggest exact elapsed scale. Compute elapsed labels only from validated dates.
- **Fallback:** With one valid event, offer a fact/date card; with no supported dates, offer a sequence without invented chronology.
- **Acceptance:** Three long event labels remain readable in both ratios, with correct order and no clipped first/last plate.

### D02 — Person Introduction

- **Visual:** Portrait on one side; smaller role above a prominent name; optional warm circle or radial glow behind the portrait.
- **Motion:** Default portrait enters from left, role from top, name from right or below. Stagger entrances; settle before the next spoken idea.
- **Inputs:** Portrait media reference, name, optional role/affiliation, optional dates and source reference. A background-removed portrait is optional, not assumed.
- **Layouts:** Portrait beside text in landscape; portrait above or behind a safe name block in vertical. Mirroring is supported.
- **Timing target:** 4–7 seconds; name/role remain visible for the majority of the shot.
- **Controls:** Portrait focal point, contain/crop, left/right layout, entrance directions, name size within readable bounds, role, halo intensity.
- **Rules:** A normal photograph uses a framed variant. No automatic paid cutout generation in this module's first release. AI must use the supplied identity metadata rather than identify an unknown face.
- **Fallback:** Named introduction without a portrait, or a framed photograph. Never fabricate an expert portrait and imply it is documentary evidence.
- **Acceptance:** Long names and multi-line roles fit without colliding with captions or portrait edges.

### D03 — Image Comparison

- **Visual:** Two image cards with independent labels and optional short comparison heading. This reproduces the functional layout of the two-photo reference.
- **Motion:** Each card scales from a smaller centered position to its final slot; optionally begins near the middle and separates outward. Labels enter separately. A calm scale reveal is the default; bounce is opt-in.
- **Inputs:** Exactly two media references, labels, optional heading and source lines. Image crops are independently editable.
- **Layouts:** Side by side in landscape; stacked in portrait; compact two-card square.
- **Timing target:** 5–9 seconds, with both final cards held long enough to inspect.
- **Controls:** Swap sides, focal points, border style, labels, pop versus fade, synchronized versus staggered entrance.
- **Rules:** Comparison does not imply equivalence, common origin, or causation. Caption content must express the actual comparison.
- **Fallback:** Missing second asset blocks this suggestion; keep the original media or offer one artifact spotlight.
- **Acceptance:** A vertical and a horizontal source image can share a clean layout without stretching either one.

### D04 — Archival Document Explainer

- **Visual:** Cream paper card, category kicker, editorial serif headline, short body, highlighted phrases, subtle shadow, optional archival markings.
- **Motion:** Paper fades/rises into place; headline appears; highlight strokes reveal on relevant narration cues. Keep decoration quieter than the text.
- **Inputs:** Kicker, headline, 1–2 short paragraphs, explicit highlight ranges, optional source/attribution. This is composed explanatory text, not a facsimile of a real document.
- **Layouts:** Wide card in landscape; narrow vertical editorial card; simplified square.
- **Initial limits:** Headline up to roughly 10 words; body target 35–55 words landscape and 18–30 portrait. Pixel measurement and reading time ultimately decide readiness.
- **Controls:** Text, highlighted phrases, paper theme, paragraph spacing, source line; optional diagram/arrow decorations only from supported variants.
- **Rules:** Keep explanatory paraphrases distinguishable from quotations. If the body is too long, show an editable warning and offer a shorter draft; never replace approved wording automatically.
- **Fallback:** A quote card or concise key-point card using approved content.
- **Acceptance:** Repeated highlight words target the correct occurrence and line wraps do not break highlight placement.

### D05 — Map Locator

- **Visual:** A quiet regional map, highlighted location/region, readable marker and place name, optional geographic context label.
- **Motion:** Establish the broad region, move toward a verified point, reveal the label. Avoid prolonged globe travel for a single local fact.
- **Inputs:** Approved map asset ID/version, projection/bounds metadata, verified coordinates or authored normalized marker, label, optional date/context.
- **First-release approach:** Curated regional SVG maps with known coordinate transforms and authored labels. No live map tile dependency in frame rendering. Ship a small useful geography set before promising worldwide coverage.
- **Layouts:** Wide regional view; portrait crop chosen to retain location/context; optional small inset for orientation.
- **Controls:** Approved map, location, focal region, zoom limit, label side, modern-location context, marker appearance.
- **Rules:** A modern locator is labeled as such when historical context could mislead. Ancient political boundaries are D16 and require dated geographic data. AI does not invent coordinates or draw an ancient empire from a name.
- **Fallback:** Place label over a verified location photo; unavailable coordinates are a visible asset requirement.
- **Acceptance:** The marker stays on the correct location after aspect-ratio changes, zoom, and map crop.

### D06 — Artifact Spotlight

- **Visual:** One object or framed artifact photograph, restrained spotlight, short identifying title, and compact metadata rail.
- **Motion:** Reveal the object, apply a slow push, reveal metadata in narrated order. A two-dimensional photograph does not rotate to invent unseen sides.
- **Inputs:** Image, title, optional material, dimensions, date/range, institution/catalog number, source reference and credit.
- **Layouts:** Object plus metadata rail; centered object with lower label; portrait object above a compact information block.
- **Controls:** Object crop/contain, focal point, labels to display, light intensity, background, metadata order.
- **Rules:** Use “unknown” or omit unsupported fields. A cutout is optional; an intact photograph must have an attractive framed variant.
- **Fallback:** Plain image plus one supported label.
- **Acceptance:** Irregular silhouettes and ordinary rectangular photos both look intentional; catalog labels remain legible.

### D07 — Detail Zoom and Annotation

- **Visual:** Full image for context, one highlighted region, optional magnified inset, and a concise annotation.
- **Motion:** Establish the image, approach the selected region, draw the pointer/outline, then hold. Default to one focal action at a time.
- **Inputs:** Media reference, 1–3 authored focus rectangles/polygons in normalized source-image coordinates, labels, optional source references and cue anchors.
- **Layouts:** Inset beside the original in landscape; image above annotation in portrait; direct crop when an inset would be too small.
- **Controls:** Drag focus box on original, zoom amount, label position, pointer type, cue timing, before/after focus preview.
- **Rules:** Geometry is mapped through the real contain/cover transform, including letterboxing. Do not annotate AI-guessed glyph locations as precise evidence. Check source resolution before allowing a large zoom.
- **Fallback:** Lower magnification, a simple outline, or the original image without an unsupported annotation.
- **Acceptance:** The pointer lands on the same source detail at all ratios and at every camera position.

### D08 — Manuscript Highlight

- **Visual:** Actual document image, passage focus, a measured highlight/outline, optional readable transcription and citation.
- **Motion:** Show the page, approach the passage, reveal its highlight in sync with narration; optionally display a legible excerpt panel.
- **Inputs:** Document media reference, source/edition/page or folio information, authored passage region, supplied transcription/excerpt, optional translation, cue anchor.
- **Layouts:** Page with side excerpt; portrait page with compact excerpt below; close-up-only variant when the source is large enough.
- **Controls:** Region editor, exact excerpt, citation, excerpt visibility, highlight color and timing.
- **Rules:** Keep photographic document highlights separate from DOM text highlights. Source-image regions are authored/verified; normalized text ranges refer to a supplied transcription. OCR/automated region discovery is deferred.
- **Fallback:** Attributed quotation when text is available but the document image is missing. Do not generate a fake manuscript page to fill this slot.
- **Acceptance:** Excerpt, citation, selected region, and narration cue refer to the same passage; low-resolution source remains readable through the excerpt panel.

### D09 — Original Text to Translation

- **Visual:** Original term or passage, optional transliteration, translation, and one concise explanation. Present alternative readings only when supplied.
- **Motion:** Original appears first, then transliteration/translation, then emphasis on the relevant difference.
- **Inputs:** Exact original text, language/script, direction, optional transliteration, supplied translation, attribution/edition, optional alternate wording and explanation.
- **Layouts:** Left-to-right explanatory sequence for Latin-script interface content; stacked portrait; the original text itself respects its native direction.
- **Controls:** Text fields, language/font choice from a supported list, visible transliteration, highlight phrase, source line, cue timing.
- **Rules:** Do not animate complex scripts character-by-character. Preserve combining marks and bidirectional layout. An AI summary of a meaning is not silently substituted for a verified translation.
- **Fallback:** Show supplied transliteration plus translation when supported glyphs are unavailable; require explicit review of that choice. Image-of-text is a last-resort authored asset with accessibility metadata.
- **Acceptance:** Supported script fixtures display correctly in preview/local/cloud render with no missing glyph boxes or reversed phrase order.

### D10 — Relationship Diagram

- **Visual:** A small set of labeled entities joined by typed, labeled connections. Optional portraits or symbols reinforce identification.
- **Motion:** Reveal the first entity, add connected entities in narration order, draw each edge as its relationship is explained.
- **Inputs:** 2–6 nodes, stable IDs, optional images, up to 7 explicit edges with relationship labels and source references, optional temporal/context qualifier.
- **Layouts:** Small tree, chain, or hub-and-spoke. Portrait layout favors a vertical tree/chain. No arbitrary force-directed graph in the first release.
- **Controls:** Entity names, relationships, layout variant, focus entity, optional icons, edge ordering and label placement.
- **Rules:** An arrow can mean influence, descent, copying, or a story relationship; its label must say which. Mythological relationships are labeled as described in a text/tradition. Similar names are not sufficient to create a connection.
- **Fallback:** Simplify to an approved pairwise comparison or list. Do not drop nodes or edges without showing the proposed change.
- **Acceptance:** Maximum-size fixtures have no overlapping labels or ambiguous edge crossings; all entities remain identifiable on mobile.

## 6. Specifications for later families

These are retained recommendations, not first-release commitments. Each must pass the same layout, timing, source, and export contracts as D01–D10.

| Ref | Visual and motion | Required inputs / initial bounds | Dependency, controls, and fallback |
|---|---|---|---|
| D11 Cause and Effect | 2–4 labeled steps connected as the narrator explains the chain. | Ordered steps, optional icons, typed causal/sequential links and source references. | Reuse D10 connectors. Distinguish chronology from causation. Edit step/link labels; use a numbered list when causal support is absent. |
| D12 Scale Comparison | Two or three objects/silhouettes and measurement guides on a shared baseline. | Supported dimensions, units, reference object, scale method, source. | Unit conversion and honest scale labels. Ratios must determine dimensions. Use a number card if data cannot support a proportional view. |
| D13 Fact Reveal | One dominant value, unit, qualifier, and context line; restrained reveal or count animation. | Exact value/date/range, unit, label, source; one principal fact. | Extend existing typography. Approximate values retain qualifiers. Years should reveal as dates, not automatically count from zero. |
| D14 Claim and Evidence | Claim, supporting passage/object, and a short statement of what remains uncertain. | Claim, specific evidence references, supported interpretation, optional limitation. | Reuse D04/D08 source blocks. No generic “verified” stamp based only on model confidence. Use attributed explanation if direct evidence is unavailable. |
| D15 Journey Map | Route draws, stops appear, camera follows selected sections. | Approved map, supplied route geometry or stop sequence, dates, source, approximation status. | Build on D05. A connecting line between known stops must be labeled schematic when the actual route is unknown. Edit stop order and route emphasis. |
| D16 Territory Change | Dated region snapshots crossfade or change emphasis with a persistent time label. | Versioned historical polygons per date and source; 2–4 states initially. | Requires curated data and topology handling. Do not interpolate unsupported intermediate borders. Fall back to discrete dated maps or a locator. |
| D17 Then and Now | Aligned image pair with a controlled comparison wipe. | Two images, alignment/crop settings, time labels, reconstruction status and sources. | Reuse D03 assets. Editor aligns landmarks. When alignment is unsuitable use ordinary comparison. Label a reconstruction as reconstruction. |
| D18 Layered Parallax | 2–4 prepared depth layers move at different rates through a bounded camera move. | Transparent layers, complete background plate, depth order, focal point. | Prepared layers required; automatic segmentation/inpainting is a separate dependency. Clamp motion to avoid holes; fall back to Ken Burns. |
| D19 Structure Cutaway | Authored diagram exposes 2–4 sections with labels. | Diagram/vector layers, labels, structure relationship and source; reconstruction status. | Needs curated diagrams or an authored illustration. Reveal existing geometry, not a model-invented excavation plan. Fall back to annotated image. |
| D20 Manuscript Comparison | Two short passages with linked difference highlights. | Supplied passages/editions, segment mappings, language/direction, citations. | Reuse D09 script support. Curated segment mapping takes precedence over character diff. Limit to a few meaningful differences; fallback to one passage. |
| D21 Evidence Board | 3–5 source cards connect one relationship at a time. | Media/documents, explicit labeled relationships, source references. | Reuse D03/D10. Explain each connection; do not imply a conspiracy through decorative lines. Simplify to a gallery or relationship diagram. |
| D22 Animated Chart | Bars or line series reveal with labels; limited additional chart types later. | Typed data, units, dates/categories, source, estimate/range metadata. | Start with bar and line charts. Preserve axis meaning, missing values, and uncertainty. No fabricated data; fall back to supported fact cards. |
| D23 Competing Explanations | 2–3 explanation panels, each with support and unresolved points. | Named explanation, attributed support, limitation, sources. | Reuse D14/comparison layout. No invented probability/confidence meters. Stacked portrait or sequential focus; fallback to attributed text. |
| D24 Chapter Recap | 2–4 earlier visuals return with concise takeaway labels and next-chapter cue. | References to earlier scene/media IDs, approved summaries, chapter title. | Use still references rather than nesting full video compositions recursively. Missing/deleted scene gets a visible repair state; use a short list if necessary. |

## 7. Visual system and motion language

### 7.1 Two initial theme packs

Themes are video-output styles. The application's existing dark UI and green action colors remain the application design language.

| Token | Parchment Archive | Dark Documentary |
|---|---|---|
| Base background | Warm gray-beige `#B9B29E` | Charcoal `#171717` |
| Card/surface | Cream `#F2ECDD` | Dark warm gray `#24211D` |
| Primary text | Ink `#201B15` | Warm white `#F5F0E7` |
| Accent | Muted ochre `#C5A45B` | Restrained gold `#D4A15B` |
| Secondary text | Dark brown-gray `#514B40` | Pale stone `#C5BEB2` |
| Headline font | Source Serif 4 | Source Serif 4 or Oswald for brief emphasis |
| Body / metadata | Inter / JetBrains Mono | Inter / JetBrains Mono |
| Background treatment | Subtle paper texture, faint archive rules | Optional dim grid, radial glow, sparse dust |
| Motion default | Soft rise, fade, underline/highlight reveal | Restrained slide, scale reveal, slow push |

Colors are proposed starting tokens and must be checked in rendered frames. Meaningful text uses a high-contrast pairing; gold on cream is reserved for highlighting with dark text rather than tiny gold lettering.

Each family can select a permitted surface/background within the chosen pack. A timeline and a quote can share a channel identity without sharing the identical layout.

### 7.2 Shared backgrounds and effects

- **Warped grid:** Draw a bounded SVG grid whose control points are driven by frame progress. This is a reusable background option, not a new template family. Keep line contrast low and movement slow.
- **Warm halo:** A restrained radial gradient behind a portrait/object; independent of the portrait's entrance.
- **Light leak:** Optional low-opacity warm gradient passing near frame edges. Reuse the visual language of existing light effects; avoid washing out text.
- **Paper and grain:** Original/bundled texture or deterministic procedural treatment. Texture should not move more noticeably than the content.
- **Vignette and shadow:** Theme-level bounded strength; preserve image detail and label contrast.
- **Film scratches:** Existing film effect, opt-in and restrained. Never required to make every scene feel historical.

Scene-owned backgrounds/effects belong inside the scene template. Existing manually placed environmental OV clips remain separate. The editor should warn when both produce duplicate dimming or excessive effects.

### 7.3 Shared animation rules

- Define entrance, hold, emphasis, and exit phases in seconds; convert using composition FPS.
- Starter motion presets: `fade`, `fade-rise`, `slide-left`, `slide-right`, `slide-top`, `scale-reveal`, `line-draw`, `highlight-wipe`.
- Typical entrance target: 0.35–0.65 seconds; stagger: 0.10–0.25 seconds; short exit: 0.20–0.35 seconds. These are adjustable design defaults.
- “Calm” removes overshoot and reduces travel; “Standard” permits modest scaling; “Expressive” is an explicit channel/scene choice.
- Avoid animating all elements continuously. One primary focal movement at a time, followed by a readable hold.
- Use narration cues for a date, name, passage, or relationship whenever alignment is available.
- Sound effects are optional future polish. The first release does not automatically add swooshes or create extra paid audio.

Remotion animations must derive from frame state, not browser wall-clock time or CSS transitions, so random-access rendering is consistent. This follows the official [animation guidance](https://www.remotion.dev/docs/animating-properties).

### 7.4 Short-form, long-form, and accessibility rules

- Support `16:9`, `9:16`, and `1:1` through authored variants, not just uniform scaling.
- Start with a 5% composition margin and a caption exclusion region derived from caption placement. Portrait also has a configurable platform-safe overlay shown in the editor; it is a guide, not a claim that all social platforms use one fixed safe area.
- Use a 1080-based short-edge design scale for type. Initial body target 32–42 px, principal labels at least 28 px, secondary source lines at least 24 px; test actual readability at mobile preview size.
- Use font measurement and wrapping rules. When content does not fit at the minimum size, offer a shorter draft, simpler variant, or reviewed split. Never shrink to unreadable text.
- Caption geometry comes from a shared layout helper, not a second hardcoded bottom margin in every family. Captions stay above template imagery; important text and source lines stay outside the caption region.
- UI respects reduced-motion preferences for preview autoplay. Export motion remains the user's chosen video style, with a calm option.
- Long videos use intentional clean footage between explanatory beats. Short videos use fewer facts per frame and faster setup, while preserving readable holds.

## 8. Proposed architecture

### 8.1 Chosen approach

Add one new structural clip kind, `scene-template`, to the existing `overlay_clips` system. Persist one scene-attached presentation per scene, with a versioned envelope and family-specific content. Keep legacy text/cards/environment clips working through their current paths.

New families have a dedicated typed registry. They do not each become new database tables or a new `OverlayClipKind`, and complex timeline/map/graph data is not forced into the old `title-cutout-card` superset.

The scene-template is shown as one editable item in the OV timeline, attached to its scene. Its internal layers are controlled in the Presentation inspector. Store one canonical envelope; do not also persist every generated label/line as independent overlay rows.

At render compilation, attach the presentation to its `CompositionScene` and render it inside that scene's transition wrapper. Exclude that same row from the global overlay render array. This keeps a full-screen map or card transitioning with its scene, without duplicate drawing.

### 8.2 Alternatives considered

| Alternative | Benefit | Reason not chosen for the first release |
|---|---|---|
| Many new `OverlayClipKind` values | Obvious renderer dispatch. | Repeats UI/lane logic for every family; registry should own family differences. |
| New standalone timeline/template system | Maximum flexibility. | Duplicates persistence, positioning, timing, and selection already available. |
| Arbitrary AI-authored layouts/CSS | Broad visual possibilities. | Hard to guarantee readability, safe rendering, source fidelity, and editable controls. |
| One separate row per generated layer | Existing free-overlay tools work immediately. | Atomic replacement, scene attachment, timing, and content edits become fragile. |
| Only a JSON field on `scenes` | Simple ownership. | Creates a second persistence mechanism for graphics and makes OV editing/review inconsistent. |

An advanced “detach into editable layers” workflow can be considered later. It is not required to ship this library.

### 8.3 Module boundaries

```text
Scene narration + timing + project style snapshot + source/media inventory
                               |
                      Presentation Director
                  (eligible families + suggestions)
                               |
                  schema/source/timing validation
                               |
                  review or authorized auto-apply
                               |
             overlay_clips: one scene-template envelope
                               |
              shared presentation compiler + layoutScenes
                          /               \
                 editor preview        export payload
                          \               /
                        SceneTemplate renderer
```

The AI proposes content and IDs. The application resolves assets, selects approved layout algorithms, computes timing, and validates constraints. The model does not generate React code or supply executable SVG.

## 9. Persistence and contracts

### 9.1 Additive database design

Proposed migration file: `db/add-scene-template-presentations.sql`. It is a future implementation artifact, not created or applied during this planning pass.

| Field on `overlay_clips` | Proposed semantics |
|---|---|
| `kind` | Existing text column gains supported value `scene-template` in application code. |
| `scene_id uuid null` | Attached scene; required for `scene-template`. Existing rows remain null. |
| `time_basis text default 'project'` | `project` for current overlays; `scene` for attached templates. |
| `duration_mode text default 'fixed'` | `fixed` uses `duration`; `scene-remainder` holds through the scene end from the selected local start. |
| `revision integer default 1` | Compare-and-swap version for edits, replacement, locks, and undo. |
| `locked boolean default false` | Prevents AI replacement; user can explicitly unlock. |
| `last_operation_id uuid null` | Last successfully applied single-scene operation, for retry recovery. |
| `last_operation_hash text null` | Hash of that operation's validated payload; reject key reuse with different content. |
| `template_data jsonb` | Existing field holds the validated presentation envelope for the new kind. |
| `origin` | Existing `user`/`ai` provenance retained; a user edit locks an AI-authored presentation without rewriting its origin. |

Timing contracts:

- Existing rows keep project-relative `start_time` and fixed `duration` semantics.
- For new rows with `time_basis='scene'`, `start_time` is the offset from the owning scene's nominal start. It is not an absolute project timestamp.
- `duration` remains a positive authored fallback length; it is authoritative only in `fixed` mode. In `scene-remainder`, effective duration is derived from the actual scene end.
- Shared compilation produces explicit global/scene frame ranges for all consumers. Never send raw attached-row `start_time` through today's absolute-overlay mapper.

Constraints and indexes:

1. Enforce `scene-template` => non-null scene ID, scene time basis, nonnegative start, positive fixed/fallback duration, revision >= 1, allowed modes, and a valid JSON envelope object.
2. Initially restrict scene time basis to `scene-template`; other kinds remain project-relative.
3. Add a unique partial index on scene ID for `kind='scene-template'`, allowing one attached presentation per scene.
4. Enforce the scene/project pair in the database, preferably using a composite foreign key `(scene_id, project_id)` to an eligible unique scene key. Cascade only the attached presentation when its scene is deleted.
5. Index `(project_id, scene_id)` for bulk project/act reads.
6. Do not backfill scene associations by time-range guesses. Old overlays retain existing semantics until explicitly converted.
7. Existing schema scripts have differing historical RLS assumptions. Implement project ownership using the current plan-25 authorization contract; do not copy the old “disable RLS” migration behavior into a paid feature.

### 9.2 Presentation envelope

The following is a contract sketch, not a copy-ready implementation. Exact discriminated Zod schemas must be implemented from the family inputs in sections 5–6.

```ts
type AssetRef =
  | { kind: 'media'; mediaId: string }
  | { kind: 'bundled'; assetKey: string; assetVersion: number };

type SourceRef = {
  id: string;
  factSnapshotId?: string;
  label: string;
  locator?: string; // edition, page, folio, catalog record, or passage
  url?: string;
  status: 'supplied' | 'user-reviewed';
};

type CueAnchor = {
  id: string;
  phrase: string;
  occurrence: number;
  offsetSeconds: number;
  fallbackOffsetSeconds: number;
};

type PresentationEnvelope = {
  schemaVersion: 1;
  templateId: DocumentaryTemplateId | 'clean';
  templateVersion: number;
  theme: { id: ThemeId; version: number; overrides: AllowedThemeOverrides };
  variantId: string;
  motion: { intensity: 'calm' | 'standard' | 'expressive'; seed: number };
  content: FamilyContent; // discriminated together with templateId
  sources: SourceRef[];
  cues: CueAnchor[];
  provenance: {
    scriptHash: string;
    narrationHash?: string;
    assetInventoryHash: string;
    directorVersion?: string;
    selectionReason?: string;
  };
};
```

- `clean` is an explicit supported sentinel with empty content/cues; it draws nothing new and keeps base media. Saving it preserves the creator's choice across reload and AI reruns.
- Every content item has a stable ID. Highlights/cues refer to item IDs, not fragile array positions or a guessed first matching word.
- Source references used by content must exist in the supplied snapshot or reviewed source inventory. The AI cannot mark its own output `user-reviewed`.
- Do not store generated JSX, HTML, CSS strings, external script URLs, or arbitrary SVG markup in this envelope.
- Media references are durable IDs. Resolve URLs immediately before preview/export; do not persist expiring signed URLs as the authoritative asset reference.
- Schema version, family rendering version, theme version, and row revision have different jobs. Changing a theme implementation must not silently restyle previously approved videos.
- Pins require versioned registry definitions and bundled assets; a saved version number alone is insufficient if old rendering code is deleted.
- For `scene-template`, envelope content/theme/motion are authoritative. Legacy top-level `text`, `preset`, `color`, and placement fields are ignored by that renderer and hidden in its inspector; do not save a second independent headline or color there.

### 9.3 Registry responsibilities

Each family definition declares: ID/version, name, purpose, supported variants/ratios, schema, required assets, source requirements, eligibility predicate, readable content limits, duration guidance, layer policy, fields for the editor, component resolver, and sample fixture IDs.

Separate the data registry from the component map, following the existing card registry pattern. Server validation and AI eligibility must not import JSX or browser-only modules.

Use a discriminated schema per family because a map and a translation carry genuinely different data. Use lossless optional style fields within a family when switching themes/variants. Cross-family conversion is an explicit preview with a list of fields that will not carry over.

### 9.4 Source, media, and annotation metadata

Add a narrowly scoped `media.presentation_metadata jsonb` only if inspection confirms there is no appropriate existing normalized media metadata field. Keep provider-specific output in `provider_metadata`.

Proposed metadata: intrinsic dimensions, alpha availability when known, content hash/version, source URL, creator/institution, license/credit text, historical/reconstruction/illustration classification, and optional document locator. Validate known fields; unknown alpha means “not checked,” not “transparent.”

Keep scene-specific focus regions and highlights inside the presentation content. Reusable source-image metadata belongs to the media item. This avoids a global annotation being overwritten by a scene-specific crop.

Image focus rectangles use `{ x, y, width, height }` in the 0–1 coordinate space of the uncropped source image. Reject regions outside the image or with nonpositive size. Text highlights store an item ID, exact text hash, and explicit range against the unchanged text; the implementation must declare one Unicode-aware offset convention and enforce grapheme boundaries. Matching normalization must not mutate the quoted string or invalidate its highlight ranges.

Use the existing `channel_facts_snapshot` as a source anchor, not as proof that a specific image or quotation is correct. Document excerpts, translations, and geographic data still require their own supplied/reviewed content.

The first release supports project assets and bundled resources. Cross-project private asset libraries, automatic archival OCR, and paid background removal are separate future work.

### 9.5 Safe application, replacement, and undo

1. `suggestScenePresentation` reads authorized project context and returns a validated proposal without changing clips or buying assets.
2. `applyScenePresentation` accepts the scene ID, proposal, expected revision, and operation ID. Validate ownership, family availability, assets, sources, timing, and locked state on the server.
3. Persist the single envelope atomically. Use compare-and-swap updates; a concurrent modification returns a conflict rather than overwriting it.
4. On a repeated operation ID with the same payload, return the previous result. Store `last_operation_id` and a payload hash for single-scene retries; reject reusing the ID with different content. Older retries remain protected by revision checks. Durable batch jobs keep per-scene operation results in the existing job system.
5. Removing legacy combo clips is an explicit conversion operation. Accept only individually identified, project-owned clips reviewed for replacement; perform conversion/removal in one transaction. Do not delete all graphics in the scene's time range.
6. Return the saved canonical row plus the previous value for a bounded immediate Undo. Undo is a revision-checked write. After another edit, show a conflict and preserve the newer work.
7. A first insertion can be undone by deleting only that newly created row if its revision/operation still matches.
8. AI replacement skips locked rows. Manual text/asset/timing edits automatically lock the presentation, with a visible “Keep my edits” state.
9. “Remove presentation” removes only that row, leaves media/narration intact, and is recoverable through immediate Undo.

Generic `createOverlayClip`, `updateOverlayClip`, and `deleteOverlayClip` paths must reject or dispatch new-kind operations through this service. Otherwise an old inspector or direct action call could bypass validation, locks, and revision checks. Server-assigned source review status and provenance cannot be accepted as authoritative from a model or client payload.

Persist the operation fields listed above when using the single-row retry strategy. Do not claim end-to-end idempotency from an operation ID that is never stored. Immediate Undo is an editor-session feature; durable revision history across browser restarts is a separate future capability.

## 10. Timing and scene lifecycle

### 10.1 Shared timing compiler

Use `layoutScenes` as the source of nominal scene frames. For each attached presentation:

```text
sceneStartFrame = segment.from
localStartFrame = round(start_time * fps)
availableFrames = segment.durationInFrames - localStartFrame
lengthFrames = availableFrames                         // scene-remainder
            or min(round(duration * fps), availableFrames) // fixed
globalStartFrame = sceneStartFrame + localStartFrame
```

Negative, non-finite, zero-available, or overrun timing is an editor validation state; export cannot silently create a one-frame flash. Clamping a shortened scene is visible and may require a simpler template.

Inside a scene's incoming transition, honor the existing distinction between render start and nominal narration start. Hold the presentation's initial state during pre-roll, then advance local animation from nominal frame zero. The entire scene, including its presentation, passes through the scene transition exactly once. Official [Sequence documentation](https://www.remotion.dev/docs/sequence) is the reference for local frame offsets.

Concrete fixture: a six-second scene starts at project second 10 at 30 FPS. An attached template starts 0.5 seconds into it and uses scene-remainder duration. Its global start is frame 315 and its effective length is 165 frames. Moving the scene to second 20 changes the start to frame 615 without rewriting the saved local offset. Trimming the scene to two seconds leaves 45 frames; the family readability check must flag that shortened duration rather than squeezing a dense card into it.

### 10.2 Narration anchors

- Match supplied phrases to word timings within the selected scene's range, not across the whole project indiscriminately.
- Normalize matching text for case/punctuation while preserving original displayed text and source offsets.
- Store the selected occurrence and optional surrounding context so repeated names do not all bind to the first mention.
- Act-relative word timings plus the act offset determine narration time; map to scene-local time through the canonical layout.
- Present anchor status as exact, manually placed, estimated, or needs review. Do not label an estimated cue “word accurate.”
- If alignment is unavailable, use an editable scene-relative fallback cue and visibly mark it estimated.
- If the script or narration changes, re-evaluate cue mappings. Ambiguous/missing anchors become needs-review; never bind silently to a different passage.
- Animation may begin slightly before a spoken keyword for readability, using a bounded explicit cue offset.

### 10.3 Duration and reading time

Each family declares a minimum hold estimate and maximum information density. The compiler checks actual entrance/exit time, text length, and cue spacing. For crowded scenes, the proposal can reduce decorative animation, use a simpler variant, or offer a shorter approved text alternative.

Splitting a scene, changing narration duration, or rewriting a source excerpt is a separate visible edit. AI template selection must not silently perform those operations.

### 10.4 Lifecycle behavior

| Event | Required behavior |
|---|---|
| Scene reorder | Presentation follows its scene ID; global timing is recompiled. Existing free overlays retain their project timing. |
| Scene trim | Recompute available time, cue bounds, and readability; retain saved requested timing for user review. |
| Earlier act re-recorded | Recompute act/scene placement without retranscribing unchanged acts; re-resolve affected global cue times. |
| Owning narration changed | Mark the presentation stale by script/narration hash; retain editable content. |
| Scene split | Keep the presentation on the original retained scene ID; new scene starts without one unless a supported reviewed redistribution is requested. |
| Scene merge | Require a visible choice of the surviving presentation; never concatenate incompatible configurations silently. |
| Scene duplication | New presentation row/IDs, remapped internal item IDs and scene owner, same project-authorized asset refs. |
| Scene deleted or act rewritten | Attached presentation is removed with its scene; act rewrite shows how many presentations will be discarded. A full act undo is outside this module unless already supported. |
| Media replaced/deleted | Preserve the configuration; mark missing/incompatible references and require repair before export. |
| Theme changed | Update only selected/unlocked scope after preview. Existing project snapshots remain stable until an explicit project restyle. |
| Unknown future version | Show an unsupported-version state; do not silently substitute a different family in the export. |

## 11. AI selection and generation workflow

### 11.1 Separate intent from decoration

For each scene, identify its explanatory job: location, chronology, identity, comparison, physical object, image detail, source passage, translation, relationship, process, quantity, uncertainty, recap, or atmosphere.

Selection also receives the full scene wording, including negations. “This is not evidence of a spacecraft” must not trigger an affirming spacecraft visual just because that noun is present. Channel format rules remain part of this context.

### 11.2 Eligible-family filtering

Filter before asking the model to choose:

1. Family is implemented and allowed in the project snapshot.
2. A supported layout exists for the aspect ratio.
3. Required asset/source data exists, or the suggestion is explicitly marked as awaiting it.
4. Actual scene duration can support the minimum explanation.
5. Required script/font support is present.
6. The existing presentation is unlocked and replacement is in the requested scope.

Classify proposals as `ready`, `needs-assets`, `needs-source-review`, or `needs-timing-review`. Only ready proposals can be auto-applied. Clean media is always a candidate when the existing background is usable.

### 11.3 Context-aware ranking

Provide narration for the current act, neighboring scene summaries, recently selected families, available assets, project theme, supported facts, and channel motion preferences. Return scene-keyed results, not a positional array assumed to survive filtering/reordering.

Suggested response per scene: selected family/variant, bounded family content, asset IDs, source IDs, cue phrases, short human-readable reason, unmet requirements, and up to two eligible alternatives. Do not expose raw prompts or schema names in the creator UI.

Start with one bounded act-level planning call when feasible, then validate each result. For long acts, use overlapping windows and carry the chosen neighboring-family history forward. This enables meaningful variety without asking each isolated call to satisfy a video-wide quota.

### 11.4 Deterministic pacing pass

- Prefer explanatory necessity over decorative variety.
- Keep clean media available between dense graphics. The current 40% prompt rule becomes a tunable preference, not a promise that every video must hit an arbitrary quota.
- Avoid repetitive full-screen card sequences unless the narration genuinely calls for them.
- Repeated family use can be intentional for continuity; vary emphasis or view within the established theme.
- Limit simultaneous information: one focal visual and one main text message per beat, with a quiet source line.
- The pacing pass may choose only an already validated alternative; it cannot invent content or force an unsuitable family to meet diversity targets.

### 11.5 Suggestions, application, and cost

- Manual editing and local template previews do not require an LLM call.
- “Suggest presentation” requests a choice for one scene; “Suggest for act” previews a batch.
- Gallery samples are prebuilt, not generated on every hover.
- Missing assets are shown as requirements. Selecting a template does not automatically purchase image/video generation or background removal.
- Reuse project media before suggesting new procurement. Source-sensitive imagery needs identity/source checks beyond a stock keyword match.
- Keep a proposal hash over script, timing, media inventory, source snapshot, theme, and registry version so a stale cached suggestion cannot overwrite newer inputs.
- Provider calls use the existing generation/billing adapters when available. No new credit counter or unlimited batch operation is introduced here.

### 11.6 Pipeline entry points

Integrate after narration timing is available and after a usable source/media inventory is known. A media-independent family may be proposed earlier, but exact timing and apply validation occur against current data.

Manual single-scene suggestion is the first AI entry point. Act suggestions follow after the full manual apply/render path works. Background automation must use the trusted durable job context from plans 24–25; do not copy request-cookie authentication into a worker.

Reconcile `src/trigger/autopilot.ts` only if it remains a supported entry point at implementation time. Both interactive and worker workflows should call one application service that validates and applies presentations. Neither should contain its own timing/compiler implementation.

## 12. UI and interaction design

### 12.1 Timeline inspector: Presentation

Replace the narrow “Scene Combo Preset” dropdown as the main entry point with a compact Presentation section. Existing combos remain available under a clearly labeled legacy/basic section during transition.

Collapsed state shows the current template thumbnail/name, theme, ready/needs-attention status, and lock state. Actions: **Browse**, **Suggest**, and **Edit**. A clean scene reads “Clean media” rather than looking unconfigured when that choice was saved explicitly.

Expanded inspector uses four concise tabs:

| Tab | Contents |
|---|---|
| Content | Family-specific text, dates, objects, events, relationships, and asset slots. |
| Style | Theme, supported layout, background treatment, restrained motion intensity. |
| Timing | Start/end behavior, narrated phrase anchors, entrance/hold/emphasis cues. |
| Sources | Attribution, linked facts/passages, image credits, reconstruction classification. |

Fields come from typed family definitions, with custom editors for geometry and graph data. Do not build a generic JSON text editor as the ordinary workflow.

### 12.2 Template browser

Open a large drawer/workspace over the selected scene while retaining project context. On desktop it has a template grid, live preview, and brief usage details.

```text
Presentation library                               Scene 14 · 7.2s · 16:9
[Search templates] [Recommended] [All] [Ready with my assets]

┌────────────────────────────┬────────────────────────────────────────┐
│ Geography  Sources  People │ Scene preview                          │
│                            │                                        │
│ [Map Locator] [Timeline]   │ Selected template with current content │
│ Ready         Needs dates │                                        │
│                            │ Play  |  Safe areas  |  16:9 / 9:16     │
│ [Artifact] [Passage]       ├────────────────────────────────────────┤
│ Ready      Needs source   │ Why it fits: introduces a named place  │
│                            │ Required: map + location               │
└────────────────────────────┴────────────────────────────────────────┘
                         [Cancel] [Preview in scene] [Apply to scene]
```

- Search by plain-language purpose: “show where,” “compare,” “explain a word,” “show a source.”
- Cards show one stable poster first; animate only the focused/hovered card, with keyboard and reduced-motion support.
- A readiness badge explains concrete needs: “Needs second image,” “Needs source passage,” or “Fits this scene.”
- The selected preview uses the creator's content when complete. Sample content is labeled “Example”; it must never be saved accidentally as real project content.
- Show required assets, typical content capacity, supported ratios, and one short explanation of when to use the family.
- Switching the preview ratio demonstrates the alternate layout; it does not silently change the project's export ratio.
- Previewing does not mutate the project. Apply validates the current revision and changes only the selected scene.

### 12.3 Scene Board integration

- Add a small presentation badge and readiness dot to each scene card.
- Put the same Presentation panel in the selected scene inspector; share its logic with Timeline.
- Add “Suggest presentations” to an act header, alongside the existing act workflow rather than replacing audio/visual approval.
- Batch review shows old/new thumbnails, proposed family, reason, missing assets, and changed fields.
- Default batch selection includes ready suggestions on unlocked scenes only. User-edited and locked scenes are visibly skipped.
- Apply returns a per-scene result; one failure does not claim the entire act succeeded. Retry uses stable operation IDs.
- Scene Board read model must include presentation summaries and real media references, including `media_id` resolution. Its current custom-URL-only thumbnail mapping is insufficient for multi-asset templates.
- The board uses poster thumbnails; mount the full Remotion Player only for the selected preview, not every scene card.

### 12.4 Timeline behavior

- Show one attached template item in the existing OV lane area, visually grouped with its owning scene by a link indicator.
- Selecting that item opens Presentation; selecting a legacy free overlay opens its current inspector.
- Display resolved global position on the timeline, while editing relative offsets in the panel. Make the distinction clear: “Starts 0.4s into Scene 14.”
- Dragging within a scene edits its local offset. Dragging outside the scene is constrained in the first release; moving to another scene is an explicit action with revalidation.
- Right trim switches from “Until scene ends” to a fixed duration. A reset action restores scene-remainder timing.
- Reordering the scene moves the attached item with it. It is not detected by nearby timestamp or clip appearance.
- Internal name/role/portrait entrances are cue rows inside the inspector, not dozens of independently persisted OV rows.
- Keep manual free overlays visible. Show a collision/duplicate-treatment note when they overlap important template text; do not delete them automatically.

### 12.5 Asset and source editing

- Asset slots offer current project media, upload, and existing stock search where appropriate.
- A portrait slot accepts a cutout or framed image; show the supported fallback immediately.
- An annotation editor opens the original image with drag handles, zoom preview, and label placement.
- A map editor selects from supported maps/places; unsupported geography clearly says what is missing.
- Original-language inputs include language/direction and supported-font preview.
- Source picker offers project fact snapshots plus manually supplied source references. A source note is not automatically marked reviewed.
- Crop/annotation edits preserve source-image coordinates and never rewrite the image bytes.

### 12.6 Channel and project styling

Add a **Visuals** tab to the existing Channel / Format / Facts settings shell. It edits a new optional `visual.presentation` section of the existing format profile via a narrow merge; it does not introduce a second style authority.

Controls: theme pack, motion intensity, default background treatment, allowed template families, preferred date style, information density, and clean-media preference. Keep the detailed color/font overrides collapsed until needed.

At project creation, resolve and freeze these settings into `format_blueprint_snapshot`. Existing projects get backward-compatible defaults without automatic restyling. A project-level “Visual style” panel can preview and explicitly apply an override to selected or unlocked scenes.

Settings writes must preserve the rest of the format profile and use revision checks to avoid overwriting an open Format tab's changes. The new settings should not silently replace channel-specific visual prose.

### 12.7 Empty, error, and loading states

| State | User-facing behavior |
|---|---|
| No presentation | Offer Browse and Suggest; explain that current media remains the scene's visual. |
| No usable media | Show eligible text-only families plus specific missing asset requirements. |
| Source missing | Show the exact missing source/passage field; offer an eligible simpler family. |
| Timing unavailable | Preview with estimated cues and label the estimate. |
| Too much text | Highlight overflowing field, show readable limit, offer shorter draft or simpler layout. |
| Saving | Preserve local preview, show saving state, disable duplicate Apply. |
| Save conflict | Keep local draft, show that the scene changed elsewhere, allow reload/compare. |
| AI failure | Keep existing presentation and manual editing; offer retry. |
| Unsupported renderer | Keep project content, explain that export needs a compatible renderer deployment. |
| Missing/deleted asset | Show repair slot and thumbnail placeholder in editor; block affected export. |
| Locked scene | Explain that AI skipped it; creator may unlock or explicitly replace it. |

All controls need visible labels, keyboard focus, accessible names, and a non-drag alternative for numeric placement. Do not communicate readiness through color alone.

## 13. Rendering and asset pipeline

### 13.1 One compiler for preview and export

Introduce a pure compiler that accepts scenes, overlay rows, project style snapshot, assets, captions/timing, dimensions, and FPS. It returns resolved scene presentations, remaining free overlays, asset requirements, and structured diagnostics.

Timeline and Scene Board preview call the same compiler used by export preparation. The server revalidates ownership and resolves durable asset IDs; browser-supplied rendered URLs or an `isReady` flag are not authority.

Export uses the saved presentation revision and validates the requested version against the canonical row. Unsaved draft previews must be saved before export; an export cannot silently discard visible edits or trust arbitrary client-authored template data. Build an immutable per-export manifest so edits made while a render runs affect only the next render.

`CompositionScene` gains an optional resolved presentation. Fully graphical scenes must work without a fake background media row: model base media as optional for such scenes and deliberately skip the base `<Img>`/video when the presentation supplies an opaque background. Existing media-required scene validation remains for clean/overlay variants.

### 13.2 Layer order and transitions

Within a scene: base media when needed → template background/scrim → main images/map/diagram → labels/highlights/source line → restrained scene effects. Captions remain above scene content. Existing independent manual OV layers retain their current global ordering; expose conflicts instead of silently reordering the user's work.

Family metadata declares `baseMediaPolicy: required | optional | hidden` and `backgroundCoverage: opaque | transparent`. Do not decode a hidden base video beneath a fully opaque map just to keep an obsolete invariant satisfied.

Full-screen template backgrounds begin in a defined initial state during transition pre-roll. Test crossfade, zoom, and slide transitions to avoid a one-frame black rectangle or content appearing ahead of its scene.

### 13.3 Nested asset discovery

Implement one typed asset collector for every supported family and legacy card fields. Reuse it for:

- Preview readiness and source resolution.
- Server ownership/existence checks.
- Relative URL normalization and browser-only `blob:` rejection.
- Local download/cache preparation.
- Lambda S3 synchronization.
- Export manifest and missing-media diagnostics.

Walk schema-defined media fields, not every arbitrary string inside JSON. Deduplicate by stable media identity/content hash. Preserve dimensions, alpha, and required attribution. Remote acquisition occurs before rendering, with the existing approved media mechanisms and bounded file/type/size handling.

Pre-resolve all required assets for an export into a manifest valid for the entire job. No live stock search, geocoding, OCR, or model request should run while rendering frames. Use the official image loading component and wait behavior as documented for [Remotion Img](https://www.remotion.dev/docs/img).

### 13.4 Fonts and complex scripts

Reuse the existing font loader for Latin typography. Add explicitly licensed, bundled or reliably loadable script fonts only for supported languages, with exact weights/subsets and readiness handling. Follow [Remotion font loading guidance](https://www.remotion.dev/docs/fonts).

Script support is a feature matrix, not a universal “all languages” claim. Initial D09 acceptance requires the actual original languages selected for the pilot episodes, with verified transliteration-only fallback for unsupported scripts. Word/line-level animation is the default for complex text.

### 13.5 Performance and version compatibility

- Keep family renderers pure: frame + validated props + stable seed determines output.
- Precompute layouts, text measurements, routes, and graph positions outside per-frame hot paths.
- Prefer simple DOM/SVG composition. True 3D, large canvas simulations, and live map engines are deferred.
- Version sample posters and theme textures; load only relevant preview assets.
- Register supported family/theme versions in an export capability manifest for both web and Lambda builds.
- Export preflight rejects unsupported versions before starting a paid render. An editor placeholder is not acceptable final video output.
- Establish timing/memory baselines before setting a cloud cost promise. Proposed initial regression target: ordinary card families within 25% of a matched existing card-render benchmark; heavier families need measured budgets, not invented guarantees.
- Test a representative 60-second sequence and a 20–30 minute many-scene project; benchmark viewer scrubbing separately from encoding.

## 14. Channel-specific application and sample sequences

### 14.1 Enoch

Use the repository channel brief as the primary styling constraint: an archivist examining objects, slow movement, source passages, restrained typography, and one original term unpacked at a time. See `docs/channels/enoch/channel-brief.md`.

Recommended emphasis: D06 artifact → D08 passage → D09 translation → D02 scholar or D04 explanation → clean archival image. The catalog can support reconstructions for other channels, but the current Enoch brief specifically prefers physical records and present-day places over dramatic reenactments. Do not enable D18/D19 reconstruction visuals by default for this channel.

Example visual sequence, using placeholders until real assets/passages are supplied:

1. Establish an approved manuscript image with a quiet identifying label.
2. Use Artifact Spotlight to show its supported locator/date information.
3. Zoom to an authored passage region as the narrator names it.
4. Show the supplied original term, transliteration, and attributed translation.
5. Return to clean archival media while the narrator explains the implication.
6. Use a timeline only if the narration actually introduces a supported chronology.

### 14.2 Mesopotamia

Read `docs/channels/mesopotamia/dossier.md` as subject context, not a substitute for per-asset/per-claim verification. The dossier itself distinguishes supported material from ideas needing further checking.

Recommended emphasis: D05 location → D06 tablet/object → D07 inscription detail → D09 supplied term/translation → D10 named relationships. D11 causal sequences and D12 scale comparisons are natural next additions.

Example sequence:

1. Locate the named site on an approved regional map.
2. Introduce the source tablet using the actual artifact image and identifier.
3. Point to the relevant authored detail without inventing unreadable glyph content.
4. Explain the supplied term or passage in translation.
5. Show relationships as “described in [source]” where they are literary/mythological.
6. End on an attributed excerpt or clean source image.

These sequences are planning examples, not verified historical claims or a fixed template order that every episode must repeat.

### 14.3 Reuse beyond the initial channels

| Future niche | Reused families |
|---|---|
| Biography | Person introduction, timeline, quote, map, relationship diagram. |
| Science/education | Detail annotation, process, scale comparison, charts, cutaways. |
| Business/history | Timeline, maps, charts, facts, archival sources. |
| Literature/religion | Passage highlight, translation, version comparison, relationships. |
| Investigative explainers | Source cards, claim/evidence, competing explanations, evidence board. |

Avoid channel names in reusable renderer logic. Channel differences belong in approved content, allowed families, and theme/profile settings.

## 15. Concrete implementation file map

Paths marked “new” are proposed. This plan does not create them. Keep the scope focused; do not refactor the entire large TimelineEditor just to introduce these panels.

| Location | Planned responsibility |
|---|---|
| `src/lib/presentations/types.ts` — new | Shared domain types, diagnostics, source/media reference contracts. |
| `src/lib/presentations/schemas.ts` — new | Strict family/envelope parsing and numeric/text limits. Split by family if it becomes unwieldy. |
| `src/lib/presentations/registry.ts` — new | Pure family metadata, eligibility, supported versions, editor fields. |
| `src/lib/presentations/themes.ts` — new | Versioned theme tokens and channel default resolution. |
| `src/lib/presentations/compile.ts` — new | Canonical timing/layout compilation shared by preview and export. |
| `src/lib/presentations/anchors.ts` — new | Phrase occurrence resolution and stale-cue diagnostics. |
| `src/lib/presentations/assets.ts` — new | Typed asset enumeration including legacy card references. |
| `src/lib/presentations/legacy.ts` — new | Explicit legacy combo adapter/conversion and field normalization. |
| `src/features/presentations/server/presentation-actions.ts` — new | Authorized suggest/apply/lock/remove/undo entry points. |
| `src/server/presentations/presentation-service.ts` — new | Shared application service usable by actions and trusted jobs. |
| `src/features/presentations/components/*` — new | Presentation panel, browser, preview, content editors, annotation editor, batch review. |
| `src/remotion/presentations/SceneTemplate.tsx` — new | Renderer dispatcher for compiled family props. |
| `src/remotion/presentations/families/*` — new | Ten initial family renderers. |
| `src/remotion/presentations/primitives/*` — new | Shared backgrounds, source footer, connectors, focus framing, highlight and reveal helpers. |
| `src/remotion/dev/PresentationGallery.tsx` — new | Developer fixtures for every family/ratio/theme and boundary case. |
| `src/remotion/types.ts`, `compositions/VideoComposition.tsx`, `Root.tsx` | Scene presentation props, correct render placement, metadata and fixture registration. |
| `src/remotion/templates/card-registry.ts`, `card-styles.tsx` | Keep legacy registry working; reuse compatible primitives and explicit adapters. |
| `src/remotion/fonts.ts`, `captions/CaptionTrack.tsx` | Script font readiness and shared caption-safe layout. |
| `src/lib/ai/agents/edit-director.ts` | Use family eligibility, real source/media inventory, neighboring context and structured proposals. |
| `src/lib/combo-templates.ts`, `timeline-editor/server/combo-actions.ts` | Repair contract mismatches; route new choices through the presentation service. |
| `src/features/timeline-editor/components/TimelineEditor.tsx` | Shared Presentation panel, attached clip mapping, preview, trim/drag behavior. |
| `src/features/scene-board/{components/SceneBoard.tsx,server/scene-board-actions.ts}` | Summaries, selected-scene preview, batch act workflow and media lookup. |
| `src/features/channel-settings/components/SettingsTabs.tsx` | Add Visuals tab using existing application UI tokens. |
| `src/features/channel-settings/components/VisualLanguageSection.tsx` — new | Channel presentation defaults and preview samples. |
| `src/lib/ai/format-profile.ts`, `channel-settings/server/format-actions.ts` | Optional profile extension, backward-compatible parsing, narrow merge/revision handling. |
| `src/features/video-generation/server/whiteboard-actions.ts` | Snapshot settings and surface presentation effects of scene/act regeneration. |
| `src/features/timeline-editor/server/scene-actions.ts` | Attached presentation lifecycle for duplicate/split/merge/delete/reorder where these operations exist. |
| `src/server/rendering/{render-payload,media-cache,local-renderer,s3-sync,lambda-renderer}.ts` | Server validation, nested assets, durable export manifest and capability preflight. |
| `src/app/api/render-remotion/route.ts` | Export preflight and existing authorization/metering integration. |
| `src/trigger/autopilot.ts` | Conditional legacy worker reconciliation if still supported. |
| `db/add-scene-template-presentations.sql` — new | Additive attachment/version/lock/retry metadata, indexes and validated write transaction. |
| `db/add-presentation-media-metadata.sql` — conditional new | Source/dimension/alpha metadata if the implementation confirms a new field is needed. |
| `tests/presentations/*` — new | Meaningful schema, timing, state, permission, asset and render regression fixtures. |

## 16. Delivery phases and acceptance gates

Phases are dependency-ordered slices, not calendar promises. Phases 0–5 have been authorized and locally/isolated-tested. No numbered implementation phase remains unstarted; the release gates below still require remote activation and real-source acceptance. Local implementation status is distinct from paid activation, live model suitability, hosted rendering and human-approved pilot acceptance.

### Phase 0 — Contract verification and legacy baseline

**Implementation status (2026-10-06):** Local compatibility gate passed. Canonical combo writes, a read-time legacy adapter, edit/reload content protection, 17 regression tests, and 60 before/after render fixture comparisons are complete. Existing unaffected captures are identical; the expected AI/legacy card captures are corrected. A read-only row inventory query and dependency findings are available in the [readiness report](../docs/presentations/phase-0-readiness.md). Actual hosted row inventory, ownership enforcement, pilot assets/languages, and deployed Lambda/Trigger state remain unverified; no migration or deployment was performed.

- Capture existing manual card, AI combo, clean-media, captions, and transition render fixtures.
- Reproduce and repair the `style`/`styleId`, `items`/`bullets`, and card text mismatches through a scoped compatibility adapter.
- Record which existing rows rely on legacy behavior before any migration; do not bulk rewrite unknown data.
- Confirm project access contract, hosted media readiness, supported narration language, and actual pilot assets.
- Resolve whether the legacy Trigger autopilot is active or should remain isolated.

**Gate:** Existing templates still render; corrected AI combos produce the intended populated style; current baselines and dependencies are documented.

### Phase 1 — One complete manual vertical slice

**Implementation status (2026-10-07):** Local implementation gate passed. D03 Image Comparison and explicit Clean, versioned contracts, two initial theme token sets, caption-safe responsive rendering, the scene-inspector Presentation browser/editor, owned atomic saves, retry/revision protection, lock metadata, immediate Undo, and nested media preparation are implemented. Verification includes 34 tests, a production build, 46 stills, three MP4s, 13 isolated browser workflow checks, and a 60-fixture legacy recheck. Actual database activation, real authenticated project access, approved pilot assets, and deployed Lambda verification remain open. See the [Phase 1 readiness report](../docs/presentations/phase-1-readiness.md).

The initial themes expose the tokens this family needs; the full multi-family theme packs, Scene Board entry point, and Visuals settings remain Phase 2. Legacy free overlays are preserved, not automatically converted/deleted. Undo is immediate and session-local, not a durable history system. AI does not select or replace this new family until Phase 3.

The new SQL migration enables owned RLS for all overlays, and export now requires real project ownership. The existing development auth bypass is not a signed-in session; environment activation must establish that contract rather than remove the guards. Cloud presentations use the versioned `MainVideo-Documentary-v1` composition alias to prevent silent omission by an older deployed site.

- Add attachment/version/lock/retry schema and one typed family: D03 Image Comparison.
- Implement theme tokens, compiler, attached timeline behavior, Presentation panel, asset slots, atomic apply and Undo.
- Render the same scene in portrait, landscape, and square in preview and local export; verify nested media preparation and a compatible Lambda path when available.
- Include caption-safe layout and transition behavior now, not after ten families are written.

**Gate:** Creator can browse, preview, apply, edit, reload, reorder, trim, undo, and export this family without lost edits or different output.

### Phase 2 — Complete the ten-family manual library

**Implementation status (2026-10-07):** Local implementation and fixture verification are complete. Nine additional families bring the manual library to ten; shared v2 theme packs, typed content/source editors, original-image region selection, supported-script rendering, the West Asia reference map, constrained diagrams, Scene Board integration, and frozen channel/project Visuals defaults are implemented. Verification includes 50 passing tests, typecheck/build, 180 final stills and three clips, 39 edge stills with six expected repair rejections, 15 new UI workflow groups, the 13-check comparison regression and 60 legacy captures. The additive SQL is authored and isolated-tested, not applied remotely. Actual authentication, cloud deployment and approved Enoch/Mesopotamia pilots remain open. See the [Phase 2 readiness report](../docs/presentations/phase-2-readiness.md).

The manual library does not yet select families with AI, infer coordinates/relationships, transcribe manuscripts, translate supplied text or generate cutouts. The UI's future AI preference is stored only for Phase 3. Existing versioned presentations are not automatically restyled. Manual Channel Format saves now require the Phase 2 CAS migration as well; coordinate activation with the compatible application/renderer.

- Add D01, D02, D04, D06 using the common text/card/asset primitives.
- Add D07/D08 region editing and source links; D09 supported-script text and translation fields.
- Add D05 curated map assets and coordinate mapping; D10 constrained graph layouts.
- Complete both theme packs, Scene Board integration, Visuals settings, and frozen defaults.
- Prepare real approved pilot content for both channels; sample content remains explicitly labeled.

**Gate:** All ten families pass family-specific and ratio/source/timing acceptance; creator can finish a representative documentary sequence manually.

### Phase 3 — AI selection and reviewed act workflow

**Implementation status (2026-10-07):** Local implementation and isolated verification are complete. Source-constrained selection from reviewed typed packets, eligible/repair candidates, exact cue occurrence/alignment, bounded scene windows, a deterministic pacing pass, durable request IDs, the shared metered generation adapter, scene/act review, editable previews and selective revision/lock/stale-safe application are implemented. Verification includes 63 presentation tests, 159 billing dependency tests, typecheck/build, ten new browser workflow groups and the 15-group manual-library regression. No real model request, remote migration or cloud deployment was made. See the [Phase 3 readiness report](../docs/presentations/phase-3-readiness.md).

The first implementation fills factual template fields by copying creator-approved project source packets; the model selects IDs/reasons/cue phrases, not invented dates, translations, crops, coordinates or relationships. Missing evidence remains a repair requirement. Locked/unsupported scenes are skipped before provider work; unlocked manual scenes require explicit inclusion and replacement approval. Paid requests remain off by default and fail closed without the approved billing catalog. Current cap-based token accounting, host execution/reconciliation and real model suitability need review before activation. No cookie-based legacy worker or unattended auto-apply was enabled.

- Add eligible-family selection, source-aware filling, timing anchors, reasons and alternatives.
- Add sequence pacing validation, explicit clean choice, lock handling, and stale-input detection.
- Ship one-scene suggestions, then act review and selective apply.
- Integrate with trusted jobs/provider budgets only through the established application contracts.

**Gate:** Across a reviewed scene set, every applied selection has valid assets/content and preserved user edits. Measure selection suitability with a rubric, not the model's own confidence score.

**First release ends here:** ten families, two themes, manual control, AI suggestions, review, and verified export paths.

### Phase 4 — Next four additions

**Implementation status (2026-10-08):** Local implementation and isolated verification are complete. D11–D14 have typed content/source controls, distinct posters, responsive deterministic renderers, explicit causal/sequential and proportional/values-only distinctions, exact fact/quotation retention and evidence limitations. Existing reviewed-packet AI selection supports the enabled new families without authoring factual data. An additive migration preserves the existing CAS/lock/origin services, expands Visuals to fourteen and invalidates older suggestions through a registry hash revision; new/mixed exports require `MainVideo-Documentary-v3`. Verification includes 72 passing presentation tests, eleven new manual browser workflows, the fifteen-group manual and ten-group AI-review regressions, 97 stills/four clips, five expected unsafe-text rejections and typecheck/build. No remote migration, paid model call or cloud deployment was made. See [Phase 4 readiness](../docs/presentations/phase-4-readiness.md). Existing saved allowed-family settings are not expanded automatically; actual pilot suitability and hosted activation remain open.

Implement D11 Cause and Effect, D12 Scale Comparison, D13 Fact Reveal, and D14 Claim/Evidence. Prioritize based on actual pilot scenes that the first ten families could not explain well.

**Gate:** Each adds a distinct useful storytelling capability and its required data validation, rather than duplicating an existing layout under a new name.

### Phase 5 — Advanced catalog

**Implementation status (2026-10-08):** D15–D24 are locally implemented with strict authored-content contracts, distinct posters, family-specific controls, source slots, responsive deterministic renderers and existing manual/AI review services. Defaults remain fourteen families; advanced families require explicit AI opt-in and approved typed packets. Authoritative save/export and the additive Phase 5 SQL validate current recap references, ownership and source/data constraints. New/mixed exports require `MainVideo-Documentary-v4`; all older composition IDs remain registered. Verification passed: 85 presentation tests; 18 advanced, 15 original manual, 10 AI-review and 11 Phase 4 browser groups; 251 stills, ten H.264 clips and six expected unsafe-input rejections; typecheck, focused lint and production build. SQL was applied twice only in isolated PGlite. No live migration, paid model call or deployment occurred. See [Phase 5 readiness](../docs/presentations/phase-5-readiness.md).

**Bounded implementation, not universal automation:** Journey/territory maps use the existing West Asia basemap and a reviewed static viewport, not automatic camera-follow or invented historical borders. Routes are explicit supplied vertices or clearly labeled schematic connections. Territory snapshots crossfade reviewed simple polygon rings; arbitrary GeoJSON topology, holes and geometry morphing are not supported. Wipes require reviewed matching source crops or an explicit side-by-side choice. Parallax requires registered prepared layers and a complete background plate; no segmentation, background removal or inpainting is added. Cutaways reveal a supplied reviewed diagram rather than inventing an interior. Manuscript mappings use exact supplied text; charts retain actual data, missing values and uncertainty on a zero baseline. Recaps use owned earlier-scene stills, not recursively rendered scenes. Real channel sources/prepared assets remain a prerequisite for activation and editorial acceptance.

**Gate:** Local quality/export checks and measured synthetic render timings passed. Each family still needs real-source editorial review, full-resolution hosted parity and approved pilot acceptance; synthetic fixtures and creator review flags are not independent historical verification or a production performance guarantee.

## 17. Verification plan

### 17.1 Functional tests

| Area | Required cases |
|---|---|
| Schema | Every family valid fixture, malformed JSON, wrong content type, unknown version, excessive items, non-finite values, invalid rectangles/edges. |
| Ownership | Wrong workspace/project/scene/media IDs rejected; a source from another private project cannot be referenced. |
| Persistence | Atomic first apply, replacement, failed replacement, concurrent edits, lock enforcement, repeated operation, same operation with different payload. |
| Legacy compatibility | Old rows without style IDs, corrected combo field mappings, legacy free overlays, manual overlap, unknown saved styles. |
| Timing | Reorder, trim, short scene, scene-remainder/fixed mode, 24/30/60 FPS, transition pre-roll, repeated anchor phrase, missing alignment. |
| Narration lifecycle | Re-record owning act, re-record earlier act, changed script, deleted/split/merged scene, stale proposals. |
| Assets | Nested template image, alpha portrait, missing second image, invalid blob URL, expired remote reference, relative URL, deletion and asset version change. |
| Text | Long names, long dates, multi-line labels, repeated highlights, original-language shaping, unsupported glyphs, exact quote preservation. |
| Geography/data | Coordinate transform under crop, approximate date, BCE/CE boundary, missing year, graph ambiguity, unknown source record. |
| Export | Same compiled config in Player/local/Lambda, compatible version preflight, caption collision, graphical scene without background media. |

### 17.2 Visual QA

- Render stills at entrance, settled hold, each important cue, and exit for every first-release family.
- Review both themes at 1920×1080, 1080×1920, and 1080×1080, including mobile-sized previews.
- Render short clips to inspect motion, timing, transition boundaries, and font stability; stills alone cannot verify animation quality.
- Include sparse and maximum-content fixtures, low-resolution images, unusual aspect ratios, and intentionally missing requirements.
- Keep a contact sheet/gallery of approved visual fixtures; compare meaningful visual changes against it.
- Inspect one representative Enoch passage/translation sequence and one Mesopotamia map/artifact sequence with real reviewed assets.
- Verify no sample names, placeholder dates, debug markers, or unresolved template warnings enter final exports.

### 17.3 AI evaluation rubric

Prepare a small versioned set of representative scene inputs with approved sources/assets and human-reviewed acceptable choices. Include clean-media cases, denied concepts, scarce assets, dense text, multiple dates, and repeated neighboring scenes.

Evaluate: explanatory fit, source fidelity, asset identity, readable duration, useful variety, theme consistency, and preservation of manual choices. A selection can have several acceptable answers. Report rates and example failures rather than a single flattering overall score.

Structural validity, no unauthorized replacement, and no invented required source data are release gates. Stylistic suitability is reviewed with the creator and improved using concrete scene examples.

### 17.4 Engineering checks during implementation

- Run focused lint/type checks on changed modules; do not rely on a script that excludes those paths.
- Add targeted tests for compiler, validation, transaction, timing, and ownership invariants.
- Run render smoke tests only after meaningful rendering changes; reuse fixtures for subsequent checks.
- Validate migrations against an isolated database fixture before considering application to a real project database.
- Record which cloud checks actually ran. Local parity is not evidence of Lambda parity when assets/fonts differ.

## 18. Rollout, dependencies, and recovery

- Add separate controls for manual-library availability and AI selection. Enable new family writes only when the matching reader/renderer and migration exist.
- Deploy compatible rendering support before enabling creation of new versioned presentations. Verify web and Lambda capabilities before export.
- Rollback disables new suggestions/creation first; retain render support for saved projects. Removing a feature flag must not make existing paid projects unreadable.
- Existing projects keep old styles and timing until explicitly edited/converted. No blanket conversion of all historical overlays.
- Missing migrations disable the new write path with a useful setup state while existing editing remains usable.
- Pilot with reviewed Enoch and Mesopotamia projects before widening AI eligibility to every channel.
- Authentication/ownership, durable storage, job execution, and generation budgeting follow plans 24–25. This module can be developed and fixture-tested independently, but a hosted paid release depends on those contracts working.
- Measure suggestion latency, preview responsiveness, failed apply rate, missing assets, render failures, and manual override frequency. Keep metrics operational; do not collect source text or private media unnecessarily.

## 19. Open review decisions with proposed defaults

These are review points for this specification, not requests to interrupt planning. Defaults allow a concrete first implementation once the user authorizes it.

| Decision | Proposed default | What would change the plan |
|---|---|---|
| Initial scope | D01–D10 plus refinement of existing essentials. | Creator chooses fewer families for an earlier pilot. |
| Initial themes | Parchment Archive and Dark Documentary. | A supplied channel brand guide requires different typography/colors. |
| AI autonomy | Suggest and review; opt-in auto-apply only for ready, unlocked scenes. | Creator explicitly wants broader unattended operation after testing. |
| Template ownership | One attached scene-template row; manual overlays remain independent. | A proven need for multiple unrelated presentations in one scene. |
| Map coverage | Small curated regional set for pilot episodes. | Geographic range requires a separate data/geocoding integration. |
| Original-language support | Declare and test scripts used by selected pilot passages. | Other languages require font/typing fixtures before claiming support. |
| Asset procurement | Reuse/upload/current stock tools; no automatic paid generation on template selection. | Explicit product decision to add metered procurement later. |
| Source annotation | Creator-authored region and supplied excerpt. | OCR/vision tooling becomes a separately approved feature. |
| Background removal | Use supplied cutouts or attractive framed variants. | A dedicated cutout workflow is requested. |
| Visual reconstruction | Allowed as a labeled capability; disabled by default where the channel brief excludes it. | Channel format explicitly permits reconstruction scenes. |
| Advanced exports | Ship only families with verified renderer support and measured cost. | Performance findings require simpler variants or different render infrastructure. |

## 20. Definition of done for the first release

- [ ] All ten families have typed content, readable variants, source/asset requirements, and a working fallback or repair state.
- [ ] Both theme packs are coherent across families, with configurable but bounded motion.
- [ ] Template browser, Presentation inspector, Scene Board badges/review, and Visuals settings are implemented.
- [ ] Attached presentations survive reload, reorder, timing changes, and ordinary editing without affecting unrelated manual overlays.
- [ ] Apply/replace/undo are atomic or revision-safe; retries do not duplicate graphics.
- [ ] AI choices use scene meaning, assets, sources, timing, and neighboring context; creators can inspect and override them.
- [ ] Quotes/translations/source images remain traceable; original-language support is explicitly tested.
- [ ] Captions, source lines, and template text remain readable in landscape, portrait, and square.
- [ ] All nested assets are available to preview and supported export backends; fully graphical scenes do not require fake media.
- [ ] Version compatibility is checked before rendering, with no silent substitution of missing families.
- [ ] Pilot documentary sequences for both channels pass human visual review and technical verification.
- [ ] Current generation, billing, and hosted deployment dependencies are documented as verified or still outstanding.

The next decisions are review and staged activation of the locally implemented twenty-four-family module with approved billing and channel assets, ordered database migrations through Phase 5, and live provider/hosted v4 validation. There is no remaining numbered implementation phase in this plan. The unchecked first-release definition includes actual authenticated workflows, cloud verification and human AI suitability/pilot acceptance; local Phase 5 completion does not imply those gates have passed.
