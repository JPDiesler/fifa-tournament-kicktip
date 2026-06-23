// Coordination layer between sync.js and the result-source adapter (api-football,
// the sole provider). Fetches the fixture feed once per cycle within the provider's
// per-minute and per-day budget, then emits canonical per-match records with goals
// already ORIENTED to the static home/away (swap applied) so sync.js stays a thin
// writer. The per-feature merge structure is kept so the data path is unchanged.
import { matchForFixture } from "./fixtures.js";
import { remainingLoadToday } from "./poller.js";
import { getAdapter, DEFAULT_SOURCE } from "./sources/index.js";
import { orientOdds } from "./sources/oddsParse.js";
import { getSourceConfig, getProviderCaps, getMeta, setMeta, getLivePollSeconds, getProviderDelay } from "../db.js";

export const FEATURES = ["results", "liveScore", "liveMinute", "phase", "scorers", "cards"];

// ---- per-provider budgets ----
const RATE_WINDOW_MS = 60_000;
const recent = new Map(); // id → call timestamps (resets on restart, harmless)
function rateOk(id, perMin) {
  const now = Date.now();
  const arr = (recent.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.set(id, arr);
  return arr.length < perMin;
}
function noteCall(id, n = 1) {
  const arr = recent.get(id) || [];
  const now = Date.now();
  for (let i = 0; i < n; i++) arr.push(now);
  recent.set(id, arr);
  const meta = getMeta();
  const today = new Date().toISOString().slice(0, 10);
  const pc = meta.providerCalls || {};
  if (!pc[id] || pc[id].date !== today) pc[id] = { date: today, count: 0 };
  pc[id].count += n;
  meta.providerCalls = pc;
  setMeta(meta);
}
function dailyOk(id, limit) {
  if (limit == null) return true; // dailyLimit set to null = explicitly uncapped
  const pc = getMeta().providerCalls?.[id];
  const today = new Date().toISOString().slice(0, 10);
  return !pc || pc.date !== today || pc.count < limit;
}

// Lazy player profile/bio (on a player-detail open). Routed to a provider that supports
// it, budget-gated like every other ancillary call. null if unavailable/over budget.
export async function getPlayerProfile(pid, season) {
  const id = (effectiveConfig().routing.scorers || []).find((p) => getAdapter(p)?.fetchPlayerProfile && getAdapter(p)?.configured?.()) || DEFAULT_SOURCE;
  const ad = getAdapter(id);
  if (!ad?.fetchPlayerProfile || !ad.configured?.()) return null;
  return budgetedCall(id, () => ad.fetchPlayerProfile(pid, season));
}

// Budget-gated ancillary single call (used by the AI-player bundle builder). Returns
// null if over the provider's per-minute or daily budget — or on error — otherwise
// notes the call against the SAME budgets the sync uses and returns fn()'s result.
export async function budgetedCall(id, fn) {
  const ad = getAdapter(id);
  if (!ad) return null;
  if (!rateOk(id, ad.rateLimit()) || !dailyOk(id, ad.dailyLimit())) return null;
  noteCall(id);
  try { return await fn(); } catch { return null; }
}

// ---- routing (defaults to DEFAULT_SOURCE = api-football for every feature) ----
// A stored routing may still name the removed football-data provider; such entries are
// filtered out and the feature falls back to DEFAULT_SOURCE so the feed never goes dark.
export function effectiveConfig() {
  const cfg = getSourceConfig() || {};
  const providers = cfg.providers || {};
  const usable = (id) => { const a = getAdapter(id); return !!(a && a.configured() && providers[id]?.enabled !== false); };
  const routing = {};
  for (const f of FEATURES) {
    const list = (cfg.routing?.[f] || [DEFAULT_SOURCE]).filter(usable);
    routing[f] = list.length ? list : [DEFAULT_SOURCE].filter(usable);
  }
  return { providers, routing };
}

// Orient a provider fixture to the static match's home/away (apply matchForFixture's swap).
const oriented = (fx) => ({
  homeGoals: fx.swap ? fx.awayGoals : fx.homeGoals,
  awayGoals: fx.swap ? fx.homeGoals : fx.awayGoals,
  penHome: fx.swap ? fx.penAway : fx.penHome,
  penAway: fx.swap ? fx.penHome : fx.penAway,
  homeName: fx.swap ? fx.awayName : fx.homeName,
  awayName: fx.swap ? fx.homeName : fx.awayName,
  winner: fx.winner === "home" ? (fx.swap ? "away" : "home") : fx.winner === "away" ? (fx.swap ? "home" : "away") : fx.winner,
});
const HAS = {
  results: (fx) => fx.finished && fx.homeGoals != null && fx.awayGoals != null,
  liveScore: (fx) => fx.live,
  liveMinute: (fx) => fx.minute != null,
  phase: (fx) => fx.phase != null,
};

// Fetch every routed provider once, match each fixture to a static match number,
// then merge per match + feature. Returns canonical records + provenance.
export async function fetchMerged() {
  const { routing } = effectiveConfig();
  const needed = [...new Set(Object.values(routing).flat())];
  const byProvider = {}; // id → { n: providerFixture (+swap,ko) }
  const errors = [], fetched = [];

  for (const id of needed) {
    const ad = getAdapter(id);
    if (!ad) continue;
    if (!rateOk(id, ad.rateLimit())) { errors.push(`${ad.name}: Rate-Limit`); continue; }
    if (!dailyOk(id, ad.dailyLimit())) { errors.push(`${ad.name}: Tageslimit`); continue; }
    try {
      noteCall(id);
      const list = await ad.fetchFixtures();
      const used = new Set(), map = {};
      for (const f of list) { if (!f.dateMs) continue; const hit = matchForFixture(f, used); if (hit) map[hit.n] = { ...f, swap: hit.swap, ko: hit.ko }; }
      byProvider[id] = map; fetched.push(id);
    } catch (e) { errors.push(`${ad.name}: ${e.message}`); }
  }

  return { fixtures: mergeFixtures(byProvider, fetched, routing), providers: needed, fetched, errors, routing, byProvider };
}

// Merge each provider's matched fixtures into canonical, oriented per-match
// records following the feature routing. Pure — exported for unit testing.
// `byProvider` = { id: { n: providerFixture(+swap,ko) } }.
export function mergeFixtures(byProvider, fetched, routing) {
  const ns = new Set();
  for (const id of fetched) for (const n of Object.keys(byProvider[id] || {})) ns.add(Number(n));
  const pick = (n, feature) => { for (const id of routing[feature] || []) { const fx = byProvider[id]?.[n]; if (fx && HAS[feature]?.(fx)) return fx; } return null; };
  const anyFx = (n) => { for (const id of fetched) { const fx = byProvider[id]?.[n]; if (fx) return fx; } return null; };

  const fixtures = [];
  for (const n of ns) {
    const resFx = pick(n, "results"), lsFx = pick(n, "liveScore"), phFx = pick(n, "phase"), mnFx = pick(n, "liveMinute");
    const idFx = resFx || lsFx || phFx || mnFx || anyFx(n);
    if (!idFx) continue;
    const idO = oriented(idFx);
    const rec = { n, ko: idFx.ko, finished: false, live: false, homeGoals: null, awayGoals: null, penHome: null, penAway: null, phase: null, statusShort: idFx.statusShort ?? null, minute: null, injuryTime: null, duration: null, winner: null, homeName: idO.homeName, awayName: idO.awayName, extIds: {} };
    for (const id of fetched) if (byProvider[id]?.[n]) rec.extIds[id] = byProvider[id][n].extId;
    if (resFx) {
      const o = oriented(resFx);
      rec.finished = true; rec.homeGoals = o.homeGoals; rec.awayGoals = o.awayGoals; rec.penHome = o.penHome; rec.penAway = o.penAway; rec.winner = o.winner; rec.homeName = o.homeName; rec.awayName = o.awayName;
      rec.duration = resFx.duration || "REGULAR"; // play length (REGULAR | EXTRA_TIME | PENALTY) for the final clock
      rec.minute = resFx.minute ?? null; rec.injuryTime = resFx.injuryTime ?? null; // FT elapsed + added time (api-football status.extra) → real final clock
    } else if (lsFx) {
      const o = oriented(lsFx);
      rec.live = true;
      const ok = lsFx.homeGoals != null && lsFx.awayGoals != null;
      rec.homeGoals = ok ? o.homeGoals : 0; rec.awayGoals = ok ? o.awayGoals : 0;
      rec.penHome = o.penHome; rec.penAway = o.penAway; // shootout tally during status "P"
    }
    if (!rec.finished) {
      if (phFx) rec.phase = phFx.phase;
      if (mnFx) { rec.minute = mnFx.minute; rec.injuryTime = mnFx.injuryTime; }
      if (rec.live && !rec.phase) rec.phase = "LIVE";
    }
    fixtures.push(rec);
  }
  return fixtures;
}

// Fetch scorers/cards for the given matches from the routed, CAPABLE provider
// (one detail call per provider+match, budget-gated + hard-capped). Only providers
// whose caps declare scorers/cards true are used. Returns { details:{n:{scorers,cards}}, capped }.
const DETAIL_MAX = Number(process.env.DETAIL_MAX_PER_SYNC || 8);
export async function fetchDetails(fixtures, byProvider, routing, matchNs, { max = DETAIL_MAX, lineupNs = null, statsNs = null, oddsNs = null, playerStatsNs = null } = {}) {
  const capsOf = (id) => getProviderCaps(id) || getAdapter(id)?.declaredCaps() || {};
  const sProv = (routing.scorers || []).find((id) => capsOf(id).scorers === true);
  const cProv = (routing.cards || []).find((id) => capsOf(id).cards === true);
  if (!sProv && !cProv) return { details: {}, lineups: {}, stats: {}, liveOdds: {}, playerStats: {}, capped: false, capable: false, queried: [] };
  const lProv = [sProv, cProv].find((id) => id && getAdapter(id)?.fetchLineups); // provider for the starting lineup
  const stProv = [sProv, cProv].find((id) => id && getAdapter(id)?.fetchStatistics); // provider for match statistics
  const oProv = [sProv, cProv].find((id) => id && getAdapter(id)?.fetchLiveOdds); // provider for in-play odds
  const psProv = [sProv, cProv].find((id) => id && getAdapter(id)?.fetchPlayerStats); // provider for per-player stats + captain

  const targets = fixtures.filter((f) => (f.live || f.finished) && (!matchNs || matchNs.has(f.n)));
  const cache = new Map(); // `${id}:${n}` → {scorers,cards,subs}|null
  const details = {}, lineups = {}, stats = {}, liveOdds = {}, playerStats = {};
  const queried = new Set(); // matches we fully fetched (events + lineup if requested)
  let calls = 0, capped = false;

  const get = async (provId, n) => {
    if (!provId) return null;
    const fx = byProvider[provId]?.[n];
    if (fx?.extId == null) return null;
    const k = `${provId}:${n}`;
    if (cache.has(k)) return cache.get(k);
    const ad = getAdapter(provId);
    if (!ad?.fetchDetail) return null;
    if (calls >= max) { capped = true; return null; }
    if (!rateOk(provId, ad.rateLimit()) || !dailyOk(provId, ad.dailyLimit())) { capped = true; return null; }
    const ctx = { homeName: fx.homeName, awayName: fx.awayName, swap: fx.swap }; // for h/a side tagging
    try { noteCall(provId); calls++; const d = await ad.fetchDetail(fx.extId, ctx); cache.set(k, d); return d; }
    catch { cache.set(k, null); return null; }
  };

  // Lineups: a separate endpoint, only fetched for matches that still need it
  // (lineupNs). Rate/daily-gated but not bound by `max` (it piggybacks the events pass).
  const getLineups = async (n) => {
    const fx = byProvider[lProv]?.[n];
    if (fx?.extId == null) return null;
    const ad = getAdapter(lProv);
    if (!rateOk(lProv, ad.rateLimit()) || !dailyOk(lProv, ad.dailyLimit())) { capped = true; return null; }
    try { noteCall(lProv); calls++; return await ad.fetchLineups(fx.extId, { homeName: fx.homeName, awayName: fx.awayName, swap: fx.swap }); }
    catch { return null; }
  };

  // Match statistics: separate endpoint, fetched for the matches in statsNs (live →
  // refresh, finished → once). Rate/daily-gated, piggybacks the pass (not max-bound).
  const getStats = async (n) => {
    const fx = byProvider[stProv]?.[n];
    if (fx?.extId == null) return null;
    const ad = getAdapter(stProv);
    if (!rateOk(stProv, ad.rateLimit()) || !dailyOk(stProv, ad.dailyLimit())) { capped = true; return null; }
    try { noteCall(stProv); calls++; return await ad.fetchStatistics(fx.extId, { homeName: fx.homeName, awayName: fx.awayName, swap: fx.swap }); }
    catch { return null; }
  };

  // In-play odds: separate live endpoint, fetched for matches in oddsNs (live only).
  // Outcomes are the provider's home/away → orient by swap. Rate/daily-gated, piggybacks.
  const getLiveOdds = async (n) => {
    const fx = byProvider[oProv]?.[n];
    if (fx?.extId == null) return null;
    const ad = getAdapter(oProv);
    if (!rateOk(oProv, ad.rateLimit()) || !dailyOk(oProv, ad.dailyLimit())) { capped = true; return null; }
    try {
      noteCall(oProv); calls++;
      const o = await ad.fetchLiveOdds(fx.extId);
      return o ? orientOdds(o, fx.swap) : null;
    } catch { return null; }
  };

  // Per-player stats: separate /fixtures/players endpoint, fetched for matches in
  // playerStatsNs (live → refresh, finished → once; only populated from kickoff). Also
  // carries the captain flag. Rate/daily-gated, piggybacks the pass (not max-bound).
  const getPlayerStats = async (n) => {
    const fx = byProvider[psProv]?.[n];
    if (fx?.extId == null) return null;
    const ad = getAdapter(psProv);
    if (!rateOk(psProv, ad.rateLimit()) || !dailyOk(psProv, ad.dailyLimit())) { capped = true; return null; }
    try { noteCall(psProv); calls++; return await ad.fetchPlayerStats(fx.extId); }
    catch { return null; }
  };

  for (const f of targets) {
    const sd = await get(sProv, f.n);
    const cd = sProv === cProv ? sd : await get(cProv, f.n);
    const eventsOk = sd !== null || cd !== null; // got a real response
    const scorers = sd?.scorers || [], cards = cd?.cards || [], subs = sd?.subs || [], shootout = sd?.shootout || null;
    if (scorers.length || cards.length || subs.length || shootout) details[f.n] = { scorers, cards, subs, shootout };
    let lineupOk = true;
    if (lineupNs?.has(f.n) && lProv) { const lu = await getLineups(f.n); if (lu) lineups[f.n] = lu; else lineupOk = false; }
    if (statsNs?.has(f.n) && stProv) { const s = await getStats(f.n); if (s) stats[f.n] = s; }
    if (oddsNs?.has(f.n) && oProv) { const o = await getLiveOdds(f.n); if (o) liveOdds[f.n] = o; }
    if (playerStatsNs?.has(f.n) && psProv) { const ps = await getPlayerStats(f.n); if (ps) playerStats[f.n] = ps; }
    if (eventsOk && lineupOk) queried.add(f.n); // fully done → don't keep retrying
  }
  return { details, lineups, stats, liveOdds, playerStats, capped, capable: true, queried: [...queried] };
}

// In-play odds polling enabled? (default on; set INPLAY_ODDS_ENABLED=off to disable.)
export const inplayOddsEnabled = () => process.env.INPLAY_ODDS_ENABLED !== "off";

const RESERVE = Math.min(0.5, Math.max(0, Number(process.env.POLL_BUDGET_RESERVE || 0.15)));
// Floor for the live poll. Default 1s so a large daily budget (e.g. 75k/day) can drive
// near-real-time polling; the budget sizer (below) keeps it from overrunning a small cap.
const MIN_POLL_MS = Math.max(250, Number(process.env.MIN_POLL_MS || 1_000)), MAX_POLL_MS = 300_000;

// Live-poll delay (ms) while a match runs. For a daily-capped provider WITHOUT a
// manual rate override → AUTO: spread the remaining daily budget over the remaining
// *match* load today (not the whole day), with a reserve → the optimal interval.
//   calls(interval) ≈ coverageSec/interval  (+ sumActiveSec/interval if it feeds
//   scorers/cards) ⇒ interval ≥ demand / usableBudget.
// A daily-capped provider WITH a manual rate → that optimal acts only as a
// protective floor (base interval otherwise governs). An uncapped provider
// (dailyLimit null) imposes nothing → base interval. Always within [10s, 5min].
export function liveDelayMs(now = Date.now()) {
  const base = getLivePollSeconds() * 1000;
  const { routing } = effectiveConfig();
  const needed = [...new Set(Object.values(routing).flat())];
  const meta = getMeta();
  const today = new Date().toISOString().slice(0, 10);
  const cfg = getSourceConfig() || {};
  const { coverageSec, sumActiveSec } = remainingLoadToday(now);

  const capsOf = (id) => getProviderCaps(id) || getAdapter(id)?.declaredCaps() || {};
  const sProv = (routing.scorers || []).find((id) => capsOf(id).scorers === true);
  const cProv = (routing.cards || []).find((id) => capsOf(id).cards === true);
  const oProv = [sProv, cProv].find((id) => id && getAdapter(id)?.fetchLiveOdds); // in-play odds provider
  const oddsOn = inplayOddsEnabled();

  let auto = null, manualFloor = 0;
  for (const id of needed) {
    const limit = getAdapter(id)?.dailyLimit();
    if (limit == null) continue; // no daily cap → no constraint from this provider
    const pc = meta.providerCalls?.[id];
    const used = pc && pc.date === today ? pc.count : 0;
    const usable = Math.max(1, (limit - used) * (1 - RESERVE));
    const feedsDetail = id === sProv || id === cProv;
    const feedsLiveOdds = oddsOn && id === oProv; // an extra per-live-match call when enabled
    const demandSec = coverageSec + (feedsDetail ? sumActiveSec : 0) + (feedsLiveOdds ? sumActiveSec : 0); // call-demand integral
    const reqMs = (demandSec / usable) * 1000;
    if (cfg.providers?.[id]?.rateLimit != null) manualFloor = Math.max(manualFloor, reqMs); // manual: protect only
    else auto = Math.max(auto ?? 0, reqMs);                                                  // auto: optimal target
  }
  let interval = auto != null ? auto : base;
  interval = Math.max(interval, manualFloor, MIN_POLL_MS);
  return Math.round(Math.min(interval, MAX_POLL_MS));
}

// Max FRESHNESS (s) for a capability to count as effective. Freshness = the live
// provider's inherent delay + the worst-case poll staleness. A feature only counts
// as "live" if the data is actually fresh enough; otherwise it's downgraded.
const CAP_MAX_FRESHNESS = { realtime: 30, liveMinute: 60, scorers: 300, cards: 300 };

// Effective capabilities for the frontend. For each feature, the primary routed
// provider's probed/declared cap, gated by the achievable freshness (provider
// delay + effective poll interval) so we never claim "live minute" while polling
// slowly or behind a delayed feed.
export function effectiveCapabilities() {
  const { routing } = effectiveConfig();
  const capsOf = (id) => getProviderCaps(id) || getAdapter(id)?.declaredCaps() || {};
  const first = (f) => routing[f]?.[0] || null;
  const cap = (f) => { const id = first(f); return id ? capsOf(id)[f] === true : false; }; // caps key === feature name (liveMinute/scorers/cards)
  const lsId = first("liveScore");
  const pollSeconds = Math.round(liveDelayMs() / 1000);
  const freshness = (lsId ? getProviderDelay(lsId) : 180) + pollSeconds;
  const fresh = (f) => freshness <= CAP_MAX_FRESHNESS[f];
  return {
    results: !!first("results"),
    liveScore: !!lsId,
    phase: !!first("phase"),
    liveMinute: cap("liveMinute") && fresh("liveMinute"),
    scorers: cap("scorers") && fresh("scorers"),
    cards: cap("cards") && fresh("cards"),
    realtime: !!lsId && freshness <= CAP_MAX_FRESHNESS.realtime,
    delaySeconds: freshness, // shown to users as the live-display delay
    pollSeconds,
    client: (getProviderCaps(lsId) || {}).client || null,
    checkedAt: (getProviderCaps(first("results")) || {}).checkedAt || null,
  };
}
