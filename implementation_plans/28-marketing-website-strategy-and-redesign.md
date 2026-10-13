# 28 — Marketing website strategy and redesign

Research date: October 9, 2026 (Asia/Manila)

Status: Research and proposed structure/copy. No redesign implementation, new dependency,
external account connection, purchase, publication or deployment is included in this phase.

## 1. Direction and decisions

The owner selected these priorities during discovery:

- Primary audience: faceless YouTube creators making long-form videos.
- Launch conversion: request early access or a product demo.
- Visual direction: dark theme with purposeful motion and interactive product cards.
- Sequence: product truth and website structure, complete copy, static design, then motion.

Recommended positioning:

> AssemblyReel helps faceless YouTube creators turn a topic into a long-form narrated
> video through AI-assisted scripting, narration, visuals and editing, with creator review
> at key stages.

The site should sell the result and explain the control the creator retains. Use the
internal multi-agent architecture as supporting detail, not the main sales vocabulary.
Describe software capabilities as features/workflows. Do not introduce separate consulting,
editing or done-for-you services unless the owner actually offers and supports them.

The preferred short message is **“Turn your topic into a long-form video. Stay in control
of the story.”** Avoid an unattended publishing promise. AI does substantial production
work; the creator supplies direction, reviews narration and visuals, and checks the export.

Use **AssemblyReel** consistently in text, metadata, logo labels, examples and social cards.
Confirm the public domain and business contact before generating production URLs or policies.

## 2. Audit of the current website

### Evidence and limits

Reviewed the current landing/pricing source, root metadata, design tokens, product entry
form, narration code, integrations screen, thumbnail UI, worker scaffold, and readiness
records. A local HTTP request returned 200 and landing-page content at `/` after the
previous routing fix. The returned HTML title was `Autocast | Media Factory`; it had no
canonical link or JSON-LD. No app-router robots/sitemap/social-image files were found.

No connected browser was returned by the enabled browser inventory. This is a source and
HTML audit, not a pixel-by-pixel screenshot review. Desktop/mobile appearance, real keyboard
behavior, contrast of all combinations, network loading and Core Web Vitals remain unmeasured.
Competitor observations below come from public pages/docs, not paid-product testing.

### Evaluation

| Area | Assessment | Evidence | Recommended change |
|---|---|---|---|
| Product fit | Major mismatch | Hero sells short videos posted daily to TikTok/YouTube/Instagram | Lead with long-form faceless YouTube production and export |
| Distinctiveness | Weak | Borrowed Series/autoposting narrative misses the chapter workflow | Make narration review, channel consistency and editing central |
| Trust | Needs correction before public launch | 28,000+ creators, 2.5M+ videos, 800M+ views; no supporting evidence in this audit | Remove until substantiated; replace with real output and walkthroughs |
| Demo proof | Mostly illustrative | Fake player and repeated gradient cards with view counts | Show actual exported examples and clearly labeled interface demos |
| Navigation | Incomplete | Pricing/Login/Sign Up; desktop nav hidden on small screens without replacement | Add Product, How it works, Examples, Resources and early-access CTA; mobile menu |
| Calls to action | Wrong launch model | Free trial/sign-up wording and demo cookie login | Request early access / Watch demo; separate gated access from acquisition |
| FAQ | Not useful yet | Questions and plus icons have no answers or expansion handlers | Publish substantive answers in accessible HTML |
| Pricing | Conflicts with implementation | Free/Starter/Daily/Hardcore cards; monthly/yearly controls lack behavior | Early-access notice, then approved pricing after cost and billing validation |
| Brand | Inconsistent | AssemblyReel/Assemblyreel/Assemblyreels versus Autocast metadata | One identity and accurate per-page titles/descriptions |
| Visual continuity | Disconnected | Light blue marketing versus dark mint-accented product | Neutral dark marketing tokens with compatible mint accent |
| Search foundations | Incomplete | Generic root description, no canonical/structured data/sitemap files found | Per-page metadata, public sitemap, correct indexing and substantive pages |
| Maintainability | Needs separation | Large client landing component; duplicated nav/modal/pricing; whole-page initial opacity zero | Server-render static copy, isolate interactive sections and share marketing components |

Local evidence paths:

- [Landing page](../src/app/page.tsx): hero/social proof near lines 50–149; FAQs near 618–687;
  placeholder footer links near 749 onward; demo login near the top.
- [Pricing page](../src/app/pricing/page.tsx): prototype plan cards and demo login.
- [Root layout](../src/app/layout.tsx): stale Autocast title.
- [Global tokens](../src/app/globals.css): light marketing tokens and dark `ed-*` app tokens.
- [Integrations](../src/app/(dashboard)/integrations/page.tsx): mock connection handlers.
- [Billing plan proposals](../src/features/billing/plans.ts): approved catalog is empty;
  billing disabled by default.

Do not treat a client component as automatically invisible to search: the current hero
exists in the initial HTML. The issue is unnecessary interactivity/dependencies and the
whole-page animation hiding content until it runs, not proof of zero indexability.

### Keep, replace, remove

