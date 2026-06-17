// OpenAI (ChatGPT) adapter — official `openai` SDK. JSON-only is enforced via
// response_format json_object; an optional reasoning_effort drives the reasoning
// models. SDK auto-retries are disabled (maxRetries: 0) → one clean attempt.
import OpenAI from "openai";
import { extractJson } from "../parse.js";

export const meta = { id: "openai", name: "ChatGPT (OpenAI)", defaultModel: "gpt-5.1" };

// gpt-5.x are reasoning models: without a capped effort they "think" long enough to
// blow a tight timeout. Default to a low effort (env-overridable; "" omits the param
// for non-reasoning models) and a generous shared timeout. One clean attempt → no retries.
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS || 120_000);
const DEFAULT_EFFORT = process.env.OPENAI_REASONING_EFFORT ?? "low";

export async function predict({ systemPrompt, bundle, apiKey, model, signal, reasoningEffort }) {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: TIMEOUT });
  const req = {
    model: model || meta.defaultModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(bundle) },
    ],
    response_format: { type: "json_object" },
  };
  const effort = reasoningEffort ?? DEFAULT_EFFORT;
  if (effort) req.reasoning_effort = effort;

  const t0 = Date.now();
  const resp = await client.chat.completions.create(req, { signal });
  const latencyMs = Date.now() - t0;
  const text = (resp.choices?.[0]?.message?.content || "").trim();
  const tokens = resp.usage?.total_tokens || 0;
  return { prediction: extractJson(text), raw: text, latencyMs, tokens };
}

export async function testConnection({ apiKey, model }) {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 });
  await client.chat.completions.create({ model: model || meta.defaultModel, max_completion_tokens: 8, messages: [{ role: "user", content: "ping" }] });
  return true;
}

// Available models (chat-capable ids floated to the top) for the admin model picker.
export async function listModels({ apiKey }) {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
  const r = await client.models.list();
  return (r.data || [])
    .map((m) => ({ id: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
