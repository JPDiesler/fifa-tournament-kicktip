// API-Football (v3.football.api-sports.io) adapter. Real-time data on paid plans
// (live minute, scorers, cards); season 2026 typically requires a subscription.
import { getProviderToken, getProviderLimits } from "../../db.js";
import { pickMarkets } from "./oddsParse.js";

const BASE = "https://v3.football.api-sports.io";
const key = () => getProviderToken("apifootball"); // DB override (admin) → env API_FOOTBALL_KEY
const H = () => ({ headers: { "x-apisports-key": key() } });

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
    providerId: "apifootball", extId: f.fixture?.id,
    dateMs: Date.parse(f.fixture?.date),
    finished: ["FT", "AET", "PEN"].includes(short),
    live, phase,
    duration: short === "PEN" ? "PENALTY" : short === "AET" ? "EXTRA_TIME" : short === "FT" ? "REGULAR" : null,
    minute: f.fixture?.status?.elapsed ?? null,
    injuryTime: f.fixture?.status?.extra ?? null, // added/stoppage time of the current period (also set at FT)
    homeName: f.teams?.home?.name || null,
    awayName: f.teams?.away?.name || null,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
    winner: f.teams?.home?.winner ? "home" : f.teams?.away?.winner ? "away" : null,
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
  const league = process.env.API_LEAGUE || "1";
  const season = process.env.API_SEASON || "2026";
  const r = await fetch(`${BASE}/fixtures?league=${league}&season=${season}`, H());
  const j = await r.json();
  const errs = j.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) throw new Error(JSON.stringify(errs));
  return (j.response || []).map(mapApiFootballFixture);
}

// Per-fixture events → scorers + cards, each tagged with the team SIDE ("h"/"a", via
// ctx) and goals with a type ("penalty"/"own"/null). A "Missed Penalty" is a Goal
// event that didn't score → dropped. api-football lists an own goal under the player's
// (offending) team — we keep that side so the scorer shows on his own team, marked (ET).
async function fetchDetail(extId, ctx) {
  const r = await fetch(`${BASE}/fixtures/events?fixture=${extId}`, H());
  const j = await r.json();
  const ev = Array.isArray(j.response) ? j.response : [];
  const goalType = (d) => (d === "Penalty" ? "penalty" : d === "Own Goal" ? "own" : null);
  const scorers = ev
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .map((e) => ({ team: e.team?.name || null, player: e.player?.name || null, minute: e.time?.elapsed ?? null, injury: e.time?.extra ?? null, type: goalType(e.detail), side: sideOf(e.team?.name, ctx) }));
  const cards = ev
    .filter((e) => e.type === "Card")
    .map((e) => ({ team: e.team?.name || null, player: e.player?.name || null, minute: e.time?.elapsed ?? null, injury: e.time?.extra ?? null, card: e.detail || null, side: sideOf(e.team?.name, ctx) }));
  // Substitutions: api-football's subst event carries the player going OFF in `player`
  // and the one coming ON in `assist` (verified against live data, despite the docs).
  const subs = ev
    .filter((e) => e.type === "subst")
    .map((e) => ({ minute: e.time?.elapsed ?? null, injury: e.time?.extra ?? null, in: e.assist?.name || null, out: e.player?.name || null, side: sideOf(e.team?.name, ctx) }));
  return { scorers, cards, subs };
}

// Starting lineups + bench/formation/coach, oriented to the static home/away (via ctx).
async function fetchLineups(extId, ctx) {
  const r = await fetch(`${BASE}/fixtures/lineups?fixture=${extId}`, H());
  const j = await r.json();
  const arr = Array.isArray(j.response) ? j.response : [];
  if (arr.length < 2) return null; // lineups usually publish ~1h before kickoff
  const mapTeam = (t) => ({
    formation: t.formation || null,
    coach: t.coach?.name || null,
    coachId: t.coach?.id ?? null, // → coach photo via the media CDN (free)
    teamId: t.team?.id ?? null, // → team crest via the media CDN (free)
    // The match kit colours (home team = home kit, away team = change kit) → real
    // home/away colours per side. { player:{primary,number,border}, goalkeeper:{…} }.
    colors: t.team?.colors || null,
    startXI: (t.startXI || []).map((e) => ({ pid: e.player?.id ?? null, n: e.player?.number ?? null, name: e.player?.name || null, pos: e.player?.pos || null, grid: e.player?.grid || null })),
    bench: (t.substitutes || []).map((e) => ({ pid: e.player?.id ?? null, n: e.player?.number ?? null, name: e.player?.name || null, pos: e.player?.pos || null })),
  });
  const out = { home: null, away: null };
  for (const t of arr) {
    const side = sideOf(t.team?.name, ctx);
    if (side === "h") out.home = mapTeam(t);
    else if (side === "a") out.away = mapTeam(t);
  }
  if (!out.home && !out.away) { const a = mapTeam(arr[0]), b = mapTeam(arr[1]); out.home = ctx?.swap ? b : a; out.away = ctx?.swap ? a : b; }
  return out;
}

