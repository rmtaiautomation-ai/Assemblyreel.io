# 01 Project Plan: AI Video Generation SaaS

*[[README]] - Return to Map of Content*

## Target Scope
Build a specialized web pipeline that acts as a personal content engine. It will generate automated video rough drafts based on niche workspaces, provide a minimal timeline editor for adjustments, and handle automated distribution to social platforms.

### Architecture (Single Machine, Synchronous)
This is a desktop/laptop tool for one content creator, run entirely via `npm run dev` on your own machine — not a deployed, multi-device SaaS. Next.js talks directly to Voice Studio, Gemini, Fal.ai, and Remotion, all on the same machine; every action is a direct request/response. *(A FastAPI/Python backend, and separately a Supabase-job-queue + remote-worker design, were both evaluated and reverted once remote/phone access was ruled out — see [[02_ARCHITECTURE]] for why.)*

---

## Phase 1: Frontend UI & AI Workspace (Weeks 1-3)
**Goal:** Build database foundations, authentication, and the Next.js UI for creating tailored channel profiles.
- [x] Initialize Next.js environment, load Tailwind configurations, and register Supabase project auth instances.
- [x] Construct the Workspace Creation Wizard (Next.js) to define tailored channel profiles:
  - **Step 1: Linked Accounts** (TikTok, YouTube, Instagram).
  - **Step 2: Content Theme**
  - **Step 3: Series Settings**
  - **Step 4: Visual Aesthetic / Art Style**
  - **Step 5: Aspect Ratio**
  - **Step 6: Video Language**
  - **Step 7: Duration Preferences**
- [x] Set up the `workspaces` state to save these settings as master prompts securely in Supabase.
- [x] Construct Voice Cloning Hub UI for uploading 60s Cartesia voice samples.

## Phase 2: Native 7-Agent Engine (Weeks 4-6)
**Goal:** Implement the 7-Agent logic in native TypeScript, running directly in Next.js. *(See [[03_AI_PIPELINE]] for agent details)*
- [ ] Implement Agent 1 & 2: The Script Writer & Metadata Expert. Long-form runs as a direct, synchronous act-by-act loop — no Vercel timeout to work around on a local machine.
- [ ] Implement Agent 3: The Scene B-roll Slicer.
- [ ] Implement Agent 4: The Casting Director.
- [ ] Implement Agent 5, 6, & 7 (The Loop): The Visual Architect, Cinematic Director, and Prompt Assembler.
- [ ] TTS narration: call Voice Studio/Cartesia/11Labs directly, then Deepgram to align scene timings.
- [ ] Fal.ai routes (Kling / Seedance / Veo) — a working async pattern via `media.status` polling; download the completed clip into `public/media/` once ready rather than leaving it on Fal's CDN.
- [ ] Parse returning asset URLs into `public/media/` and the matching `scenes` table rows.

## Phase 3: Minimal Timeline UI & Editing (Weeks 7-9)
**Goal:** Implement a minimal browser-based editor in Next.js for adjusting generated scenes.
- [x] Construct a simple layout to view the generated video sequence alongside captions.
- [x] Enable clip replacement, allowing users to swap out a specific timestamp's video clip.
- [x] Build capabilities to adjust video timing (trimming or extending clips).
- [x] Integrate Remotion (`@remotion/renderer`) to programmatically compile the timeline edits and kinetic typography into one finalized `.mp4` file, completely replacing the legacy FFmpeg workflow. *(See [[04_REMOTION_ENGINE]])* Already runs inline in a Next.js API route — correct for a single-machine app, no change needed.

## Phase 4: Automation & Social Distribution (Weeks 10-11)
**Goal:** Hands-off posting to personal production platforms.
- [ ] Configure OAuth 2.0 for YouTube Data API v3 and Instagram/Meta Graph APIs.
- [ ] Auto-publish once export finishes.

---

## Technical Enhancements & Strategic Roadmap

### 1. Zero-Cost Local TTS Provider (Voice Studio by MSR)
- **Endpoint:** `http://localhost:8880` (a FastAPI service you already run — this project calls it, but does not build or modify it; not the same as the Vite dev UI on `:5173`).
- **Integration Strategy:** Implement a TTS provider toggle (`TTS_PROVIDER="local"` in `.env.local`).

### 2. Long-Form Content Architecture (20–30m Documentaries)
- **5-Act Modular / Chapterized Scripting:** Break long scripts into 4–5 distinct Acts/Chapters to prevent LLM attention fatigue.

### 3. Deployment Model
- Run Next.js natively on `http://localhost:3000` and Voice Studio on `http://localhost:8880`, both on your own machine.
- No deployment target, no phone/remote access — every generation call is a direct, same-machine request.
