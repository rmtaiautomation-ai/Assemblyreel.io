# Project Plan: Custom Media Factory

## Target Scope
Build a specialized web pipeline that acts as a personal content engine. It will generate automated video rough drafts based on niche workspaces, provide a minimal timeline editor for adjustments, and handle automated distribution to social platforms.

---

## Phase 1: AI Workspace (Weeks 1-3)
**Goal:** Build database foundations, authentication, and core script generation workflows. No asset generation.
- [ ] Initialize Next.js environment, load Tailwind configurations, and register Supabase project auth instances.
- [ ] Construct the Workspace Creation Wizard to define tailored channel profiles:
  - **Step 1: Linked Accounts** (TikTok, YouTube, Instagram).
  - **Step 2: Content Theme** (Dropdown with 20 options: Mythology & Ancient Lore, Horror & Paranormal Suspense, True Crime & Investigation, Cosmic & Space Science, Philosophy & Stoicism, Financial Case Studies & Wealth, Alternative History & Lost Civilizations, Tech, AI & Future Trends, Geopolitics & Global Documentaries, Deep Sea & Earth Anomalies, Dark Psychology & Human Behavior, Survival, Disasters & True Accounts, Internet Mysteries & Creepypastas, Pop Culture & Media Lore (Anime/Gaming), Biographies & Historical Figures, Self-Improvement & Parables, Corporate Empires & Brand Breakdowns, Micro-History & Forgotten Archives, Health, Longevity & Biohacking Facts, Luxury Lifestyle & Architecture. UI should allow maximizing to see prompt details/studio matches).
  - **Step 3: Series Settings** (Narration Voice via ElevenLabs - list of at least 20 voices).
  - **Step 4: Visual Aesthetic / Art Style** (Top 10 options e.g., Charcoal, Cinematic).
  - **Step 5: Aspect Ratio** (Vertical 9:16, Horizontal 16:9, Square 1:1).
  - **Step 6: Video Language** (e.g., English).
  - **Step 7: Duration Preferences** (30-60s, 60-90s, 2-3m, 3-5m, up to 20-30 minutes).
- [ ] Set up the `workspaces` state to save these settings as master prompts securely.
- [ ] Construct Voice Cloning Hub UI for uploading 60s Cartesia voice samples.
- [ ] Integrate the Gemini 2.5 API engine for basic setup testing.

## Phase 2: Next.js 7-Agent AI Engine (Weeks 4-6)
**Goal:** Translate the complex n8n 7-Agent logic directly into Next.js Server Actions using Structured JSON Outputs.
- [ ] Implement Agent 1 & 2: The Script Writer & Metadata Expert (Generates Voiceover and YouTube Meta).
- [ ] Implement Agent 3: The Scene B-roll Slicer (Slices script into a strictly typed JSON array of scenes).
- [ ] Implement Agent 4: The Casting Director (Ensures character visual consistency).
- [ ] Implement Agent 5, 6, & 7 (The Loop): The Visual Architect, Cinematic Director, and Prompt Assembler (Iterates through scenes to build perfect 120-word prompts, filtered by the Safety Officer).
- [ ] Wire API routes to Cartesia/11Labs to compile scene records into isolated high-fidelity TTS `.mp3` blocks.
- [ ] Bind Fal.ai routes (Kling / Seedance / Veo) to translate assembled prompts into dynamic background video clips.
- [ ] Parse returning asset URLs directly into the matching positions within the Supabase `scenes` table.

## Phase 3: Minimal Timeline UI & Editing (Weeks 7-9)
**Goal:** Implement a minimal browser-based editor for adjusting generated scenes.
- [ ] Construct a simple layout to view the generated video sequence alongside captions.
- [ ] Enable clip replacement, allowing users to swap out a specific timestamp's video clip or regenerate a scene.
- [ ] Build capabilities to adjust video timing (trimming or extending clips).
- [ ] Integrate background music capabilities (uploading or generating tracks) and simple transitions between clips.
- [ ] Wire up FFmpeg.wasm or Shotstack API to compile the edits into one finalized `.mp4` file.

## Phase 4: Automation & Social Distribution (Weeks 10-11)
**Goal:** Hands-off posting to personal production platforms.
- [ ] Configure OAuth 2.0 (Testing Mode) for YouTube Data API v3 and Instagram/Meta Graph APIs for personal channels.
- [ ] Deploy an edge server listener that fires when the project output finishes rendering, instantly auto-publishing files, text descriptions, and titles.