# 06 API Integrations

*[[README]] - Return to Map of Content*

This project orchestrates multiple external APIs to handle the heavy lifting of AI generation and billing. All external calls are routed securely through Next.js Server Actions or FastAPI backend routes to hide API keys from the client.

## Generative Media APIs

### 1. Fal.ai (Visual Generation)
- **Role:** Generates the B-Roll images and video clips.
- **Models:** Fal acts as a router to access top-tier visual models like **Kling**, **Seedance**, and **Google Veo**. 
- **Workflow:** The AI Prompt Assembler sends the highly detailed 120-word scene prompt to Fal.ai. Fal returns a temporary URL of the generated MP4 or JPG, which is then saved to Supabase and loaded into the Timeline Editor.

### 2. Cartesia & ElevenLabs (Voice Cloning & TTS)
- **Role:** Generates the ultra-realistic voiceovers for the scripts.
- **Workflow:** The Script Writer agent generates the text, and the Timeline Editor sends specific dialogue blocks to these APIs to receive `.mp3` buffers.
- **Fallback:** For zero-cost local testing, the system supports a local Voice Studio endpoint (`http://localhost:5173`) running via a Python backend.

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
