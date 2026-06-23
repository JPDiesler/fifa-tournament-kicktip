// Achievements & Streaks — server-authoritative (single source of truth for BOTH the
// displayed badges AND the push, AND because they are points-relevant: achievementPoints()
// is folded into leaderboard() like the champion bonus). Derived purely from tips + results
// (no extra state). Unlock conditions are MONOTONIC (once earned, stays earned) so the
// push can fire once per (player, achievement) via the markSentOnce ledger.
import { MATCHES } from "../data.js";
import { score } from "./scoring.js";

// Chronological match order for streak detection (dt is ISO-ish "YYYY-MM-DDTHH:MM" → sorts
// lexicographically = chronologically; tie-break on the static number).
const CHRONO = [...MATCHES].sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.n - b.n));

const longestRun = (flags) => { let best = 0, run = 0; for (const v of flags) { if (v) { run++; if (run > best) best = run; } else run = 0; } return best; };
// tip/result tendency: 1 home, -1 away, 0 draw, null if not (fully) given. Scores are strings.
const tendency = (t) => { if (!t || t.h === "" || t.a === "" || t.h == null || t.a == null) return null; const d = Number(t.h) - Number(t.a); return d > 0 ? 1 : d < 0 ? -1 : 0; };
const hasResult = (r) => r && r.h !== "" && r.a !== "" && r.h != null && r.a != null;

// The catalog: each entry exposes label/description/points (server is the source of truth
// for the copy too — the web only maps id → lucide icon). `measure(m)` returns the current
// MONOTONIC progress value; unlocked = measure >= target; the meter shows min(measure,target).
export const ACHIEVEMENTS = [
  { id: "first_exact", label: "Erster Volltreffer", description: "Tippe ein Spiel exakt richtig.", points: 1, target: 1, measure: (m) => m.exact },
  { id: "sharpshooter", label: "Scharfschütze", description: "10 exakte Ergebnisse über das Turnier.", points: 2, target: 10, measure: (m) => m.exact },
  { id: "clairvoyant", label: "Hellseher", description: "25 exakte Ergebnisse über das Turnier.", points: 3, target: 25, measure: (m) => m.exact },
  { id: "hot_streak", label: "Heißer Lauf", description: "5 Spiele in Folge mit mindestens einem Punkt.", points: 2, target: 5, measure: (m) => m.longestPointRun },
  { id: "unstoppable", label: "Unaufhaltsam", description: "10 Spiele in Folge mit mindestens einem Punkt.", points: 3, target: 10, measure: (m) => m.longestPointRun },
  { id: "hattrick", label: "Hattrick-Orakel", description: "3 exakte Ergebnisse in Folge.", points: 2, target: 3, measure: (m) => m.longestExactRun },
  { id: "matchday_winner", label: "Spieltagssieger", description: "Hol an einem Spieltag die meisten Punkte.", points: 2, target: 1, measure: (m) => m.matchdayWins },
  { id: "perfect_day", label: "Perfekter Spieltag", description: "An einem Spieltag mit ≥2 Spielen alle exakt tippen.", points: 3, target: 1, measure: (m) => m.perfectDays },
  { id: "big_day", label: "Großer Wurf", description: "Hol 8+ Punkte an einem einzigen Spieltag.", points: 3, target: 8, measure: (m) => m.bestDayPts },
  { id: "lone_wolf", label: "Einzelkämpfer", description: "Als Einzige(r) in einem Spiel punkten.", points: 2, target: 1, measure: (m) => m.loneWolf },
  { id: "against_the_grain", label: "Gegen den Strom", description: "Tendenz gegen die Mehrheit richtig tippen.", points: 2, target: 1, measure: (m) => m.contrarian },
  { id: "regular", label: "Dauergast", description: "Gib für 40 Spiele einen Tipp ab.", points: 1, target: 40, measure: (m) => m.tipped },
];

// All monotonic metrics for one player, from the full state (`st.tips` of EVERY player +
// `st.results`). O(players × matches) — negligible for a private pool.
function metrics(kuerzel, st) {
  const tips = st.tips?.[kuerzel] || {}, results = st.results || {};
  const allK = Object.keys(st.tips || {}), others = allK.filter((k) => k !== kuerzel);

  let exact = 0, tipped = 0;
  const pointFlags = [], exactFlags = [];
  for (const m of CHRONO) {
    const t = tips[m.n];
    if (t && t.h !== "" && t.a !== "" && t.h != null && t.a != null) tipped++;
    const pt = score(t, results[m.n]);
    if (pt === null) continue;
    if (pt === 3) exact++;
    pointFlags.push(pt >= 1 ? 1 : 0); exactFlags.push(pt === 3 ? 1 : 0);
  }

  // matchday wins (shared top counts) + perfect days, grouped by calendar day.
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const dayPts = (k, ms) => { let pts = 0, any = false; for (const m of ms) { const p = score(st.tips[k]?.[m.n], results[m.n]); if (p !== null) { pts += p; any = true; } } return any ? pts : null; };
  let matchdayWins = 0, perfectDays = 0, bestDayPts = 0;
  for (const ms of Object.values(byDay)) {
    const mine = dayPts(kuerzel, ms);
    if (mine != null) {
      if (mine > bestDayPts) bestDayPts = mine;
      let top = -1;
      for (const k of allK) { const p = dayPts(k, ms); if (p != null && p > top) top = p; }
      if (top > 0 && mine === top) matchdayWins++;
    }
    if (ms.length >= 2) {
      const scored = ms.map((m) => score(tips[m.n], results[m.n])).filter((p) => p !== null);
      if (scored.length >= 2 && scored.every((p) => p === 3)) perfectDays++;
    }
  }

  // lone wolf (only scorer) + contrarian (correct tendency vs. a field majority that differed).
  let loneWolf = 0, contrarian = 0;
  for (const m of CHRONO) {
    const res = results[m.n]; if (!hasResult(res)) continue;
    const myPt = score(tips[m.n], res);
    if (myPt != null && myPt > 0 && !others.some((k) => { const p = score(st.tips[k]?.[m.n], res); return p != null && p > 0; })) loneWolf++;
    const myTen = tendency(tips[m.n]);
    if (myTen != null && myTen === tendency(res)) {
      const tens = others.map((k) => tendency(st.tips[k]?.[m.n])).filter((t) => t != null);
      if (tens.length >= 2 && tens.filter((t) => t === myTen).length / tens.length < 0.5) contrarian++;
    }
  }

  return { exact, tipped, bestDayPts, longestPointRun: longestRun(pointFlags), longestExactRun: longestRun(exactFlags), matchdayWins, perfectDays, loneWolf, contrarian };
}

// Per-player achievement state for the UI: id/label/description/points + unlocked + progress.
export function computeAchievements(kuerzel, st) {
  const m = metrics(kuerzel, st);
  return ACHIEVEMENTS.map((a) => {
    const raw = a.measure(m), current = Math.min(raw, a.target);
    return { id: a.id, label: a.label, description: a.description, points: a.points, unlocked: raw >= a.target, progress: { current, target: a.target } };
  });
}
// Total bonus points from unlocked achievements (folded into the leaderboard like CHAMP_BONUS).
export function achievementPoints(kuerzel, st) {
  const m = metrics(kuerzel, st);
  return ACHIEVEMENTS.reduce((s, a) => s + (a.measure(m) >= a.target ? a.points : 0), 0);
}
