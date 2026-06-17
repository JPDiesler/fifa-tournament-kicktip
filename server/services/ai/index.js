// Registry of LLM provider adapters. Each adapter exposes the same interface:
//   predict({ systemPrompt, bundle, apiKey, model, signal }) -> { prediction, raw, latencyMs, tokens }
//   testConnection({ apiKey, model }) -> true | throws
//   meta { id, name, defaultModel }
// New providers (Gemini, Mistral) drop in here and appear in the admin form automatically.
import * as anthropic from "./adapters/anthropic.adapter.js";
import * as openai from "./adapters/openai.adapter.js";
import * as gemini from "./adapters/gemini.adapter.js";
import * as mistral from "./adapters/mistral.adapter.js";

const ADAPTERS = { anthropic, openai, gemini, mistral };

export const getAiAdapter = (provider) => ADAPTERS[provider] || null;
export const isKnownProvider = (provider) => Object.prototype.hasOwnProperty.call(ADAPTERS, provider);
// Public list for the admin UI (no secrets).
export const AI_PROVIDERS = Object.values(ADAPTERS).map((a) => ({ id: a.meta.id, name: a.meta.name, defaultModel: a.meta.defaultModel }));
