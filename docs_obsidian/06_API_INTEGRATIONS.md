# 06 API Integrations

*[[README]] - Return to Map of Content*

This project orchestrates multiple external APIs to handle the heavy lifting of AI generation and billing. All external calls are routed securely through Next.js Server Actions to hide API keys from the client.

## Generative Media APIs

### 1. Fal.ai (Visual Generation)
- **Role:** Generates the B-Roll images and video clips.
- **Models:** Fal acts as a router to access top-tier visual models like **Kling**, **Seedance**, and **Google Veo**. 
- **Workflow:** The AI Prompt Assembler sends the highly detailed 120-word scene prompt to Fal.ai. Fal's queue API is inherently async (submit → poll `status_url`), which is already the pattern `media.status`/`provider_metadata` implements. Once complete, the clip is downloaded and saved to `public/media/` — not left pointing at Fal's CDN indefinitely — then loaded into the Timeline Editor.

### 2. Cartesia & ElevenLabs (Voice Cloning & TTS)
- **Role:** Generates the ultra-realistic voiceovers for the scripts.
- **Workflow:** The Script Writer agent generates the text, and the Timeline Editor sends specific dialogue blocks to these APIs to receive `.mp3` buffers.
- **Fallback:** For zero-cost local testing, the system supports a local Voice Studio endpoint (`http://localhost:8880`) running via a Python backend, called directly since it's on the same machine as Next.js.

### 3. Google Gemini 2.5 (The Brain)
- **Role:** The core language model driving the entire 7-Agent logic.
- **Workflow:** Handles everything from scriptwriting to prompt generation using strictly typed JSON Structured Outputs to guarantee reliability.

## Infrastructure APIs

### 4. Supabase
- **Role:** PostgreSQL Database and Authentication.
- **Workflow:** Manages user login, workspaces, billing tiers, and saves the massive JSON timeline states securely.

### 5. Stripe
- **Role:** Payment processing and credit management.
- **Workflow:** Handles user subscriptions (Free vs. Pro). As users generate videos and hit API costs, the system deducts credits from their Stripe-synced Supabase profile.
