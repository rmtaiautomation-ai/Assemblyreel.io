# 03 AI Pipeline (7-Agent Logic)

*[[README]] - Return to Map of Content*

## Overview
To handle complex, highly-tailored video generation, we use a decoupled **7-Agent AI Engine**. This ensures the LLM's attention is focused on one specific task at a time, resulting in much higher quality outputs than a single prompt.

All agents run via Next.js Server Actions using the Google Gemini 2.5 API with strictly typed JSON Structured Outputs. Long-form content repeats the whole loop per act — 5 to 11 acts, each running Agents 1-7 — as a direct, synchronous sequential loop; there's no deployment timeout to work around on a local machine, so no special chunking infrastructure is needed.

## The 7 Agents

### 1. The Script Writer
Takes the user's base prompt and workspace settings (e.g., True Crime, 16:9, Dark Psychology) and writes a compelling, hooked script. For long-form content, it uses a **5-Act Modular Architecture** to prevent repetitive dialogue.

### 2. The Metadata Expert
Analyzes the finalized script and generates optimized YouTube/TikTok metadata:
- Viral Title
- SEO Description
- Relevant Tags

### 3. The Scene B-Roll Slicer
The most crucial agent for the timeline. It takes the full script and "slices" it into distinct visual beats. It outputs a strictly typed JSON array of scenes, defining the exact voiceover text and duration for each block.

### 4. The Casting Director
Responsible for visual continuity. If the script features a recurring character (e.g., "A detective in a trench coat"), this agent ensures that the visual prompt for that character remains identical across all scenes to prevent AI morphing.

### 5. The Visual Architect
Designs the actual composition of the shot. Decides on lighting, camera angle, and background elements for each specific sliced scene.

### 6. The Cinematic Director
*(See [[04_REMOTION_ENGINE]] for how this integrates).*
This agent acts as the motion graphic supervisor. It decides if a scene needs a typewriter effect, a dual-title reveal, or a slow Ken Burns zoom. It outputs the exact JSON styling schema for Remotion to render.

### 7. The Prompt Assembler & Safety Officer (The Loop)
Takes the outputs from Agents 3, 4, 5, and 6 and assembles the perfect, highly-detailed 120-word prompt for the visual generation API (e.g., Fal.ai). It also filters the prompt to ensure it doesn't violate safety guidelines (e.g., removing overly gory descriptions in True Crime scripts) before sending it to the generator.
