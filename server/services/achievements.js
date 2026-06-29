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

// tip/result tendency: 1 home, -1 away, 0 draw, null if not (fully) given. Scores are strings.
const tendency = (t) => { if (!t || t.h === "" || t.a === "" || t.h == null || t.a == null) return null; const d = Number(t.h) - Number(t.a); return d > 0 ? 1 : d < 0 ? -1 : 0; };
const hasResult = (r) => r && r.h !== "" && r.a !== "" && r.h != null && r.a != null;

// A PLAUSIBLE tip is a realistic scoreline — used to gate the (lose-incentivised) hidden
// achievements so absurd farm-tips like 9:0 don't count. Genuine tips (mostly ≤3 each) pass.
// The boundary (≤5/side, ≤7 total) is deliberate: it blocks the unmistakable throws while still
// admitting real blowout tips. A determined farmer could still tip extreme-but-legal scorelines
// (5:0) on obvious favourites — accepted for a small trusted pool, since it demands conscious,
// repeated self-sabotage across dozens of matches against the raised thresholds.
const PLAUS_MAX_SIDE = 5, PLAUS_MAX_TOTAL = 7;
const plausible = (t) => {
  if (!t || t.h === "" || t.a === "" || t.h == null || t.a == null) return false;
  const h = Number(t.h), a = Number(t.a);
  return Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0 && h <= PLAUS_MAX_SIDE && a <= PLAUS_MAX_SIDE && h + a <= PLAUS_MAX_TOTAL;
};
const KO_PH = new Set(["R32", "R16", "QF", "SF", "P3", "FIN"]);
// --- Spielverlauf helpers (match_detail; best-effort — return falsy without data) ---
const lastGoalMinute = (d) => (d?.scorers?.length ? Math.max(...d.scorers.map((g) => (Number(g.minute) || 0) + (Number(g.injury) || 0))) : 0);
const hadRedCard = (d) => !!d?.cards?.some((c) => /red/i.test(c.card || "") || /second yellow/i.test(c.card || ""));
// Did the eventual winner (resTen: 1=home, −1=away) trail at some point? Replay the running
// score from the goal timeline (an own goal counts for the OTHER side).
const cameFromBehind = (d, resTen) => {
  if (!d?.scorers?.length || resTen === 0) return false;
  const seq = [...d.scorers].sort((x, y) => ((Number(x.minute) || 0) + (Number(x.injury) || 0)) - ((Number(y.minute) || 0) + (Number(y.injury) || 0)));
  let h = 0, a = 0;
  for (const g of seq) {
    const side = g.type === "own" ? (g.side === "h" ? "a" : "h") : g.side;
    if (side === "h") h++; else if (side === "a") a++;
    if ((resTen === 1 && h < a) || (resTen === -1 && a < h)) return true; // eventual winner trails here
  }
  return false;
};
// The goal log is COMPLETE when it reconstructs to the final score (own goals to the other side).
// Gates the order-sensitive comeback metric: a partial/late-arriving timeline gives a wrong running
// prefix, so we only judge "came from behind" once the scorers add up to the result — never before,
// so the unlock can't flip back (keeps it monotonic + the once-only push honest).
const detailComplete = (d, h, a) => {
  if (!d || !Array.isArray(d.scorers) || d.scorers.length !== h + a) return false; // every goal of the final score is logged
  let hg = 0, ag = 0;
  for (const g of d.scorers) {
    const side = g.type === "own" ? (g.side === "h" ? "a" : "h") : g.side;
    if (side === "h") hg++; else if (side === "a") ag++; else return false; // an unoriented goal → can't trust the prefix → stay locked (fail-safe)
  }
  return hg === h && ag === a;
};

