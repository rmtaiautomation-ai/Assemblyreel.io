# 02 Architecture Blueprint

*[[README]] - Return to Map of Content*

## 1. Core Stack
- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript (Strict typing, no explicit 'any')
- **Styling:** Tailwind CSS (Strictly utility classes, no inline styles)
- **Database & Auth:** Supabase (PostgreSQL) - *(See [[05_DATABASE_SCHEMA]])*
- **Hosting:** Your own machine only, via `npm run dev`. This is a single-user, single-machine desktop tool for one content creator — not a deployed, multi-device SaaS. No Vercel, no remote/phone access.

## 2. External Generation Pipeline (Next.js Code-First)
All external generative AI tools route through Next.js Server Actions to safely hide API environment keys from the client. Because Next.js, Voice Studio, and Chromium (for rendering) all run on the same machine, every call is direct and synchronous — click a button, wait for it to finish. There's no deployment boundary to bridge, so there's no need for a job queue, a separate worker process, or cloud object storage for generated media.
- **The AI Engine (7-Agent Logic):** The complex 7-agent workflow (Script Writer, Slicer, Casting, Visual Architect, Cinematic Director, Prompter, Safety) runs entirely in Next.js using Google Gemini 2.5 API with strictly typed JSON Structured Outputs. Long-form act-by-act generation is a direct sequential loop — safe here since a local Node process has no imposed request timeout.
- **The Voice (TTS):** Local Voice Studio (`http://localhost:8880` — a FastAPI service *you already run and this project does not build or modify*), 11Labs, or Cartesia AI. *(See [[06_API_INTEGRATIONS]])*
- **The Visuals (Video/Image):** Fal.ai (routing to Seedance, Kling, or Google Veo). Completed clips are downloaded and saved to `public/media/` rather than left pointing indefinitely at Fal's own CDN — protects a multi-session edit from losing a clip to link rot.
- **Why not FastAPI?** An earlier plan proposed a Python/FastAPI backend to host the 7-agent logic and background work. It was cancelled: its only concrete deliverable — a local-TTS endpoint — already exists as Voice Studio, which this project calls directly over `localhost` since both run on the same machine. There's no deployment boundary here for a second backend to bridge.
- **n8n Status:** Deprecated for core AI reasoning due to complex JSON loop requirements. Reserved only for potential background rendering tasks if necessary.

## 3. Web-Based Timeline Architecture
Instead of exporting directly to traditional tools, users retain full timeline capabilities inside the application.
- **State Management:** React local state or a lightweight Zustand store.
- **The Player:** Synced HTML5 `<video>` and `<audio>` DOM elements mapped directly to the timeline state array.
- **Compilation/Stitching:** Full video rendering and kinetic typography powered by **Remotion** (`@remotion/renderer`), run inline in a Next.js API route — same machine, same Chromium, no timeout to work around. FFmpeg stitching is deprecated and replaced by Remotion's React-based programmatic video composition. *(See [[04_REMOTION_ENGINE]])*
- **Media storage:** Generated and uploaded assets are saved to this app's own `public/audio` and `public/media` directories (gitignored, not committed) — the local filesystem is the durable store.

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
```
