import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-achv-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

import { MATCHES } from "../data.js";
import { computeAchievements, achievementPoints, achievementPointsByDay } from "../services/achievements.js";

const CHRONO = [...MATCHES].sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.n - b.n));
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

test("achievements: exact-count + point/exact streaks unlock and are monotonic", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 20; i++) { const n = CHRONO[i].n; tips[n] = { h: "3", a: "0" }; results[n] = { h: "3", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_exact.unlocked, true);
  assert.equal(a.sharpshooter.unlocked, true);            // 20 exact ≥ 20
  assert.equal(a.clairvoyant.unlocked, false);            // needs 30
  assert.equal(a.clairvoyant.progress.current, 20);       // meter shows progress toward 30
  assert.equal(a.hot_streak.unlocked, true);              // run of 20 ≥ 6
  assert.equal(a.unstoppable.unlocked, true);             // run of 20 ≥ 12
  assert.equal(a.hattrick.unlocked, true);                // 3 exact in a row
  assert.ok(achievementPoints("AA", { tips: { AA: tips }, results }) >= 10);
});

test("achievements: big day (10+ pts on one matchday) + catalog is 32 (20 win + 12 fail)", async () => {
  const { computeAchievements, ACHIEVEMENTS } = await import("../services/achievements.js");
  assert.equal(ACHIEVEMENTS.length, 32);
  assert.equal(ACHIEVEMENTS.filter((a) => a.kind === "win").length, 20);
  assert.equal(ACHIEVEMENTS.filter((a) => a.kind === "fail").length, 12);
  assert.ok(ACHIEVEMENTS.filter((a) => a.kind === "fail").every((a) => a.points >= 1 && a.points <= 8)); // equalizer points, rebalanced down
  assert.ok(new Set(ACHIEVEMENTS.map((a) => a.id)).size === 32, "ids are unique");
  // wins are tiered: common→1, rare→2, epic→3 (points always match the tier)
  const TIER_PTS = { common: 1, rare: 2, epic: 3 };
  assert.ok(ACHIEVEMENTS.filter((a) => a.kind === "win").every((a) => TIER_PTS[a.tier] === a.points), "win points match their rarity tier");
  // four exact tips on one calendar day = 12 pts → "Großer Wurf" (target 12)
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const bigMs = Object.values(byDay).find((ms) => ms.length >= 4).slice(0, 4);
  const tips = {}, results = {};
  for (const m of bigMs) { tips[m.n] = { h: "1", a: "0" }; results[m.n] = { h: "1", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.big_day.unlocked, true);     // 12 ≥ 12
  assert.equal(a.regular.unlocked, false);     // only 4 tipped, needs 90
  assert.equal(a.regular.progress.current, 4);
});

test("achievements: lone wolf (3×) + contrarian (4×) require the field", () => {
  // 4 home wins 2:1; AA nails each (only scorer + home-correct vs. an all-away field), BB/CC tip away
  const tips = { AA: {}, BB: {}, CC: {} }, results = {};
  for (let i = 0; i < 4; i++) {
    const n = CHRONO[i].n;
    tips.AA[n] = { h: "2", a: "1" }; tips.BB[n] = { h: "0", a: "2" }; tips.CC[n] = { h: "0", a: "1" };
    results[n] = { h: "2", a: "1" };
  }
  const st = { tips, results };
  const a = byId(computeAchievements("AA", st));
  assert.equal(a.lone_wolf.unlocked, true);               // only AA scored, ≥3 matches
  assert.equal(a.against_the_grain.unlocked, true);       // 4× home-correct vs. an all-away field
  const b = byId(computeAchievements("BB", st));
  assert.equal(b.lone_wolf.unlocked, false);
  assert.equal(b.against_the_grain.unlocked, false);
});

test("fail achievements: a cold streak of wrong-way tips unlocks the equalizer badges", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 10; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "2" }; results[n] = { h: "2", a: "0" }; } // tipped 0:2, played 2:0 → 0 pts AND exact mirror
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_zero.unlocked, true);     // ≥ 5 zeros (revealed)
  assert.equal(a.cold_streak.unlocked, true);    // 6 zero in a row
  assert.equal(a.anti_talent.unlocked, true);    // 10 exact mirror tips ≥ 3
  assert.equal(a.false_start.unlocked, true);    // first 3 (settled) all zero
  assert.equal(a.ice_cold, undefined);           // needs 12 → still hidden
  assert.equal(a.zero_collector, undefined);     // needs 30 → still hidden
});

