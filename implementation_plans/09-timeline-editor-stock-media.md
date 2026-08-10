# Timeline Editor & Unified Stock Media Implementation Plan

## Goal
To upgrade the Timeline Editor by restructuring the Scene Info panel for better usability (Visual Generation accordion first) and adding a robust, unified Stock Media search system that supports both Pexels and Pixabay for both Images and Videos.

## 1. Backend Foundation (Unified Stock Media API)
Currently, stock media searching is tightly coupled to Pexels video search. We need a unified route to abstract this logic.

* **Create a new route:** `src/app/api/stock-media/route.ts`
* **Query Parameters:** It must accept `query` (string), `provider` (`pexels` | `pixabay`), and `type` (`video` | `image`).
* **Environment Variables:** Securely utilize `PEXELS_API_KEY` and `PIXABAY_API_KEY`.
* **Response Normalization:** The frontend needs a consistent format regardless of the provider. Ensure the JSON response maps both Pexels and Pixabay raw data into a standardized array of `results`:
  ```typescript
  {
    success: true,
    results: [
      {
        id: "unique_string",
        thumbnailUrl: "url_to_thumbnail",
        mediaUrl: "url_to_hd_video_or_large_image",
        type: "video" // or "image"
      }
    ]
  }
  ```
* **Deprecation:** Once implemented and tested, delete the old `/api/pexels/route.ts`.

## 2. UI Layout Updates (TimelineEditor.tsx)
We need to prioritize the most frequently used tools in the Scene Info panel.

* **Reorder Accordions:** Locate the 4 accordions inside the Scene Info panel (Voiceover, Text Overlay, Transition, Visual Generation). Move the **Visual Generation** accordion block so it sits at the very top, immediately below the Scene Properties header.
* **Update Default States:** Update the component's `useState` hooks for accordion visibility:
  - `isVisualExpanded` -> `true` (Open by default)
  - `isVoiceoverExpanded` -> `false`
  - `isOverlayExpanded` -> `false`
  - `isTransitionExpanded` -> `false`

## 3. UI Functionality Updates (TimelineEditor.tsx)
We must connect the new backend API to the newly reorganized UI, allowing the user to select their desired stock platform and format.

* **Add Component State:** Add state variables to track the chosen stock settings:
  ```typescript
  const [globalStockProvider, setGlobalStockProvider] = useState<'pexels' | 'pixabay'>('pexels');
  const [globalStockType, setGlobalStockType] = useState<'video' | 'image'>('video');
  // Also ensure stockSearchResults and isSearchingStock are defined correctly.
  ```
* **Add Dropdown UI:** Inside the Visual Generation accordion, within the `selectedScene.generation_mode === 'stock_media'` conditional block, inject two new `<select>` dropdowns before the search input:
  1. **Platform:** Options for "Pexels" and "Pixabay" (bound to `globalStockProvider`).
  2. **Media Type:** Options for "Video" and "Image" (bound to `globalStockType`).
* **Update `handleStockSearch`:** Modify this function to pass the selected provider and type as query parameters to `/api/stock-media`. Map the normalized response directly into `stockSearchResults`.
* **Update `handleGenerateAllVisuals`:** Ensure that when a user clicks the button to auto-generate all scenes, the system uses the user's selected `globalStockProvider` and `globalStockType` instead of defaulting to a hardcoded Pexels video search.

## 4. Future Optimization: Local Media Caching (Fixing the Render Crash)
**Context:** Currently, if a user applies a remote stock video (Pexels/Pixabay URL) directly to a scene, Remotion tries to stream that high-definition video live over the internet frame-by-frame during the export process. This creates a massive network bottleneck that overwhelms CPU/Memory, causing severe lag and PC crashes.

* **Solution:** Build a pre-processing step right before triggering the Remotion render.
* **How to Implement:** 
  1. Scan the `scenes` array for any `custom_media_url` that points to a remote domain (e.g., `pexels.com`, `pixabay.com`).
  2. Download those remote files to a temporary local directory (e.g., `public/media/downloads`).
  3. Swap the `custom_media_url` in the timeline payload from the remote URL to the new local file path before passing the data to Remotion.
  4. This ensures Remotion extracts frames from a fast, local file on the hard drive, completely eliminating the network bottleneck and crashing issues.

## Execution Notes for Claude Code
- Pay close attention to the structural nesting of the accordions in `TimelineEditor.tsx` when moving them. They share a single parent `<div>`.
- When normalizing the Pixabay video response in the API, note that Pixabay videos do not have a straightforward `thumbnail` field; you must manually construct the thumbnail URL using `picture_id` (e.g., `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`).
- The user uses a Windows environment. Ensure any file path manipulations use appropriate tooling. Do not attempt to run a generic find-and-replace script to move the 500-line accordion block; parse and inject it safely or use exact regex matching.