// Per-team match statistics, oriented to the static home/away (via ctx). Values are
// raw api-football strings/numbers ("56%", 12, …); the UI formats them.
const STAT_KEY = {
  "Ball Possession": "possession", "Total Shots": "shots", "Shots on Goal": "shotsOnGoal",
  "Shots off Goal": "shotsOffGoal", "Blocked Shots": "blockedShots", "Corner Kicks": "corners",
  "Fouls": "fouls", "Offsides": "offsides", "Yellow Cards": "yellow", "Red Cards": "red",
  "Goalkeeper Saves": "saves", "Total passes": "passes", "Passes accurate": "passesAccurate",
  "Passes %": "passAccuracy", "expected_goals": "xg",
};
async function fetchStatistics(extId, ctx) {
  const r = await fetch(`${BASE}/fixtures/statistics?fixture=${extId}`, H());
  const j = await r.json();
  const arr = Array.isArray(j.response) ? j.response : [];
  if (arr.length < 2) return null; // not published yet
  const teamStats = (entry) => {
    const o = {};
    for (const s of entry.statistics || []) { const k = STAT_KEY[s.type]; if (k && s.value != null) o[k] = s.value; }
    return o;
  };
  const out = { home: null, away: null };
  for (const entry of arr) {
    const side = sideOf(entry.team?.name, ctx);
    if (side === "h") out.home = teamStats(entry);
    else if (side === "a") out.away = teamStats(entry);
  }
  if (!out.home && !out.away) { out.home = teamStats(arr[ctx?.swap ? 1 : 0]); out.away = teamStats(arr[ctx?.swap ? 0 : 1]); }
  return (out.home || out.away) ? out : null;
}

// --- AI-bundle data (pre-match): predictions (form/att-def/Poisson/percent/h2h) + injuries ---
// Each returns response[0] / response[] (or null/[]); orientation is handled by the bundle builder.
async function fetchPredictions(extId) {
  const r = await fetch(`${BASE}/predictions?fixture=${extId}`, H());
  const j = await r.json();
  return Array.isArray(j.response) ? (j.response[0] || null) : null;
}
async function fetchInjuries(extId) {
  const r = await fetch(`${BASE}/injuries?fixture=${extId}`, H());
  const j = await r.json();
  return Array.isArray(j.response) ? j.response : [];
}
// Pre-match odds for ALL bookmakers → curated markets (1X2, O/U 2.5, BTTS) per book,
// provider home/away (the bundle builder orients). { update, bookmakers:[…] } | null.
async function fetchOdds(extId) {
  const r = await fetch(`${BASE}/odds?fixture=${extId}`, H());
  const j = await r.json();
  const resp = Array.isArray(j.response) ? j.response[0] : null;
  if (!resp) return null;
  const bookmakers = (resp.bookmakers || []).map((bm) => ({ name: bm.name, ...pickMarkets(bm.bets) })).filter((bm) => bm.mw || bm.ou25 || bm.btts);
  if (!bookmakers.length) return null;
  return { update: resp.update || null, bookmakers };
}

// In-play odds from /odds/live (paid live feed; NO history — only while the match runs).
// Same curated shape + a `suspended` flag. Live is an aggregated feed (usually one
// "bookmaker"); we keep the array shape and surface Next Goal when present. null if none.
async function fetchLiveOdds(extId) {
  const r = await fetch(`${BASE}/odds/live?fixture=${extId}`, H());
  const j = await r.json();
  const resp = Array.isArray(j.response) ? j.response[0] : null;
  if (!resp) return null;
  const suspended = !!(resp.status?.stopped || resp.status?.blocked);
  const bookmakers = (Array.isArray(resp.bookmakers) && resp.bookmakers.length
    ? resp.bookmakers.map((bm) => ({ name: bm.name, ...pickMarkets(bm.bets) }))
    : [{ name: "Live", ...pickMarkets(resp.odds) }]
  ).filter((bm) => bm.mw || bm.ou25 || bm.btts || bm.nextGoal);
  if (!bookmakers.length) return null;
  return { update: resp.update || null, suspended, bookmakers };
}

// Paid real-time provider: assume the full feature set (confirmed by probe).
const declaredCaps = () => ({ results: true, liveScore: true, phase: true, liveMinute: true, scorers: true, cards: true, realtime: true });

// Probe the key via the lightweight /status endpoint. Never throws.
async function probe() {
  if (!key()) return { ok: false, error: "Kein API-Key gesetzt" };
  try {
    const r = await fetch(`${BASE}/status`, H());
    const availableMinute = Number(r.headers.get("x-ratelimit-remaining"));
    const j = await r.json().catch(() => ({}));
    const errs = j.errors;
    if (!r.ok || (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)))
      return { ok: false, status: r.status, error: (errs && JSON.stringify(errs)) || `HTTP ${r.status}` };
    const acct = j.response?.account;
    const client = acct ? ([acct.firstname, acct.lastname].filter(Boolean).join(" ") || acct.email || null) : null;
    return { ok: true, status: r.status, client, availableMinute: Number.isFinite(availableMinute) ? availableMinute : undefined, caps: declaredCaps() };
  } catch (e) { return { ok: false, error: e.message }; }
}

export const apifootball = {
  id: "apifootball",
  name: "API-Football",
  // admin override → env → default (Pro plan e.g. 7500/day; set it in the admin UI)
  rateLimit: () => { const o = getProviderLimits("apifootball").rateLimit; return Number.isFinite(o) ? o : Number(process.env.API_RATE_LIMIT || 10); },
  dailyLimit: () => { const o = getProviderLimits("apifootball").dailyLimit; return o === null ? null : Number.isFinite(o) ? o : Number(process.env.API_DAILY_LIMIT || 100); },
  configured: () => !!key(),
  declaredCaps, fetchFixtures, fetchDetail, fetchLineups, fetchStatistics, fetchPredictions, fetchInjuries, fetchOdds, fetchLiveOdds, probe,
};