test("plausibility gate: absurd farm tips never count toward the hidden equalizers", () => {
  // 9:0 is implausible (side > 5) → losing on purpose with a farm scoreline earns NOTHING
  const tips = {}, results = {};
  for (let i = 0; i < 12; i++) { const n = CHRONO[i].n; tips[n] = { h: "9", a: "0" }; results[n] = { h: "0", a: "1" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.first_zero, undefined);   // gate blocks it → stays hidden
  assert.equal(a.cold_streak, undefined);
  assert.equal(a.anti_talent, undefined);
  assert.equal(a.false_start, undefined);
  assert.equal(achievementPoints("AA", { tips: { AA: tips }, results }), 0, "no points from farmed losses");
});

test("quirky wins: 0:0-Hellseher, Torfestival, Kantersieg unlock on the right exact tips", () => {
  const m0 = CHRONO[0].n, m1 = CHRONO[1].n, m2 = CHRONO[2].n;
  const tips = { [m0]: { h: "0", a: "0" }, [m1]: { h: "3", a: "2" }, [m2]: { h: "4", a: "0" } };
  const results = { [m0]: { h: "0", a: "0" }, [m1]: { h: "3", a: "2" }, [m2]: { h: "4", a: "0" } };
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.zero_zero.unlocked, true);  // 0:0 exact
  assert.equal(a.goal_fest.unlocked, true);  // 5 goals exact
  assert.equal(a.blowout.unlocked, true);    // 4-goal margin exact
});

test("quirky win: Phönix — a Volltreffer right after 5 pointless games", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 5; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "1" }; results[n] = { h: "1", a: "0" }; } // 5 pointless
  const n6 = CHRONO[5].n; tips[n6] = { h: "2", a: "1" }; results[n6] = { h: "2", a: "1" };                              // exact after the drought
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.phoenix.unlocked, true);
});

test("Spielverlauf wins: Last-Minute, Platzverweis, Comeback (from match_detail)", () => {
  const m0 = CHRONO[0].n, m1 = CHRONO[1].n, m2 = CHRONO[2].n;
  const tips = { [m0]: { h: "2", a: "1" }, [m1]: { h: "1", a: "0" }, [m2]: { h: "2", a: "1" } };
  const results = { [m0]: { h: "2", a: "1" }, [m1]: { h: "1", a: "0" }, [m2]: { h: "2", a: "1" } };
  const details = {
    [m0]: { scorers: [{ minute: 88, side: "h" }] },                                                       // goal after the 85th
    [m1]: { cards: [{ card: "Red Card", side: "a" }] },                                                   // a sending-off
    [m2]: { scorers: [{ minute: 12, side: "a" }, { minute: 50, side: "h" }, { minute: 80, side: "h" }] }, // home trailed 0:1, won 2:1
  };
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }, details));
  assert.equal(a.late_show.unlocked, true);
  assert.equal(a.red_card.unlocked, true);
  assert.equal(a.comeback.unlocked, true);
  // without the Spielverlauf the same exact tips don't earn the timeline badges
  const b = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(b.late_show.unlocked, false);
  assert.equal(b.comeback.unlocked, false);
});

test("Spielverlauf win: Elfer-Prophet — keyed on the shootout log, not the (mutable) result", () => {
  const ko = CHRONO.find((m) => ["R32", "R16", "QF", "SF", "P3", "FIN"].includes(m.ph));
  assert.ok(ko, "a knockout fixture exists");
  const shootout = { home: [{ scored: true }], away: [{ scored: false }] };
  const tips = { AA: { [ko.n]: { h: "1", a: "1" } } };                 // tipped a draw
  const results = { [ko.n]: { h: "1", a: "1" } };
  assert.equal(byId(computeAchievements("AA", { tips, results }, { [ko.n]: { shootout } })).penalty_prophet.unlocked, true);
  // monotonic: stays unlocked even if the level result is later "corrected" to a decisive one
  assert.equal(byId(computeAchievements("AA", { tips, results: { [ko.n]: { h: "2", a: "1" } } }, { [ko.n]: { shootout } })).penalty_prophet.unlocked, true);
  // no shootout log → not a penalty decision → does NOT count (even with a tipped draw)
  assert.equal(byId(computeAchievements("AA", { tips, results }, {})).penalty_prophet.unlocked, false);
  // a K.o. extra-time WIN (resolved winner, non-draw result, NO shootout) must stay locked
  const et = byId(computeAchievements("AA", { tips, results: { [ko.n]: { h: "2", a: "1" } }, resolved: { [ko.n]: { winner: "home" } } }, {}));
  assert.equal(et.penalty_prophet.unlocked, false);
  // a group-stage shootout-shaped log does NOT count (knockouts only)
  const grp = CHRONO.find((m) => !["R32", "R16", "QF", "SF", "P3", "FIN"].includes(m.ph));
  const b = byId(computeAchievements("AA", { tips: { AA: { [grp.n]: { h: "1", a: "1" } } }, results: { [grp.n]: { h: "1", a: "1" } } }, { [grp.n]: { shootout } }));
  assert.equal(b.penalty_prophet.unlocked, false);
});

