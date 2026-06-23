import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-achv-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

import { MATCHES } from "../data.js";
import { computeAchievements, achievementPoints } from "../services/achievements.js";

const CHRONO = [...MATCHES].sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.n - b.n));
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

test("achievements: exact-count + point/exact streaks unlock and are monotonic", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 10; i++) { const n = CHRONO[i].n; tips[n] = { h: "3", a: "0" }; results[n] = { h: "3", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_exact.unlocked, true);
  assert.equal(a.sharpshooter.unlocked, true);            // 10 exact ≥ 10
  assert.equal(a.clairvoyant.unlocked, false);            // needs 25
  assert.equal(a.clairvoyant.progress.current, 10);       // meter shows progress toward 25
  assert.equal(a.hot_streak.unlocked, true);              // run of 10 ≥ 5
  assert.equal(a.unstoppable.unlocked, true);             // run of 10 ≥ 10
  assert.equal(a.hattrick.unlocked, true);                // 3 exact in a row
  assert.ok(achievementPoints("AA", { tips: { AA: tips }, results }) >= 10);
});

test("achievements: big day (8+ pts on one matchday) + catalog is 12", async () => {
  const { computeAchievements, ACHIEVEMENTS } = await import("../services/achievements.js");
  assert.equal(ACHIEVEMENTS.length, 12); // 4×3 grid
  // three exact tips on one calendar day = 9 pts → "Großer Wurf"
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const bigMs = Object.values(byDay).find((ms) => ms.length >= 3).slice(0, 3);
  const tips = {}, results = {};
  for (const m of bigMs) { tips[m.n] = { h: "1", a: "0" }; results[m.n] = { h: "1", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.big_day.unlocked, true);     // 9 ≥ 8
  assert.equal(a.regular.unlocked, false);     // only 3 tipped, needs 40
  assert.equal(a.regular.progress.current, 3);
});

test("achievements: lone wolf + contrarian require the field", () => {
  const n = CHRONO[0].n; // home win 2:1; AA nails it, BB+CC tip an away win
  const st = {
    tips: { AA: { [n]: { h: "2", a: "1" } }, BB: { [n]: { h: "0", a: "2" } }, CC: { [n]: { h: "0", a: "1" } } },
    results: { [n]: { h: "2", a: "1" } },
  };
  const a = byId(computeAchievements("AA", st));
  assert.equal(a.lone_wolf.unlocked, true);               // only AA scored
  assert.equal(a.against_the_grain.unlocked, true);       // AA home-correct vs. an all-away field
  const b = byId(computeAchievements("BB", st));
  assert.equal(b.lone_wolf.unlocked, false);
  assert.equal(b.against_the_grain.unlocked, false);
});

test("leaderboard folds achievement points into the total (sum = matchPts + achPoints)", async () => {
  const db = await import("../db.js");
  const { db: raw } = await import("../db/connection.js");
  const p = db.createAiPlayer({ kuerzel: "ACH", name: "Ach", provider: "anthropic" });
  assert.ok(p?.id);
  const n = CHRONO[0].n; // a past (locked) match → insert the tip directly, as a real historic tip
  raw.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)").run(p.id, n, "2", "0");
  db.setResult(n, "2", "0"); // exact → 3 match points
  const row = db.leaderboard().find((r) => r.p === "ACH");
  assert.ok(row, "ACH on the board");
  assert.ok(row.achPoints >= 1, "at least the first-exact bonus");
  assert.equal(row.sum, 3 + row.achPoints, "total = match points + achievement bonus");
});
