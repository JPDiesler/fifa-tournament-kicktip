// Achievements & Streaks — server-authoritative (single source of truth for BOTH the
// displayed badges AND the push, AND because they are points-relevant: achievementPoints()
// is folded into leaderboard() like the champion bonus). Derived purely from tips + results
// (no extra state). Unlock conditions are MONOTONIC (once earned, stays earned) so the push
// can fire once per (player, achievement) and the per-matchday attribution stays consistent.
//
// Two kinds: "win" (reward skill, small points) and "fail" (reward bad luck / blunders with
// BIGGER points) — the fail badges act as a rubber-band equalizer: laggards earn them, leaders
// don't, so the table tightens.
import { MATCHES } from "../data.js";
import { score } from "./scoring.js";

// Chronological match order for streak detection (dt is ISO-ish "YYYY-MM-DDTHH:MM" → sorts
// lexicographically = chronologically; tie-break on the static number).
const CHRONO = [...MATCHES].sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.n - b.n));

const longestRun = (flags) => { let best = 0, run = 0; for (const v of flags) { if (v) { run++; if (run > best) best = run; } else run = 0; } return best; };
// Trailing run (the CURRENT, resettable streak) — for the live badge display only; the
// UNLOCK always uses longestRun, so an earned badge can never be lost.
const currentRun = (flags) => { let r = 0; for (let i = flags.length - 1; i >= 0; i--) { if (flags[i]) r++; else break; } return r; };
// tip/result tendency: 1 home, -1 away, 0 draw, null if not (fully) given. Scores are strings.
const tendency = (t) => { if (!t || t.h === "" || t.a === "" || t.h == null || t.a == null) return null; const d = Number(t.h) - Number(t.a); return d > 0 ? 1 : d < 0 ? -1 : 0; };
const hasResult = (r) => r && r.h !== "" && r.a !== "" && r.h != null && r.a != null;

