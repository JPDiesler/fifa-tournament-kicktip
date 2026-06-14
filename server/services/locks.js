import { MATCHES } from "../data.js";

// Kickoff time per match (MESZ wall-clock → epoch ms), and the lock rules.
const tsOf = (dtLocal) => Date.parse(dtLocal + ":00+02:00");
const KO_PHASES = new Set(["R32", "R16", "QF", "SF", "FIN"]);

const KICKOFF = {};
for (const m of MATCHES) KICKOFF[m.n] = tsOf(m.dt);

export const TIP_LOCK_OFFSET_MIN = 5;
const TIP_LOCK_OFFSET_MS = TIP_LOCK_OFFSET_MIN * 60 * 1000;

export const kickoff = (n) => KICKOFF[n] ?? null;

// A match is locked for tipping from (kickoff − 5 min). Others' tips become
// visible at the same moment.
export const isTipLocked = (n, now = Date.now()) => {
  const k = KICKOFF[n];
  return k != null && now >= k - TIP_LOCK_OFFSET_MS;
};

// The champion tip locks at the start of the K.o. phase (first R32 kickoff).
export const champLockTs = Math.min(...MATCHES.filter((m) => KO_PHASES.has(m.ph)).map((m) => tsOf(m.dt)));
export const isChampLocked = (now = Date.now()) => now >= champLockTs;
