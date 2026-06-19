import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-aikeys-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
const { setAiProviderKey, getAiProviderKey, aiProviderKeyMeta, setAiProviderTest } = await import("../db.js");

test("setAiProviderKey stores encrypted; getAiProviderKey decrypts it back", () => {
  setAiProviderKey("openai", "sk-secret-1234");
  assert.equal(getAiProviderKey("openai"), "sk-secret-1234");
});

test("aiProviderKeyMeta masks to the last 4 (never the raw key) + tracks the test result", () => {
  setAiProviderKey("anthropic", "abcd-WXYZ");
  let m = aiProviderKeyMeta("anthropic");
  assert.equal(m.hasKey, true);
  assert.equal(m.masked, "••••WXYZ");
  assert.equal(m.testOk, null);
  setAiProviderTest("anthropic", true);
  m = aiProviderKeyMeta("anthropic");
  assert.equal(m.testOk, true);
  assert.ok(m.testAt);
});

test("setAiProviderKey('') clears the key and resets the test", () => {
  setAiProviderKey("mistral", "key-xyz");
  setAiProviderTest("mistral", true);
  setAiProviderKey("mistral", "");
  const m = aiProviderKeyMeta("mistral");
  assert.equal(m.hasKey, false);
  assert.equal(getAiProviderKey("mistral"), null);
  assert.equal(m.testOk, null);
});

test("getAiProviderKey is null for an unset provider", () => {
  assert.equal(getAiProviderKey("gemini"), null);
});
