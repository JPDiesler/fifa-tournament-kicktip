// OpenAI (ChatGPT) adapter — official `openai` SDK. JSON-only is enforced via
// response_format json_object; an optional reasoning_effort drives the reasoning
// models. SDK auto-retries are disabled (maxRetries: 0) → one clean attempt.
import OpenAI from "openai";
import { extractJson } from "../parse.js";

export const meta = { id: "openai", name: "ChatGPT (OpenAI)", defaultModel: "gpt-5.1" };

export async function predict({ systemPrompt, bundle, apiKey, model, signal, reasoningEffort }) {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 });
  const req = {
    model: model || meta.defaultModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(bundle) },
    ],
    response_format: { type: "json_object" },
  };
  if (reasoningEffort) req.reasoning_effort = reasoningEffort;

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