// The catalog: each entry exposes kind/label/description/points (server owns the copy; the web
// only maps id → lucide icon). `measure(m)` returns the current MONOTONIC progress value;
// unlocked = measure >= target; the meter shows min(measure, target).
export const ACHIEVEMENTS = [
  // --- wins (skill; small points) ---
  { id: "first_exact", kind: "win", label: "Erster Volltreffer", description: "Tippe ein Spiel exakt richtig.", points: 1, target: 1, measure: (m) => m.exact },
  { id: "sharpshooter", kind: "win", label: "Scharfschütze", description: "15 exakte Ergebnisse über das Turnier.", points: 2, target: 15, measure: (m) => m.exact },
  { id: "clairvoyant", kind: "win", label: "Hellseher", description: "25 exakte Ergebnisse über das Turnier.", points: 3, target: 25, measure: (m) => m.exact },
  { id: "hot_streak", kind: "win", label: "Heißer Lauf", description: "5 Spiele in Folge mit mindestens einem Punkt.", points: 2, target: 5, streak: true, measure: (m) => m.longestPointRun, currentMeasure: (m) => m.currentPointRun },
  { id: "unstoppable", kind: "win", label: "Unaufhaltsam", description: "10 Spiele in Folge mit mindestens einem Punkt.", points: 3, target: 10, streak: true, measure: (m) => m.longestPointRun, currentMeasure: (m) => m.currentPointRun },
  { id: "hattrick", kind: "win", label: "Hattrick-Orakel", description: "3 exakte Ergebnisse in Folge.", points: 2, target: 3, streak: true, measure: (m) => m.longestExactRun, currentMeasure: (m) => m.currentExactRun },
  { id: "matchday_winner", kind: "win", label: "Spieltagssieger", description: "Hol an 3 Spieltagen die meisten Punkte.", points: 3, target: 3, measure: (m) => m.matchdayWins },
  { id: "perfect_day", kind: "win", label: "Perfekter Spieltag", description: "An einem Spieltag mit ≥2 Spielen alle exakt tippen.", points: 3, target: 1, measure: (m) => m.perfectDays },
  { id: "big_day", kind: "win", label: "Großer Wurf", description: "Hol 10+ Punkte an einem einzigen Spieltag.", points: 4, target: 10, measure: (m) => m.bestDayPts },
  { id: "lone_wolf", kind: "win", label: "Einzelkämpfer", description: "Als Einzige(r) in 2 Spielen punkten.", points: 3, target: 2, measure: (m) => m.loneWolf },
  { id: "against_the_grain", kind: "win", label: "Gegen den Strom", description: "3-mal die Tendenz gegen die Mehrheit richtig tippen.", points: 3, target: 3, measure: (m) => m.contrarian },
  { id: "regular", kind: "win", label: "Dauergast", description: "Sei bei 75 gewerteten Spielen mit einem Tipp dabei.", points: 2, target: 75, measure: (m) => m.tipped },
  // --- fails (bad luck / blunders; BIGGER points → equalizer) ---
  { id: "first_zero", kind: "fail", label: "Nietenstart", description: "Liege bei 3 Tipps komplett daneben.", points: 4, target: 3, measure: (m) => m.zeroCount },
  { id: "cold_streak", kind: "fail", label: "Pechvogel", description: "5 Spiele in Folge ohne einen Punkt.", points: 5, target: 5, streak: true, measure: (m) => m.longestZeroRun, currentMeasure: (m) => m.currentZeroRun },
  { id: "ice_cold", kind: "fail", label: "Totalausfall", description: "10 Spiele in Folge ohne einen Punkt.", points: 8, target: 10, streak: true, measure: (m) => m.longestZeroRun, currentMeasure: (m) => m.currentZeroRun },
  { id: "zero_collector", kind: "fail", label: "Nieten-Sammler", description: "25 Tipps komplett daneben.", points: 5, target: 25, measure: (m) => m.zeroCount },
  { id: "black_hole", kind: "fail", label: "Schwarzes Loch", description: "30 Tipps komplett daneben.", points: 7, target: 30, measure: (m) => m.zeroCount },
  { id: "washout", kind: "fail", label: "Rabenschwarzer Tag", description: "Geh an einem Spieltag mit ≥2 Tipps komplett leer aus.", points: 5, target: 1, measure: (m) => m.badDays },
  { id: "total_blackout", kind: "fail", label: "Komplett-Blackout", description: "Geh an einem Spieltag mit ≥3 Tipps komplett leer aus.", points: 7, target: 1, measure: (m) => m.bigBadDays },
  { id: "cellar_regular", kind: "fail", label: "Nullrunden-Abo", description: "Geh an 3 Spieltagen IN FOLGE komplett leer aus.", points: 6, target: 3, streak: true, measure: (m) => m.longestZeroDayRun, currentMeasure: (m) => m.currentZeroDayRun },
  { id: "lone_loser", kind: "fail", label: "Versager des Tages", description: "Als Einzige(r) in 2 Spielen leer ausgehen.", points: 6, target: 2, measure: (m) => m.loneLoser },
  { id: "herd", kind: "fail", label: "Herdentier", description: "3-mal mit der Mehrheit auf die falsche Tendenz tippen.", points: 4, target: 3, measure: (m) => m.herd },
  { id: "false_start", kind: "fail", label: "Fehlstart", description: "Verpatze deine ersten 3 gewerteten Tipps (alle null).", points: 5, target: 1, measure: (m) => m.falseStart },
  { id: "anti_talent", kind: "fail", label: "Antitalent", description: "Tippe 8-mal den Sieger genau falschherum.", points: 5, target: 8, measure: (m) => m.wrongTendency },
];

