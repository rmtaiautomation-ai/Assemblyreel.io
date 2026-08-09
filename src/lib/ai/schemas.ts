import { Type, Schema } from "@google/genai";

export const ScriptWriterSchema: Schema = {
  type: Type.ARRAY,
  description: "Array of script lines.",
  items: {
    type: Type.STRING,
  },
};

export const SceneSlicerSchema: Schema = {
  type: Type.ARRAY,
  description: "Array of distinct scenes sliced organically from the master script.",
  items: {
    type: Type.OBJECT,
    properties: {
      sceneNumber: { type: Type.INTEGER, description: "Sequential scene number, starting at 1" },
      voiceoverText: { type: Type.STRING, description: "The exact voiceover script fragment to be spoken during this scene. Must match original script words exactly." },
      estimatedDurationMs: { type: Type.INTEGER, description: "Estimated duration of this scene in milliseconds (assume 150 words per minute / 2.5 words per second)." },
      sceneType: { type: Type.STRING, description: "Type of scene: ESTABLISH, ACTION, DIALOGUE, DIVINE, CLOSEUP, MACRO, etc." },
      visualDescription: { type: Type.STRING, description: "A highly visual description of what happens on screen to assist the Prompt Assembler later." }
    },
    required: ["sceneNumber", "voiceoverText", "estimatedDurationMs", "sceneType", "visualDescription"]
  }
};
