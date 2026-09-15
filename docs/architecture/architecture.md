# Architecture Blueprint: Assemblyreel.io

## 1. Core Stack
- **Framework:** Next.js (App Router, React 19) — the whole app, dashboard and generation pipeline alike. Runs via `npm run dev` on your own desktop/laptop. Not deployed to Vercel; this is a single-machine, single-user tool, not a hosted SaaS.
- **Language:** TypeScript (Strict typing, no explicit 'any')
- **Styling:** Tailwind CSS (Strictly utility classes, no inline styles)
- **Database & Auth:** Supabase (PostgreSQL)
- **Hosting:** Your own machine only. No Python backend of any kind is planned — an earlier FastAPI-backend plan was evaluated and cancelled; see "Why not FastAPI" below.

## 2. External Generation Pipeline (Next.js Code-First)
All external generative AI tools route through Next.js Server Actions/API routes to keep API keys off the client. Because everything — Next.js, Voice Studio, Chromium for rendering — runs on the same machine, every call is a direct, synchronous request: click a button, wait for it to finish. There is no deployment boundary to work around, so there's no need for a job queue, a separate worker process, or cloud object storage for generated media.
- **The AI Engine (7-Agent Logic):** The complex 7-agent workflow (Script Writer, Slicer, Casting, Visual Architect, Cinematic Director, Prompter, Safety) runs entirely in Next.js using Google Gemini 2.5 API with strictly typed JSON Structured Outputs. Long-form act-by-act generation is a synchronous sequential loop — safe here because a local Node process has no imposed request timeout, unlike a serverless deployment.
- **The Voice (TTS):** Local Voice Studio (`http://localhost:8880` — a FastAPI service *you already run and this project does not build or modify*), 11Labs, or Cartesia AI. Reachable directly from Next.js since both run on the same machine.
- **The Visuals (Video/Image):** Fal.ai (routing to Seedance, Kling, or Google Veo). B-roll clips are downloaded and saved to `public/media/` once generation completes, rather than left pointing at Fal's own CDN indefinitely — a project edited over several sessions shouldn't be able to lose a clip to link rot.
- **n8n Status:** Deprecated for core AI reasoning due to complex JSON loop requirements. Reserved only for potential background rendering tasks if necessary.

### Why not FastAPI
An earlier plan proposed a Python/FastAPI backend to host the 7-agent logic and background work. It was cancelled: its only concrete deliverable (a local-TTS proxy) already existed as Voice Studio, which this project calls directly over `localhost` — there's no deployment boundary here for a second backend to bridge.

## 3. Web-Based Timeline Architecture
Instead of exporting directly to traditional tools, users retain full timeline capabilities inside the application.
- **State Management:** React local state or a lightweight Zustand store.
- **The Player:** Synced HTML5 `<video>` and `<audio>` DOM elements mapped directly to the timeline state array.
- **Compilation/Stitching:** Full video rendering and kinetic typography powered by **Remotion** (`@remotion/renderer`), run inline in a Next.js API route — same machine, same Chromium, no timeout to work around. FFmpeg stitching is deprecated and replaced by Remotion's React-based programmatic video composition.
- **Media storage:** Generated and uploaded assets are saved to this app's own `public/audio` and `public/media` directories (gitignored, not committed) — the local filesystem is the durable store; there is no cloud Storage step.

## 4. Strict Directory Layout
```text
/app
  /api              # Serverless API routes (YouTube API callbacks, external service hooks)
  /dashboard        # Protected client routes (Workspaces, Projects, Timeline)
/components
  /editor           # Multi-track timeline rows, playback buttons, preview window
  /ui               # Pure, stateless Tailwind UI primitives (modals, inputs, buttons)
/lib
  /supabase         # Database context initialization and queries
  /ai               # External API routers (Gemini, Cartesia, Fal.ai)