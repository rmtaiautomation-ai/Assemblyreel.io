# 07 AI Generation Plan

Based on our project documentation (`n8n_translation_plan.md` and `PROJECT_PLAN.md`), the goal here is to optimize how we generate audio scripts, sentence structures, and visual pacing dynamically based on **Video Duration** (60s up to 30m) and **Niche/Behavior**. We need to avoid LLM fatigue on long videos while maintaining high engagement.

## Generation Architecture

### 1. Niche & Behavior Definitions (The Tone Matrix)
The **Script Writer** and **Visual Architect** agents will receive specific behavioral overrides based on the selected niche:

*   **Mythology & Ancient Lore:** 
    *   *Tone:* Epic, NLT Bible style, grandiose. 
    *   *Visuals:* Heavy use of `ESTABLISH` (wide sweeping shots) and `DIVINE` (god rays, massive scale) scene types.
*   **True Crime / Investigation:** 
    *   *Tone:* Grounded, suspenseful, analytical. 
    *   *Visuals:* High ratio of `ACTION` and `DIALOGUE` (intimate close-ups, handheld camera logic, evidence shots).
*   **Dark Psychology & Human Behavior:** 
    *   *Tone:* Intense, psychological, slow-burn.
    *   *Visuals:* Slower pacing, high contrast/chiaroscuro, subtle `ESTABLISH` scenes with slow dolly pushes.

### 2. Duration-Based Scripting & Audio Logic
To optimize audio generation, we calculate pacing at ~150 Words Per Minute (WPM). The pipeline scales modularly to prevent API timeouts or hallucination.

#### A. Short-Form (30s - 60s)
*   **Target Word Count:** 75 - 150 words.
*   **Structure (1 Act):** Hook → Core Concept → Climax + CTA.
*   **Scene Slicing Behavior:** Hyper-fast pacing. The Slicer divides sentences into shorter fragments (e.g., 2-3 seconds per clip). We let the LLM decide the total scene count organically based on the script density.

#### B. Mid-Form Short (2m - 3m)
*   **Target Word Count:** 300 - 450 words.
*   **Structure (3 Acts):** Hook & Context (25%) → The Deep Dive (50%) → Conclusion & CTA (25%).
*   **Scene Slicing Behavior:** Moderate pacing. Clips change every 4-6 seconds. Uses a mix of wide and close-up camera moves. Scene count is determined organically by the LLM based on the generated narrative.

#### C. Mid-Form Long (4m - 5m)
*   **Target Word Count:** 600 - 750 words.
*   **Structure (3 Acts):** Hook & Context (20%) → The Deep Dive (60%) → Conclusion & CTA (20%).
*   **Scene Slicing Behavior:** Moderate-to-Slow pacing. Clips change every 5-8 seconds to allow for more visual breathing room. Scene count is determined organically by the LLM.

#### D. Long-Form / Documentary (10m - 30m)
*   **Target Word Count:** 1,500 - 4,500 words.
*   **Structure (5-Act Modular/Chapterized):**
    *   Act 1: The Forbidden Hook & Context (0-3m)
    *   Act 2: The Rising Threat / Core Problem (3-8m)
    *   Act 3: The Deep Dive / Revelation (8-14m)
    *   Act 4: Implications & Climax (14-22m)
    *   Act 5: Aftermath & CTA (22-30m)
*   **Optimization (Chunking & Streaming):** The Script Writer generates **one Act at a time** in separate API calls. As soon as an Act is completed and its audio is generated, it will be **streamed directly into the UI Timeline** sequentially so the user can watch the sequences build up in real-time.
*   **Scene Slicing Behavior:** Slow, cinematic pacing. Clips linger for 6-12 seconds. Uses subtle Ken Burns effects and looping ambient B-Roll. Scene count is decided organically by the LLM.

### 3. Sentence Construction & Agent Overrides
To fundamentally alter how each audio sentence is constructed, we inject the following rule into the **Script Writer**:

*   **Camera-Ready Rule:** Every sentence generated must state WHO (physical subject), WHAT (physical action), and WHERE (visible location). No abstract metaphors unless specifically in the "Philosophy" niche.
*   **Slicer Mapping:** The Scene Slicer will assign a `duration_ms` value to each sentence by analyzing the syllable count, ensuring the frontend Timeline accurately spaces out the generated Voiceover chunks.

### 4. The 7-Agent Loop Explained (Behind the Scenes)
For non-technical team members and external platforms, here is exactly how our AI backend operates to generate a complete video, especially for long-form (25-30 minute) content.

**The "Waterfall" Information Flow:**
Instead of asking one AI to "make a video" (which causes it to forget details or hallucinate), we split the job across 7 highly specialized "Agents." They talk to each other in a specific order, passing validated data down the chain.

1. **The Script Writer:** Writes the voiceover. For a 30-minute video, it writes **Act 1** first, so the system can start generating audio/visuals immediately while Acts 2-5 are written in the background.
2. **The Scene Slicer:** Takes the script and chops it up. It decides "This sentence is 4 seconds long. Let's make it an ACTION scene."
3. **The Casting Director:** Reads the whole chopped script and locks in character designs. If "King David" is in Scene 1 and Scene 40, this agent creates a rigid "Blueprint" (e.g., *King David, golden crown, red tunic*) and passes it down so the visual AI doesn't accidentally change his clothes halfway through the video.
4. **The Visual Architect:** Looks at the Scene Slicer's "ACTION" tag and the Casting Director's "King David" blueprint. It then generates the **Environment** (e.g., *dusty battlefield, dark stormy sky*).
5. **The Cinematic Director:** Looks at the environment and decides the **Camera Angle**. It says: "We need an epic feel here, inject a *low-angle drone sweep*."
6. **The Prompt Assembler (The Compiler):** This agent takes ALL the previous injected data (Character Blueprint + Environment + Camera Angle + Niche Style) and mathematically combines them into one perfect, highly-detailed 120-word text prompt.
7. **The Safety Officer (Validation):** Before sending this prompt to the final video generator (like Fal.ai or Kling), this agent scans the text. If the script was True Crime and included "bloody knife", it intercepts and rewrites it to "glistening steel in dim light" to ensure the generation doesn't fail safety filters.

**How it Scales for 30-Minute Videos:**
Because a 30-minute video requires hundreds of scenes, doing this all at once would crash the server. Instead, our backend runs this 7-Agent Loop on **Act 1** and immediately **Streams** the finished scenes into your browser's Timeline. While you are watching the first 5 minutes generate on your screen, the server is quietly running the 7-Agent loop on Act 2 in the background.
