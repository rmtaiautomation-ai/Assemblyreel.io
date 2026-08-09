# AI Video Generation SaaS (Assemblyreel.io)

An advanced, automated personal content engine that generates highly tailored video drafts for niche social media channels. It features an automated multi-agent AI pipeline for scripting and visual generation, alongside a robust web-based timeline editor.

## Tech Stack

- **Frontend & Routing:** Next.js (App Router), React 19 — runs via `npm run dev` on your own desktop/laptop; not deployed, single-machine tool.
- **Styling:** Tailwind CSS
- **Database & Auth:** Supabase (PostgreSQL)
- **Video Rendering Engine:** Remotion (`@remotion/player`, `@remotion/renderer`) - Provides real-time interactive canvas previews and server-side kinetic typography composition, run inline in a Next.js API route on the same machine. *(Note: We recently migrated from FFmpeg to Remotion for advanced programmatic control).*
- **AI Core (External Services):** Google Gemini 2.5 API (Scripting), Fal.ai (Visual Generation), Cartesia / ElevenLabs / Local Voice Studio (TTS).

## Features

- **Workspace Wizard:** Easily spin up customized channel profiles (True Crime, Finance, etc.) with default voices, aspect ratios, and styles.
- **7-Agent AI Engine:** A multi-step generative workflow that creates scripts, parses them into scene beats, maintains character consistency, and assembles rich prompts.
- **Timeline Editor:** A bespoke, browser-based drag-and-drop video editor featuring programmatic kinetic overlays (Slide, Pop In, Typewriter, Lower Thirds).
- **Automated Social Distribution:** Once a video is rendered via Remotion, it can be scheduled or auto-published directly to YouTube or Instagram.

## Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
