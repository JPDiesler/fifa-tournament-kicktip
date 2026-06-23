import { test } from "node:test";
import assert from "node:assert/strict";
import { toAiError, AiError } from "../services/ai/errors.js";

const check = (raw, provider, code, transient, retryable = transient) => {
  const e = toAiError(raw, provider);
  assert.ok(e instanceof AiError, "is an AiError");
  assert.equal(e.code, code, `code for ${JSON.stringify(raw).slice(0, 60)}`);
  assert.equal(e.transient, transient, `transient for code ${code}`);
  assert.equal(e.retryable, retryable, `retryable for code ${code}`);
  assert.equal(e.provider, provider);
  assert.ok(typeof e.message === "string" && e.message.length > 0, "has a message");
};

test("Anthropic 529 overloaded → transient", () => {
  check({ status: 529, error: { type: "overloaded_error" }, message: "Overloaded" }, "anthropic", "overloaded", true);
});
test("Anthropic 401 auth → permanent", () => {
  check({ status: 401, error: { type: "authentication_error" }, message: "invalid x-api-key" }, "anthropic", "auth", false);
});
test("OpenAI 429 rate limit → transient", () => {
  check({ status: 429, code: "rate_limit_exceeded", message: "Rate limit reached" }, "openai", "rate_limit", true);
});
test("OpenAI 400 invalid request → permanent", () => {
  check({ status: 400, type: "invalid_request_error", message: "Invalid 'messages'" }, "openai", "bad_request", false);
});
test("Gemini-style message (no status field) overloaded → transient", () => {
  check({ message: "[503 Service Unavailable] The model is overloaded. Please try again later." }, "gemini", "overloaded", true);
});
test("Mistral 503 server → transient", () => {
  check({ statusCode: 503, message: "Service unavailable" }, "mistral", "server", true);
});
test("connection timeout → transient but NOT retried (too slow within the window)", () => {
  check({ name: "APIConnectionTimeoutError", message: "Request timed out." }, "anthropic", "timeout", true, false);
});
test("network failure → transient", () => {
  check(new Error("fetch failed"), "openai", "network", true);
});
test("parse failure (no JSON object) → permanent invalid_response", () => {
  check(new Error("kein JSON-Objekt in der Modell-Antwort"), "anthropic", "invalid_response", false);
});
test("JSON SyntaxError → permanent invalid_response", () => {
  check(new SyntaxError("Unexpected token o in JSON at position 1"), "openai", "invalid_response", false);
});
test("truly unknown error → permanent (no retry)", () => {
  check(new Error("something weird happened"), "mistral", "unknown", false);
});
test("AiError passes through unchanged (idempotent)", () => {
  const a = toAiError({ status: 529, message: "Overloaded" }, "anthropic");
  const b = toAiError(a, "anthropic");
  assert.equal(a, b, "same instance returned");
});
test("message is transparent: leads with the German label + status", () => {
  const e = toAiError({ status: 529, message: "Overloaded" }, "anthropic");
  assert.match(e.message, /^Anbieter überlastet \(529\)/);
});
