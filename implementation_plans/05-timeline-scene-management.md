# 05 Timeline Scene Management & Editing

## Goal Description
Enhance the `TimelineEditor` to support granular, scene-level management. This includes the ability to right-click a specific scene on the timeline to swap its media (toggling between image and video), apply CapCut-style transitions between scenes, and isolate a single scene for playback and rendering to improve the editing workflow.

## Proposed Changes

### Timeline UI & Interaction (`src/components/ui/TimelineEditor.tsx`)
- **Context Menu (Right-Click):** Implement a custom right-click context menu on individual scene clips in the timeline.
- **Media Replacement & AI Generation:** When "Replace Media" is selected from the context menu, the UI will automatically focus/open the existing **Visual Generation Tab** in the properties panel for that specific scene. This ensures a unified UX without adding unnecessary popup modals.
- **Model Selection:** The existing Visual Generation tab already supports selecting the AI video/image model, clip duration, and entering a custom prompt, which perfectly handles the media replacement workflow.
- **Media Type Toggle:** Allow the user to select whether the new media should be treated as an `image` (static) or `video` (motion) within the Visual Generation tab, updating the scene's data structure accordingly.
- **Isolated Preview (Render Current Scene):** Add an action to "Preview/Render this Scene Only." This will update the state driving the Remotion `<Player />` to restrict the `inFrame` and `outFrame` to the boundaries of the selected scene, allowing the user to loop and verify one scene without playing the entire video.

### Transition Engine & Remotion (`src/remotion/`)
- **Transition Architecture:** Integrate scene transitions using Remotion's capabilities (and `@remotion/transitions`). Transitions will be applied between `Scene A` and `Scene B` dynamically based on the script data.
- **5 Custom CapCut-Style Transitions:** Implement 5 popular transitions natively in React/Remotion:
  1. **Glitch:** A short RGB split and displacement effect.
  2. **Smooth Zoom (In/Out):** A quick, eased scale transition blending the end of one scene into the next.
  3. **Wipe / Light Leak:** A bright gradient or light effect passing over the screen to mask the cut.
  4. **Crossfade / Dissolve:** A standard, smooth opacity blend.
  5. **Slide / Push:** The new scene pushes the old scene out of the frame (left/right/up/down).

## Open Questions
- Do you want the "Replace Media" action to open up an asset library/upload modal, or should it trigger an AI prompt to generate a *new* image/video for that specific scene?
- For the transitions, do you want these to be randomly applied by the AI initially, or will all scenes default to a "Cut" and the user has to manually select the transitions in the timeline?
- Should the "Isolated Preview" just play back in the browser timeline, or do you want an actual button to export/download just that single scene as an MP4?