// The catalog: each entry exposes kind/tier/label/description/points (server owns the copy; the web
// only maps id → lucide icon). `measure(m)` returns the current MONOTONIC progress value;
// unlocked = measure >= target; the meter shows min(measure, target).
//
// WIN tiers (rarity = points; the harder it is, the rarer AND the fewer points — wins favour the
// already-strong tippers, so they're kept small/tight to NARROW the spread; the fail equalizers
// carry the bigger points to help laggards catch up):
//   common (1) · rare/"Selten" (2) · epic/"Episch" (3)
export const ACHIEVEMENTS = [
  // --- wins · COMMON (1 pt) — most active tippers pick these up ---
  { id: "first_exact", kind: "win", tier: "common", label: "Erster Volltreffer", description: "Tippe ein Spiel exakt richtig.", points: 1, target: 1, measure: (m) => m.exact },
  { id: "hot_streak", kind: "win", tier: "common", label: "Heißer Lauf", description: "6 Spiele in Folge mit mindestens einem Punkt.", points: 1, target: 6, streak: true, measure: (m) => m.longestPointRun, currentMeasure: (m) => m.currentPointRun },
  { id: "blowout", kind: "win", tier: "common", label: "Kantersieg-Prophet", description: "Tippe ein Ergebnis mit 3+ Toren Differenz exakt.", points: 1, target: 1, measure: (m) => m.blowout },
  { id: "goal_fest", kind: "win", tier: "common", label: "Torfestival-Prophet", description: "Tippe ein Spiel mit 5+ Toren exakt.", points: 1, target: 1, measure: (m) => m.torfest },
  { id: "regular", kind: "win", tier: "common", label: "Dauergast", description: "Sei bei 90 gewerteten Spielen mit einem Tipp dabei.", points: 1, target: 90, measure: (m) => m.tipped },
  // --- wins · SELTEN (2 pt) — moderate skill or a rare call ---
  { id: "sharpshooter", kind: "win", tier: "rare", label: "Scharfschütze", description: "20 exakte Ergebnisse über das Turnier.", points: 2, target: 20, measure: (m) => m.exact },
  { id: "hattrick", kind: "win", tier: "rare", label: "Hattrick-Orakel", description: "3 exakte Ergebnisse in Folge.", points: 2, target: 3, streak: true, measure: (m) => m.longestExactRun, currentMeasure: (m) => m.currentExactRun },
  { id: "matchday_winner", kind: "win", tier: "rare", label: "Spieltagssieger", description: "Hol an 5 Spieltagen die meisten Punkte.", points: 2, target: 5, measure: (m) => m.matchdayWins },
  { id: "lone_wolf", kind: "win", tier: "rare", label: "Einzelkämpfer", description: "Als Einzige(r) in 3 Spielen punkten.", points: 2, target: 3, measure: (m) => m.loneWolf },
  { id: "against_the_grain", kind: "win", tier: "rare", label: "Gegen den Strom", description: "4-mal die Tendenz gegen die Mehrheit richtig tippen.", points: 2, target: 4, measure: (m) => m.contrarian },
  { id: "zero_zero", kind: "win", tier: "rare", label: "0:0-Hellseher", description: "Sag ein torloses 0:0 exakt voraus.", points: 2, target: 1, measure: (m) => m.zeroZero },
  { id: "red_card", kind: "win", tier: "rare", label: "Platzverweis-Prophet", description: "Tippe ein Spiel mit Platzverweis exakt.", points: 2, target: 1, measure: (m) => m.redCardGame },
  { id: "late_show", kind: "win", tier: "rare", label: "Last-Minute-Prophet", description: "Tippe ein Spiel exakt, in dem ab der 85. Minute noch ein Tor fällt.", points: 2, target: 1, measure: (m) => m.lateWinner },
  // --- wins · EPISCH (3 pt) — genuinely hard or rare ---
  { id: "clairvoyant", kind: "win", tier: "epic", label: "Hellseher", description: "30 exakte Ergebnisse über das Turnier.", points: 3, target: 30, measure: (m) => m.exact },
  { id: "unstoppable", kind: "win", tier: "epic", label: "Unaufhaltsam", description: "12 Spiele in Folge mit mindestens einem Punkt.", points: 3, target: 12, streak: true, measure: (m) => m.longestPointRun, currentMeasure: (m) => m.currentPointRun },
  { id: "perfect_day", kind: "win", tier: "epic", label: "Perfekter Spieltag", description: "An einem Spieltag mit ≥2 Spielen alle exakt tippen.", points: 3, target: 1, measure: (m) => m.perfectDays },
  { id: "big_day", kind: "win", tier: "epic", label: "Großer Wurf", description: "Hol 12+ Punkte an einem einzigen Spieltag.", points: 3, target: 12, measure: (m) => m.bestDayPts },
  { id: "phoenix", kind: "win", tier: "epic", label: "Phönix", description: "Lande direkt nach 5 punktlosen Spielen einen Volltreffer.", points: 3, target: 1, measure: (m) => m.phoenix },
  { id: "comeback", kind: "win", tier: "epic", label: "Comeback-Hellseher", description: "Sag einen Sieger richtig voraus, der einem Rückstand hinterherlief.", points: 3, target: 1, measure: (m) => m.comeback },
  { id: "penalty_prophet", kind: "win", tier: "epic", label: "Elfer-Prophet", description: "Tippe ein K.o.-Spiel richtig als Remis, das im Elfmeterschießen endet.", points: 3, target: 1, measure: (m) => m.elfer },
  // --- fails (bad luck / blunders; equalizer for laggards; plausibility-gated + hidden) ---
  { id: "first_zero", kind: "fail", label: "Nietenstart", description: "Liege bei 5 Tipps komplett daneben.", points: 3, target: 5, measure: (m) => m.zeroCount },
  { id: "cold_streak", kind: "fail", label: "Pechvogel", description: "6 Spiele in Folge ohne einen Punkt.", points: 3, target: 6, streak: true, measure: (m) => m.longestZeroRun, currentMeasure: (m) => m.currentZeroRun },
  { id: "ice_cold", kind: "fail", label: "Totalausfall", description: "12 Spiele in Folge ohne einen Punkt.", points: 6, target: 12, streak: true, measure: (m) => m.longestZeroRun, currentMeasure: (m) => m.currentZeroRun },
  { id: "zero_collector", kind: "fail", label: "Nieten-Sammler", description: "30 Tipps komplett daneben.", points: 5, target: 30, measure: (m) => m.zeroCount },
  { id: "black_hole", kind: "fail", label: "Schwarzes Loch", description: "45 Tipps komplett daneben.", points: 5, target: 45, measure: (m) => m.zeroCount },
  { id: "washout", kind: "fail", label: "Rabenschwarzer Tag", description: "Geh an einem Spieltag mit ≥2 Tipps komplett leer aus.", points: 1, target: 1, measure: (m) => m.badDays },
  { id: "total_blackout", kind: "fail", label: "Komplett-Blackout", description: "Geh an einem Spieltag mit ≥3 Tipps komplett leer aus.", points: 3, target: 1, measure: (m) => m.bigBadDays },
  { id: "cellar_regular", kind: "fail", label: "Nullrunden-Abo", description: "Geh an 3 Spieltagen IN FOLGE komplett leer aus.", points: 4, target: 3, streak: true, measure: (m) => m.longestZeroDayRun, currentMeasure: (m) => m.currentZeroDayRun },
  { id: "lone_loser", kind: "fail", label: "Versager des Tages", description: "Beende als Einzige(r) einen Spieltag ganz ohne Punkte.", points: 2, target: 1, measure: (m) => m.loneLoserDay },
  { id: "herd", kind: "fail", label: "Herdentier", description: "3-mal mit der Mehrheit auf die falsche Tendenz tippen.", points: 1, target: 3, measure: (m) => m.herd },
  { id: "false_start", kind: "fail", label: "Fehlstart", description: "Verpatze deine ersten 3 gewerteten Tipps (alle null).", points: 2, target: 1, measure: (m) => m.falseStart },
  { id: "anti_talent", kind: "fail", label: "Antitalent", description: "Tippe 3-mal das exakt spiegelverkehrte Ergebnis (z. B. 1:3 statt 3:1).", points: 5, target: 3, measure: (m) => m.mirrorCount },
];