test("Spielverlauf monotonicity: comeback waits for a COMPLETE goal log (no premature unlock)", () => {
  const n = CHRONO[0].n;
  const st = { tips: { AA: { [n]: { h: "2", a: "1" } } }, results: { [n]: { h: "2", a: "1" } } };
  // a partial log (only the early away goal) would, prefix-replayed, look like a comeback — but it
  // doesn't reconstruct to 2:1, so the gate keeps it locked (it must not unlock then flip back)
  assert.equal(byId(computeAchievements("AA", st, { [n]: { scorers: [{ minute: 20, side: "a" }] } })).comeback.unlocked, false);
  // the full log reconstructs to 2:1 and shows the winner trailed → unlocks
  assert.equal(byId(computeAchievements("AA", st, { [n]: { scorers: [{ minute: 20, side: "a" }, { minute: 55, side: "h" }, { minute: 80, side: "h" }] } })).comeback.unlocked, true);
  // a complete log where the winner never trailed → no comeback
  assert.equal(byId(computeAchievements("AA", st, { [n]: { scorers: [{ minute: 20, side: "h" }, { minute: 55, side: "h" }, { minute: 80, side: "a" }] } })).comeback.unlocked, false);
});

test("Spielverlauf edges: own-goal comeback (+ negative twin), second yellow, injury-time late goal", () => {
  const n = CHRONO[0].n;
  const exact = { tips: { AA: { [n]: { h: "2", a: "1" } } }, results: { [n]: { h: "2", a: "1" } } };
  // away leads 0:1 (12'), an away OWN goal makes it 1:1 (50', credited to home), home 2:1 (80') → home came back
  assert.equal(byId(computeAchievements("AA", exact, { [n]: { scorers: [{ minute: 12, side: "a" }, { minute: 50, side: "a", type: "own" }, { minute: 80, side: "h" }] } })).comeback.unlocked, true);
  // negative twin: same scoreline WITHOUT the own-goal flip → home leads throughout → no comeback
  assert.equal(byId(computeAchievements("AA", exact, { [n]: { scorers: [{ minute: 12, side: "h" }, { minute: 50, side: "h" }, { minute: 80, side: "a" }] } })).comeback.unlocked, false);
  const ex10 = { tips: { AA: { [n]: { h: "1", a: "0" } } }, results: { [n]: { h: "1", a: "0" } } };
  // a second yellow counts as a sending-off
  assert.equal(byId(computeAchievements("AA", ex10, { [n]: { cards: [{ card: "Second Yellow card", side: "a" }] } })).red_card.unlocked, true);
  // injury time pushes 84'+2 over the 85' line; 84' alone does not
  assert.equal(byId(computeAchievements("AA", ex10, { [n]: { scorers: [{ minute: 84, injury: 2, side: "h" }] } })).late_show.unlocked, true);
  assert.equal(byId(computeAchievements("AA", ex10, { [n]: { scorers: [{ minute: 84, side: "h" }] } })).late_show.unlocked, false);
});

