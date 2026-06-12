// Kickoff time of a match (dt is MESZ wall-clock) → epoch ms.
export const kickoffMs = (dt) => Date.parse(dt + ":00+02:00");

// Short relative countdown to kickoff, or null once it has started.
export function countdown(dt, now = Date.now()) {
  const diff = kickoffMs(dt) - now;
  if (diff <= 0) return null;
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h} Std`;
  return `in ${Math.floor(h / 24)} T`;
}

export const isMatchLocked = (n, st) => (st?.locks?.lockedMatches || []).includes(n);

// A match is "live" once it has kicked off but has no final result yet
// (bounded to ~4h so a stale unresolved match doesn't stay "live" forever).
export function isLive(dt, hasResult, now = Date.now()) {
  if (hasResult) return false;
  const ms = kickoffMs(dt);
  return ms <= now && now - ms <= 4 * 60 * 60 * 1000;
}
