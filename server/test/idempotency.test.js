import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-idem-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

test("claimAiPrediction is single-shot per (player, match)", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM1", name: "x", provider: "anthropic", model: "m" });
  assert.equal(db.claimAiPrediction(p.id, 5, "anthropic", "m"), true, "first claim wins");
  assert.equal(db.claimAiPrediction(p.id, 5, "anthropic", "m"), false, "second claim is a no-op");
  assert.equal(db.hasAiPrediction(p.id, 5), true);
});
// (Per-provider key encryption is covered in aiproviderkeys.test.js.)

test("champion claim is single-shot per player", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM3", name: "z", provider: "anthropic" });
  assert.equal(db.claimAiChamp(p.id, "anthropic", null), true);
  assert.equal(db.claimAiChamp(p.id, "anthropic", null), false);
});

test("aiRanking computes Brier score + hit rate from predictions vs results", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "RNK", name: "r", provider: "openai" });
  db.claimAiPrediction(p.id, 50, "openai", "m");
  db.finishAiPrediction(p.id, 50, { status: "done", tip: { h: "2", a: "0" }, prediction: { outcome_probabilities: { home_win: 0.7, draw: 0.2, away_win: 0.1 } } });
  db.setResult(50, "2", "0"); // actual home win → argmax(home) hits; Brier = .3²+.2²+.1² = .14
  const r = db.aiRanking().find((x) => x.kuerzel === "RNK");
  assert.equal(r.n, 1);
  assert.equal(r.hitRate, 100);
  assert.equal(r.brier, 0.14);
});

test("aiPlayerStats counts done/total; setAiTestResult records the connection status", async () => {
  const db = await import("../db.js");
  const p = db.createAiPlayer({ kuerzel: "IDM4", name: "s", provider: "openai" });
  db.claimAiPrediction(p.id, 7, "openai", "m"); db.finishAiPrediction(p.id, 7, { status: "done", tip: { h: "1", a: "0" } });
  db.claimAiPrediction(p.id, 8, "openai", "m"); db.finishAiPrediction(p.id, 8, { status: "failed", error: "x" });
  const s = db.aiPlayerStats(p.id);
  assert.equal(s.total, 2);
  assert.equal(s.done, 1);
  db.setAiTestResult(p.id, true);
  assert.equal(db.getAiPlayerById(p.id).ai_test_ok, 1);
});