test("monotonic under out-of-order settlement: false_start can't be revoked by a late earlier result", () => {
  const ns = CHRONO.slice(0, 4).map((m) => m.n);
  const tips = { AA: { [ns[0]]: { h: "1", a: "1" }, [ns[1]]: { h: "0", a: "1" }, [ns[2]]: { h: "0", a: "1" }, [ns[3]]: { h: "0", a: "1" } } };
  // STATE A: matches 2,3,4 settle first (home wins → AA blank), the earliest match 1 still pending.
  // Its plausible tip OCCUPIES the first slot (membership fixed at tip time) → Fehlstart stays locked.
  assert.equal(byId(computeAchievements("AA", { tips, results: { [ns[1]]: { h: "1", a: "0" }, [ns[2]]: { h: "1", a: "0" }, [ns[3]]: { h: "1", a: "0" } } })).false_start, undefined);
  // STATE B: match 1 finally settles as an exact hit → membership {hit,0,0} → never all-zero → still locked (never spuriously unlocked)
  assert.equal(byId(computeAchievements("AA", { tips, results: { [ns[0]]: { h: "1", a: "1" }, [ns[1]]: { h: "1", a: "0" }, [ns[2]]: { h: "1", a: "0" }, [ns[3]]: { h: "1", a: "0" } } })).false_start, undefined);
});

test("monotonic under out-of-order settlement: a pending gap match keeps the Phönix run broken", () => {
  const ns = CHRONO.slice(0, 7).map((m) => m.n);
  const tips = { AA: {} };
  for (let i = 0; i < 5; i++) tips.AA[ns[i]] = { h: "0", a: "1" }; // 5 pointless
  tips.AA[ns[5]] = { h: "3", a: "0" };                            // gap match (will be a tendency-only hit)
  tips.AA[ns[6]] = { h: "2", a: "1" };                            // the Volltreffer
  const resA = {}; for (let i = 0; i < 5; i++) resA[ns[i]] = { h: "1", a: "0" }; resA[ns[6]] = { h: "2", a: "1" };
  // gap match 6 still pending → the run is broken by the pending tip → no premature phoenix
  assert.equal(byId(computeAchievements("AA", { tips, results: resA })).phoenix.unlocked, false);
  // gap match 6 settles as pt=1 → still breaks the run → still no phoenix (never flipped 1→0)
  assert.equal(byId(computeAchievements("AA", { tips, results: { ...resA, [ns[5]]: { h: "1", a: "0" } } })).phoenix.unlocked, false);
});

test("false_start slot rule: a leading implausible farm tip does not occupy a slot", () => {
  const ns = CHRONO.slice(0, 4).map((m) => m.n);
  const tips = { AA: { [ns[0]]: { h: "9", a: "0" }, [ns[1]]: { h: "0", a: "2" }, [ns[2]]: { h: "0", a: "2" }, [ns[3]]: { h: "0", a: "2" } } };
  const results = { [ns[0]]: { h: "9", a: "0" }, [ns[1]]: { h: "2", a: "0" }, [ns[2]]: { h: "2", a: "0" }, [ns[3]]: { h: "2", a: "0" } };
  // the implausible 9:0 (an exact hit, even) is skipped → the 3 plausible zeros after it unlock Fehlstart
  assert.equal(byId(computeAchievements("AA", { tips, results })).false_start?.unlocked, true);
});

test("plausibility gate covers the field-relative fails (lone_loser/herd): farm blocked, plausible counts", () => {
  const ns3 = CHRONO.slice(0, 3).map((m) => m.n);
  // herd: AA + the majority all tip home and lose (target 3)
  const herd = (aa) => { const tips = { AA: {}, BB: {}, CC: {} }, results = {}; for (const n of ns3) { tips.AA[n] = aa; tips.BB[n] = { h: "1", a: "0" }; tips.CC[n] = { h: "2", a: "0" }; results[n] = { h: "0", a: "1" }; } return { tips, results }; };
  assert.equal(byId(computeAchievements("AA", herd({ h: "1", a: "0" }))).herd.unlocked, true);
  assert.equal(byId(computeAchievements("AA", herd({ h: "9", a: "0" }))).herd, undefined);
  // lone_loser (Versager des Tages): sole player to finish a fully-decided matchday on 0 points (target 1)
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const day = Object.values(byDay)[0]; // a fully-decided day; AA loses all, the field scores
  const lone = (aa) => { const tips = { AA: {}, BB: {}, CC: {} }, results = {}; for (const m of day) { tips.AA[m.n] = aa; tips.BB[m.n] = { h: "0", a: "1" }; tips.CC[m.n] = { h: "0", a: "1" }; results[m.n] = { h: "0", a: "1" }; } return { tips, results }; };
  assert.equal(byId(computeAchievements("AA", lone({ h: "1", a: "0" }))).lone_loser.unlocked, true);  // plausible wrong tip → sole 0 → unlocks
  assert.equal(byId(computeAchievements("AA", lone({ h: "9", a: "0" }))).lone_loser, undefined);      // farm tip → no genuine attempt → hidden
});

