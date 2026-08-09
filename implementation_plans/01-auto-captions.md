# Auto-Captions Feature Implementation Plan

## Goal
Implement a "CapCut-style" automatic captions feature that takes the existing script/narration text and generates timed text overlays at the bottom of the video. 

## Approach
Based on your feedback, we'll implement a **Global Toggle** for Auto-Captions, rather than a separate timeline track. This keeps the timeline clean and makes it a one-click setup. 

## 1. Data Model Updates
- Add a new state `showCaptions: boolean` in `TimelineEditor`, defaulting to `false` to avoid surprises.
- *(Optional future step: save this setting to the database so it persists across sessions).*

## 2. UI / Editor Updates (The Design)
We will place a sleek "Video Settings" or "Global Effects" toggle at the **very top of the Scene Info (Left Panel)**. 

* **Location:** Right below the "Scene" / "Export" tabs and above the Scene accordions (Voiceover / Visual / Overlay).
* **The Design:** A clean, rounded row with an icon (like `Subtitles` or `Type`), the text "Auto-Captions", a subtle description ("Generate subtitles from script"), and an iOS-style toggle switch. 
* **Why here?:** It clearly communicates that this setting applies to the entire video, while keeping it in the area where you already expect to edit scene details.

## 3. Remotion Integration (The Player)
- In the `VideoComposition` component, we will read the `showCaptions` state.
- If enabled, we will loop through all scenes. For each scene, we will render a `Sequence` containing its `voice_over_beat` text.
- The text will be positioned at the bottom of the video, centered, using a high-contrast style (e.g., bold white text with a heavy black outline/shadow) so it looks like standard TikTok/CapCut subtitles.

## Developer Execution Steps (For Claude Code)
1. Add the state `showCaptions` and the UI toggle in `src/components/ui/TimelineEditor.tsx`.
2. Update the Remotion player props to accept this state.
3. Update `VideoComposition.tsx` and `VideoScene.tsx` to map and render text captions if the toggle is ON.
4. Verify that turning the toggle ON immediately displays captions in the video player, and OFF hides them.
