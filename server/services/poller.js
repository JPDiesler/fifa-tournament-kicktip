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

// Like matchDueForResult, but the window opens at KICKOFF (not 95 min) so we also
// pick up the live (delayed) scoreline and match phase while a game is running —
// not just the final result. Returns the earliest such match or null. One sync
// covers every active match at once, so polling every minute here costs 1 call/min
// while matches run, far under the per-minute rate limit.
export function anyMatchActive(hasResult, now = Date.now()) {
  for (const w of WINDOWS) {
    const sinceMin = (now - w.ts) / 60000;
    const end = w.ko ? END_KO : END_GROUP;
    if (sinceMin >= 0 && sinceMin <= end && !hasResult(w.n)) return w.n;
  }
  return null;
}

// Remaining polling LOAD for the rest of today (until UTC midnight = the daily
// budget boundary), used to size the live-poll interval against a daily cap:
//   coverageSec  – union of all active match windows (one poll covers concurrent
//                  matches → fixtures cost = 1 call per poll)
//   sumActiveSec – sum over matches of their remaining active seconds (scorers/
//                  cards cost = 1 detail call PER live match per poll)
// So calls(interval) ≈ coverageSec/interval (+ sumActiveSec/interval if details).
export function remainingLoadToday(now = Date.now()) {
  const dayEnd = (Math.floor(now / 86400000) + 1) * 86400000; // next UTC midnight
  const spans = [];
  let sumActiveSec = 0;
  for (const w of WINDOWS) {
    const end = w.ts + (w.ko ? END_KO : END_GROUP) * 60000;
    const start = Math.max(w.ts, now);
    const clipEnd = Math.min(end, dayEnd);
    if (clipEnd <= start) continue; // already over, or not until tomorrow
    spans.push([start, clipEnd]);
    sumActiveSec += (clipEnd - start) / 1000;
  }
  spans.sort((a, b) => a[0] - b[0]);
  let coverageSec = 0, curStart = null, curEnd = null;
  for (const [s, e] of spans) {
    if (curEnd == null || s > curEnd) { if (curEnd != null) coverageSec += (curEnd - curStart) / 1000; curStart = s; curEnd = e; }
    else curEnd = Math.max(curEnd, e);
  }
  if (curEnd != null) coverageSec += (curEnd - curStart) / 1000;
  return { coverageSec, sumActiveSec };
}