test("zero-run isn't glued across a SCORED implausible tip (no false ice_cold; phoenix still fires)", () => {
  const tips = {}, results = {};
  for (let i = 0; i < 6; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "1" }; results[n] = { h: "1", a: "0" }; } // 6 plausible pointless
  const mid = CHRONO[6].n; tips[mid] = { h: "6", a: "0" }; results[mid] = { h: "6", a: "0" };                          // a NAILED implausible blowout (+3)
  for (let i = 7; i < 13; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "1" }; results[n] = { h: "1", a: "0" }; } // 6 more pointless
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.equal(a.cold_streak.unlocked, true);  // a genuine run of 6 → cold_streak (6)
  assert.equal(a.ice_cold, undefined);         // but the scored game breaks the run → NOT 12 in a row → still hidden
  assert.equal(a.phoenix.unlocked, true);      // a real Volltreffer after ≥5 pointless games
});

test("a matchday with an implausible WIN is not counted as 'leer' (no false washout)", () => {
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const day = Object.values(byDay).find((ms) => ms.length >= 2);
  const mk = (winNode) => {
    const tips = { AA: {} }, results = {};
    for (const m of day) { tips.AA[m.n] = { h: "0", a: "1" }; results[m.n] = { h: "1", a: "0" }; } // all plausible losses
    if (winNode) { tips.AA[winNode] = { h: "6", a: "0" }; results[winNode] = { h: "6", a: "0" }; }  // one NAILED implausible blowout
    return { tips, results };
  };
  assert.equal(byId(computeAchievements("AA", mk(day[0].n))).washout, undefined); // scored that day → not leer
  assert.equal(byId(computeAchievements("AA", mk(null))).washout.unlocked, true); // all-losses → genuinely leer
});

test("FUZZ: per-day attribution sums to the total (all-days replay, Spielverlauf + farm tips)", () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const R = (n) => Math.floor(rnd() * n);
  const KO = ["R32", "R16", "QF", "SF", "P3", "FIN"], PLAYERS = ["AA", "BB", "CC"];
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const days = Object.keys(byDay).sort();
  for (let it = 0; it < 150; it++) {
    const sub = CHRONO.slice(0, 8 + R(40));
    const tips = {}; for (const k of PLAYERS) tips[k] = {};
    const results = {}, details = {};
    for (const m of sub) {
      if (rnd() < 0.85) {
        const h = R(6), a = R(6); results[m.n] = { h: String(h), a: String(a) };
        if (KO.includes(m.ph) && h === a && rnd() < 0.7) details[m.n] = { shootout: { home: [{ scored: true }], away: [{ scored: false }] }, scorers: [], cards: [] };
        else { const sc = []; for (let g = 0; g < h + a; g++) sc.push({ minute: 1 + R(95), injury: R(5), side: rnd() < 0.5 ? "h" : "a", type: rnd() < 0.1 ? "own" : null }); details[m.n] = { scorers: sc, cards: rnd() < 0.3 ? [{ card: "Red Card", side: "a" }] : [] }; }
      }
      for (const k of PLAYERS) if (rnd() < 0.9) { const farm = rnd() < 0.15; tips[k][m.n] = { h: String(farm ? R(12) : R(5)), a: String(farm ? R(12) : R(5)) }; }
    }
    const st = { tips, results };
    const daysAsc = days.map((d) => ({ day: d, matchNs: byDay[d].map((m) => m.n) })); // ALL days, like matchdayBreakdown
    const perDay = achievementPointsByDay(st, daysAsc, details);
    for (const k of PLAYERS) {
      const total = achievementPoints(k, st, details);
      let summed = 0; for (const d of Object.values(perDay)) { const v = d[k] || 0; assert.ok(v >= 0, `delta>=0 it=${it} k=${k}`); summed += v; }
      assert.equal(summed, total, `sum==total it=${it} k=${k}`);
    }
  }
});

