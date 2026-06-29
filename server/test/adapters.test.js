import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-adapters-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
import { extractJson } from "../services/ai/parse.js";
import { validateMatchPrediction } from "../services/ai/schema.js";

test("registry exposes all four providers with a uniform interface", async () => {
  const { getAiAdapter, isKnownProvider, AI_PROVIDERS } = await import("../services/ai/index.js");
  assert.equal(isKnownProvider("nope"), false);
  for (const id of ["anthropic", "openai", "gemini", "mistral"]) {
    assert.ok(isKnownProvider(id), `${id} known`);
    const a = getAiAdapter(id);
    assert.equal(typeof a.predict, "function");
    assert.equal(typeof a.testConnection, "function");
    assert.ok(a.meta?.defaultModel, "has a default model");
  }
  assert.equal(AI_PROVIDERS.length, 4);
});

test("adapter output pipeline: fenced model text → canonical tip", () => {
  const modelText = '```json\n{"match_id":9,"tip":{"home":2,"away":1},"outcome_probabilities":{"home_win":0.7,"draw":0.2,"away_win":0.1},"reasoning":"Heimstark."}\n```';
  const { tip } = validateMatchPrediction(extractJson(modelText));
  assert.deepEqual(tip, { h: "2", a: "1", w: "" }); // no `advances` → no K.o. winner pick
});
