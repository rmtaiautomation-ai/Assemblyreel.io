# 01 Project Plan: AI Video Generation SaaS

*[[README]] - Return to Map of Content*

## Target Scope
Build a specialized web pipeline that acts as a personal content engine. It will generate automated video rough drafts based on niche workspaces, provide a minimal timeline editor for adjustments, and handle automated distribution to social platforms.

### Architecture (Microservices Approach)
To handle the heavy computational requirements and prevent serverless timeouts during video generation, the system is decoupled:
- **Frontend (Next.js):** Handles UI, Workspace Wizard, Timeline Editor, Authentication, and Billing.
- **AI Brain (FastAPI/Python):** Manages the 7-Agent LLM logic, orchestrates heavy media APIs (Fal.ai, Cartesia), and runs background generation tasks asynchronously without timing out.

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

## Phase 2: FastAPI 7-Agent AI Engine (Weeks 4-6)
**Goal:** Translate the complex 7-Agent logic into a robust Python FastAPI backend using async background tasks to prevent Vercel timeouts. *(See [[03_AI_PIPELINE]] for agent details)*
- [ ] Initialize Python FastAPI backend environment and connect it to the Supabase instance.
- [ ] Implement Agent 1 & 2: The Script Writer & Metadata Expert.
- [ ] Implement Agent 3: The Scene B-roll Slicer.
- [ ] Implement Agent 4: The Casting Director.
- [ ] Implement Agent 5, 6, & 7 (The Loop): The Visual Architect, Cinematic Director, and Prompt Assembler.
- [ ] Wire API routes in FastAPI to Cartesia/11Labs.
- [ ] Bind Fal.ai routes (Kling / Seedance / Veo).
- [ ] Parse returning asset URLs directly into Supabase `scenes` table.

## Phase 3: Minimal Timeline UI & Editing (Weeks 7-9)
**Goal:** Implement a minimal browser-based editor in Next.js for adjusting generated scenes.
- [x] Construct a simple layout to view the generated video sequence alongside captions.
- [x] Enable clip replacement, allowing users to swap out a specific timestamp's video clip.
- [x] Build capabilities to adjust video timing (trimming or extending clips).
- [x] Integrate Remotion (`@remotion/renderer`) to programmatically compile the timeline edits and kinetic typography into one finalized `.mp4` file, completely replacing the legacy FFmpeg workflow. *(See [[04_REMOTION_ENGINE]])*

## Phase 4: Automation & Social Distribution (Weeks 10-11)
**Goal:** Hands-off posting to personal production platforms.
- [ ] Configure OAuth 2.0 for YouTube Data API v3 and Instagram/Meta Graph APIs.
- [ ] Deploy a FastAPI background worker/listener to instantly auto-publish files, text descriptions, and titles.

---

## Technical Enhancements & Strategic Roadmap

### 1. Zero-Cost Local TTS Provider (Voice Studio by MSR)
- **Endpoint:** `http://localhost:5173` (running via local PowerShell / Python backend).
- **Integration Strategy:** Implement a TTS provider toggle (`TTS_PROVIDER="local"` in `.env.local`).

### 2. Long-Form Content Architecture (20–30m Documentaries)
- **5-Act Modular / Chapterized Scripting:** Break long scripts into 4–5 distinct Acts/Chapters to prevent LLM attention fatigue.

### 3. Two-Phase Deployment Roadmap
- **Phase 1 (Current):** Run Next.js natively on `http://localhost:3000` and Voice Studio on `http://localhost:5173`.
- **Phase 2:** Package the full stack into a Docker Compose (`docker-compose.yml`) multi-container environment for free, automated daily publishing.
