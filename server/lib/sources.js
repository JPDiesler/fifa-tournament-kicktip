// Result data sources. Each provider returns a NORMALISED fixture list:
//   { dateMs, finished, homeName, awayName, homeGoals, awayGoals, winner }
// where winner is 'home' | 'away' | 'draw' | null (already accounts for extra
// time / penalty shootouts). The sync logic (timestamp matching, result/pairing
// writing) stays provider-agnostic. Each provider also declares its call budget:
// a per-minute rate limit (the binding constraint on the free tiers) and an
// optional per-day cap (null = none).

// ---- API-Football (v3.football.api-sports.io) ----
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
  return (j.response || []).map((f) => ({
    dateMs: Date.parse(f.fixture?.date),
    finished: ["FT", "AET", "PEN"].includes(f.fixture?.status?.short),
    homeName: f.teams?.home?.name || null,
    awayName: f.teams?.away?.name || null,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
    winner: f.teams?.home?.winner ? "home" : f.teams?.away?.winner ? "away" : null,
  }));
}

// ---- football-data.org (v4) — free tier covers the World Cup competition ----
async function footballDataFetch() {
  const token = process.env.FOOTBALL_DATA_TOKEN || "";
  const comp = process.env.FOOTBALL_DATA_COMPETITION || "WC";
  const season = process.env.FOOTBALL_DATA_SEASON || ""; // optional year, defaults to current
  const url = `https://api.football-data.org/v4/competitions/${comp}/matches` + (season ? `?season=${season}` : "");
  const r = await fetch(url, { headers: { "X-Auth-Token": token } });
  const j = await r.json();
  if (!Array.isArray(j.matches)) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j.matches.map((m) => ({
    dateMs: Date.parse(m.utcDate),
    finished: m.status === "FINISHED",
    homeName: m.homeTeam?.name || m.homeTeam?.shortName || null,
    awayName: m.awayTeam?.name || m.awayTeam?.shortName || null,
    homeGoals: m.score?.fullTime?.home,
    awayGoals: m.score?.fullTime?.away,
    winner: m.score?.winner === "HOME_TEAM" ? "home" : m.score?.winner === "AWAY_TEAM" ? "away" : m.score?.winner === "DRAW" ? "draw" : null,
  }));
}

const SOURCES = {
  footballdata: {
    name: "football-data.org",
    rateLimit: () => Number(process.env.FOOTBALL_DATA_RATE_LIMIT || 10), // free tier: 10 calls/min
    dailyLimit: () => (process.env.FOOTBALL_DATA_DAILY_LIMIT ? Number(process.env.FOOTBALL_DATA_DAILY_LIMIT) : null), // free tier: no daily cap
    configured: () => !!process.env.FOOTBALL_DATA_TOKEN,
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
