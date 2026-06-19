// Kickoff time of a match (dt is MESZ wall-clock) → epoch ms.
export const kickoffMs = (dt) => Date.parse(dt + ":00+02:00");

// Free-tier live scores arrive delayed (measured ~3 min during the WC); shown as
// a small, unobtrusive hint so the live score doesn't read as broken/real-time.
export const LIVE_DELAY_NOTE = "ca. 3 Min verzögert"; // fallback when capabilities are unknown

// Human label for the live-display delay (seconds, from capabilities.delaySeconds).
// null = effectively live → show no note.
export function delayLabel(sec) {
  if (sec == null) return null;
  if (sec <= 20) return null;
  if (sec < 90) return `ca. ${Math.round(sec)} Sek verzögert`;
  return `ca. ${Math.round(sec / 60)} Min verzögert`;
}

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

// ---- local match clock (skew-free): anchor to the server snapshot, tick locally ----
// Nominal half boundary (minutes) for stoppage formatting, from phase + anchor minute.
export function clockBoundary(live) {
  if (live?.phase === "ET") return (live.minute ?? 0) <= 105 ? 105 : 120;
  return (live?.minute ?? 0) <= 45 ? 45 : 90;
}
// Play-seconds already elapsed at fetch = the snapshot minute + how stale it is on
// the server (serverNow − as_of). Uses only server-side deltas → no clock skew.
export function liveBaseSeconds(live, serverNow) {
  const stale = (serverNow != null && live?.asOf != null) ? Math.max(0, (serverNow - live.asOf) / 1000) : 0;
  return (live?.minute ?? 0) * 60 + stale;
}
// Format running play-seconds against the boundary → "67'" or "45+2'" (stoppage,
// capped at +15 so a stalled feed can't run away).
export function formatClock(totalSec, boundary) {
  const m = Math.max(0, Math.floor(totalSec / 60));
  return m <= boundary ? `${m}'` : `${boundary}+${Math.min(m - boundary, 15)}'`;
}
// Whether the clock is running for this phase (paused at HT, stopped at PEN).
export const clockRunning = (live) => live?.phase === "LIVE" || live?.phase === "ET";

// --- match event display helpers (scorers / cards) ---
// Minute label for a goal/card event: "23'" or "90+5'" (stoppage carried as injury).
export function eventMinute(e) {
  if (!e || e.minute == null) return "";
  return e.injury ? `${e.minute}+${e.injury}'` : `${e.minute}'`;
}
// Suffix marking a goal's type: penalty "(E)", own goal "(ET)", else "".
export const goalMark = (type) => (type === "penalty" ? "(E)" : type === "own" ? "(ET)" : "");
// A card counts as red when its label mentions "red" (api-football: "Red Card").
// A second yellow ("Second Yellow card") stays yellow (it's still a yellow card).
export const isRedCard = (card) => /red/i.test(card || "");

// Card type for the icon: "yellow" | "red" | "yellowred" (second yellow / Gelb-Rot).
// api-football labels: "Yellow Card" / "Red Card" / "Second Yellow card".
export function cardKind(card) {
  const c = card || "";
  if (/yellow.?red|second\s*yellow/i.test(c)) return "yellowred";
  if (/red/i.test(c)) return "red";
  return "yellow";
}
// Final match clock for a finished match (from match_detail.final): "90+5'", "120'",
// or "120' i.E." when decided on penalties. null when unknown.
export function finalClockLabel(final) {
  if (!final || final.minute == null) return null;
  const t = `${final.minute}${final.injury ? `+${final.injury}` : ""}'`;
  return final.phase === "PEN" ? `${t} i.E.` : t;
}

// Label for the live match phase coming from st.live[n]
// ({ phase:'LIVE'|'HT'|'ET'|'PEN', minute, injury }). Scores are DELAYED on the
// free data tier (which also reports no minute), so plain in-play falls back to
// "LIVE". `short` gives compact labels for the narrow match cards; the long form
// is for the detail sheet. `clockOverride` is the locally-ticked clock string
// (when liveMinute is supported). Returns null when there is no live state.
export function livePhase(live, short = false, clockOverride = null) {
  if (!live) return null;
  const clock = clockOverride || (live.minute != null ? `${live.minute}'${live.injury ? `+${live.injury}` : ""}` : null);
  switch (live.phase) {
    case "HT": return short ? "HZ" : "Halbzeit";
    case "PEN": return short ? "Elfer" : "Elfmeterschießen";
    case "ET": return clock ? (short ? `V.${clock}` : `Verl. ${clock}`) : (short ? "Verl." : "Verlängerung");
    default: return clock || (short ? "LIVE" : "läuft"); // plain in-play — no minute on the free tier
  }
}
