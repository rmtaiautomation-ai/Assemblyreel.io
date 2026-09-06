import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

/**
 * Shared OpenAI provider for the whole text-generation stack.
 *
 * Every LLM call in this project runs on OpenAI: the 7-agent pipeline, the scene
 * slicer, the long-form script writer and the brainstorm co-writer. The one
 * exception is AI IMAGE generation, which still calls Gemini directly — see
 * `providers/gemini-image.ts`. `GEMINI_API_KEY` therefore stays in the environment
 * for images; nothing in this file or the agents reads it any more.
 *
 * Built lazily on first call rather than as a module-level const: a top-level
 * `createOpenAI(...)` reads `process.env.OPENAI_API_KEY` at import time, which only
 * works if the environment is already populated before this module is first
 * imported. Next.js guarantees that ordering for server code, but a standalone
 * script (verification tooling, a future CLI) that loads `.env.local` itself after
 * its imports resolve would silently capture `undefined` and every call would fail
 * with a misleading "API key missing" error. Deferring construction to first use
 * removes the ordering dependency entirely.
 */
let cachedProvider: OpenAIProvider | null = null;

export function openai(modelId: string) {
  if (!cachedProvider) {
    cachedProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedProvider(modelId);
}

/**
 * Fast, cheap model for every structured agent in the chain and the scene slicer.
 *
 * `gpt-4o-mini` is the deliberate TESTING default while the channel's format,
 * persona and pacing are still being dialled in — it is structured-output capable
 * and a fraction of the cost of the full model, so the format can be re-run freely.
 * Once the settings are locked, raising quality is a one-line change here.
 */
export const AGENT_MODEL = "gpt-4o-mini";

/**
 * Model for the long-form script writer and the brainstorm co-writer — the two
 * places prose quality is the actual product rather than a structured extraction.
 *
 * Kept separate from `AGENT_MODEL` so script quality can be pushed to `gpt-4o`
 * without also paying the full model price on every per-scene pipeline call.
 */
export const SCRIPT_MODEL = "gpt-4o-mini";

/**
 * Passed as `providerOptions` on every `generateObject` call.
 *
 * `strictJsonSchema: false` tells OpenAI to treat the JSON schema as guidance rather
 * than validating it against its strict-mode keyword allowlist — the pipeline's Zod
 * schemas use `.min()`, `.max()` and `.int()` constraints that strict mode rejects
 * outright with a 400. The model still returns schema-shaped JSON; only the
 * server-side keyword check is relaxed.
 */
export const OBJECT_PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

/** Structured-extraction agents need determinism far more than flair. */
export const STRUCTURED_TEMPERATURE = 0.2;

/** Creative agents (environment, camera) get a little more room. */
export const CREATIVE_TEMPERATURE = 0.6;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const MISSING_OPENAI_KEY_ERROR =
  "OPENAI_API_KEY is missing in environment variables.";
