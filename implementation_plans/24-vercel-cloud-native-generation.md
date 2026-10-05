 np# Transition AI Generation to Vercel-Compatible Cloud Storage

This plan addresses the issue of running the application on Vercel, which has a read-only filesystem. Currently, the AI generation modules (Text-to-Speech and Image Generation) attempt to write generated files to the local `public/` directory, which will fail with an `EROFS` error on Vercel.

## Background Context
The application relies on AI providers (`elevenlabs`, `openai-tts`, `local-tts`, and `gemini-image`) to generate media assets. These currently use a "dual-storage" model:
1. They upload to Supabase in the background (`uploadBufferToSupabase(...)`).
2. They save the file locally using `fs.writeFile` to `public/`.
3. They return a relative local URL (e.g., `/audio/...`) for the UI to consume.

On Vercel, step 2 crashes the serverless function. 

## Proposed Changes

We will introduce a Vercel-environment check (`process.env.VERCEL === "1"`) into each provider. When running on Vercel, the providers will:
1. Block (await) until the Supabase upload completes.
2. Skip the local `fs.writeFile` step entirely.
3. Return the absolute public URL from Supabase, so the UI can play/display the media directly from the cloud.

When running locally (dev environment), the providers will retain their current behavior for maximum iteration speed.

### [AI Providers]

#### [MODIFY] [elevenlabs.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/ai/elevenlabs.ts)
- Add a check for `process.env.VERCEL === "1"`.
- If true, await `uploadBufferToSupabase`, handle any upload errors, and return `{ success: true, audioUrl: uploadResult.url }`.
- If false, run the existing background upload and local file write.

#### [MODIFY] [openai-tts.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/ai/openai-tts.ts)
- Apply the same Vercel logic as ElevenLabs, ensuring we return `uploadResult.url` and include `voiceWarning` if applicable.

#### [MODIFY] [local-tts.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/ai/local-tts.ts)
- Apply the same Vercel logic as above. (Note: While `local-tts` connects to a local FastAPI server, it might still be invoked in a cloud environment if the FastAPI server is publicly exposed or tunneled, so making it Vercel-safe is a good defensive practice).

#### [MODIFY] [gemini-image.ts](file:///c:/Users/romme/OneDrive/Documents/Desktop/PROJECTS/AI%20Video%20Generation%20SaaS/src/lib/ai/providers/gemini-image.ts)
- Add a check for `process.env.VERCEL === "1"`.
- If true, await `uploadBufferToSupabase`, handle any upload errors, and return `{ status: "completed", url: uploadResult.url, storagePath }`.
- If false, run the existing background upload and local file write.

## User Review Required
> [!IMPORTANT]
> The Vercel environment automatically provides the `VERCEL="1"` environment variable. This logic relies on that variable to distinguish between local development and cloud deployment. If you plan to deploy to a platform *other* than Vercel (e.g., AWS, Render, Heroku) that also has a read-only filesystem, we should use a more generic environment variable (like `NODE_ENV === "production"` or a custom `DISABLE_LOCAL_WRITES="1"`). Let me know if you want to use a generic variable instead!

## Verification Plan

### Manual Verification
- Code review to ensure `fs.writeFile` is successfully bypassed in Vercel mode.
- Local tests (if desired) can simulate Vercel mode by temporarily setting `process.env.VERCEL="1"` to verify that media is fetched directly from Supabase.