test("FUZZ: every unlock is monotonic under arbitrary-order settlement (result, then Spielverlauf)", () => {
  let seed = 99999; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const R = (n) => Math.floor(rnd() * n);
  const KO = ["R32", "R16", "QF", "SF", "P3", "FIN"], PLAYERS = ["AA", "BB"];
  const idsOf = (k, st, det) => new Set(computeAchievements(k, st, det).filter((x) => x.unlocked && x.id && !String(x.id).startsWith("hidden")).map((x) => x.id));
  for (let it = 0; it < 200; it++) {
    const sub = CHRONO.slice(0, 8 + R(30));
    const tips = {}; for (const k of PLAYERS) tips[k] = {};
    for (const m of sub) for (const k of PLAYERS) if (rnd() < 0.9) { const farm = rnd() < 0.15; tips[k][m.n] = { h: String(farm ? R(12) : R(5)), a: String(farm ? R(12) : R(5)) }; }
    const order = [], finalRes = {}, finalDet = {};
    for (const m of sub) if (rnd() < 0.85) {
      const h = R(6), a = R(6); finalRes[m.n] = { h: String(h), a: String(a) }; order.push(m.n);
      if (KO.includes(m.ph) && h === a && rnd() < 0.7) finalDet[m.n] = { shootout: { home: [{ scored: true }], away: [] }, scorers: [], cards: [] };
      else { const sc = []; for (let g = 0; g < h + a; g++) sc.push({ minute: 1 + R(95), injury: R(5), side: rnd() < 0.5 ? "h" : "a", type: rnd() < 0.1 ? "own" : null }); finalDet[m.n] = { scorers: sc, cards: rnd() < 0.3 ? [{ card: "Red Card", side: "a" }] : [] }; }
    }
    for (let i = order.length - 1; i > 0; i--) { const j = R(i + 1); [order[i], order[j]] = [order[j], order[i]]; } // random settlement order
    const results = {}, details = {}, seen = {}; for (const k of PLAYERS) seen[k] = new Set();
    const apply = () => { for (const k of PLAYERS) { const now = idsOf(k, { tips, results }, details); for (const id of seen[k]) assert.ok(now.has(id), `monotonic: ${k} kept ${id} (it=${it})`); for (const id of now) seen[k].add(id); } };
    for (const n of order) { results[n] = finalRes[n]; apply(); details[n] = finalDet[n]; apply(); } // result lands, then its Spielverlauf
  }
});

test("Pleiten/Nieten are hidden until unlocked (Steam-style); wins always visible", () => {
  // no results → every fail locked → masked stub, NO detail leaks
  const none = computeAchievements("AA", { tips: { AA: {} }, results: {} });
  const fails = none.filter((x) => x.kind === "fail");
  assert.equal(fails.length, 12);
  assert.ok(fails.every((x) => x.hidden === true && !x.unlocked && !x.label && !x.description && x.points == null && !x.progress), "locked fails leak nothing");
  assert.ok(none.filter((x) => x.kind === "win").every((x) => !x.hidden && x.label), "wins stay visible");
  // unlock one fail (5 wrong tips → Nietenstart) → revealed in full; the rest stay hidden
  const tips = {}, results = {};
  for (let i = 0; i < 5; i++) { const n = CHRONO[i].n; tips[n] = { h: "0", a: "1" }; results[n] = { h: "1", a: "0" }; }
  const a = byId(computeAchievements("AA", { tips: { AA: tips }, results }));
  assert.ok(a.first_zero?.unlocked && a.first_zero.hidden === false && a.first_zero.label);
  assert.equal(a.ice_cold, undefined); // still hidden
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
  // 3 consecutive blank days → unlocked (revealed)
  assert.equal(byId(computeAchievements("AA", fill([0, 1, 2], new Set([0, 1, 2])))).cellar_regular.unlocked, true);
  // blank, scored, blank, blank → longest consecutive = 2 → not unlocked → stays hidden
  const a = byId(computeAchievements("AA", fill([0, 1, 2, 3], new Set([0, 2, 3]))));
  assert.equal(a.cellar_regular, undefined);
});

test("fail day-badges credit only a FULLY decided day (monotonic across staggered kickoffs)", async () => {
  const { computeAchievements } = await import("../services/achievements.js");
  const byDay = {}; for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const day = Object.values(byDay).find((ms) => ms.length >= 3); // a full multi-match day
  const last = day[day.length - 1].n;
  const wash = (st) => byId(computeAchievements("AA", st)).washout?.unlocked === true; // hidden while locked
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
