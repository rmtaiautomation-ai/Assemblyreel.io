# AWS Lambda Cloud Rendering — Implementation Plan

## Goal
Move video rendering off the local machine and onto AWS Lambda (via Remotion Lambda), so that generation for **all** video lengths — 60s, 2–3 min, 4–5 min, and 10–30 min long-form — renders in the cloud instead of blocking/crashing the local Next.js process. This is a brainstorming/reference doc only; nothing below has been built yet.

## Context
The Timeline Editor currently renders video locally via Remotion (`src/app/api/render-remotion/route.ts`), writing generated media (images, TTS audio, uploads) straight to the local filesystem (`fs.writeFile` calls in `render-remotion/route.ts`, `media/upload/route.ts`, `local-tts.ts`, `elevenlabs.ts`, `gemini-image.ts`). This works for short clips, but for long-form video (10–30 minutes), local rendering blocks the Next.js process for the full render duration and risks the kind of memory exhaustion/crash observed during a recent dev session.

The user has already: created an AWS account (Paid plan, so the account has full service access and the permanent Lambda free tier of 400,000 GB-seconds/month), selected Basic (free) support, and added a payment method — a budget alert (e.g. $10/month) is still recommended before real renders begin.

**Decisions made during brainstorming (do not relitigate unless something changes):**
- **Single render pipeline for all durations.** 60s, 2–3 min, 4–5 min, and 10–30 min long-form all route through the same Lambda-based render path. Deliberately rejected maintaining two separate code paths (local vs. cloud) based on duration — not worth the extra maintenance for marginal benefit, since short renders are cheap on Lambda anyway.
- **Local-first asset storage, sync-to-cloud at render time.** Media generation (images, TTS, uploads) stays local as-is (fast, no network latency during editing). A new upload/sync step runs immediately before a render is triggered, pushing local assets to S3 and swapping local file paths for S3 URLs in the render payload. This mirrors the existing "cache remote media before rendering" pattern (see `09-timeline-editor-stock-media.md`, section 4) but in the opposite direction.
- **Whole app stays local for now.** No need to deploy the Next.js app itself (e.g. to Vercel) since local TTS (`local-tts.ts`) depends on running on this machine, and this is personal-use, single-device usage. Only the render step goes to the cloud.
- **AWS account type.** Paid account plan (not the 6-month restricted Free plan) was required for full service access and the permanent Lambda free tier — confirmed selected correctly during signup.

## Phase 1 — AWS / Remotion Lambda Foundation
- Install `@remotion/lambda` and follow Remotion's CLI setup: create an IAM user with the policy Remotion provides, deploy a Remotion Lambda function (`npx remotion lambda functions deploy`), and deploy the Remotion "site" bundle (`npx remotion lambda sites create`).
- Store AWS credentials (access key/secret, region, function name, site name) in `.env.local`, following the existing env var pattern used for other provider keys.
- Set an AWS Billing budget alert (e.g. $10/month) before doing any real renders.

## Phase 2 — Media Sync-to-S3 Step
- Create an S3 bucket for render inputs/outputs (Remotion Lambda needs this regardless).
- Build a pre-render sync step: scan the scenes/timeline payload for any local file paths (images, audio, video), upload each to S3, and rewrite the payload to use the resulting S3 URLs before handing it to Lambda.
- Reuse/extend the existing remote-media caching logic (`09-timeline-editor-stock-media.md`, section 4) as a reference pattern — it already solves "swap media URL before render," just in the opposite direction (local → S3 instead of remote → local).

## Phase 3 — Wire the Render Route to Lambda
- Update `src/app/api/render-remotion/route.ts` (or a new route) to call `renderMediaOnLambda` from `@remotion/lambda` instead of rendering locally, passing the S3-synced payload from Phase 2.
- Return the Lambda render ID/bucket info to the client so progress can be polled.

## Phase 4 — Render Progress Polling
- Update the render-progress polling logic in `src/components/ui/TimelineEditor.tsx` (`renderPollRef`, currently ~line 1388) to poll Lambda's `getRenderProgress` instead of (or in addition to) local render status.
- Ensure the polling `setInterval` is cleaned up correctly on unmount, completion, and error — flagged during brainstorming as needing solid cleanup regardless of the Lambda migration.

## Phase 5 — Guardrails
- Prevent duplicate concurrent renders of the same video (simple in-flight lock/check).
- Add basic error handling/timeout around the Lambda render call and the S3 sync step (both are new network-dependent steps that didn't exist in the local-only flow).
- Confirm the AWS budget alert from Phase 1 is active before this goes into regular use.

## Verification
- Do a first Lambda render end-to-end using a short (60s) test video before attempting a long-form render — cheaper/faster to debug S3 sync and Lambda wiring issues on a small case.
- Confirm actual GB-seconds usage per render in the AWS console after the first real render, to replace the rough brainstorming estimate (~600 GB-seconds/minute of output) with a real number.
- Once short-form works end-to-end, test a full long-form (20–30 min) render and confirm total render time stays well under 5 minutes and total cost stays near-free under the Lambda always-free tier.

## Execution Notes for Claude Code
- This plan intentionally covers architecture and phasing only — no code has been written yet. Confirm scope with the user before starting Phase 1.
- The media-sync step (Phase 2) is new; it does not yet exist anywhere in the codebase, unlike the remote→local caching it mirrors.
- `renderPollRef` cleanup (Phase 4) should be fixed regardless of whether Lambda work has started, since it's a pre-existing gap independent of this migration.