// All monotonic metrics for one player, from the full state (`st.tips` of EVERY player +
// `st.results`). O(players × matches) — negligible for a private pool.
function metrics(kuerzel, st) {
  const tips = st.tips?.[kuerzel] || {}, results = st.results || {};
  const allK = Object.keys(st.tips || {}), others = allK.filter((k) => k !== kuerzel);

  let exact = 0, tipped = 0, zeroCount = 0, wrongTendency = 0;
  const pointFlags = [], exactFlags = [], zeroFlags = [], firstTipped = [];
  for (const m of CHRONO) {
    const t = tips[m.n];
    const complete = t && t.h !== "" && t.a !== "" && t.h != null && t.a != null;
    if (complete && firstTipped.length < 3) firstTipped.push(score(t, results[m.n])); // first 3 CHRONO matches tipped (null until played → stable membership)
    const pt = score(t, results[m.n]);
    if (pt === null) continue;
    tipped++; // a tipped match that has been PLAYED → grows chronologically and matches the chart attribution exactly
    if (pt === 3) exact++;
    if (pt === 0) zeroCount++;
    pointFlags.push(pt >= 1 ? 1 : 0); exactFlags.push(pt === 3 ? 1 : 0); zeroFlags.push(pt === 0 ? 1 : 0);
    const mt = tendency(t), rt = tendency(results[m.n]);
    if (mt != null && rt != null && mt !== 0 && rt !== 0 && mt !== rt) wrongTendency++; // predicted a winner, the other side won
  }
  // Fehlstart: the first 3 CHRONO-tipped matches are all settled and all 0 (frozen once those 3 are played).
  const falseStart = firstTipped.length === 3 && firstTipped.every((p) => p === 0) ? 1 : 0;

  // per-day (chronological): matchday wins, perfect days, best haul, leer-ausgegangen (washout)
  // tiers, and the blank-day flag sequence for the CONSECUTIVE Nullrunden-Abo run.
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const dayPts = (k, ms) => { let pts = 0, any = false; for (const m of ms) { const p = score(st.tips[k]?.[m.n], results[m.n]); if (p !== null) { pts += p; any = true; } } return any ? pts : null; };
  let matchdayWins = 0, perfectDays = 0, bestDayPts = 0, badDays = 0, bigBadDays = 0;
  const dayBlankFlags = []; // per fully-decided day the player took part in: 1 = went leer (0 pts), 0 = scored
  for (const dk of Object.keys(byDay).sort()) {
    const ms = byDay[dk];
    let myPts = 0, myScored = 0;
    for (const m of ms) { const p = score(tips[m.n], results[m.n]); if (p !== null) { myPts += p; myScored++; } }
    if (myScored > 0 && myPts > bestDayPts) bestDayPts = myPts; // monotonic on its own: a day's points only accrue
    // The who-topped / leer-ausgegangen aggregates only become FINAL once every match of the day is
    // settled — credit them only then, else they'd flip true→false mid-day (staggered kickoffs) and
    // break the once-only push + chronological attribution. (Days resolve forward; admin edits aside.)
    if (!ms.every((m) => hasResult(results[m.n]))) continue;
    if (myScored > 0) {
      let top = -1;
      for (const k of allK) { const p = dayPts(k, ms); if (p != null && p > top) top = p; }
      if (top > 0 && myPts === top) matchdayWins++;
      const blank = myPts === 0;
      dayBlankFlags.push(blank ? 1 : 0); // ordered → longest/current run = consecutive blank matchdays
      if (blank) { if (myScored >= 2) badDays++; if (myScored >= 3) bigBadDays++; }
    }
    if (ms.length >= 2) {
      const scored = ms.map((m) => score(tips[m.n], results[m.n])).filter((p) => p !== null);
      if (scored.length >= 2 && scored.every((p) => p === 3)) perfectDays++;
    }
  }

  // field-relative, per scored match: lone wolf / lone loser + contrarian / herd.
  let loneWolf = 0, loneLoser = 0, contrarian = 0, herd = 0;
  for (const m of CHRONO) {
    const res = results[m.n]; if (!hasResult(res)) continue;
    const myPt = score(tips[m.n], res);
    const oth = others.map((k) => score(st.tips[k]?.[m.n], res)).filter((p) => p != null);
    if (myPt != null && myPt > 0 && oth.length && !oth.some((p) => p > 0)) loneWolf++;
    if (myPt === 0 && oth.length && oth.every((p) => p > 0)) loneLoser++;
    const myTen = tendency(tips[m.n]), resTen = tendency(res);
    if (myTen != null) {
      const tens = others.map((k) => tendency(st.tips[k]?.[m.n])).filter((t) => t != null);
      if (tens.length >= 2) {
        const shared = tens.filter((t) => t === myTen).length / tens.length;
        if (myTen === resTen && shared < 0.5) contrarian++;  // right call, most of the field went elsewhere
        if (myTen !== resTen && shared > 0.5) herd++;        // wrong call, but most of the field went with you
      }
    }
  }

  return {
    exact, tipped, zeroCount, wrongTendency, falseStart,
    longestPointRun: longestRun(pointFlags), longestExactRun: longestRun(exactFlags), longestZeroRun: longestRun(zeroFlags),
    currentPointRun: currentRun(pointFlags), currentExactRun: currentRun(exactFlags), currentZeroRun: currentRun(zeroFlags),
    longestZeroDayRun: longestRun(dayBlankFlags), currentZeroDayRun: currentRun(dayBlankFlags),
    matchdayWins, perfectDays, bestDayPts, badDays, bigBadDays,
    loneWolf, loneLoser, contrarian, herd,
  };
}

