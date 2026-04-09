/**
 * Shared OpenRouter client factory.
 * OpenRouter is OpenAI-API-compatible — we use the `openai` SDK with a custom baseURL.
 *
 * Required env var : OPENROUTER_API_KEY
 * Optional env vars:
 *   OPENROUTER_MODEL      — generation model   (default: deepseek/deepseek-r1)
 *   OPENROUTER_FAST_MODEL — analysis model     (default: deepseek/deepseek-chat-v3-0324)
 */
import OpenAI from 'openai';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Main (high-quality) coding model */
export const GEN_MODEL =
  process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-r1';

/** Fast / cheap model for lightweight tasks (analysis, intent detection) */
export const FAST_MODEL =
  process.env.OPENROUTER_FAST_MODEL ?? 'deepseek/deepseek-chat-v3-0324';

/** Build an OpenRouter-backed OpenAI client. Throws if no API key. */
export function createClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  return new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://app.neowow.studio',
      'X-Title':      'Neowow Studio',
    },
  });
}

/** Returns true when the OpenRouter key is available */
export function hasKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
