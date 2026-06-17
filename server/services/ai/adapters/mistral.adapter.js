// Mistral adapter — official @mistralai/mistralai SDK. JSON-only via
// responseFormat json_object.
import { Mistral } from "@mistralai/mistralai";
import { extractJson } from "../parse.js";

export const meta = { id: "mistral", name: "Mistral", defaultModel: "mistral-large-latest" };

// message content may come back as a string or as content chunks → normalise to text.
const textOf = (c) => (Array.isArray(c) ? c.map((x) => x.text || "").join("") : (c || ""));

export async function predict({ systemPrompt, bundle, apiKey, model }) {
  const client = new Mistral({ apiKey });
  const t0 = Date.now();
  const r = await client.chat.complete({
    model: model || meta.defaultModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(bundle) },
    ],
    responseFormat: { type: "json_object" },
  });
  const latencyMs = Date.now() - t0;
  const text = textOf(r.choices?.[0]?.message?.content).trim();
  const tokens = r.usage?.totalTokens || 0;
  return { prediction: extractJson(text), raw: text, latencyMs, tokens };
}

export async function testConnection({ apiKey, model }) {
  const client = new Mistral({ apiKey });
  await client.chat.complete({ model: model || meta.defaultModel, messages: [{ role: "user", content: "ping" }], maxTokens: 8 });
  return true;
}
