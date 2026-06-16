import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-idem-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

test("claimAiPrediction is single-shot per (player, match)", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM1", name: "x", provider: "anthropic", model: "m", apiKey: "secret" });
  assert.equal(db.claimAiPrediction(p.id, 5, "anthropic", "m"), true, "first claim wins");
  assert.equal(db.claimAiPrediction(p.id, 5, "anthropic", "m"), false, "second claim is a no-op");
  assert.equal(db.hasAiPrediction(p.id, 5), true);
});

test("API key is encrypted at rest and roundtrips", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM2", name: "y", provider: "openai", model: "m", apiKey: "sk-plaintext-xyz" });
  assert.equal(db.getAiPlayerKey(p.id), "sk-plaintext-xyz", "decrypts to original");
  assert.ok(!String(db.getAiPlayerById(p.id).ai_key_enc).includes("sk-plaintext-xyz"), "not stored in plaintext");
});

test("champion claim is single-shot per player", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM3", name: "z", provider: "anthropic", apiKey: "k" });
  assert.equal(db.claimAiChamp(p.id, "anthropic", null), true);
  assert.equal(db.claimAiChamp(p.id, "anthropic", null), false);
});
