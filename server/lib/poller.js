import { MATCHES } from "../data.js";

const tsOf = (dt) => Date.parse(dt + ":00+02:00"); // MESZ wall-clock → epoch ms
const KICKOFF = {};
for (const m of MATCHES) KICKOFF[m.n] = tsOf(m.dt);

// Expected-end window after kickoff (minutes): a match ends ~100–115 min in; we
// keep checking up to +150 to catch stoppage/penalties/late data entry.
const END_MIN = 100;
const END_MAX = 150;

// Returns a match number that is currently in its expected-end window and still
// has no final result (→ a sync is worthwhile), or null. Called on a short cron;
// because it only triggers when a match is actually finishing, the API is hit
// just around end-times — and it naturally retries until the result lands.
export function matchDueForResult(hasResult, now = Date.now()) {
  for (const m of MATCHES) {
    const sinceMin = (now - KICKOFF[m.n]) / 60000;
    if (sinceMin >= END_MIN && sinceMin <= END_MAX && !hasResult(m.n)) return m.n;
  }
  return null;
}
