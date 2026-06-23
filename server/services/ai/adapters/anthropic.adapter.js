// Anthropic (Claude) adapter — official @anthropic-ai/sdk. The static system prompt
// is sent with cache_control (prompt caching); extended thinking is enabled for the
// EV/Poisson reasoning on models that support the manual `thinking` param. SDK
// auto-retries are disabled (maxRetries: 0) so a failure is a single clean attempt.
import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../parse.js";

export const meta = { id: "anthropic", name: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-6" };

// Shared request timeout (the reasoning bundle can be slow). One clean attempt → no retries.
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS || 120_000);

// Opus 4.7/4.8, Fable 5 & Mythos 5 think ADAPTIVELY — they reject a manual `thinking`
// block, so we omit it (they still reason internally).
const ADAPTIVE_THINKING = /opus-4-(7|8)|fable|mythos/i;

export async function predict({ systemPrompt, bundle, apiKey, model, signal, thinkingBudget = 4000 }) {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: TIMEOUT });
  const mdl = model || meta.defaultModel;
  const manualThinking = thinkingBudget > 0 && !ADAPTIVE_THINKING.test(mdl);
  const req = {
    model: mdl,
    max_tokens: manualThinking ? thinkingBudget + 2000 : 4000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(bundle) }],
  };
  if (manualThinking) req.thinking = { type: "enabled", budget_tokens: thinkingBudget };

  const t0 = Date.now();
  const msg = await client.messages.create(req, { signal });
  const latencyMs = Date.now() - t0;
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const tokens = (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
  return { prediction: extractJson(text), raw: text, latencyMs, tokens };
}

// Free-text generation (no JSON enforcement) — used by the matchday recap. Returns plain prose.
export async function generateText({ systemPrompt, prompt, apiKey, model, signal, maxTokens = 700 }) {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: TIMEOUT });
  const t0 = Date.now();
  const msg = await client.messages.create({
    model: model || meta.defaultModel,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  }, { signal });
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return { text, latencyMs: Date.now() - t0, tokens: (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0) };
}

// Minimal connection check (no match prompt) — verifies key + model are usable.
export async function testConnection({ apiKey, model }) {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
  await client.messages.create({ model: model || meta.defaultModel, max_tokens: 8, messages: [{ role: "user", content: "ping" }] });
  return true;
}

// Available models for the admin model picker.
export async function listModels({ apiKey }) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  const r = await client.models.list({ limit: 100 });
  return (r.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
}