// Per-player achievement state for the UI: id/kind/label/description/points + unlocked + progress.
// Streak badges are still earned by the LONGEST run (monotonic → never lost once earned), but the
// meter follows the CURRENT run while still locked so the UI visibly resets when a streak breaks.
export function computeAchievements(kuerzel, st) {
  const m = metrics(kuerzel, st);
  return ACHIEVEMENTS.map((a) => {
    const raw = a.measure(m), unlocked = raw >= a.target;
    const out = { id: a.id, kind: a.kind, label: a.label, description: a.description, points: a.points, unlocked };
    if (a.streak) {
      const cur = a.currentMeasure(m);
      out.streak = true;
      out.current = Math.min(cur, a.target); // live current run (resets on a break)
      out.progress = { current: unlocked ? a.target : Math.min(cur, a.target), target: a.target };
    } else {
      out.progress = { current: Math.min(raw, a.target), target: a.target };
    }
    return out;
  });
}
// Total bonus points from unlocked achievements (folded into the leaderboard like CHAMP_BONUS).
export function achievementPoints(kuerzel, st) {
  const m = metrics(kuerzel, st);
  return ACHIEVEMENTS.reduce((s, a) => s + (a.measure(m) >= a.target ? a.points : 0), 0);
}

// Per-matchday attribution: how many achievement points each player NEWLY earned on each day,
// by replaying the (monotonic) total against a state cut to the matches played up to that day.
// `daysAsc` = [{ day, matchNs }] oldest-first. Returns { [day]: { [kuerzel]: deltaPts } }.
// Deltas are ≥ 0 and sum (over days) to achievementPoints() — so the charts add up exactly.
export function achievementPointsByDay(st, daysAsc) {
  const allK = Object.keys(st.tips || {});
  const seen = new Set();
  const prev = {}; for (const k of allK) prev[k] = 0;
  const out = {};
  for (const { day, matchNs } of daysAsc) {
    for (const n of matchNs) seen.add(n);
    const cut = { tips: {}, results: {} };
    for (const n of seen) if (st.results[n]) cut.results[n] = st.results[n];
    for (const k of allK) { const t = st.tips[k] || {}, ct = {}; for (const n of seen) if (t[n]) ct[n] = t[n]; cut.tips[k] = ct; }
    const d = {};
    for (const k of allK) { const p = achievementPoints(k, cut); d[k] = p - prev[k]; prev[k] = p; }
    out[day] = d;
  }
  return out;
}
