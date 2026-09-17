# AssemblyReel: Expanded Portfolio Walkthrough Video Script

> [!TIP]
> **Recording Advice for a 10-15 Minute Video**
> - **Tone:** Speak naturally, like you're showing this to a fellow developer over a Zoom call. Be passionate about the problems you solved. Don't rush; take pauses to let the viewer absorb what's on the screen.
> - **Pacing:** If you find yourself speaking too fast, take a breath. It’s okay to have moments where you just say, "Let's watch this generate for a second," while the screen records.
> - **Show, Don't Just Tell:** When you talk about a feature (like the Timeline Editor or the Settings), move your mouse, click around, and highlight the UI elements you are discussing. 

---

## 🎬 Section 1: The Hook & Introduction (0:00 - 2:00)

**[Screen: Start on the AssemblyReel dashboard or a visually interesting page, maybe with a finished video playing silently in the background]**

**You:**
"Hey everyone, my name is [Your Name], and today I’m really excited to give you a deep dive into a project I’ve been building called **AssemblyReel**. 

At its core, AssemblyReel is an AI-powered long-form video generation pipeline. But it’s not just a wrapper around an API where you type a prompt and hope for the best. I built this specifically for producing faceless YouTube documentaries at scale—videos that are 10, 20, or even 30 minutes long. 

If you've played with AI video tools, you know the biggest problems: characters change appearances from shot to shot, the narrative wanders, and if you try to generate a 20-minute video all at once, a failure at minute 18 ruins the whole thing. 

AssemblyReel solves this by breaking the entire generation process into a controlled, reviewable pipeline. It writes the script act by act, force-aligns the narration for perfect captions, casts recurring characters *once* so they stay consistent, and compiles complex cinematic prompts for every single scene. Ultimately, it means that whether I'm producing video number 1 or video number 100, they have a consistent, high-quality channel voice. And if I want to launch a totally different channel in a different niche, it’s just a settings change, not a code fork."

---

## 🛠️ Section 2: The Tech Stack (2:00 - 3:30)

