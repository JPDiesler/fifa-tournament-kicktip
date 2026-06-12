import { MATCHES } from "../data.js";

const tsOf = (dt) => Date.parse(dt + ":00+02:00"); // MESZ wall-clock → epoch ms
const KO_PHASES = new Set(["R32", "R16", "QF", "SF", "P3", "FIN"]);

// Minutes after kickoff when a match can plausibly already be FINAL:
//   • regular play: 2×45 + ~15 min halftime + stoppage → final ≈ 105–120 min in
//   • knockout:     may add extra time (2×15 + breaks) and a penalty shootout
//                   → final possible anywhere up to ~180 min after kickoff
// We open the window a little before the earliest plausible finish and keep
// retrying (via a frequent cron) until the result lands, then the window closes.
const START_MIN = 95;
const END_GROUP = 130;
const END_KO = 180;

const WINDOWS = MATCHES.map((m) => ({ n: m.n, ko: KO_PHASES.has(m.ph), ts: tsOf(m.dt) }));

// Returns the (earliest) match number currently inside its "might be finishing"
// window that still has no final result — i.e. a sync is worthwhile right now —
// or null. A single sync fetches all fixtures, so one hit covers every match
// that is in-window simultaneously.
export function matchDueForResult(hasResult, now = Date.now()) {
  for (const w of WINDOWS) {
    const sinceMin = (now - w.ts) / 60000;
    const end = w.ko ? END_KO : END_GROUP;
    if (sinceMin >= START_MIN && sinceMin <= end && !hasResult(w.n)) return w.n;
  }
  return null;
}
