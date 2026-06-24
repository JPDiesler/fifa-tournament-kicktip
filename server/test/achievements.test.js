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
  for (let i = 0; i < 15; i++) { const n = CHRONO[i].n; tips[n] = { h: "3", a: "0" }; results[n] = { h: "3", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_exact.unlocked, true);
  assert.equal(a.sharpshooter.unlocked, true);            // 15 exact ≥ 15
  assert.equal(a.clairvoyant.unlocked, false);            // needs 25
  assert.equal(a.clairvoyant.progress.current, 15);       // meter shows progress toward 25
  assert.equal(a.hot_streak.unlocked, true);              // run of 15 ≥ 5
  assert.equal(a.unstoppable.unlocked, true);             // run of 15 ≥ 10
  assert.equal(a.hattrick.unlocked, true);                // 3 exact in a row
  assert.ok(achievementPoints("AA", { tips: { AA: tips }, results }) >= 10);
});

test("achievements: big day (10+ pts on one matchday) + catalog is 24 (12 win + 12 fail)", async () => {
  const { computeAchievements, ACHIEVEMENTS } = await import("../services/achievements.js");
  assert.equal(ACHIEVEMENTS.length, 24); // two 4×3 grids
  assert.equal(ACHIEVEMENTS.filter((a) => a.kind === "win").length, 12);
  assert.equal(ACHIEVEMENTS.filter((a) => a.kind === "fail").length, 12);
  assert.ok(ACHIEVEMENTS.filter((a) => a.kind === "fail").every((a) => a.points > 3)); // equalizer: bigger points
  // four exact tips on one calendar day = 12 pts → "Großer Wurf" (target 10)
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const bigMs = Object.values(byDay).find((ms) => ms.length >= 4).slice(0, 4);
  const tips = {}, results = {};
  for (const m of bigMs) { tips[m.n] = { h: "1", a: "0" }; results[m.n] = { h: "1", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.big_day.unlocked, true);     // 12 ≥ 10
  assert.equal(a.regular.unlocked, false);     // only 4 tipped, needs 75
  assert.equal(a.regular.progress.current, 4);
});

test("achievements: lone wolf (2×) + contrarian (3×) require the field", () => {
  // 3 home wins 2:1; AA nails each (only scorer + home-correct vs. an all-away field), BB/CC tip away
  const tips = { AA: {}, BB: {}, CC: {} }, results = {};
  for (let i = 0; i < 3; i++) {
    const n = CHRONO[i].n;
    tips.AA[n] = { h: "2", a: "1" }; tips.BB[n] = { h: "0", a: "2" }; tips.CC[n] = { h: "0", a: "1" };
    results[n] = { h: "2", a: "1" };
  }
  const st = { tips, results };
  const a = byId(computeAchievements("AA", st));
  assert.equal(a.lone_wolf.unlocked, true);               // only AA scored, ≥2 matches
  assert.equal(a.against_the_grain.unlocked, true);       // 3× home-correct vs. an all-away field
  const b = byId(computeAchievements("BB", st));
  assert.equal(b.lone_wolf.unlocked, false);
  assert.equal(b.against_the_grain.unlocked, false);
});

test("fail achievements: a cold streak of wrong-way tips unlocks the equalizer badges", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 8; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "2" }; results[n] = { h: "2", a: "0" }; } // tipped away, home won → 0 pts, opposite tendency
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_zero.unlocked, true);     // ≥ 3 zeros
  assert.equal(a.cold_streak.unlocked, true);    // 5 zero in a row
  assert.equal(a.ice_cold.unlocked, false);      // needs 10
  assert.equal(a.anti_talent.unlocked, true);    // 8 opposite-winner tips
  assert.equal(a.false_start.unlocked, true);    // first 3 (settled) all zero
  assert.equal(a.zero_collector.unlocked, false); // needs 25
});

