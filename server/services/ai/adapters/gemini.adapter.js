// Google Gemini adapter — official @google/genai SDK. JSON-only via
// responseMimeType; the system prompt goes in config.systemInstruction.
import { GoogleGenAI } from "@google/genai";
import { extractJson } from "../parse.js";

export const meta = { id: "gemini", name: "Gemini (Google)", defaultModel: "gemini-2.5-pro" };
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS || 120_000);

export async function predict({ systemPrompt, bundle, apiKey, model }) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT } });
  const t0 = Date.now();
  const r = await ai.models.generateContent({
    model: model || meta.defaultModel,
    contents: JSON.stringify(bundle),
    config: { systemInstruction: systemPrompt, responseMimeType: "application/json" },
  });
  const latencyMs = Date.now() - t0;
  const text = (r.text || "").trim();
  const u = r.usageMetadata || {};
  const tokens = u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0));
  return { prediction: extractJson(text), raw: text, latencyMs, tokens };
}

export async function testConnection({ apiKey, model }) {
  const ai = new GoogleGenAI({ apiKey });
  await ai.models.generateContent({ model: model || meta.defaultModel, contents: "ping", config: { maxOutputTokens: 8 } });
  return true;
}

// Available models (only those that can generateContent) for the admin model picker.
export async function listModels({ apiKey }) {
  const ai = new GoogleGenAI({ apiKey });
  const out = [];
  const pager = await ai.models.list();
  for await (const m of pager) {
    const acts = m.supportedActions || m.supportedGenerationMethods || [];
    if (acts.length && !acts.includes("generateContent")) continue;
    const id = (m.name || "").replace(/^models\//, "");
    if (id) out.push({ id, label: m.displayName || id, contextLimit: m.inputTokenLimit || null });
  }
  return out;
}
