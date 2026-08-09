# Project Plan: AI Video Generation SaaS (Custom Media Factory)

## Target Scope
Build a specialized web pipeline that acts as a personal content engine. It will generate automated video rough drafts based on niche workspaces, provide a minimal timeline editor for adjustments, and handle automated distribution to social platforms.

### Architecture (Single-Machine, Synchronous)
This is a desktop/laptop tool for one content creator, run entirely on your own machine via `npm run dev` — not a deployed, multi-device SaaS. There is no second backend and no background job system: Next.js talks directly to Voice Studio (`localhost:8880`), Gemini, Fal.ai, and Remotion, all on the same machine, and every action is a direct request/response — click a button, wait for it to finish.
- *(An earlier FastAPI-backend plan was evaluated and cancelled — see `architecture.md` for why. A Supabase-job-queue + remote-worker design was also considered and reverted once "remote/phone access" was ruled out as a requirement — everything runs on one machine, so there's no deployment boundary to bridge.)*

---

## Phase 1: Frontend UI & AI Workspace (Weeks 1-3)
**Goal:** Build database foundations, authentication, and the Next.js UI for creating tailored channel profiles.
- [ ] Initialize Next.js environment, load Tailwind configurations, and register Supabase project auth instances.
- [ ] Construct the Workspace Creation Wizard (Next.js) to define tailored channel profiles:
  - **Step 1: Linked Accounts** (TikTok, YouTube, Instagram).
  - **Step 2: Content Theme** (Dropdown with 20 options: Mythology & Ancient Lore, Horror & Paranormal Suspense, True Crime & Investigation, Cosmic & Space Science, Philosophy & Stoicism, Financial Case Studies & Wealth, Alternative History & Lost Civilizations, Tech, AI & Future Trends, Geopolitics & Global Documentaries, Deep Sea & Earth Anomalies, Dark Psychology & Human Behavior, Survival, Disasters & True Accounts, Internet Mysteries & Creepypastas, Pop Culture & Media Lore (Anime/Gaming), Biographies & Historical Figures, Self-Improvement & Parables, Corporate Empires & Brand Breakdowns, Micro-History & Forgotten Archives, Health, Longevity & Biohacking Facts, Luxury Lifestyle & Architecture. UI should allow maximizing to see prompt details/studio matches).
  - **Step 3: Series Settings** (Narration Voice via ElevenLabs/Cartesia - list of at least 20 voices).
  - **Step 4: Visual Aesthetic / Art Style** (Top 10 options e.g., Charcoal, Cinematic).
  - **Step 5: Aspect Ratio** (Vertical 9:16, Horizontal 16:9, Square 1:1).
  - **Step 6: Video Language** (e.g., English).
  - **Step 7: Duration Preferences** (30-60s, 60-90s, 2-3m, 3-5m, up to 20-30 minutes).
- [ ] Set up the `workspaces` state to save these settings as master prompts securely in Supabase.
- [ ] Construct Voice Cloning Hub UI for uploading 60s Cartesia voice samples.

## Phase 2: Native 7-Agent Engine (Weeks 4-6)
**Goal:** Implement the 7-Agent logic in native TypeScript, running directly in Next.js.
- [ ] Implement Agent 1 & 2: The Script Writer & Metadata Expert (Generates Voiceover and YouTube Meta). Long-form runs as a direct, synchronous act-by-act loop — no Vercel timeout to work around on a local machine.
- [ ] Implement Agent 3: The Scene B-roll Slicer (Slices script into a strictly typed JSON array of scenes).
- [ ] Implement Agent 4: The Casting Director (Ensures character visual consistency).
- [ ] Implement Agent 5, 6, & 7 (The Loop): The Visual Architect, Cinematic Director, and Prompt Assembler (Iterates through scenes to build perfect 120-word prompts, filtered by the Safety Officer).
- [ ] TTS narration: call Voice Studio/11Labs directly, then Deepgram to align scene timings.
- [ ] Fal.ai routes (Kling / Seedance / Veo) — a working async pattern via `media.status`/`provider_metadata` polling; download the completed clip to `public/media/` once ready rather than leaving it on Fal's CDN.
- [ ] Parse returning asset URLs into `public/media/` and the matching `scenes`/`media` rows.

## Phase 3: Minimal Timeline UI & Editing (Weeks 7-9)
**Goal:** Implement a minimal browser-based editor in Next.js for adjusting generated scenes.
- [ ] Construct a simple layout to view the generated video sequence alongside captions.
- [ ] Enable clip replacement, allowing users to swap out a specific timestamp's video clip or regenerate a scene (direct call, same as any other action).
- [ ] Build capabilities to adjust video timing (trimming or extending clips).
- [ ] Integrate background music capabilities (uploading or generating tracks) and simple transitions between clips.
- [x] Integrate Remotion (`@remotion/renderer`) to programmatically compile the timeline edits and kinetic typography into one finalized `.mp4` file, completely replacing the legacy FFmpeg workflow. Already runs inline in a Next.js API route — correct for a single-machine app, no change needed.

## Phase 4: Automation & Social Distribution (Weeks 10-11)
**Goal:** Hands-off posting to personal production platforms.
- [ ] Configure OAuth 2.0 (Testing Mode) for YouTube Data API v3 and Instagram/Meta Graph APIs for personal channels.
- [ ] Auto-publish once export finishes, instantly publishing files, text descriptions, and titles.

---

## Technical Enhancements & Strategic Roadmap (Updated)

### 1. Zero-Cost Local TTS Provider (Voice Studio by MSR)
- **Endpoint:** `http://localhost:8880` (a FastAPI service you already run locally — this project calls it, but does not build or modify it; not to be confused with the Vite dev UI on `:5173`).
- **Integration Strategy:** Implement a TTS provider toggle (`TTS_PROVIDER="local"` in `.env.local`).
- **Workflow:** Next.js Server Actions send text prompts directly to `http://localhost:8880`, save returning `.wav` buffers to `/public/audio/`, and populate timeline audio tracks (`A1`) with zero external API fees.

### 2. Long-Form Content Architecture (20–30m Documentaries)
- **5-Act Modular / Chapterized Scripting:**
  - Break long scripts (e.g., *"The Book of Enoch & The Resurrection"*) into 4–5 distinct Acts/Chapters to prevent LLM attention fatigue, repetitive dialogue, and TTS memory crashes.
  - **Act 1 (0–3m):** The Forbidden Hook & Scriptural Context
  - **Act 2 (3–8m):** Cosmic Prison & The Watchers
  - **Act 3 (8–14m):** Core Revelation / Descent
  - **Act 4 (14–19m):** Modern Eschatology & Implications
  - **Act 5 (19–22m):** Climax & Engagement CTA ("UNVEILED")

### 3. Deployment Model
- Everything — Next.js, Voice Studio — runs on your own desktop/laptop. Run Next.js natively on `http://localhost:3000` (`npm run dev`) and Voice Studio on `http://localhost:8880`.
- No deployment target, no second host, no phone/remote access. Enables rapid Hot Module Replacement (HMR) and debugging, and keeps every generation call a direct, same-machine request.

---

## Immediate Next Milestone: Short-Form Prototype (<60s)
1. **Generate Short-Form Audio:** Call the local Voice Studio endpoint (`http://localhost:8880`) with a short test script (<60 seconds).
2. **Populate Timeline Track A1:** Directly insert the returning audio asset URL (`/audio/<sceneId>.wav`) into Audio Track 1 (`A1`) of `TimelineState`.
3. **Verify Playback:** Load the timeline editor and verify synchronized HTML5 audio playback.