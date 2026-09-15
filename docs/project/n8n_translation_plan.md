# n8n AI Workflow Analysis: Throne of Glory

This document captures the exact logic, structure, and system prompts from your n8n workflow. We will use this blueprint to translate your multi-agent system directly into Next.js/TypeScript code.

## 1. The Orchestration Sequence
The workflow operates in two main phases:

### Phase 1: Script & Metadata Generation
1. **Input:** Fetches a Topic, Narrative Arc, Script Hook, Visual Aesthetic, and POV (from Airtable).
2. **The Script Writer:** Writes the master Voiceover (VO) script.
3. **The Metadata Expert:** Takes the master script and generates YouTube-optimized title, description, and tags.
4. **Save to DB:** Saves the Master Script and Metadata.

### Phase 2: Scene-by-Scene Visual Generation
1. **The Scene B-roll Slicer:** Slices the master script into a JSON array of individual scenes (one scene per line).
2. **The Casting Director:** Reads the whole scene array and generates a unified Character Blueprint (ensuring visual consistency).
3. **The Loop:** Iterates through every single scene to build the visual prompts:
   - **The Visual Architect:** Generates environment keywords for the specific scene.
   - **The Cinematic Director:** Assigns specific camera moves (crane, dolly, pan) based on the scene sequence and type.
   - **The Prompt Assembler:** Merges the Character Blueprint, Environment, Camera Move, and VO into a single 120-word visual prompt, appending a universal Style Tag.
   - **The Safety Officer (Firewall):** Scans the final prompt and surgically replaces violent/gory words with platform-safe equivalents.
4. **Final Save:** Pushes the finalized scene data back to the database.

---

## 2. Agent Prompts & Rules

### A. The Script Writer
**Inputs:** Topic, Narrative Arc, Hook, Visual Aesthetic, POV
**Rules:**
- **Tone:** Plain English (NLT Bible style), 8th-grade reading level.
- **Structure:** Exactly 12-15 lines (160-190 words). 5 parts: Hook → Setup → Escalation → Divine Turn → Consequence + CTA.
- **Camera-Ready Rule:** Every line MUST state WHO (physical subject), WHAT (physical action), and WHERE (visible location). No metaphors.
- **Money Shot Rule:** Final line must combine visual summary and a CTA ("if you believe [theme], type AMEN and write: [phrase]").

### B. The Scene B-roll Slicer
**Inputs:** Master Script, Topic, Narrative Arc, Visual Aesthetic
**Rules:**
- One scene per script line. Output as JSON array.
- **Scene Types:** 
  - `ESTABLISH` (max 4, wide empty)
  - `ACTION` (min 3, default, physical movement)
  - `DIALOGUE` (min 2, must have explicit speech verbs like "said, called out")
  - `DIVINE` (min 1, supernatural result)
- Never use the same scene type more than twice in a row.

### C. The Casting Director
**Inputs:** Scene Array, Topic, Visual Aesthetic
**Rules:**
- Generate a locked visual character blueprint for named characters/armies.
- **Archetypes provided:** Defending King, Enemy King, Defending Army, Enemy Army, Angel of the Lord, Voice of God (No physical body), Civilian.
- Format: `[CHARACTER NAME]: keyword, keyword...`

### D. The Visual Architect
**Inputs:** Scene Type, Base Subject, Continuity Anchor, VO, Visual Aesthetic
**Rules:**
- Generate environment keywords based on `scene_type`.
- `ESTABLISH`: full rich description (e.g. ancient cracked stone walls).
- `ACTION`: battlefield chaos, dust clouds, harsh sunlight.
- `DIALOGUE`: intimate close environment, soft bokeh, warm torchlight.
- `DIVINE`: supernatural collision, massive light shafts, god rays.

### E. The Cinematic Director
**Inputs:** Scene Type, Sequence Number, Base Subject, Environment, Video Duration
**Rules:**
- Assign one camera move per scene (crushing, sweeping, pushing, tracking).
- Sequence rules: Scenes 1-3 (wide/crane), Scenes 4-9 (dollies/close-ups), Scenes 10-12 (orbits for peak), Scenes 13+ (wide/locked).

### F. The Prompt Assembler
**Inputs:** Scene Type, Camera, Character Blueprint, Environment, Base Subject, Scene Dialogue
**Rules:**
- **Hard Limit:** 120 words max.
- **Character Isolation:** Only include characters explicitly named in the Base Subject. Never add extras from the blueprint.
- **Gravity Rule:** Characters must physically displace the environment (crushing, kicking up dust).
- **Style Tag (Appended to all):** *"Photorealistic ancient war epic, 35mm cinematic lens, hyper-detailed live-action, dramatic chiaroscuro lighting, gritty ancient realism with rich golden hour highlights, dust and atmosphere creating natural depth, 8K resolution, cinematic masterpiece."*

### G. The Safety Officer (Firewall)
**Inputs:** Assembled Prompt
**Rules:**
- Replace flagged words with safe equivalents.
- e.g., `blood` → `red dust`, `corpse` → `fallen soldiers`, `massacre` → `overwhelmed`, `smiting` → `struck down by divine force`.

---

## 3. Next Steps (User Review)

> [!IMPORTANT]
> I have captured the entire exact logic of your n8n workflow. 
> 
> **Question:** Would you like me to start writing the TypeScript files to implement Phase 1 (`The Script Writer` and `The Metadata Expert`) into our Next.js backend? We can use the Gemini API we already set up.
