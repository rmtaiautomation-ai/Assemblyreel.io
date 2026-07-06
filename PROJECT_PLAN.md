# Project Plan: Custom Media Factory

## Target Scope
Build a specialized web pipeline that generates an automated video rough draft based on niche workspaces, allows manual timeline modification (CapCut-style adjustments), handles automated distribution, and scales into a credit-based SaaS over time.

---

## Phase 1: AI Workspace (Weeks 1-3)
**Goal:** Build database foundations, authentication, and core script generation workflows. No asset generation.
- [ ] Initialize Next.js environment, load Tailwind configurations, and register Supabase project auth instances.
- [ ] Construct the Workspace dashboard view allowing creation of tailored channel profiles (e.g., Biblical Horror, Finance, Esoteric).
- [ ] Set up the `workspaces` state to append master prompts (branding rules, palette selections) securely.
- [ ] Add "Style Presets" dropdown (Charcoal, Cinematic, etc.) and "Voice ID" selection.
- [ ] Construct Voice Cloning Hub UI for uploading 60s Cartesia voice samples.
- [ ] Integrate the Gemini 2.5 API engine to parse a text prompt into a complete voice script broken down into structured scenes.

## Phase 2: AI Generation (Weeks 4-6)
**Goal:** Map raw script data arrays to asset endpoints.
- [ ] Wire Cartesia API route to compile individual scene string records into isolated high-fidelity TTS `.mp3` blocks.
- [ ] Bind Fal.ai routes (Kling / Seedance / Veo) to translate scene action strings into dynamic high-resolution background video clips.
- [ ] Parse returning asset destinations directly into the matching positions within the `timeline_json` column.
- [ ] Generate `.srt` subtitles based on the script pacing.

## Phase 3: Unrestricted Timeline UI & Editing (Weeks 7-12)
**Goal:** Implement a browser-based multi-track timeline container for individual scene fixes.
- [ ] Construct a visual track layout displaying synchronized Video, Audio, Transition, and Overlay (Subtitle/Watermark) nodes.
- [ ] Enable explicit block click behavior to pop open localized editing controls (Regenerate Text Voiceover / Swapping out clip urls).
- [ ] Create timeline modification capabilities allowing users to manually shorten, extend, or add arbitrary footage clips.
- [ ] Build "Review & Approval Gate" to prevent auto-posting before user manually catches hallucinations.
- [ ] Wire up FFmpeg.wasm or Shotstack API options to combine the raw multi-track track blocks into one finalized `.mp4` file download.

## Phase 4: Automation & Social Distribution (Weeks 13-14)
**Goal:** Hands-off posting to production platforms.
- [ ] Configure secure OAuth 2.0 connection loops for YouTube Data API v3 and Instagram/Meta Graph APIs.
- [ ] Deploy an edge server listener that fires when the project output finishes rendering, instantly auto-publishing files, text descriptions, and titles to scheduled platform queues.

## Phase 5: SaaS Commercialization (Weeks 15-16)
**Goal:** Turn into a public credit-based micro-SaaS platform.
- [ ] Build Stripe subscription pricing hooks ($14/mo base tier targets).
- [ ] Establish strict account deduction actions (deducting usage units for full timeline rendering and individual block regeneration calls).