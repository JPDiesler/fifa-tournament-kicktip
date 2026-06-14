// Matching API fixtures to our internal match numbers — the shared core used by
// both the result sync and the broadcast (EPG) mapping.
import { MATCHES, ALIASES, TEAMS } from "../data.js";

export const tsOf = (dtLocal) => Date.parse(dtLocal + ":00+02:00"); // MESZ wall-clock -> epoch ms
export const known = (c) => Object.prototype.hasOwnProperty.call(TEAMS, c);
export const norm = (s) => (s || "").normalize("NFKD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const codeForName = (name) => {
  const x = norm(name);
  for (const c in ALIASES) if (ALIASES[c].includes(x)) return c;
  return null;
};

export const FINAL_N = 104; // the World Cup final → its winner is the actual champion

// Group / already-decided matches are keyed by their (unordered) team pair, so
// two matches that kick off at the same minute can never be confused. K.o.
// matches carry placeholder "teams" ("Sieger Gruppe A" …) and are matched by
// kickoff time alone until the API fills in the real qualified teams.
const PAIR_INDEX = new Map(); // "AAA|BBB" (sorted) -> { n, ts, h }
const TIME_ONLY = [];         // [{ n, ts }] for K.o. placeholder matches
for (const m of MATCHES) {
  const ts = tsOf(m.dt);
  if (known(m.h) && known(m.a)) PAIR_INDEX.set([m.h, m.a].sort().join("|"), { n: m.n, ts, h: m.h });
  else TIME_ONLY.push({ n: m.n, ts });
}
const PAIR_TOL = 6 * 60 * 60 * 1000; // same pairing, roughly the same day
const TIME_TOL = 90 * 60 * 1000;     // K.o. fallback window

// Map a normalised API fixture to one of our matches.
// Returns { n, swap, ko } or null. `swap` means the fixture's home is our
// match's away (so its goals must be flipped to match our home/away order).
// `usedTimeOnly` guards against two simultaneous K.o. fixtures grabbing the
// same match number.
export function matchForFixture(f, usedTimeOnly) {
  const fh = codeForName(f.homeName), fa = codeForName(f.awayName);
  if (fh && fa) {
    const hit = PAIR_INDEX.get([fh, fa].sort().join("|"));
    if (hit && Math.abs(hit.ts - f.dateMs) <= PAIR_TOL) return { n: hit.n, swap: fh !== hit.h, ko: false };
  }
  let best = null, bestDiff = Infinity;
  for (const { n, ts } of TIME_ONLY) {
    if (usedTimeOnly.has(n)) continue;
    const d = Math.abs(ts - f.dateMs);
    if (d < bestDiff) { bestDiff = d; best = n; }
  }
  return best != null && bestDiff <= TIME_TOL ? { n: best, swap: false, ko: true } : null;
}
