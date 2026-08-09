# AI Script Writer & Whiteboard Workflow

> **Note on execution model.** This app is confirmed single-machine (`npm run dev`, no Vercel, no job queue) — "Regenerate Act 2" below is just a direct, synchronous server action call scoped to one act, same as any other button in the app. The still-open question, independent of that: per-act audio files vs. one master narration — modular "regenerate Act 2 only" audio is in tension with the current whole-file Deepgram alignment in `audio-actions.ts`, and needs a decision when this plan is actually built.

## 1. The Recommended User Flow
Based on your vision of editing specific Acts and regenerating audio modularly, I recommend a **3-Step Wizard Workflow** rather than trying to cram everything into the Timeline Editor at once. This keeps the UI incredibly clean and premium.

### Step 1: The "Ideation" Chat (AI Script Writer)
*   **Where it lives:** A dedicated page or full-screen view (e.g., `/create`) that the user sees *before* entering the editor.
*   **How it works:** A sleek, ChatGPT-style interface. The user chats with the AI, brainstorms ideas, and the AI drafts the overall outline.
*   **Web Research:** **Recommendation:** We will use **Tavily AI** (a search engine built specifically for AI agents) or **Google Gemini's built-in Search**. I recommend Tavily because it guarantees clean, structured facts specifically meant to be fed into LLM prompts without hallucinating.

### Step 2: The "Whiteboard" (Review & Approval Dashboard)
*   **Where it lives:** The screen transitions from the Chat into the Whiteboard view.
*   **How it works:** This is exactly what you visualized. The script is broken down into visually distinct cards: **Act 1**, **Act 2**, **Act 3**, etc.
*   **Modular Regeneration:** 
    *   Each Act card shows the generated text and has a "Play Audio" button. 
    *   If you don't like Act 2, you simply click into the text box, edit the words, and click the **"Regenerate Act 2"** button. 
    *   *Crucial feature:* Only the audio for Act 2 is replaced. Act 1 and Act 3 remain untouched, saving you huge amounts of API costs and time.
*   **Progress Tracking:** At the top of this whiteboard is your 1-100% progress bar, showing which Acts are currently being processed by the backend.

### Step 3: The Timeline Editor (Visual Generation)
*   **Where it lives:** Once you click "Approve All Acts" on the Whiteboard, you transition into the final Timeline Editor.
*   **How it works:** The perfectly sliced audio from the Whiteboard drops straight into the `A1` audio track. The Timeline is now strictly used for generating your B-Roll (Fal.ai, Kling) and adjusting visual timing.

## Why this approach is better:
By separating the **Script/Audio Approval (Whiteboard)** from the **Video Timeline**, the user never feels overwhelmed. They lock in the story first, and *then* they focus on making it look visually stunning.

## Developer Execution Steps (For Claude Code)
1. **Create the 3-Step UI Shell:** Build a step-wizard component (`Ideation` -> `Whiteboard` -> `Timeline`).
2. **Integrate Tavily Search:** Add the Tavily API to the Script Writer agent for real-time background checking.
3. **Build the Whiteboard Component:** Create a grid of "Act Cards". Each card must have its own localized state for text editing and a specific `handleRegenerateAudio(actId)` function to ensure isolated audio replacement.
4. **State Handoff:** Ensure that the final, approved array of Acts from the Whiteboard is passed cleanly into the existing Timeline Editor state initialization.