// All monotonic metrics for one player, from the full state (`st.tips` of EVERY player +
// `st.results` + `st.resolved`) and the optional `details` (match_detail Spielverlauf, keyed by
// match number). Fail signals are PLAUSIBILITY-GATED so absurd farm-tips don't count.
// O(players × matches) — negligible for a private pool.
function metrics(kuerzel, st, details = {}) {
  const tips = st.tips?.[kuerzel] || {}, results = st.results || {};
  const allK = Object.keys(st.tips || {}), others = allK.filter((k) => k !== kuerzel);

  let exact = 0, tipped = 0, zeroCount = 0, mirrorCount = 0;
  let zeroZero = 0, torfest = 0, blowout = 0, phoenix = 0, lateWinner = 0, comeback = 0, redCardGame = 0, elfer = 0;
  let zStreak = 0; // running pointless streak, for Phönix
  // Streak runs as gap-aware running counters. A tipped-but-PENDING match is a GAP that breaks every
  // run, so a late-settling interior match can never glue two segments into a longer streak — that
  // keeps the longest-run unlocks MONOTONIC under out-of-order settlement. `*Best` = longest (unlock),
  // `*Cur` = run at the last settled match (the live meter; trailing future fixtures don't zero it).
  let pRun = 0, eRun = 0, zRun = 0, pBest = 0, eBest = 0, zBest = 0, pCur = 0, eCur = 0, zCur = 0;
  const firstPlaus = [];
  for (const m of CHRONO) {
    const t = tips[m.n], res = results[m.n], pl = plausible(t), tipped_ = t && t.h !== "" && t.a !== "" && t.h != null && t.a != null;
    const pt = score(t, res, st.resolved?.[m.n]);
    // Fehlstart membership is fixed at TIP time (first 3 plausibly-tipped CHRONO matches), so
    // out-of-order settlement can never reshuffle it; pt stays null until played → the unlock
    // (all 3 === 0) only fires once all three are settled, and once earned it can't be displaced.
    if (pl && firstPlaus.length < 3) firstPlaus.push(pt);
    if (pt === null) { if (tipped_) { pRun = 0; eRun = 0; zRun = 0; zStreak = 0; } continue; } // a pending tipped match breaks every run
    tipped++;
    if (pt >= 3) exact++; // 4 (K.o. exact-draw + winner) counts as a Volltreffer too
    pRun = pt >= 1 ? pRun + 1 : 0; if (pRun > pBest) pBest = pRun; pCur = pRun;
    eRun = pt >= 3 ? eRun + 1 : 0; if (eRun > eBest) eBest = eRun; eCur = eRun;
    // Phönix: a Volltreffer directly after ≥5 pointless tips (the run resets on any non-zero too)
    if (pt === 0) zStreak++; else { if (pt >= 3 && zStreak >= 5) phoenix = 1; zStreak = 0; }
    const mt = tendency(t), rt = tendency(res);
    // zero-run = consecutive GENUINE (plausible) pointless games. ONLY a plausible 0-pointer advances
    // it; a scored game OR an implausible (non-genuine) tip BREAKS it — so a nailed blowout tip (6:0)
    // can't be glued into a "12 in a row without a point" streak, and absurd losses can't farm it.
    if (pl && pt === 0) { zeroCount++; zRun++; if (zRun > zBest) zBest = zRun; zCur = zRun; }
    else { zRun = 0; zCur = 0; }
    // Antitalent: the tipped score is the EXACT mirror of the result (e.g. 1:3 tipped, 3:1 played) —
    // right magnitudes, wrong way round. Only non-draw plausible tips qualify.
    if (pl && mt != null && mt !== 0 && Number(t.h) === Number(res.a) && Number(t.a) === Number(res.h)) mirrorCount++;
    // result + Spielverlauf wins (curious / timeline). The score-derived ones (0:0/Torfest/Kanter)
    // and lastGoalMinute/hadRedCard only ever grow, so they're monotonic; comeback depends on goal
    // ORDER and is gated on a COMPLETE goal log so a partial timeline can't unlock-then-flip.
    const h = Number(res.h), a = Number(res.a), d = details[m.n];
    if (pt >= 3) {
      if (h === 0 && a === 0) zeroZero = 1;
      if (h + a >= 5) torfest = 1;
      if (Math.abs(h - a) >= 3) blowout = 1;
      if (lastGoalMinute(d) >= 85) lateWinner = 1;
      if (hadRedCard(d)) redCardGame = 1;
    }
    if (pt >= 1 && mt != null && mt === rt && rt !== 0 && detailComplete(d, h, a) && cameFromBehind(d, rt)) comeback = 1;
    // Elfer: tipped a draw on a K.o. game decided by penalties. Keyed on the shootout log (which,
    // once present, stays) — NOT on h===a, which a later result correction could flip.
    if (KO_PH.has(m.ph) && mt === 0 && d?.shootout) elfer = 1;
  }
  // Fehlstart: the first 3 plausibly-tipped matches are all settled and all 0 (null !== 0 → an
  // unsettled member keeps it locked).
  const falseStart = firstPlaus.length === 3 && firstPlaus.every((p) => p === 0) ? 1 : 0;

  // per-day (chronological): WIN aggregates (matchday win / perfect / best haul, all tips) +
  // FAIL aggregates (leer-ausgegangen tiers + the CONSECUTIVE Nullrunden-Abo run, PLAUSIBLE tips only).
  const byDay = {};
  for (const m of CHRONO) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  const dayPts = (k, ms) => { let pts = 0, any = false; for (const m of ms) { const p = score(st.tips[k]?.[m.n], results[m.n], st.resolved?.[m.n]); if (p !== null) { pts += p; any = true; } } return any ? pts : null; };
  let matchdayWins = 0, perfectDays = 0, bestDayPts = 0, badDays = 0, bigBadDays = 0, loneLoserDay = 0;
  let zdRun = 0, zdBest = 0, zdCur = 0; // consecutive blank-day run (gap-aware, like the match streaks)
  for (const dk of Object.keys(byDay).sort()) {
    const ms = byDay[dk];
    let myPts = 0, myScored = 0, failScored = 0; // failScored = plausible scored tips (the anti-farm qualifier)
    for (const m of ms) {
      const p = score(tips[m.n], results[m.n], st.resolved?.[m.n]);
      if (p !== null) { myPts += p; myScored++; if (plausible(tips[m.n])) failScored++; }
    }
    if (myScored > 0 && myPts > bestDayPts) bestDayPts = myPts; // monotonic on its own: a day's points only accrue
    // Day aggregates only become FINAL once every match of the day is settled — else they'd flip
    // true→false mid-day (staggered kickoffs) and break the once-only push + chronological attribution.
    // A day the player plausibly tipped into but which isn't fully decided yet is a GAP that breaks the
    // blank-day run (so a late-finishing day can't merge two blank stretches → keeps cellar_regular monotonic).
    if (!ms.every((m) => hasResult(results[m.n]))) { if (ms.some((m) => plausible(tips[m.n]))) zdRun = 0; continue; }
    if (myScored > 0) {
      let top = -1;
      for (const k of allK) { const p = dayPts(k, ms); if (p != null && p > top) top = p; }
      if (top > 0 && myPts === top) matchdayWins++;
    }
    if (failScored > 0) { // the day counts only if the player made ≥1 GENUINE (plausible) tip (anti-farm)
      const blank = myPts === 0; // truly leer = 0 points across ALL tips → an implausible WIN that day still counts (not leer)
      zdRun = blank ? zdRun + 1 : 0; if (zdRun > zdBest) zdBest = zdRun; zdCur = zdRun; // consecutive blank matchdays
      if (blank) { if (failScored >= 2) badDays++; if (failScored >= 3) bigBadDays++; }
      // Versager des Tages: the SOLE player to finish the day on 0 points (everyone else who tipped scored).
      if (blank) {
        let otherZero = false, otherScored = false;
        for (const k of others) { const p = dayPts(k, ms); if (p == null) continue; if (p === 0) otherZero = true; else otherScored = true; }
        if (!otherZero && otherScored) loneLoserDay++;
      }
    }
    if (ms.length >= 2) {
      const scored = ms.map((m) => score(tips[m.n], results[m.n], st.resolved?.[m.n])).filter((p) => p !== null);
      if (scored.length >= 2 && scored.every((p) => p >= 3)) perfectDays++;
    }
  }

  // field-relative, per scored match: lone wolf / contrarian (win, ungated) + herd (fail, plausible).
  // (Versager des Tages is judged per matchday above, not per match.)
  let loneWolf = 0, contrarian = 0, herd = 0;
  for (const m of CHRONO) {
    const res = results[m.n]; if (!hasResult(res)) continue;
    const myPt = score(tips[m.n], res, st.resolved?.[m.n]), pl = plausible(tips[m.n]);
    const oth = others.map((k) => score(st.tips[k]?.[m.n], res, st.resolved?.[m.n])).filter((p) => p != null);
    if (myPt != null && myPt > 0 && oth.length && !oth.some((p) => p > 0)) loneWolf++;
    const myTen = tendency(tips[m.n]), resTen = tendency(res);
    if (myTen != null) {
      const tens = others.map((k) => tendency(st.tips[k]?.[m.n])).filter((t) => t != null);
      if (tens.length >= 2) {
        const shared = tens.filter((t) => t === myTen).length / tens.length;
        if (myTen === resTen && shared < 0.5) contrarian++;        // right call, most of the field went elsewhere
        if (pl && myTen !== resTen && shared > 0.5) herd++;        // wrong call, but most of the field went with you
      }
    }
  }

  return {
    exact, tipped, zeroCount, mirrorCount, falseStart,
    zeroZero, torfest, blowout, phoenix, lateWinner, comeback, redCardGame, elfer,
    longestPointRun: pBest, longestExactRun: eBest, longestZeroRun: zBest,
    currentPointRun: pCur, currentExactRun: eCur, currentZeroRun: zCur,
    longestZeroDayRun: zdBest, currentZeroDayRun: zdCur,
    matchdayWins, perfectDays, bestDayPts, badDays, bigBadDays, loneLoserDay,
    loneWolf, contrarian, herd,
  };
}