Keep the concept of a strong hero, examples, workflow explanation, capability sections,
FAQ and final CTA. Rebuild their content and presentation around this product.

Replace the generic gradient examples, passive-income language, copied plan names,
prototype login and unanswered FAQs. Replace decorative mock dashboards with actual
captures or explicitly labeled diagrams.

Remove unsupported social metrics, growth guarantees, claims of automatic cross-platform
publishing, invented endorsements, placeholder affiliate/alternative links, and nonfunctional
pricing controls. Provider logos can identify integrations; they must not imply partnerships.

## 3. Product truth and capability inventory

“Implemented locally” describes code evidence; it does not establish hosted availability,
operational reliability or customer access. Before public demonstrations, validate the
specific showcased workflow and record which steps involved manual correction.

| Capability | Evidence/status | How to describe it |
|---|---|---|
| Topic/brief to project | NewVideoForm and video-generation actions | Start with your topic, hook, visual direction and target length |
| AI chapter outlining and scriptwriting | Whiteboard actions, script writer, duration rules | Develop a long-form story chapter by chapter |
| Scene breakdown | Slicer actions and Scene Board | Review how narration becomes individual scenes |
| Channel format/blueprint | Channel settings, format resolver and frozen snapshots | Reuse voice, tone, structure and visual preferences across projects |
| Source/fact ledger | Fact settings and frozen project facts | Supply and approve sources; AI is not an independent fact-verification guarantee |
| Narration | Audio actions; local/OpenAI/ElevenLabs routing | Generate and review narration for each chapter; voices depend on configuration |
| Word timing/captions | Alignment, narration layout and Remotion captions | Build caption/timing tracks from generated narration; confirm the demonstrated output |
| Casting consistency | Project character blueprints | Reuse character descriptions to reduce drift; do not promise perfect identity consistency |
| Generated stills/clips | Provider registry and media actions | Use configured AI media providers; availability/cost varies |
| Stock/media upload | Stock workflow and upload routes | Review stock selections or use your own assets; licenses still matter |
| Chapter visual approval | Whiteboard approval and timeline inspector | Review narration before producing each chapter's visuals |
| Timeline editing | TimelineEditor and Phase 7 record | Refine scene order, timing, transitions, audio and overlays |
| Documentary graphics | 24 families plus Clean implemented locally | Show a curated set of presentation examples; authenticated/remote activation remains gated |
| Charts/maps/evidence templates | Presentation contracts and Phase 5 report | Author supported graphics from reviewed content/assets; no invented data or unlimited geography |
| Thumbnails | Concept/final thumbnail UI/actions | Explore concept thumbnails and render-based directions; validate shown path |
| MP4 rendering | Local/Lambda server-rendering modules | Export a finished file; cloud rendering requires configuration/deployment |
| Multiple channel workspaces | Workspace and blueprint code | Organize projects with distinct channel settings; not proof of agency team collaboration |
| Autopilot worker | Trigger task scaffold and form option | In development; not a production promise of unattended full generation |
| Social publishing | Mock connection UI; worker stops at project approval | Not an established live capability; exclude from primary pitch |
| Paid self-service SaaS | Guarded billing core; empty approved offers; fake auth retained | Not the launch path; early access/demo only |
| Public API/team roles/mobile app/avatars/voice cloning | Not established by reviewed implementation | Omit rather than infer from competitor features |

Important boundaries:

- [Timeline Phase 7](27-phase-7-readiness.md) passed local gates but still needs live-browser acceptance.
- [Presentation Phase 5](../docs/presentations/phase-5-readiness.md) still needs remote activation,
  real authenticated workflows, deployed rendering and editorial/pilot acceptance.
- [Billing checkpoint](../docs/billing/core-implementation.md) still needs auth/customer UI,
  complete provider/worker usage integration and real sandbox lifecycle validation.
- [Autopilot scaffold](../src/trigger/autopilot.ts) contains simplified overlay timing and
  hardcoded orientation and does not establish cloud queue resilience, final rendering or publishing.
- The README's broad multi-hour/no-queue wording should not become marketing copy without
  reconciling it with the actual selectable durations and the newer worker scaffold.

Initial marketing should target long-form production without guaranteeing exact duration,
completion speed, unlimited generation, monetization, error-free facts or particular results.

## 4. Competitor research and implications

These are dated observations, not independent verification of vendor performance claims.
The recommendation is to learn the communication pattern and create original copy/assets.

