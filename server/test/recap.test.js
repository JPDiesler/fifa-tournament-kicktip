import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-recap-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

test("matchday_recaps storage round-trips; latestRecap returns the newest day", async () => {
  const db = await import("../db.js");
  db.setMatchdayRecap("2026-06-20", { text: "Tag eins", provider: "anthropic", model: "m" });
  db.setMatchdayRecap("2026-06-22", { text: "Tag drei" });
  assert.equal(db.getMatchdayRecap("2026-06-20").text, "Tag eins");
  assert.equal(db.hasMatchdayRecap("2026-06-22"), true);
  const latest = db.latestRecap();
  assert.equal(latest.day, "2026-06-22");
  assert.equal(latest.text, "Tag drei");
});

test("pickRecapProvider: null without keys; setting wins when keyed, else first keyed", async () => {
  const db = await import("../db.js");
  const { pickRecapProvider } = await import("../services/ai/recap.js");
  assert.equal(pickRecapProvider(), null);            // no keys configured
  db.setAiProviderKey("mistral", "k-mistral");
  assert.equal(pickRecapProvider(), "mistral");        // only keyed provider
  db.setAiProviderKey("anthropic", "k-anthropic");
  db.setSetting("recapProvider", "anthropic");
  assert.equal(pickRecapProvider(), "anthropic");      // setting wins (has a key)
  db.setSetting("recapProvider", "openai");             // set but unkeyed → fall back to a keyed one
  assert.ok(["anthropic", "mistral"].includes(pickRecapProvider()));
});

test("buildRecapContext: results line, leader, and day-best (zero-pointers filtered)", async () => {
  const { buildRecapContext } = await import("../services/ai/recap.js");
  const { MATCHES } = await import("../data.js");
  const m = MATCHES[0];
  const st = {
    results: { [m.n]: { h: "2", a: "1" } }, resolved: {},
    tips: { AA: { [m.n]: { h: "2", a: "1" } }, BB: { [m.n]: { h: "0", a: "0" } } },
  };
  const board = [{ p: "AA", name: "Ann", sum: 10 }, { p: "BB", name: "Bo", sum: 4 }];
  const ctx = buildRecapContext([m], st, board);
  assert.equal(ctx.ergebnisse.length, 1);
  assert.match(ctx.ergebnisse[0], /2:1/);
  assert.equal(ctx.tabellenfuehrer, "Ann");
  assert.deepEqual(ctx.tagesbeste, ["Ann 3"]); // AA exact = 3; BB 0 → filtered out
});
