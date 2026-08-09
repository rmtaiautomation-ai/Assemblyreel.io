import { Type, Schema } from "@google/genai";

export const ScriptWriterSchema: Schema = {
  type: Type.ARRAY,
  description: "Array of script lines.",
  items: {
    type: Type.STRING,
  },
};

// The Scene Slicer's schema now lives with the agent itself, as a Zod schema in
// `src/app/actions/slicer-actions.ts` — Zod gives it runtime validation and inferred
// types, which the hand-written Google `Schema` objects here cannot.
