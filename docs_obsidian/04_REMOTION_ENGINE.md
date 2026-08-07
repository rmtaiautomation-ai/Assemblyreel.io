# 04 Remotion Engine

*[[README]] - Return to Map of Content*

## The Vision: "Infinite Options"
Instead of hardcoding specific visual templates (e.g., "Dual Title Reveal" or "Typewriter"), we are building a **Dynamic Motion Graphic Engine**. This allows the AI (Claude/Gemini) to generate endless variations of motion graphics, text animations, and visual effects on a per-scene basis by outputting a strictly typed JSON schema. 

This approach ensures the platform scales infinitely and can replicate advanced editor features (like CapCut) entirely through automation.

## Core Concepts

### 1. AI-Driven JSON Styling (The Cinematic Director)
The 7-Agent AI pipeline will be upgraded so the "Cinematic Director" agent dictates exactly how a scene should look and feel. It will output a JSON object defining the CSS, animations, and transitions for that specific scene based on the script's emotional tone.

**Example AI Output Schema for a Scene:**
```json
{
  "sceneId": "scene-001",
  "mediaUrl": "https://fal.media/image.jpg",
  "duration": 5.0,
  "motionGraphics": {
    "background": {
      "effect": "ken-burns",
      "zoomDirection": "in",
      "filter": "blur(5px)"
    },
    "typography": [
      {
        "text": "The Secret",
        "fontFamily": "Creepster, sans-serif",
        "color": "#FF0000",
        "position": "center",
        "animation": {
          "type": "slide",
          "from": "left",
          "timing": "ease-out"
        }
      },
      {
        "text": "Revealed",
        "fontFamily": "Inter, sans-serif",
        "color": "#FFFFFF",
        "position": "bottom",
        "animation": {
          "type": "slide",
          "from": "right",
          "timing": "spring"
        }
      }
    ]
  }
}
```

### 2. The Universal Remotion Component
Instead of building 50 individual React components for 50 different effects, we will build **one** highly intelligent component: `<DynamicMotionGraphic />`.

- **Props:** It accepts the JSON schema above.
- **Rendering:** It iterates through the `typography` array, dynamically applying standard React inline styles (`style={{ color, fontFamily }}`).
- **Animation:** It uses Remotion's core hooks (`useCurrentFrame`, `interpolate`, `spring`) to mathematically calculate movements (like sliding left or right) based on the `"animation.type"` property in the JSON.

### 3. The Timeline Editor UI (Next.js)
The frontend editor will read this JSON. Instead of a simple dropdown for "Presets", the editor can offer an "Advanced Mode" where users can view and tweak the JSON values directly, or use simple sliders that update the underlying JSON state.

## Implementation Roadmap

When we are ready to build this, we will follow these phases:

1. **Define the Zod Schema:** Create a strict TypeScript/Zod schema defining every possible animation type, color, font, and background effect we want to support.
2. **Upgrade the AI Prompts:** Inject this schema into the LLM prompt instructions so the AI knows exactly how to format its directorial decisions.
3. **Build the Remotion Engine:** Develop the `<DynamicMotionGraphic />` component inside the Remotion folder to parse the JSON and render the math-based animations.
4. **Wire the Next.js State:** Update the `TimelineEditor` state management to handle this nested JSON structure and pass it to the Remotion `<Player />`.
