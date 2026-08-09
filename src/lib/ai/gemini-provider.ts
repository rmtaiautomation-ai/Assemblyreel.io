import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";

/**
 * Shared Gemini provider for the 7-agent pipeline.
 *
 * `@ai-sdk/google` defaults its credential to `GOOGLE_GENERATIVE_AI_API_KEY`, but this
 * project has always stored it as `GEMINI_API_KEY`. Passing it explicitly here — once —
 * keeps every agent on the same credential and avoids an auth failure that would
 * otherwise only appear at request time.
 *
 * Built lazily on first call rather than as a module-level const: a top-level
 * `createGoogleGenerativeAI(...)` reads `process.env.GEMINI_API_KEY` at import time,
 * which only works if the environment is already populated before this module is
 * first imported. Next.js guarantees that ordering for server code, but nothing else
 * does — a standalone script (verification tooling, a future CLI) that loads
 * `.env.local` itself after its imports resolve would silently capture `undefined` and
 * every agent call would fail with a misleading "API key missing" error. Deferring
 * construction to first use removes the ordering dependency entirely.
 */
let cachedProvider: GoogleGenerativeAIProvider | null = null;

export function gemini(modelId: string) {
  if (!cachedProvider) {
    cachedProvider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cachedProvider(modelId);
}

/** Fast, cheap model used for every agent in the chain. */
export const AGENT_MODEL = "gemini-2.5-flash";

/** Structured-extraction agents need determinism far more than flair. */
export const STRUCTURED_TEMPERATURE = 0.2;

/** Creative agents (environment, camera) get a little more room. */
export const CREATIVE_TEMPERATURE = 0.6;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const MISSING_GEMINI_KEY_ERROR =
  "GEMINI_API_KEY is missing in environment variables.";
