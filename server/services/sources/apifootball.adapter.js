// API-Football (v3.football.api-sports.io) adapter. Real-time data on paid plans
// (live minute, scorers, cards); season 2026 typically requires a subscription.
import { getProviderToken, getProviderLimits } from "../../db.js";

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
    minute: f.fixture?.status?.elapsed ?? null,
    injuryTime: null, // not provided
    homeName: f.teams?.home?.name || null,
    awayName: f.teams?.away?.name || null,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
    winner: f.teams?.home?.winner ? "home" : f.teams?.away?.winner ? "away" : null,
  };
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

// Per-fixture events → scorers + cards.
async function fetchDetail(extId) {
  const r = await fetch(`${BASE}/fixtures/events?fixture=${extId}`, H());
  const j = await r.json();
  const ev = Array.isArray(j.response) ? j.response : [];
  const scorers = ev.filter((e) => e.type === "Goal").map((e) => ({ team: e.team?.name || null, player: e.player?.name || null, minute: e.time?.elapsed ?? null }));
  const cards = ev.filter((e) => e.type === "Card").map((e) => ({ team: e.team?.name || null, player: e.player?.name || null, minute: e.time?.elapsed ?? null, card: e.detail || null }));
  return { scorers, cards };
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
  declaredCaps, fetchFixtures, fetchDetail, probe,
};
