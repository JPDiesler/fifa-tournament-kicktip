// Result data sources. Each provider returns a NORMALISED fixture list:
//   { dateMs, finished, live, phase, minute, injuryTime,
//     homeName, awayName, homeGoals, awayGoals, winner }
// where winner is 'home' | 'away' | 'draw' | null (already accounts for extra
// time / penalty shootouts) and the live fields describe an in-progress match:
//   live    – true while the match is in play or paused (not scheduled/finished)
//   phase   – 'LIVE' | 'HT' (pause/halftime) | 'ET' (extra time) | 'PEN'
//             (penalty shootout) | null. Free tiers deliver scores DELAYED, so
//             this is "near-live", not real-time.
//   minute  – current minute of play (may be null on the free tier)
//   homeGoals/awayGoals double as the live (delayed) scoreline while in play.
// The sync logic (timestamp matching, result/pairing writing) stays
// provider-agnostic. Each provider also declares its call budget: a per-minute
// rate limit (the binding constraint on the free tiers) and an optional per-day
// cap (null = none).

import { getDataToken } from "../db.js";

// ---- API-Football (v3.football.api-sports.io) ----
// Pure mapper (exported for testing) — one raw fixture → normalised shape.
export function mapApiFootballFixture(f) {
  const short = f.fixture?.status?.short;
  const liveCodes = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "SUSP", "INT"];
  const live = liveCodes.includes(short);
  const phase =
    short === "P" ? "PEN" :
    short === "ET" ? "ET" :
    short === "HT" || short === "BT" ? "HT" :
    live ? "LIVE" : null;
  return {
    dateMs: Date.parse(f.fixture?.date),
    finished: ["FT", "AET", "PEN"].includes(short),
    live,
    phase,
    minute: f.fixture?.status?.elapsed ?? null,
    injuryTime: null, // not provided
    homeName: f.teams?.home?.name || null,
    awayName: f.teams?.away?.name || null,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
    winner: f.teams?.home?.winner ? "home" : f.teams?.away?.winner ? "away" : null,
  };
}
async function apiFootballFetch() {
  const key = process.env.API_FOOTBALL_KEY || "";
  const league = process.env.API_LEAGUE || "1";
  const season = process.env.API_SEASON || "2026";
  const r = await fetch(`https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}`, {
    headers: { "x-apisports-key": key },
  });
  const j = await r.json();
  const errs = j.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
    throw new Error(JSON.stringify(errs));
  }
  return (j.response || []).map(mapApiFootballFixture);
}

// ---- football-data.org (v4) — free tier covers the World Cup competition ----
// Pure mapper (exported for testing) — one raw match → normalised shape.
// status enums: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, SUSPENDED, … ;
// score.duration: REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT. On the free tier the
// live score in score.fullTime is delayed (paid "livescores" add-on removes the
// lag), and `minute` may be absent — we degrade gracefully (phase without clock).
export function mapFootballDataMatch(m) {
  const live = m.status === "IN_PLAY" || m.status === "PAUSED";
  const dur = m.score?.duration;
  const phase =
    m.status === "PAUSED" ? "HT" :
    dur === "PENALTY_SHOOTOUT" ? "PEN" :
    dur === "EXTRA_TIME" ? "ET" :
    live ? "LIVE" : null;
  return {
    dateMs: Date.parse(m.utcDate),
    finished: m.status === "FINISHED",
    live,
    phase,
    minute: m.minute != null ? Number(m.minute) : null,
    injuryTime: m.injuryTime != null ? Number(m.injuryTime) : null,
    homeName: m.homeTeam?.name || m.homeTeam?.shortName || null,
    awayName: m.awayTeam?.name || m.awayTeam?.shortName || null,
    homeGoals: m.score?.fullTime?.home,
    awayGoals: m.score?.fullTime?.away,
    winner: m.score?.winner === "HOME_TEAM" ? "home" : m.score?.winner === "AWAY_TEAM" ? "away" : m.score?.winner === "DRAW" ? "draw" : null,
  };
}
async function footballDataFetch() {
  const token = getDataToken();
  const comp = process.env.FOOTBALL_DATA_COMPETITION || "WC";
  const season = process.env.FOOTBALL_DATA_SEASON || ""; // optional year, defaults to current
  const url = `https://api.football-data.org/v4/competitions/${comp}/matches` + (season ? `?season=${season}` : "");
  const r = await fetch(url, { headers: { "X-Auth-Token": token } });
  const j = await r.json();
  if (!Array.isArray(j.matches)) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j.matches.map(mapFootballDataMatch);
}

// Test the current football-data token and PROBE its capabilities, so the feature
// set can adapt to the account's plan. Returns the account/budget the API exposes
// (authenticated client + per-minute request headers) plus detected capabilities:
//   caps.liveMinute – does a currently in-play match carry a `minute`? (bool|null:
//                     null = no live match to test right now)
//   caps.scorers    – finished-match detail carries goals/scorers? (bool|null)
//   caps.cards      – finished-match detail carries bookings/cards? (bool|null)
//   caps.{liveScore,phase,results} – base football-data features (always true)
//   caps.realtime   – proxy for non-delayed live data (= liveMinute present)
// The real-time-vs-delayed scoreline isn't directly exposed by the API.
// Never throws — on failure returns { ok:false, error }. Costs up to 2 API calls.
export async function probeSource() {
  const token = getDataToken();
  if (!token) return { ok: false, error: "Kein Token gesetzt" };
  const comp = process.env.FOOTBALL_DATA_COMPETITION || "WC";
  const H = { headers: { "X-Auth-Token": token } };
  try {
    const r = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches`, H);
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
      try {
        const d = await (await fetch(`https://api.football-data.org/v4/matches/${fin.id}`, H)).json();
        scorers = Array.isArray(d.goals);
        cards = Array.isArray(d.bookings);
      } catch { scorers = null; cards = null; }
    }
    return {
      ok: true, status: r.status, client, availableMinute, resetSeconds,
      caps: {
        // base capabilities football-data always provides (on free, the live score
        // is delayed → the UI treats `realtime` separately):
        liveScore: true, phase: true, results: true,
        // tier-gated, probed live/from match detail:
        liveMinute, scorers, cards,
        realtime: liveMinute === true, // proxy for real-time (no delay) live data
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const SOURCES = {
  footballdata: {
    name: "football-data.org",
    rateLimit: () => Number(process.env.FOOTBALL_DATA_RATE_LIMIT || 10), // free tier: 10 calls/min
    dailyLimit: () => (process.env.FOOTBALL_DATA_DAILY_LIMIT ? Number(process.env.FOOTBALL_DATA_DAILY_LIMIT) : null), // free tier: no daily cap
    configured: () => !!getDataToken(),
    fetchFixtures: footballDataFetch,
  },
  apifootball: {
    name: "API-Football",
    rateLimit: () => Number(process.env.API_RATE_LIMIT || 10),
    dailyLimit: () => Number(process.env.API_DAILY_LIMIT || 100),
    configured: () => !!process.env.API_FOOTBALL_KEY,
    fetchFixtures: apiFootballFetch,
  },
};

export function activeSource() {
  const key = (process.env.DATA_SOURCE || "footballdata").toLowerCase();
  return SOURCES[key] || SOURCES.footballdata;
}
