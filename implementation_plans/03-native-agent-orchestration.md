# Native 7-Agent Orchestration Implementation Plan

> **Note on execution model.** This app is confirmed single-machine — `npm run dev` on your own desktop/laptop, no Vercel deployment. So the concern that motivated an earlier (now-abandoned) job-queue design doesn't apply here: a local Node process has no imposed request timeout, so the act-by-act loop described below can run as a direct, synchronous, sequential call — click a button, wait for it to finish. The "streaming to the client via `createStreamableValue`" idea can be skipped entirely; a simple loop that updates the UI as each act completes (or just shows a spinner until the whole thing is done) is sufficient and much simpler to build.

## Goal
Implement the 7-Agent AI video generation pipeline entirely in native TypeScript/Next.js using the **Vercel AI SDK** and **Google Gemini 2.5**. This replaces the need for heavy frameworks like LangChain, offering total control, strict typing, and high reliability.

## Architecture & Tooling
*   **Framework:** Next.js (App Router) Server Actions & API Routes.
*   **AI SDK:** Vercel AI SDK (`ai`, `@ai-sdk/google`) for native model interactions.
*   **Validation:** `zod` for strictly typing the inputs and outputs (Structured JSON) of every agent.

By using `generateObject` from the Vercel AI SDK, we force the AI to return data that matches our exact TypeScript interfaces. This guarantees that Agent 1's output perfectly matches Agent 2's required input.

## The 7-Agent Data Flow

We will structure this as a single orchestration function (or a series of chained Server Actions) that passes data sequentially:

### 1. The Script Writer
*   **Input:** User Prompt + Niche/Tone Matrix constraints.
*   **Action:** Calls `generateObject` with a `ScriptSchema`.
*   **Output:** Returns a structured JSON array of "Acts" and paragraphs.

### 2. The Scene Slicer
*   **Input:** The raw script text from Agent 1.
*   **Action:** Slices sentences based on pacing rules (e.g., Short-Form = fast cuts).
*   **Output:** Array of `Scene` objects (Text, Estimated Duration).

### 3. The Casting Director
*   **Input:** The entire sliced script.
*   **Action:** Identifies recurring subjects and generates visual "Blueprints" to maintain character consistency across the video.
*   **Output:** A `Record<CharacterName, VisualBlueprint>`.

### 4. The Visual Architect & 5. Cinematic Director
*   **Input:** Individual Scene Text + Character Blueprints.
*   **Action:** Processes scenes in parallel (using `Promise.all`) to generate environment descriptions and camera angle tags (e.g., `ESTABLISH`, `ACTION`, `low-angle drone sweep`).
*   **Output:** Appends environment and camera data to the `Scene` object.

### 6. The Prompt Assembler
*   **Input:** Scene Text + Blueprint + Environment + Camera Angle.
*   **Action:** A lightweight string-compilation step (no AI needed here, just pure TypeScript logic) that merges the data into a dense 120-word visual prompt.
*   **Output:** `raw_video_prompt`.

### 7. The Safety Officer
*   **Input:** `raw_video_prompt`.
*   **Action:** A final, fast LLM pass to sanitize the prompt against NSFW/violence filters (e.g., changing "bloody knife" to "glistening steel").
*   **Output:** `final_safe_video_prompt` (Ready to be sent to Fal.ai / Kling).

## Handling Long-Form Videos (Chunking & Streaming)
As outlined in the core plan, a 30-minute video will crash standard serverless timeouts. 
*   **Solution:** We will implement **Act-by-Act Chunking**. The orchestration function will process "Act 1" completely through all 7 agents and **stream** those completed scenes to the client-side Timeline Editor immediately. 
*   While the user reviews Act 1, Next.js background workers (or subsequent chained requests) will begin processing Act 2.

## Execution Steps (For Claude Code)

1.  **Create Zod Schemas:** In `src/lib/ai/schemas.ts`, define the strict Zod schemas for every step of the pipeline (`ScriptSchema`, `BlueprintSchema`, `VisualSceneSchema`).
2.  **Create Agent Functions:** In `src/lib/ai/agents/`, create a separate TypeScript file for each of the 7 agents. Each file exports a function that takes the previous agent's output and calls `generateObject`.
3.  **Build the Orchestrator:** Create `src/lib/ai/orchestrator.ts` that imports the 7 agent functions and chains them together using standard `async/await` logic.
4.  **Wire to UI:** Create a Next.js Server Action (`generateVideoWorkflow`) that triggers the orchestrator and uses Next.js Streaming (e.g., `createStreamableValue` or similar AI SDK UI helpers) to push completed scenes to the `TimelineEditor.tsx` state in real-time.
