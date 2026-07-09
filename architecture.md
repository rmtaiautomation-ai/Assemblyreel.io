# Architecture Blueprint: Assemblyreel.io

## 1. Core Stack
- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript (Strict typing, no explicit 'any')
- **Styling:** Tailwind CSS (Strictly utility classes, no inline styles)
- **Database & Auth:** Supabase (PostgreSQL)
- **Hosting:** Vercel (Hobby tier for dev/personal use, Pro for scaling)

## 2. External Generation Pipeline (Next.js Code-First)
All external generative AI tools must route through Next.js Server Actions to safely hide API environment keys from the client.
- **The AI Engine (7-Agent Logic):** The complex 7-agent workflow (Script Writer, Slicer, Casting, Visual Architect, Cinematic Director, Prompter, Safety) runs entirely in Next.js using Google Gemini 2.5 API with strictly typed JSON Structured Outputs.
- **The Voice (TTS):** 11Labs or Cartesia AI
- **The Visuals (Video/Image):** Fal.ai (routing to Seedance, Kling, or Google Veo)
- **n8n Status:** Deprecated for core AI reasoning due to complex JSON loop requirements. Reserved only for potential background rendering tasks if necessary.

## 3. Web-Based Timeline Architecture
Instead of exporting directly to traditional tools, users retain full timeline capabilities inside the application.
- **State Management:** React local state or a lightweight Zustand store.
- **The Player:** Synced HTML5 `<video>` and `<audio>` DOM elements mapped directly to the timeline state array.
- **Compilation/Stitching:** Local rendering via FFmpeg.wasm or cloud rendering via Shotstack API (Remotion remains entirely optional/secondary).

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