// football-data.org (v4) adapter. Free tier covers the World Cup; the live score
// is DELAYED and minute/goals/bookings may be absent — we degrade gracefully.
// Normalised fixture shape (shared across adapters):
//   { providerId, extId, dateMs, finished, live, phase, minute, injuryTime,
//     homeName, awayName, homeGoals, awayGoals, winner }
import { getDataToken, getProviderLimits } from "../../db.js";

const BASE = "https://api.football-data.org/v4";
const comp = () => process.env.FOOTBALL_DATA_COMPETITION || "WC";
const H = () => ({ headers: { "X-Auth-Token": getDataToken() } });

// status enums: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, SUSPENDED, … ;
// score.duration: REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT.
export function mapFootballDataMatch(m) {
  const live = m.status === "IN_PLAY" || m.status === "PAUSED";
  const dur = m.score?.duration;
  const phase =
    m.status === "PAUSED" ? "HT" :
    dur === "PENALTY_SHOOTOUT" ? "PEN" :
    dur === "EXTRA_TIME" ? "ET" :
    live ? "LIVE" : null;
  return {
    providerId: "footballdata", extId: m.id,
    dateMs: Date.parse(m.utcDate),
    finished: m.status === "FINISHED",
    live, phase,
    duration: dur === "PENALTY_SHOOTOUT" ? "PENALTY" : dur === "EXTRA_TIME" ? "EXTRA_TIME" : dur ? "REGULAR" : null,
    minute: m.minute != null ? Number(m.minute) : null,
    injuryTime: m.injuryTime != null ? Number(m.injuryTime) : null,
    homeName: m.homeTeam?.name || m.homeTeam?.shortName || null,
    awayName: m.awayTeam?.name || m.awayTeam?.shortName || null,
    homeGoals: m.score?.fullTime?.home,
    awayGoals: m.score?.fullTime?.away,
    winner: m.score?.winner === "HOME_TEAM" ? "home" : m.score?.winner === "AWAY_TEAM" ? "away" : m.score?.winner === "DRAW" ? "draw" : null,
  };
}

// Map a provider team name to the static "h"/"a" side (applying matchForFixture's
// swap). ctx = { homeName, awayName, swap } from the matched fixture. null if unknown.
function sideOf(team, ctx) {
  if (!ctx || !team) return null;
  const raw = team === ctx.homeName ? "h" : team === ctx.awayName ? "a" : null;
  if (!raw) return null;
  return ctx.swap ? (raw === "h" ? "a" : "h") : raw;
}

async function fetchFixtures() {
  const season = process.env.FOOTBALL_DATA_SEASON || ""; // optional year, defaults to current
  const url = `${BASE}/competitions/${comp()}/matches` + (season ? `?season=${season}` : "");
  const r = await fetch(url, H());
  const j = await r.json();
  if (!Array.isArray(j.matches)) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j.matches.map(mapFootballDataMatch);
}

// Per-match detail → scorers + cards (free tier may omit these → empty arrays).
// Each event carries its team SIDE ("h"/"a", via ctx) so the UI can place it on the
// home/away side; goals carry a type ("penalty"/"own"/null). football-data attributes
// an own goal to the benefiting team, so its side already matches the score.
async function fetchDetail(extId, ctx) {
  const d = await (await fetch(`${BASE}/matches/${extId}`, H())).json();
  const goalType = (t) => (t === "PENALTY" ? "penalty" : t === "OWN" ? "own" : null);
  const scorers = Array.isArray(d.goals) ? d.goals.map((g) => ({
    team: g.team?.name || null, player: g.scorer?.name || null,
    minute: g.minute ?? null, injury: g.injuryTime ?? null,
    type: goalType(g.type), side: sideOf(g.team?.name, ctx),
  })) : [];
  const cards = Array.isArray(d.bookings) ? d.bookings.map((b) => ({
    team: b.team?.name || null, player: b.player?.name || null,
    minute: b.minute ?? null, card: b.card || null, side: sideOf(b.team?.name, ctx),
  })) : [];
  return { scorers, cards };
}

// Best-known capabilities without a probe. Free tier: scores/phase/results yes,
// but DELAYED; minute/scorers/cards unknown until probed (null).
const declaredCaps = () => ({ results: true, liveScore: true, phase: true, liveMinute: null, scorers: null, cards: null, realtime: false });

// Probe the token + detect capabilities. Costs up to 2 calls. Never throws.
async function probe() {
  const token = getDataToken();
  if (!token) return { ok: false, error: "Kein Token gesetzt" };
  try {
    const r = await fetch(`${BASE}/competitions/${comp()}/matches`, H());
    const availableMinute = Number(r.headers.get("x-requests-available-minute"));
    const resetSeconds = Number(r.headers.get("x-requestcounter-reset"));
    const client = r.headers.get("x-authenticated-client") || null;
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, status: r.status, error: d.message || `HTTP ${r.status}`, client, availableMinute, resetSeconds };
    }
    const j = await r.json();
    const matches = Array.isArray(j.matches) ? j.matches : [];
    const liveM = matches.find((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    const liveMinute = liveM ? liveM.minute != null : null; // null = couldn't test (no live match)
    let scorers = null, cards = null;
    const fin = matches.find((m) => m.status === "FINISHED");
    if (fin) {
      try { const d = await (await fetch(`${BASE}/matches/${fin.id}`, H())).json(); scorers = Array.isArray(d.goals); cards = Array.isArray(d.bookings); }
      catch { scorers = null; cards = null; }
    }
    return {
      ok: true, status: r.status, client, availableMinute, resetSeconds,
      caps: { liveScore: true, phase: true, results: true, liveMinute, scorers, cards, realtime: liveMinute === true },
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

export const footballdata = {
  id: "footballdata",
  name: "football-data.org",
  // admin override → env → default (free tier: 10/min, no daily cap)
  rateLimit: () => { const o = getProviderLimits("footballdata").rateLimit; return Number.isFinite(o) ? o : Number(process.env.FOOTBALL_DATA_RATE_LIMIT || 10); },
  dailyLimit: () => { const o = getProviderLimits("footballdata").dailyLimit; return o === null ? null : Number.isFinite(o) ? o : (process.env.FOOTBALL_DATA_DAILY_LIMIT ? Number(process.env.FOOTBALL_DATA_DAILY_LIMIT) : null); },
  configured: () => !!getDataToken(),
  declaredCaps, fetchFixtures, fetchDetail, probe,
};
