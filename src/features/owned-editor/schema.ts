import { z } from "zod";

const id = z.string().uuid().transform(value => value.toLowerCase());
const seconds = z.number().finite().min(0).max(7200);
export const editorSceneSchema = z.object({
  id, voice_over_beat: z.string().max(10000), final_video_prompt: z.string().max(10000),
  video_duration: z.number().finite().min(0.1).max(600), trim_start: seconds,
}).strict();
export const editorItemSchema = z.object({
  id, media_id: id, track_id: z.enum(["A1", "A2"]), start_time: seconds,
  duration: z.number().finite().min(0.1).max(7200), trim_start: seconds,
}).strict().refine(item => item.start_time + item.duration <= 7200 && item.trim_start + item.duration <= 7200);
const trackSchema = z.object({ locked: z.boolean(), muted: z.boolean(), volume: z.number().finite().min(0).max(1) }).strict();
export const editorDocumentSchema = z.object({
  scenes: z.array(editorSceneSchema).max(200), items: z.array(editorItemSchema).max(200),
  settings: z.object({ captions_enabled: z.boolean(), track_states: z.object({ V1: trackSchema, A1: trackSchema, A2: trackSchema }).strict() }).strict(),
}).strict().superRefine((document, context) => {
  for (const rows of [document.scenes, document.items]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) context.addIssue({ code: "custom", message: "Duplicate identifiers." });
  }
  if (document.scenes.reduce((total, scene) => total + scene.video_duration, 0) > 7200) {
    context.addIssue({ code: "custom", message: "Timeline exceeds two hours." });
  }
});
export const editorSaveSchema = z.object({
  operationId: id, revision: z.number().int().min(0).max(2147483646), document: editorDocumentSchema,
}).strict();
export type EditorDocument = z.infer<typeof editorDocumentSchema>;
export type EditorSave = z.infer<typeof editorSaveSchema>;
export type EditorSnapshot = {
  project: { id: string; workspace_id: string; topic: string };
  revision: number;
  document: EditorDocument;
  removableSceneIds: string[];
  media: { id: string; media_type: "audio" | "image" | "video"; duration_seconds: number | null }[];
};
export const editorSnapshotSchema: z.ZodType<EditorSnapshot> = z.object({
  project: z.object({ id, workspace_id: id, topic: z.string().max(200) }).strict(),
  revision: z.number().int().min(0).max(2147483647), document: editorDocumentSchema,
  removableSceneIds: z.array(id).max(200),
  media: z.array(z.object({ id, media_type: z.enum(["audio", "image", "video"]), duration_seconds: z.number().finite().min(0).nullable() }).strict()).max(500),
}).strict();