// Per-player achievement state for the UI: id/kind/label/description/points + unlocked + progress.
// Streak badges are still earned by the LONGEST run (monotonic → never lost once earned), but the
// meter follows the CURRENT run while still locked so the UI visibly resets when a streak breaks.
//
// Pleiten/Nieten (kind:"fail") are HIDDEN until unlocked (Steam-style): a locked fail returns a
// MASKED stub — no id/label/condition/progress leaves the API — so nobody can farm the equalizer
// points by playing badly on purpose. Points are unaffected (achievementPoints reads the raw
// measure); only the displayed detail is withheld until the badge is earned (= revealed).
// Accepted residual (trusted private pool): the *count* of locked fails and their points' magnitude/
// timing still surface via the aggregate (leaderboard sum + per-day chart) — that's inherent to the
// "achievements count toward the standings" decision. The unlock CONDITION (the only thing that
// would enable deliberate farming) stays hidden, which is what matters.
export function computeAchievements(kuerzel, st, details = {}) {
  const m = metrics(kuerzel, st, details);
  let hidden = 0;
  return ACHIEVEMENTS.map((a) => {
    const raw = a.measure(m), unlocked = raw >= a.target;
    if (a.kind === "fail" && !unlocked) return { id: `hidden-${hidden++}`, kind: "fail", hidden: true, unlocked: false };
    const out = { id: a.id, kind: a.kind, label: a.label, description: a.description, points: a.points, unlocked, hidden: false };
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
export function achievementPoints(kuerzel, st, details = {}) {
  const m = metrics(kuerzel, st, details);
  return ACHIEVEMENTS.reduce((s, a) => s + (a.measure(m) >= a.target ? a.points : 0), 0);
}

// Per-matchday attribution: how many achievement points each player NEWLY earned on each day,
// by replaying the (monotonic) total against a state cut to the matches played up to that day.
// `daysAsc` = [{ day, matchNs }] oldest-first. Returns { [day]: { [kuerzel]: deltaPts } }.
// Deltas are ≥ 0 and sum (over days) to achievementPoints() — so the charts add up exactly.
export function achievementPointsByDay(st, daysAsc, details = {}) {
  const allK = Object.keys(st.tips || {});
  const seen = new Set();
  const prev = {}; for (const k of allK) prev[k] = 0;
  const out = {};
  for (const { day, matchNs } of daysAsc) {
    for (const n of matchNs) seen.add(n);
    const cut = { tips: {}, results: {}, resolved: {} };
    for (const n of seen) { if (st.results[n]) cut.results[n] = st.results[n]; if (st.resolved?.[n]) cut.resolved[n] = st.resolved[n]; }
    for (const k of allK) { const t = st.tips[k] || {}, ct = {}; for (const n of seen) if (t[n]) ct[n] = t[n]; cut.tips[k] = ct; }
    const d = {};
    for (const k of allK) { const p = achievementPoints(k, cut, details); d[k] = p - prev[k]; prev[k] = p; }
    out[day] = d;
  }
  return out;
}