| Platform | Relevant public pattern | Lesson for AssemblyReel |
|---|---|---|
| [VidRush](https://vidrush.ai/) | Long-form focus; brief-driven workflow; examples/use cases, editing and pricing; some polish features marked coming soon | Explain the brief-to-output journey and clearly distinguish shipping versus developing features |
| [VidRush guide](https://docs.vidrush.ai/docs/quick-start-guide) | Brand settings, prompt interpretation, cost review, generation and editing; timing depends on demand | A workflow page should explain configuration, review, output and realistic expectations |
| [AutoShorts](https://autoshorts.ai/?trk=article-ssr-frontend-pulse_little-text-block) | Series-based short-form creation, customization and scheduled publishing | This explains the current template's message; retain simplicity, rebuild the story for long form |
| [AutoShorts workflow](https://autoshorts.ai/alternative/faceless-reels) | Topic/style setup, preview, connected posting channels | Publishing is a separate validated capability, not synonymous with generating a downloadable video |
| [InVideo](https://invideo.io/) | Editing-led story with natural-language assistance and a multitrack timeline | Demonstrate practical editing control; do not advertise conversational editing unless built |
| [Pictory](https://pictory.ai/) | Separates input-based workflows and gives them dedicated explanations/demos | Use specific feature/use-case pages rather than a long undifferentiated list |

Inference across the reviewed sites: clear input/output, examples, how-it-works, control,
capability detail, commercial expectations and objection handling recur. This is a small
qualitative sample, not a universal layout requirement or conversion study.

VidRush's headline timing is not a reliable benchmark for our app: its own guide describes
longer waits at peak demand. Do not copy its speed or scale claims.

Suggested differentiation to validate with pilot creators:

1. Review a long video in manageable chapters.
2. Hear the narration before committing to visuals.
3. Reuse a channel blueprint instead of repeating preferences.
4. Refine the timeline and documentary graphics from one workspace.
5. Preserve creator approval of source-dependent material.

This is a proposed messaging angle, not evidence that competitors lack these capabilities.

## 5. Website structure

### Navigation

Desktop: logo → Product → How it works → Examples → Resources → About → Request early access.
For the first small release, Product, How it works and Examples can be homepage anchors.
Resources appears only when real resources exist. About can start in the footer if the
header becomes crowded. Do not link an unfinished Pricing page as though checkout is active.

Mobile: logo + accessible menu button; the same destinations and CTA inside the menu.
Keyboard operation, focus return, Escape and scroll behavior must work.

### Proposed route map and priority

| Route | Purpose | Release |
|---|---|---|
| `/` | Product identity, evidence, workflow, benefits and conversion | Initial |
| `/early-access` | Actual lead request, expectations and privacy notice | Initial |
| `/demo` | Walkthrough with transcript; optional request form for guided demo | Initial |
| `/examples` | Gallery of real, labeled exports | Initial once approved assets exist |
| `/examples/[slug]` | Watch page: video, original brief, workflow notes and transcript | Initial for at least one real sample |
| `/about` | Founder story, why the workflow exists, product status, contact | Initial |
| `/privacy`, `/terms` | Actual data/process and use terms reviewed for launch | Before public data collection |
| `/contact` | Supported contact route; can initially live on About | Initial |
| `/how-it-works` | Detailed steps and what creator review involves | Next |
| `/features` and selected detail pages | Capabilities with screenshot/output proof | Next, publish only substantial pages |
| `/use-cases/faceless-youtube` | Audience-specific production workflow | Next |
| `/use-cases/ai-documentaries` | Documentary workflow with source/graphic examples | Next |
| `/resources/[slug]` | Original tutorials and production notes | Next, editorial cadence |
| `/pricing` | Early-access availability now; approved plans later | Correct the existing prototype before launch |
| `/compare/assemblyreel-vs-vidrush` | Dated, fair verified comparison | Later, after real tests and product readiness |

Do not create every route as a thin SEO page. Fewer useful pages are better than a large
empty navigation. Export, narration, blueprint and graphics can be sections before they
justify separate feature pages. Existing dashboard routes are separate application surfaces.

### Homepage sequence and layout

| Order | Section | Visitor question | Content/layout | Later motion |
|---|---|---|---|---|
| 1 | Hero | What is this, and is it for me? | Specific headline, two CTAs, one widescreen product/output visual | Brief → chapter → timeline sequence |
| 2 | Real example | Can it produce something I would publish? | Large playable excerpt, original brief and full-example link | User-initiated video only |
| 3 | Production overview | What work does AI do? | Input, script, narration, visuals, editor, export map | Advance one step at a time |
| 4 | How it works | What do I have to do? | Four numbered steps with actual UI crops | Optional selectable step cards |
| 5 | Creator control | Can I correct the result? | Large editor screenshot plus three specific controls | Scene change and chapter approval highlights |
| 6 | Capability grid | What is included? | Six compact cards, grouped by production stage | Small purposeful card transitions |
| 7 | Channel consistency | Can I reuse my channel identity? | Blueprint example and two project cards | Same settings visually carried forward |
| 8 | Documentary graphics | How do I explain complex material? | Three or four validated graphic examples | User-selectable graphic previews |
| 9 | Use cases | What would I make? | History, educational explainers, narrative essays with real examples | Still cards with optional previews |
| 10 | Early access | What is available now? | Honest launch status, request process and pricing notice | Static |
| 11 | FAQ | What might stop me? | 10–12 useful answers | Accessible disclosure transitions |
| 12 | Final CTA + footer | What is my next step? | Short request invitation and complete footer | Restrained button feedback |

Hero and real output should receive the most visual emphasis. Alternate wide showcase
sections, two-column explanations and compact grids. Do not make every section a bento grid.
Mobile flow preserves the same reading order; large visual timelines become readable steps.

## 6. Proposed homepage copy, start to finish

Draft copy below is an original editorial proposal. Feature text describes the demonstrated
local workflow; early-access labels must remain explicit. Placeholder asset labels are
production instructions, not text to publish. Final copy needs a claim-to-evidence review.

### Header and hero

Navigation: Product · How it works · Examples · About

Header CTA: **Request early access**

Eyebrow: **AI video production for faceless YouTube creators**

H1: **Turn your topic into a long-form video.**

Supporting line: **Stay in control of the story.**

Body: **AssemblyReel brings AI scripting, narration, visuals and timeline editing into one
workflow. Start with your topic and channel style, review each chapter, then refine and
export your video.**

Primary CTA: **Request early access**

Secondary CTA: **Watch the workflow**

Microcopy: **Early access · Guided demos · Long-form creator workflow**

Hero visual: one real editor capture paired with its output excerpt. If a prompt animation
is used, label it **Workflow preview**. A selectable example brief may read:
**“Create a documentary about how ancient cities managed water. Use a calm narrator,
chapter-based storytelling and a cinematic visual style.”** Do not present a fake live
generation form or progress timer. Use **Explore the workflow** for a static demo control.

### Real output

H2: **See the story take shape.**

Body: **Explore a video made with AssemblyReel, from the original brief to the final export.**

Example metadata: actual title · measured final runtime · actual format · demonstrated
workflow/settings · creator edits disclosed.

Actions: **Play excerpt** · **View the complete example**

Production requirement: one legitimate sample before publishing this section. Until then,
use a clearly labeled product walkthrough; do not substitute invented view counts.

### Production overview

H2: **One idea. A complete production workflow.**

Body: **Writing, voiceover, visuals and editing usually mean moving between tools.
AssemblyReel connects those stages around one project so you can focus on the story.**

Stage labels: **Your brief → Chapters and script → Narration → Visuals → Timeline → Export**

Supporting line: **AI handles the production steps. You review the decisions that shape the result.**

### How it works

H2: **From your brief to an editable video.**

1. **Give the story direction.** Enter your topic, target length and visual style. Use
   saved channel settings to guide the voice and structure.
2. **Build and hear each chapter.** Review the AI-written script and listen to its
   narration before moving on to visuals.
3. **Bring the scenes to life.** Generate visuals, review stock options or add your own
   media. Refine scenes that need a different direction.
4. **Polish the timeline and export.** Adjust timing, audio, captions, transitions and
   overlays, then render the finished video file.

Link: **Explore the full workflow** (publish only when its destination exists).

### Creator control

H2: **AI does the heavy lifting. You keep the final say.**

Body: **Long videos need more than a single generation button. Review one chapter at a
time, replace a visual, adjust narration or refine the edit before your final export.**

Three supporting labels:

- **Review before visuals:** listen to each chapter before committing to its scenes.
- **Refine the edit:** adjust scene timing, transitions, captions and audio in the timeline.
- **Revisit a chapter:** revise a section without starting the entire story again.

No percentage-of-automation, time-saved or zero-learning-curve claims without observed evidence.

### Capability grid

H2: **The tools behind your next long-form video.**

| Card | Draft description |
|---|---|
| Chapters and scripts | Turn a topic into a structured narrative with editable chapters and scene text. |
| Narration and captions | Generate chapter narration and build caption timing around the spoken audio. |
| AI and stock visuals | Combine generated media, reviewed stock selections and your own uploads. |
| Timeline and sound | Refine scenes, music, transitions and overlays before rendering. |
| Channel blueprints | Save your channel's voice, storytelling rules and visual direction for future projects. |
| Thumbnails and export | Explore thumbnail directions and render your project into a finished video file. |

Do not list all AI providers on the home page. A technical detail page can explain the
configured integrations after real availability has been verified.

### Channel consistency

H2: **Build a channel style you can reuse.**

Body: **Define the narrator, tone, story structure and visual preferences once. AssemblyReel
uses that channel blueprint to guide new projects while keeping each video's settings
attached to its own production.**

Labels: **Voice and tone · Chapter structure · Visual direction · Reviewed source notes**

Visual requirement: a sanitized real blueprint and two real project examples. Avoid a
claim that every character, image or outcome is identical across runs.

### Documentary graphics

H2: **Give complex ideas a visual explanation.**

Body: **Explore documentary presentation tools for timelines, comparisons, source passages
and other scene graphics. Use reviewed content and supported assets to make the explanation
clearer. Advanced workflows are being validated for early access.**

Preview labels: **Historical timeline · Image comparison · Source passage · Chart**

Caption: **Demonstration examples. Available formats and supported content vary by workflow.**

Show only templates that have been validated with their required assets, saved state and
export. Maps must respect the current geographic/data restrictions. A template renderer is
not a fact-checking service. Showing all 24 families is optional; a meaningful small set is stronger.

### Use cases

H2: **Built for stories worth watching beyond the first minute.**

- **History and documentary:** build chapter-based narratives with narration, visuals and
  reviewed source material.
- **Educational explainers:** turn a topic into a sequence of explanations with captions
  and supporting graphics.
- **Narrative essays:** develop an argument or story with a consistent narrator and
  editable scene pacing.

These are intended use cases; accompany them with real samples before implying proven
performance in every niche. Short-form support can sit in feature detail without dominating the pitch.

### Early access and commercial expectations

H2: **Help shape the next stage of AssemblyReel.**

Body: **We are preparing early access for creators making long-form faceless videos.
Request access or a guided demo to discuss your channel, see the workflow and find out
whether the current version fits your production needs.**

CTA: **Request early access**

Supporting line: **Public plans and included usage will be shared when confirmed.**

Do not publish the provisional $49/$99/$249 proposal as an approved offer or retain
the copied Free/Starter/Daily/Hardcore cards. Do not promise guaranteed admission,
no-card generation, free videos, unlimited regeneration or a response deadline.

### FAQ answers

**What does AssemblyReel do?**
AssemblyReel is an AI-assisted video production app for long-form faceless content.
Its workflow connects scripting, narration, visuals, editing and export, with creator
review at key stages.

**What do I need to provide?**
Start with a topic, desired length and creative direction. Channel voice, structure and
style can be saved as a blueprint. Specific source-dependent graphics also need suitable
reviewed content and assets.

**Does AI do everything automatically?**
AI assists with the major production stages. The reviewed workflow keeps script,
narration, visual and final-output decisions with the creator. Fully unattended
production is not the early-access promise.

**Can I edit the result?**
The workflow includes a Scene Board and timeline for refining scene order, timing,
audio, transitions and overlays. A guided demo can show which controls are available
in the current build.

**What kinds of videos is it designed for?**
The primary focus is chapter-based faceless YouTube content, including documentary
stories, explainers and narrative essays. Output examples will show the specific
workflows demonstrated in the current version.

**How long can the videos be?**
The app includes configurable duration tiers and an Act-based workflow for long-form
projects. Confirm suitable target lengths during your demo; final runtime depends on
the script and narration. Do not publish a hard maximum until it is validated.

**How long does generation take?**
Timing depends on project length, selected media providers, narration, rendering and
the revisions you make. We are measuring representative workflows rather than
promising that every long video finishes in a fixed number of minutes.

**Does AssemblyReel publish directly to YouTube?**
The current demonstrated workflow creates a video file for you to review and upload.
Automatic social publishing is not an established early-access feature.

**Is all generated information fact-checked?**
No. Creators should review factual claims and approve appropriate sources. Source
tools help organize material; AI-generated text and graphics still need editorial review.

**Can I use my own images or clips?**
The local workflow supports uploaded media alongside configured generated and stock
media. You are responsible for the permissions needed to use your supplied material.

**What does early access cost?**
Public prices and usage allowances are not finalized. Request early access or a demo
to learn about availability and confirmed terms before committing to a plan.

**Can I monetize the finished videos?**
AssemblyReel cannot guarantee monetization or revenue. Review the relevant platform
rules and the rights associated with your script, narration, media and other assets.

Keep these answers present in HTML even when collapsed. Revisit them as launch conditions
change; do not leave the marketing answers behind the actual product.

### Final CTA and footer

H2: **Bring your next video idea. See how the workflow brings it together.**

Body: **Tell us about your channel and the long-form content you want to create.**

CTA: **Request early access**

Footer description: **AI-assisted long-form video production, from your topic to a
reviewable script, narrated scenes and a finished export.**

Footer groups: Product (How it works, Examples, Availability); Company (About, Contact);
Resources (only published guides); Legal (Privacy, Terms). Add real social links only.
Use a text copyright with the current year and confirmed business name.

## 7. Supporting pages and conversion flow

### Early-access page

H1: **Tell us what you want to create.**

Body: **Request early access or a guided demo of AssemblyReel's long-form production
workflow. Share a little about your channel so we can understand your needs.**

Required: email address and request type (early access / guided demo). Optional: name,
channel URL, typical video length, main production challenge. Do not require a long survey,
password, credit card or upload to express interest. Explain optional fields as optional.

Submit label: **Send request**

Success after actual durable acceptance: **Your request has been received. We will contact
you about availability or your demo request.** Do not show success on a timer or failed request.

Error: **We could not send your request. Your entries are still here—please try again.**

Link the actual privacy notice, and keep optional newsletter consent separate from the
product/demo request. Select a reliable storage/delivery destination during implementation;
no service or account has been selected or connected in this planning phase.

### Demo and example pages

Demo: one guided walkthrough, captions/transcript, step list, build/status date,
and a request CTA. No unattended paid generation behind the marketing demo.

Example: full output, original topic/brief, real runtime/format, source/media provenance
summary, creator corrections, workflow version/date, transcript and related capabilities.
Use permissions-cleared assets and anonymized screenshots. Do not expose private
workspace names, customer data, tokens or draft notes in captures.

### About

Draft opening: **AssemblyReel is being built around a practical problem: long-form
faceless production involves many connected decisions, from story structure and narration
to scene timing and visuals. Our goal is to bring that work into one reviewable workflow.**

Add the owner's verified biography, why this project exists, product maturity and a real
contact method. Avoid fabricated team members, awards, enterprise customers or support guarantees.

### Pricing migration

During early access, `/pricing` should explain that public plans are being finalized
and direct visitors to the request flow. Preserve its URL or redirect deliberately so
existing links have a useful destination. Later approved pricing must clarify usage units,
included outputs, retries, render charges, resolution/duration, paid add-ons and cancellation.

Terms, privacy and asset-rights wording require the actual business process. This plan
does not supply legal policy text or invent rights granted by external media providers.

## 8. Visual design system and motion

### Dark direction

Use a calm production-studio appearance: neutral charcoal, restrained mint, clean
typography and real video imagery. Draft palette, subject to contrast testing:

- Background `#0A0B0D`; surface `#15181C`; raised surface `#20242A`.
- Main text `#F3F4F6`; secondary text `#B5BCC6`; border `#353B44`.
- Accent `#13EF93` with dark button text. Do not put white text on bright mint.
- Media imagery supplies the rich color; navigation and body text stay quiet.

Use marketing-scoped tokens, not a global rewrite of `ed-*` values. The app has existing
semantic colors and contrast constraints. Start with the existing Inter font; test one
additional display font only if it adds a clear brand benefit and fits the loading budget.

Suggested layout: approximately 1200 px maximum content width, readable paragraph widths,
comfortable responsive gutters, strong headline hierarchy, and three distinct section
types (wide output, paired explanation, compact card group). These are starting values,
not a measured final layout. Avoid dense all-caps body copy and perpetual neon borders.

### Motion specification after the static page works

| Section | Motion concept | Fallback/control |
|---|---|---|
| Hero | Brief becomes chapter cards, then a timeline; 8–12 second illustrative sequence | Static labeled final state; replay/pause; no hidden headline |
| Workflow | Click/select a stage and reveal its actual screen | Keyboard/touch accessible; plain step list remains |
| Editing | One scene replacement or narration-review highlight | Clearly a demo; no fake user data or real paid API calls |
| Blueprint | Settings visually attach to two projects | Static equivalent and readable labels |
| Graphics | Select a real template excerpt | One active preview at a time; click-to-play |
| FAQ | Small disclosure height/fade changes | Correct semantics; readable answer without animation |
| CTA | Brief hover/press feedback | No magnetic interaction that interferes with clicking |

Motion is useful when it explains input/output, state or control. A waveform should not
pretend to be measured audio if it is decorative. Use actual recorded product media for
proof, and labeled authored diagrams for explanation.

Respect reduced motion; support keyboard focus and media captions; no audio autoplay.
Do not depend on hover for important content. Avoid scroll hijacking, long pinned sections,
cursor-only controls, per-letter movement on paragraph text and multiple WebGL canvases.
Pause loops while offscreen or the tab is hidden; offer pause controls for sustained motion.
Mobile/reduced-motion versions can use posters instead of loops.

## 9. Design/tooling recommendations

Choose one design source of truth and a small runtime stack. These tools solve different
jobs; buying or installing all of them is not a design strategy. Prices/plan entitlements
and licensing must be checked again when a purchase or integration is actually proposed.

| Tool | Appropriate role | Recommendation/tradeoff |
|---|---|---|
| [Figma](https://www.figma.com/dev-mode/) | Wireframes, components, prototype and handoff | Preferred optional design workspace; app still implemented in Next.js |
| [Penpot](https://help.penpot.app/user-guide/dev-tools/) | Open-source design/inspect alternative | Choose instead of Figma if its workflow is preferred; not both by default |
| Next.js + Tailwind | Production layout and server-rendered content | Keep current stack and code ownership |
| [Motion](https://motion.dev/docs/react-accessibility) | React transitions and reduced-motion handling | Use already installed `framer-motion`; no animation-library migration needed initially |
| [shadcn/ui](https://ui.shadcn.com/docs) | Editable component primitives | Evaluate for menu, dialog, accordion and forms; validate accessibility in our usage |
| [v0](https://v0.app/docs/faqs) | React/Next.js layout explorations | Optional prototype tool; review generated output against our tokens and product truth |
| [Framer](https://www.framer.com/help/articles/can-i-export-my-website-to-html-and-self-host-it/) | Separately hosted marketing builder | Viable if separate marketing hosting is intentionally chosen; not a simple install into this app |
| [Framer React Export plugin](https://www.framer.com/marketplace/plugins/react-export/) | Selected Framer-to-React export workflow | Third-party workflow; pilot before relying on full layout/effect portability |
| [Webflow DevLink](https://developers.webflow.com/home/changelog/2026/5/21) | Designer-authored React components | Real export option, but adds provider/runtime/style constraints; evaluate only if visual editing is necessary |
| [Builder.io](https://www.builder.io/c/docs/visual-editor) | Visual editing of registered components/content | Best candidate if non-developer editing in the existing Next.js site becomes a recurring need |
| [Rive](https://rive.app/docs/runtimes/react/react) | Interactive authored vector animations | Optional for one meaningful workflow illustration after static design is approved |
| [LottieFiles](https://lottiefiles.com/blog/working-with-lottie-animations/how-to-use-lottie-in-react-app) | Authored animation assets/React playback | Alternative to Rive for simpler clips; actual asset/runtime cost needs testing |
| [GSAP](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) | Complex animation timelines/scroll sequences | Defer unless an approved sequence exceeds the existing Motion approach |
| [Magic UI](https://magicui.design/) / [Aceternity UI](https://ui.aceternity.com/) / [React Bits](https://www.reactbits.dev/) | Optional component/effect references | Selective references, not whole themes; inspect license, dependencies, motion and performance before copying |
| [Spline](https://spline.design/) | Interactive 3D visual | Defer; product footage is more relevant to proving a video workflow |

Framer's website builder and the `framer-motion` library are different products. Framer
does not provide native full-site HTML export for self-hosting; marketplace plugins are a
separate integration path. Webflow's current DevLink can export component-scoped interactions,
but its [limitations](https://developers.webflow.com/devlink/docs/component-export/troubleshooting)
include unsupported action types and CSS/runtime integration concerns. Neither should be
treated as a guaranteed one-click export of the existing app.

v0's [Git workflow](https://v0.app/docs/github) automatically creates branches/commits.
Given the recent branch confusion, use an isolated prototype or a clearly named short-lived
design branch if chosen, then review and merge deliberately. Do not automatically attach
production secrets or deploy the complete local media-generating app just to preview marketing.

Preferred initial combination: **Figma or a directly reviewable coded wireframe + existing
Next.js/Tailwind + existing Motion**. Add accessible primitives where needed. Use Remotion
to author/export a product demonstration if useful; marketing should serve a lightweight
video/poster rather than mount the full production editor.

## 10. SEO, AEO and GEO

SEO concerns search discovery/indexing. AEO is a useful shorthand for answering visitors'
questions clearly. GEO concerns being accurately represented/cited in generated answers.
They share content and technical foundations; none guarantees rankings or citations.

### Current official guidance

Google's [2026 generative AI guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
continues to emphasize conventional SEO and original useful content. It says Google Search
ignores `llms.txt`, does not require special AI schema and does not require content to be
split into tiny chunks. For this site, original demos and precise workflow explanations
are stronger investments than supposed AI-ranking tricks. This recommendation concerns
Google; it is not a claim about every other AI retrieval service.

Google's [search changelog](https://developers.google.com/search/updates) records the
retirement of FAQ rich results beginning May 7, 2026. Keep useful visible FAQs, but do not
sell FAQPage markup as a way to obtain that retired presentation. Avoid obsolete SEO
checklists. Recheck official guidance before implementing structured data.

### Technical foundation

- Canonical public domain, HTTPS, stable URLs, actual 200 content and intentional redirects.
- Distinct page title, description, canonical and Open Graph/Twitter preview metadata.
- Server-render core copy and links; isolate demos/menu/forms as interactive client islands.
- Use semantic headings, buttons, labels and links. Essential text belongs in real HTML,
  not just canvas, image, CSS-generated content or animation frames.
- Public sitemap includes only substantial canonical marketing/resources/example pages.
- Crawler policy should match business goals. Keep private application pages outside the
  marketing sitemap; authenticated access remains necessary. Robots/noindex are not access control.
- Add route-specific indexing rules so dashboard pages do not inherit public marketing metadata.
- Responsive images, explicit media dimensions, video posters and lazy below-fold embeds.
- Preserve useful existing URLs when restructuring; do not reset all pages to the home page.
- Validate rendered HTML and metadata, mobile navigation, crawlability and structured data.

### Structured data scope

Organization/WebSite can identify the real entity/site; Article/BreadcrumbList can describe
published resources. Only verified profiles belong in `sameAs`. VideoObject can describe
actual published demos with real titles, thumbnails, upload dates, durations and URLs.
Follow Google's [video markup](https://developers.google.com/search/docs/appearance/structured-data/video)
and [video discoverability](https://developers.google.com/search/docs/appearance/video) guidance.

SoftwareApplication may describe the app factually, but Google's
[software rich-result requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app)
include an offer and a rating/review. The early-access site does not currently have those
validated inputs; do not fabricate a $0 offer or star ratings to satisfy eligibility.
Schema validity and eligibility for a particular rich result are different.

### Content that is useful to readers and retrieval systems

Publish one consistent product definition, an honest availability/status explanation,
steps, input/output examples, limitations, original screenshots, transcripts and dated
comparisons. Attribute supporting claims where needed. Answer natural questions directly
because visitors need those answers, not because a fixed answer length is an AI requirement.

Initial content topics, not measured search-volume forecasts:

| Topic/intent | Best page | Evidence needed |
|---|---|---|
| AI long-form video generator | Home/product | Real prompt-to-export example |
| How to make a faceless YouTube documentary | Workflow guide | Full process and creator review points |
| AI narration for long videos | Capability/tutorial | Actual chapter narration and timing example |
| Keep a consistent style across AI videos | Blueprint guide | Two projects using shared settings |
| Edit an AI-generated video | Editor guide | Real scene revision and export |
| Documentary graphics and source review | Graphics guide | Validated chart/timeline/source examples |
| AssemblyReel versus VidRush | Later comparison | Dated first-hand testing and fair limitations |

Build initial resources from the product itself: one complete project walkthrough, one
channel-blueprint guide, and one editing/graphics demonstration. Avoid generic AI-written
articles at scale, unsupported “best tool” lists and dozens of duplicate use-case pages.

### Measurement

Connect the verified public site to Search Console and Bing Webmaster Tools at launch.
Use available search/AI reports, indexing diagnostics and conversion analytics. Google's
newer guide links an AI-specific report while its older guide describes blended Web data;
verify actual account availability instead of assuming either reporting layout universally.

Bing's [AI Performance documentation](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c)
describes page citations and grouped grounding queries for supported AI experiences.
Treat them as observational visibility signals, not a causal score or complete prompt log.

Track qualified early-access requests, successful demo requests, example engagement and
request completion, then correlate with indexed pages/search referrals. Example event names:
`early_access_click`, `demo_play`, `example_open`, `lead_submit_success`, `lead_submit_error`.
Keep email addresses and free-text production briefs out of analytics payloads.

Monthly: check branded accuracy and a fixed sample of relevant search/AI questions; record
date, platform, source links and variation. Recheck competitor claims quarterly and search
documentation before major SEO changes. Third-party visibility tools are optional and cannot
guarantee placement. No automatic recurring job has been created by this plan.

## 11. Implementation phases and acceptance

### Phase A — Product truth and evidence

Finalize the claim inventory, launch status, brand spelling and public domain/contact.
Choose one flagship long-form project and assemble its brief, captures, narration excerpt,
export and corrections. Confirm actual rights and source suitability for publication.

Acceptance: every promised capability has evidence/status; no invented metrics/prices;
at least one usable product demonstration is ready. Not all 24 graphics need showcasing.

### Phase B — Structure and complete copy

Review this sitemap/home copy, early-access form fields, FAQ and page ownership. Resolve
public versus gated app routes. Draw simple desktop/mobile wireframes. Assign CTA
destinations and remove placeholder links from the planned page list.

Acceptance: a visitor can explain what the app does, what input it needs, what review is
required, what output they receive and how to request access. All visible copy has a destination.

### Phase C — Static dark website

Build reusable marketing nav/footer/sections, server-rendered pages and scoped tokens.
Replace prototype pricing and fake login on marketing pages with actual request/demo flows.
Implement real form persistence and errors. Add metadata, sitemap, relevant schema and
published policies. Keep changes to marketing routes separated from editor behavior.

Acceptance: responsive static website, real media, functioning forms/links, keyboard controls,
no fake success states, correct brand metadata and useful reading order without motion.

### Phase D — Purposeful motion

Add the approved hero/workflow sequence first. Measure its loading and interaction cost,
then add selected card/graphic transitions. Rive/Lottie/GSAP are evaluated only if a specific
approved interaction needs them. Provide reduced-motion and mobile equivalents.

Acceptance: animation explains the product and never blocks copy, keyboard use or CTAs;
videos have user controls/captions; static fallbacks work.

### Phase E — Browser, search and conversion QA

Check a named browser/device matrix, mobile menu, anchors, forms, focus, contrast, transcripts,
loading, crawler-visible HTML and metadata. Verify real requests reach the chosen destination
before publishing the form. Test structured data only against the features actually used.

Aim for the official [Core Web Vitals](https://web.dev/articles/vitals) good thresholds:
LCP at most 2.5 seconds, INP at most 200 ms and CLS at most 0.1 at the 75th percentile,
segmented by mobile/desktop. Prelaunch lab runs are proxies; field pass claims require traffic.
Choose an initial transfer/JS/video budget after measuring the static build.

Acceptance: accessibility and real browser flows pass; no broken public links; metadata and
form delivery verified; lab results recorded and field measurement configured.

### Phase F — Iteration after launch

Learn from actual qualified requests. Test one messaging/layout variable at a time when
traffic is sufficient. Add useful feature/use-case pages and truthful pilot stories. Replace
early-access pricing copy only after approved plans, real auth and billing are ready.

## 12. Immediate next work and remaining choices

The next implementation step is Phase A/B: choose the flagship example and produce a
static desktop/mobile wireframe using the copy in this document. Do not install a visual
builder first and let its template determine the product message.

Remaining choices can be resolved during that work:

- Which real project/output may be shown publicly?
- Final brand/logo and confirmed domain/contact.
- Where early-access requests are stored and how demo requests are handled.
- Figma, Penpot or a coded wireframe as the design review surface.
- Which demonstrated capabilities are included in the initial early-access offer.

The user has not requested a Git commit/push or production publication for this planning
document. Keep it locally reviewable until implementation/publication is requested.
