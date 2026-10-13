import { z } from "zod";
import { ART_STYLES, ASPECT_RATIOS, DURATIONS, LANGUAGES } from "@/lib/workspace-options";

export const setupSchema = z.object({
  workspaceId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  content_theme: z.string().trim().min(1).max(200),
  visual_aesthetic: z.enum(ART_STYLES),
  aspect_ratio: z.enum(ASPECT_RATIOS),
  video_language: z.enum(LANGUAGES),
  duration_pref: z.enum(DURATIONS),
  topic: z.string().trim().max(200),
}).strict();
export const onboardingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), revision: z.number().int().min(0).max(1000000), settings: setupSchema }).strict(),
  z.object({ action: z.literal("complete"), revision: z.number().int().min(1).max(1000000) }).strict(),
]);
export type SetupSettings = z.infer<typeof setupSchema>;
export type SetupState = { revision: number; settings: SetupSettings; workspace_id: string | null; project_id: string | null };
export const initialSettings: SetupSettings = {
  workspaceId: null, name: "", content_theme: "", visual_aesthetic: "Cinematic",
  aspect_ratio: "Horizontal 16:9", video_language: "English", duration_pref: "60-90s", topic: "",
};
