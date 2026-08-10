# Smart Duration Rounding & Non-Destructive Trimming

This plan outlines the changes implemented for the timeline generation workflow.

## Proposed Changes

### 1. Right-Click "Replace Media"
- **Context Menu Update**: Add a "Replace Media" option to the right-click menu on timeline scenes.
- **Action**: Clicking it will automatically select the scene, switch to the Scene Properties tab, expand the "Visual Generation" panel, and scroll it into view, ready for you to select a model and generate.

### 2. Smart Duration Rounding
- **Generation Logic (`TimelineEditor.tsx`)**: When generating an AI Video, the system will look at the exact voiceover-aligned duration of the scene (e.g., `3.6s`).
- **Rounding Up**: It will calculate the nearest available model increment that is *greater than* the scene duration:
  - `<= 5.0s` → Requests **5 seconds**
  - `5.1s - 8.0s` → Requests **8 seconds** (or 10s if the specific model only supports 5s/10s increments).
  - `8.1s - 10.0s` → Requests **10 seconds**
- **Images & Lip Sync**: These will bypass the rounding and request the exact scene duration (e.g., `3.6s`) since they aren't restricted by AI video increments.

### 3. Non-Destructive Trimming
- **Preserving Alignment**: When the generated video (e.g., `5s`) is returned from the API, we will **NOT** overwrite the scene's current duration (e.g., `3.6s`). 
- **The Buffer**: The scene will remain exactly `3.6s` to perfectly match the AI Scriptwriter's voiceover timing. The Remotion player will naturally play only the first `3.6s` of the `5s` video.
- **Maximizing Later**: Because the raw video is 5 seconds long, you can manually increase the scene duration in the timeline later to reveal the remaining `1.4s` of buffer footage if you need it.