**[Screen: Bring up your code editor (VS Code). Briefly show the file tree, `package.json`, or the `src/lib/ai/agents` folder to prove it's a real, complex codebase.]**

**You:**
"Before I show you the app in action, let’s talk about how this is actually built under the hood. 

- **Frontend & Backend:** The whole app is a full-stack **Next.js 16** application using the App Router, written strictly in **TypeScript**. For styling, I’m using **Tailwind CSS v4**, and for the database and auth, I'm relying on **Supabase** with PostgreSQL and row-level security.
- **The Brains (AI):** All the heavy lifting for the logic is done using the **Vercel AI SDK**, primarily calling **OpenAI (GPT-4o)**. But it's not just one big prompt; I've orchestrated a whole suite of specialized AI agents.
- **Visuals & Audio:** For image generation, I'm tapping into **Google's Gemini Image API**, and I have a provider registry set up for video generation like Fal.ai. For audio, it's plug-and-play—I can use OpenAI TTS, ElevenLabs, or even a local voice studio. 
- **The Secret Sauce:** Two massive pieces of this stack are **Deepgram**, which I use for forced word-level audio alignment, and **Remotion**, which is the video engine that actually compiles all my React components into a final MP4 timeline. We'll see both of those in action shortly."

---

## ⚙️ Section 3: Stage 0 — Channel Blueprint & Facts (3:30 - 6:00)

**[Screen: Switch to the web app. Go to "Workspace Settings" -> "Channel Format" and "Facts" tabs]**

**You:**
"Alright, let's look at the actual workflow. Everything starts with what I call 'Stage 0: Channel Setup'. 

Most AI tools fail because they lack context. In AssemblyReel, you define a 'Channel Blueprint'. Here in the settings, I can paste rough, unstructured research notes about the kind of channel I want to run—maybe it's a gritty true-crime series or a mythic history channel.

When I save this, a background agent I built called the **Format Analyst** goes to work. It translates my prose into a strict profile. It defines the narrator's persona, their exact words-per-minute, and the 'act cycle'—which are the mandatory narrative beats every chapter must hit.

Simultaneously, another agent called the **Fact Archivist** mines the notes for verifiable sources—scholars, councils, manuscripts. It puts them in a ledger. But here’s the kicker: every fact starts out as 'unverified'. Only the facts I manually tick off are compiled into the prompt. I actually built in an 'escape hatch' instruction so the AI knows it’s allowed to say 'according to a fourth-century council' instead of hallucinating a fake citation just to fill a beat. 

This blueprint gets frozen and attached to every project, so if I change my channel settings next month, my old projects are still completely reproducible."

---

## 📝 Section 4: Stage 1 to 3 — Outlining, Scripting, and Slicing (6:00 - 8:30)

**[Screen: Click "New Project", type in a topic, and initiate the generation. Show the loading states or the whiteboard where acts are forming.]**

**You:**
"Let's make a video. I'll enter a topic here.

Immediately, the app calculates a word budget. If I ask for a 20-minute video, the **Act Outliner** breaks the narrative arc into roughly 9 distinct acts. It ensures the script doesn't fall short. 

Then, the **Script Writer** takes over. Crucially, it generates the script *one act at a time*. When it’s writing Act 5, it’s passed a 'continuity block' so it remembers exactly what was discussed in Acts 1 through 4. If this was a 25-minute video, reviewing it in 2.5-minute chunks is so much more manageable for a human producer.

Once the text is written, the **Scene Slicer** chops the acts into cinematic scenes. It assigns a scene type—like an establishing shot, a macro closeup, or dialogue—based on the channel’s preferred visual grammar. All of this happens instantly and costs almost nothing in API calls."

---

## 🎙️ Section 5: Audio-First Narration & Deepgram Alignment (8:30 - 10:30)

**[Screen: Move to the Audio generation phase / Timeline Inspector. Show the waveform or the captions.]**

**You:**
"Now we enter the Audio phase. This was one of the hardest architectural challenges to solve. 

Originally, if you edited a single word in a 25-minute AI video, you had to re-record the entire 25-minute audio track, which screwed up the timing of 150 scenes. 

My solution was to chunk the narration by Act. AssemblyReel synthesizes the audio for just one act at a time and sends it to **Deepgram** to force-align the audio back to the script. This gives us exact word-level timings. The spoken length of the audio literally dictates the duration of the scene on the timeline. 

Because the alignment cursor restarts at every single act, it is impossible for a desync to cascade across the video. If I decide to re-record Act 5 and make it 10 seconds longer, the system uses what I call 'ripple semantics'. It just does the math and pushes Acts 6 through 9 ten seconds later down the timeline. Nothing drifts. It's incredibly robust."

---

## 🎨 Section 6: The Visual Agents Pipeline (10:30 - 13:00)

**[Screen: Show the human approval step. Click "Approve" on an act and show the Visual Prompts generating]**

**You:**
"AssemblyReel requires a human in the loop. I listen to the act, and if I like it, I hit 'Approve'. Approving an act unleashes the Visual Agent Pipeline. 

This is an orchestrated chain of LLM calls:
1. First, the **Casting Director**. It reads the entire script at once and locks in a rigid visual blueprint for any recurring characters. Wardrobe, appearance, demeanor—it's all locked. This is how I ensure the protagonist doesn't magically change ethnicities or outfits between chapter 1 and chapter 9. 
2. Next, the **Visual Architect and Cinematic Director** assign specific environments, lighting, and camera instructions—like the focal length or camera movement—to each scene.
3. Then, a pure TypeScript **Prompt Assembler** compiles this into a dense, 120-word prompt, ordered by priority so if we hit a word limit, it drops the least important details first.
4. Finally, the **Safety Officer** agent rewrites the prompt to clear commercial NSFW filters while preserving the cinematic intent. For example, it might change 'bloody knife' to 'glistening steel in dim light'. 

Only after all that does it hit the Gemini or Fal.ai API to generate the actual media. And it downloads everything locally to the server to prevent link rot."

---

## 🎞️ Section 7: The Browser Timeline Editor & Render (13:00 - 14:30)

**[Screen: Open the Timeline Editor. Drag some clips around, show the transition dropdown, maybe add an overlay like 'Film Damage']**

**You:**
"Once the media is ready, we jump into the **Timeline Editor**, which I built from scratch in the browser. 

You can drag and trim scenes, but what's really cool is the timeline math for transitions. If I add a crossfade, the system calculates the overlap so that the start and end frames of the scene don't actually change. This means I can add heavy transitions without ever throwing the video out of sync with that master Deepgram audio track.

I can also layer on kinetic text, graphic cards, and full-frame environmental effects like film grain, light sweeps, or particle fields. Everything is layered perfectly.

When I’m ready, I hit render. This hooks into **Remotion**. It bundles my React components, and because I have AWS Lambda configured, it chunks the video and renders it concurrently in the cloud. It bypasses the limits of my local machine completely."

---

## 🏁 Section 8: Conclusion (14:30 - 15:00)

**[Screen: Show a few seconds of the final rendered MP4 playing smoothly in full screen]**

**You:**
"And here is the final output. 

Building AssemblyReel was a huge exercise in controlling unpredictability. By breaking video generation into discrete, orchestrated steps—writing, hearing, casting, and seeing—and building custom browser-based tooling to manage it all, I've created a system that can reliably pump out high-quality, long-form content at scale.

Thank you so much for taking the time to watch this deep dive. If you want to check out the code or have any questions about the architecture, feel free to reach out. Thanks again!"