test("streak badges: meter follows the CURRENT run (resets) until earned, then locks permanently", async () => {
  const { computeAchievements } = await import("../services/achievements.js");
  const mk = (rows) => { const tips = {}, results = {}; for (const [i, t, r] of rows) { const n = CHRONO[i].n; tips[n] = t; results[n] = r; } return { tips: { AA: tips }, results }; };
  const T3 = [{ h: "2", a: "0" }, { h: "2", a: "0" }];  // exact → 3 pts (point-run +1)
  const T1 = [{ h: "1", a: "0" }, { h: "3", a: "1" }];  // right tendency, wrong score → 1 pt (point-run +1)
  const T0 = [{ h: "0", a: "1" }, { h: "1", a: "0" }];  // wrong → 0 (breaks the run)
  // point pattern 3,1,1,0,1 → longest point-run 3, CURRENT run 1
  const a = byId(computeAchievements("AA", mk([[0, ...T3], [1, ...T1], [2, ...T1], [3, ...T0], [4, ...T1]])));
  assert.equal(a.hot_streak.streak, true);
  assert.equal(a.hot_streak.unlocked, false);       // longest 3 < 5 → not yet earned
  assert.equal(a.hot_streak.progress.current, 1);   // meter shows the CURRENT run, reset by the 0
  assert.equal(a.hot_streak.current, 1);
});

test("Nullrunden-Abo needs 3 CONSECUTIVE blank matchdays (not any 3)", async () => {
  const { computeAchievements } = await import("../services/achievements.js");
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const days = Object.keys(byDay).sort();
  const fill = (idxs, blank) => { const tips = {}, results = {}; for (const di of idxs) for (const m of byDay[days[di]]) { tips[m.n] = blank.has(di) ? { h: "0", a: "1" } : { h: "1", a: "0" }; results[m.n] = { h: "1", a: "0" }; } return { tips: { AA: tips }, results }; };
  // 3 consecutive blank days → unlocked
  assert.equal(byId(computeAchievements("AA", fill([0, 1, 2], new Set([0, 1, 2])))).cellar_regular.unlocked, true);
  // blank, scored, blank, blank → longest consecutive = 2 → still locked, live current run = 2
  const a = byId(computeAchievements("AA", fill([0, 1, 2, 3], new Set([0, 2, 3]))));
  assert.equal(a.cellar_regular.unlocked, false);
  assert.equal(a.cellar_regular.progress.current, 2);
});

test("fail day-badges credit only a FULLY decided day (monotonic across staggered kickoffs)", async () => {
  const { computeAchievements } = await import("../services/achievements.js");
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const day = Object.values(byDay).find((ms) => ms.length >= 3); // a full multi-match day
  const last = day[day.length - 1].n;
  const wash = (st) => byId(computeAchievements("AA", st)).washout.unlocked;
  const tips = { AA: Object.fromEntries(day.map((m) => [m.n, { h: "0", a: "1" }])) }; // AA tips away on all
  const res = (over = {}) => Object.fromEntries(day.map((m) => [m.n, over[m.n] || { h: "1", a: "0" }])); // home wins → AA blank
  // partial day (last match still pending) → must NOT credit washout yet
  const partial = Object.fromEntries(day.slice(0, -1).map((m) => [m.n, { h: "1", a: "0" }]));
  assert.equal(wash({ tips, results: partial }), false, "incomplete day not credited");
  // day completes, still all-blank for AA → washout unlocks
  assert.equal(wash({ tips, results: res() }), true);
  // a same-day result that gives AA points → day not blank → stays locked (would have re-locked before the fix)
  assert.equal(wash({ tips, results: res({ [last]: { h: "0", a: "1" } }) }), false, "a positive same-day result keeps it locked");
});

test("achievementPointsByDay: deltas are non-negative and sum to the total bonus", async () => {
  const { achievementPoints, achievementPointsByDay } = await import("../services/achievements.js");
  const m1 = CHRONO[0];
  const m2 = CHRONO.find((m) => m.dt.slice(0, 10) !== m1.dt.slice(0, 10));
  const st = {
    tips: { AA: { [m1.n]: { h: "1", a: "0" }, [m2.n]: { h: "2", a: "2" } } },
    results: { [m1.n]: { h: "1", a: "0" }, [m2.n]: { h: "0", a: "3" } }, // m1 exact (3), m2 a wrong draw → 0
  };
  const daysAsc = [
    { day: m1.dt.slice(0, 10), matchNs: [m1.n] },
    { day: m2.dt.slice(0, 10), matchNs: [m2.n] },
  ];
  const byDay = achievementPointsByDay(st, daysAsc);
  const total = achievementPoints("AA", st);
  const summed = Object.values(byDay).reduce((s, d) => s + (d.AA || 0), 0);
  assert.equal(summed, total, "per-day deltas sum to the final total");
  for (const d of Object.values(byDay)) assert.ok((d.AA || 0) >= 0, "deltas are non-negative");
  assert.ok(total >= 1); // at least first_exact (m1 exact)
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
