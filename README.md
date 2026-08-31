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

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
npm run build
```

Secrets live in `.env.local` (git-ignored). The app runs on your own machine — it is not deployed,
so rendering, narration and generated media all write to the local filesystem.

## Repository map

```
src/
  app/
    (dashboard)/        Authenticated UI routes — workspaces, videos, whiteboard,
                        scene-board, thumbnails, settings
    actions/            "use server" actions. The real backend: one file per domain
                        (video, audio, scene, format, fact, thumbnail, whiteboard…)
    api/                Route handlers — only for things actions can't do:
                        streaming, webhooks, uploads, Remotion rendering
    page.tsx            Marketing landing page (light theme)
  components/ui/        Client components. TimelineEditor.tsx is the editor;
                        SceneBoard.tsx the shot list; Channel*Section.tsx the settings tabs
  lib/
    ai/
      agents/           The multi-agent pipeline, one file per agent
      providers/        Media generation backends behind a registry (fal, gemini,
                        stock, mock). Mock is the deliberate default until keys exist
      format-*.ts       Channel Blueprint → prompt. See scripts/check-format-prompt.mjs
    render/             AWS Lambda cloud rendering (opt-in; local render is the default)
    supabase/           client.ts (browser) / server.ts (server components + actions)
  remotion/             The video engine — compositions, overlays, templates,
                        transitions, captions. index.ts is the bundler entry point,
                        loaded BY STRING PATH from api/render-remotion; do not rename
  proxy.ts              Next 16 middleware (renamed from middleware.ts in v16)

db/                     Hand-run Supabase SQL. See db/README.md for run order
db/backups/             Point-in-time JSON exports; never run as SQL
docs/                   Living reference — architecture, schema, channel playbook,
                        fact dossiers, content map
implementation_plans/   Numbered feature plans. Referenced by path from source
                        comments, so filenames are load-bearing
scripts/                Maintained tools (format-prompt check, beat-sheet preview,
                        blueprint upgrade)
scripts/smoke/          Ad-hoc provider smoke tests; run from the repo root
public/media, public/audio
                        Generated at runtime and git-ignored, except the bundled
                        audio/transitions/ presets
```

### Conventions worth knowing

- **Server actions over API routes.** Reach for `src/app/actions/` first; add a route handler only
  when you need streaming, a webhook, a file upload, or Remotion.
- **SQL filenames are load-bearing.** The app names them in its own error messages
  ("Run `db/add-channel-facts.sql`"). Renaming one breaks that guidance silently.
- **Mock media provider is intentional.** With no video-provider keys set, the registry falls back
  to `providers/mock.ts`. That is a working state, not a bug.
- **Server-side changes need a dev-server restart.** Server actions and route handlers are cached;
  a fix can look broken until you restart `npm run dev`.
