// Robustly extract a JSON object from a model response: strip ``` code fences, take
// the first '{' through the last '}', then JSON.parse. Throws if nothing parseable
// is found (the caller then records the attempt as 'failed' — no retry).
export function extractJson(text) {
  if (!text || typeof text !== "string") throw new Error("leere Modell-Antwort");
  let s = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) throw new Error("kein JSON-Objekt in der Modell-Antwort");
  return JSON.parse(s.slice(first, last + 1)); // SyntaxError on malformed JSON
}
