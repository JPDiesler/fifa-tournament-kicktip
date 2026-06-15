import { MATCHES } from "@/data";
import { score } from "@/lib/scoring.js";
import { kickoffMs } from "@/lib/matchtime.js";

// A player's tipping record, derived purely from the shared state. Reusable: the
// Head-to-Head duel view computes this per player. `sum` here is match points
// only (no champion bonus — that lives on the leaderboard row).
export function playerStats(kuerzel, st) {
  const tips = st?.tips?.[kuerzel] || {};
  const results = st?.results || {};
  const counts = { 3: 0, 2: 0, 1: 0, 0: 0 };
  let tipped = 0, scored = 0, sum = 0;
  // chronological order so the "streak" reflects the real sequence of matches
  const chrono = [...MATCHES].sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt));
  const seq = [];
  for (const m of chrono) {
    const t = tips[m.n];
    if (t && (t.h !== "" || t.a !== "")) tipped++;
    const pt = score(t, results[m.n]);
    if (pt !== null) { counts[pt]++; scored++; sum += pt; seq.push(pt); }
  }
  const hits = counts[3] + counts[2] + counts[1];
  let longest = 0, run = 0;
  for (const pt of seq) { if (pt >= 1) { run++; if (run > longest) longest = run; } else run = 0; }
  let current = 0;
  for (let i = seq.length - 1; i >= 0; i--) { if (seq[i] >= 1) current++; else break; }
  return {
    total: MATCHES.length, tipped, scored, sum, counts, hits,
    hitRate: scored ? Math.round((hits / scored) * 100) : 0,
    exactRate: scored ? Math.round((counts[3] / scored) * 100) : 0,
    avg: scored ? sum / scored : 0,
    longest, current,
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
