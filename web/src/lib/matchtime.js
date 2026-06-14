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

// Does the (delayed) live state from the server carry an actual scoreline yet?
export const hasLiveScore = (live) => !!(live && live.h !== "" && live.a !== "");

// Label for the live match phase coming from st.live[n]
// ({ phase:'LIVE'|'HT'|'ET'|'PEN', minute, injury }). Scores are DELAYED on the
// free data tier, so this is "near-live". `short` gives compact labels for the
// narrow match cards; the long form is for the detail sheet. Returns null when
// there is no live state.
export function livePhase(live, short = false) {
  if (!live) return null;
  const clock = live.minute != null ? `${live.minute}'${live.injury ? `+${live.injury}` : ""}` : null;
  switch (live.phase) {
    case "HT": return short ? "HZ" : "Halbzeit";
    case "PEN": return short ? "Elfer" : "Elfmeterschießen";
    case "ET": return clock ? (short ? `V.${clock}` : `Verl. ${clock}`) : (short ? "Verl." : "Verlängerung");
    default: return clock || "läuft"; // 'LIVE'
  }
}
