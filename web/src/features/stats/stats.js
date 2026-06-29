import { MATCHES } from "@/data";
import { score, scoreBase } from "@/lib/scoring.js";
import { kickoffMs } from "@/lib/matchtime.js";

// A player's tipping record, derived purely from the shared state. Reusable: the
// Head-to-Head duel view computes this per player. `sum` here is match points
// only (no champion bonus — that lives on the leaderboard row).
export function playerStats(kuerzel, st) {
  const tips = st?.tips?.[kuerzel] || {};
  const results = st?.results || {};
  const counts = { 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 }; // 4 = K.o. Remis-Tipp (exaktes 90'-Remis + Sieger)
  let tipped = 0, scored = 0, sum = 0;
  // chronological order so the "streak" reflects the real sequence of matches
  const chrono = [...MATCHES].sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt));
  const seq = [];
  for (const m of chrono) {
    const t = tips[m.n];
    if (t && (t.h !== "" || t.a !== "")) tipped++;
    const res = results[m.n], resolved = st?.resolved?.[m.n];
    // Quality metrics (counts/Quote/Serie) read BASE points → stable 0–4 buckets; the joker
    // only swings the running total (matches the leaderboard, which scores with the joker).
    const base = scoreBase(t, res, resolved);
    if (base !== null) { counts[base]++; scored++; sum += score(t, res, resolved); seq.push(base); }
  }
  const hits = counts[4] + counts[3] + counts[2] + counts[1];
  let longest = 0, run = 0;
  for (const pt of seq) { if (pt >= 1) { run++; if (run > longest) longest = run; } else run = 0; }
  let current = 0;
  for (let i = seq.length - 1; i >= 0; i--) { if (seq[i] >= 1) current++; else break; }
  return {
    total: MATCHES.length, tipped, scored, sum, counts, hits,
    hitRate: scored ? Math.round((hits / scored) * 100) : 0,
    exactRate: scored ? Math.round(((counts[3] + counts[4]) / scored) * 100) : 0,
    avg: scored ? sum / scored : 0,
    longest, current,
  };
}

// Direct comparison of two players: their records + per-match duel (matches both
// tipped, scored) + the head-to-head win count. Reused by the duel view and the
// share image. `sum` falls back to playerStats if a leaderboard row is missing.
export function head2head(a, b, st, board = []) {
  const find = (k) => board.find((r) => r.p === k);
  const SA = playerStats(a, st), SB = playerStats(b, st);
  const duels = MATCHES
    .map((m) => ({ m, pa: score(st.tips?.[a]?.[m.n], st.results?.[m.n], st.resolved?.[m.n]), pb: score(st.tips?.[b]?.[m.n], st.results?.[m.n], st.resolved?.[m.n]) }))
    .filter((d) => d.pa !== null && d.pb !== null)
    .sort((x, y) => kickoffMs(y.m.dt) - kickoffMs(x.m.dt));
  let aw = 0, bw = 0, tie = 0;
  for (const d of duels) { if (d.pa > d.pb) aw++; else if (d.pb > d.pa) bw++; else tie++; }
  return {
    a, b,
    aName: find(a)?.name || a, bName: find(b)?.name || b,
    sumA: find(a)?.sum ?? SA.sum, sumB: find(b)?.sum ?? SB.sum,
    SA, SB, aw, bw, tie, duels,
  };
}

// Best / worst matchday for a player (from the per-day breakdown).
export function bestWorstDay(kuerzel, matchdays = []) {
  const mine = matchdays
    .map((d) => ({ label: d.label, pts: d.rows.find((r) => r.p === kuerzel)?.pts }))
    .filter((d) => d.pts != null);
  if (!mine.length) return { best: null, worst: null };
  let best = mine[0], worst = mine[0];
  for (const d of mine) { if (d.pts > best.pts) best = d; if (d.pts < worst.pts) worst = d; }
  return { best, worst };
}
