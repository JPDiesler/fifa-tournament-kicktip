// Builds the source-dependent data bundle (Anhang B) handed to an AI player's LLM.
// Prefers api-football (rich: predictions/Poisson/comparison/lineups/injuries) when
// configured + we have its fixture id; otherwise football-data (lean: standings +
// recent form + h2h). All provider data is oriented to OUR canonical home/away.
// Every external call is budget-gated via the coordinator (shared provider budgets).
import { MATCHES, TEAMS, CHAMP_BONUS } from "../../data.js";
import { POINTS } from "../scoring.js";
import { codeForName, known } from "../fixtures.js";
import { getAdapter } from "../sources/index.js";
import { orientOdds } from "../sources/oddsParse.js";
import { budgetedCall } from "../coordinator.js";
import { extIdsByMatch, getResolved } from "../../db.js";

const matchByN = new Map(MATCHES.map((m) => [m.n, m]));
const teamName = (code) => TEAMS[code]?.name || code;
const isGroupMatch = (m) => known(m.h) && known(m.a);
// Real Kicktipp scoring values for EV maximization (single source of truth).
const SCORING = { exact: POINTS.exact, goal_diff: POINTS.goal_diff, tendency: POINTS.tendency };

// Resolve a match's actual home/away. Group pairings are static; K.o. pairings come
// from the `resolved` table once the bracket fills in — null until then (the match
// isn't meaningfully tippable yet, so the caller defers, like a human would).
function sidesFor(m, matchN) {
  if (isGroupMatch(m)) return { home: { code: m.h, name: teamName(m.h) }, away: { code: m.a, name: teamName(m.a) } };
  const rv = getResolved(matchN);
  if (rv?.home_code && rv?.away_code && known(rv.home_code) && known(rv.away_code))
    return { home: { code: rv.home_code, name: rv.home_name || teamName(rv.home_code) }, away: { code: rv.away_code, name: rv.away_name || teamName(rv.away_code) } };
  return null;
}

// Build the per-match bundle, or null if the match is unknown / K.o. teams unresolved.
export async function buildBundle(matchN) {
  const m = matchByN.get(Number(matchN));
  if (!m) return null;
  const sides = sidesFor(m, matchN);
  if (!sides) return null; // K.o. pairing not resolved yet → defer
  const { home, away } = sides;
  const ext = extIdsByMatch(matchN);
  const base = {
    match_id: matchN,
    scoring: SCORING,
    fixture: {
      match_id: matchN, phase: m.ph,
      stage: isGroupMatch(m) ? "group" : "knockout",
      venue: m.ven, kickoff: m.dt, neutral_venue: true, // World Cup → all venues neutral
      home, away,
    },
  };

  const apiAd = getAdapter("apifootball");
  if (apiAd?.configured?.() && ext.apifootball) {
    const rich = await apiFootballBundle(ext.apifootball, home, away);
    if (rich) return { ...base, source: "api-football", ...rich };
  }
  const fdAd = getAdapter("footballdata");
  if (fdAd?.configured?.()) {
    const lean = await footballDataBundle(ext.footballdata, home, away);
    if (lean) return { ...base, source: "football-data", ...lean };
  }
  // No external data → minimal bundle; the model leans on its own knowledge.
  return { ...base, source: apiAd?.configured?.() ? "api-football" : "football-data" };
}

// api-football enrichment, relabeled to our home/away by team code.
async function apiFootballBundle(extId, home, away) {
  const ad = getAdapter("apifootball");
  const [pred, injuries, lineups] = await Promise.all([
    budgetedCall("apifootball", () => ad.fetchPredictions(extId)),
    budgetedCall("apifootball", () => ad.fetchInjuries(extId)),
    budgetedCall("apifootball", () => ad.fetchLineups(extId, { homeName: home.name, awayName: away.name, swap: false })),
  ]);
  const out = {};
  if (pred) {
    // The provider may list our away team as its "home" → orient by code.
    const apiHomeCode = codeForName(pred.teams?.home?.name);
    const swap = !!apiHomeCode && apiHomeCode !== home.code;
    const ha = (o) => (o ? (swap ? { home: o.away, away: o.home } : { home: o.home, away: o.away }) : null);
    out.predictions = {
      percent: ha(pred.predictions?.percent),
      goals: ha(pred.predictions?.goals),
      advice: pred.predictions?.advice || null,
    };
    if (pred.comparison) {
      out.comparison = {};
      for (const k of Object.keys(pred.comparison)) out.comparison[k] = ha(pred.comparison[k]);
    }
    out.teams = {
      home: { name: home.name, last_5: (swap ? pred.teams?.away : pred.teams?.home)?.last_5 || null },
      away: { name: away.name, last_5: (swap ? pred.teams?.home : pred.teams?.away)?.last_5 || null },
    };
    if (Array.isArray(pred.h2h))
      out.h2h = pred.h2h.slice(-6).map((g) => ({ date: g.fixture?.date, home: g.teams?.home?.name, away: g.teams?.away?.name, goals: g.goals }));
  }
  if (lineups) out.lineups = lineups;
  if (Array.isArray(injuries) && injuries.length)
    out.injuries = injuries.map((i) => ({ team: i.team?.name, player: i.player?.name, type: i.player?.type, reason: i.player?.reason }));
  return (out.predictions || out.comparison || out.lineups || out.injuries) ? out : null;
}

// football-data enrichment: standings rows for both teams + recent form + h2h.
async function footballDataBundle(extId, home, away) {
  const ad = getAdapter("footballdata");
  const standings = await budgetedCall("footballdata", () => ad.fetchStandings());
  const rows = [];
  for (const s of standings?.standings || []) for (const row of s.table || []) rows.push(row);
  const findRow = (code) => rows.find((r) => codeForName(r.team?.name) === code);
  const homeRow = findRow(home.code), awayRow = findRow(away.code);
  const trim = (r, name) => (r ? {
    team: name, position: r.position, playedGames: r.playedGames, points: r.points,
    won: r.won, draw: r.draw, lost: r.lost, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
    goalDifference: r.goalDifference, form: r.form,
  } : { team: name });

  const out = { standings: { home: trim(homeRow, home.name), away: trim(awayRow, away.name) } };

  const recent = async (row) => {
    if (!row?.team?.id) return null;
    const j = await budgetedCall("footballdata", () => ad.fetchTeamMatches(row.team.id, 5));
    if (!Array.isArray(j?.matches)) return null;
    return j.matches.map((mt) => ({
      date: mt.utcDate, home: mt.homeTeam?.shortName || mt.homeTeam?.name,
      away: mt.awayTeam?.shortName || mt.awayTeam?.name, score: mt.score?.fullTime, competition: mt.competition?.name,
    }));
  };
  const [rh, ra] = await Promise.all([recent(homeRow), recent(awayRow)]);
  if (rh) out.recent_home = rh;
  if (ra) out.recent_away = ra;

  if (extId) {
    const md = await budgetedCall("footballdata", () => ad.fetchMatch(extId));
    if (md?.head2head) out.h2h = md.head2head;
  }
  return out;
}

// 15-minute windows api-football buckets goal/card timing into (extra time = last two).
const MINUTE_BUCKETS = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90", "91-105", "106-120"];
// → array of 8 percentages (share of the team's events in each window), 0 where empty.
const minuteSeries = (obj) => MINUTE_BUCKETS.map((b) => { const v = obj?.[b]?.percentage; const n = v == null ? 0 : parseFloat(String(v)); return Number.isFinite(n) ? Math.round(n) : 0; });

// Per-team radar stats from a predictions response, oriented to our home/away (swap).
// last_5.{form,att,def} are percent strings; league.fixtures/goals are season totals.
function teamRadar(pred, swap) {
  const one = (t) => {
    if (!t) return null;
    const l5 = t.last_5 || {};
    const fx = t.league?.fixtures || {};
    const g = t.league?.goals || {};
    const c = t.league?.cards || {};
    return {
      last5: { form: l5.form ?? null, att: l5.att ?? null, def: l5.def ?? null },
      wins: fx.wins?.total ?? null,
      draws: fx.draws?.total ?? null,
      loses: fx.loses?.total ?? null,
      played: fx.played?.total ?? null,
      goalsFor: g.for?.total?.total ?? null,
      goalsAgainst: g.against?.total?.total ?? null,
      gfAvg: l5.goals?.for?.average ?? null,      // recent goals scored per game ("1.0")
      gaAvg: l5.goals?.against?.average ?? null,  // recent goals conceded per game
      // Event timing: share (%) of the team's goals/cards per 15-min window → timing chart.
      timing: { goalsFor: minuteSeries(g.for?.minute), goalsAgainst: minuteSeries(g.against?.minute), yellow: minuteSeries(c.yellow), red: minuteSeries(c.red) },
    };
  };
  return {
    home: one(swap ? pred.teams?.away : pred.teams?.home),
    away: one(swap ? pred.teams?.home : pred.teams?.away),
  };
}

// Human-facing pre-match preview (api-football only) — oriented to our home/away:
// win-percentages, advice, form, h2h, injuries, pre-match odds, AND the prediction
// `comparison` (7 metrics → bars) + per-team radar stats. null if no data.
// `want` selects which parts to (re)fetch; `prev` lets a partial refresh reuse the
// stored orientation + merge into the existing preview (budget-aware staleness refresh).
export async function buildPreview(matchN, { want = { predictions: true, odds: true, injuries: true }, prev = null } = {}) {
  const m = matchByN.get(Number(matchN));
  if (!m) return null;
  const sides = sidesFor(m, matchN);
  if (!sides) return null;
  const { home, away } = sides;
  const ext = extIdsByMatch(matchN);
  const ad = getAdapter("apifootball");
  if (!ad?.configured?.() || !ext.apifootball) return null;
  const [pred, injuries, odds] = await Promise.all([
    want.predictions ? budgetedCall("apifootball", () => ad.fetchPredictions(ext.apifootball)) : null,
    want.injuries ? budgetedCall("apifootball", () => ad.fetchInjuries(ext.apifootball)) : null,
    want.odds ? budgetedCall("apifootball", () => ad.fetchOdds(ext.apifootball)) : null,
  ]);
  const hasInj = Array.isArray(injuries) && injuries.length;
  if (!pred && !hasInj && !odds) return null;

  // Orient provider home/away to OUR home/away (the away team's data is swapped when
  // api-football lists our away side as its "home"). Derived from fresh predictions, or
  // reused from a prior preview on an odds-only refresh.
  const apiHomeCode = pred ? codeForName(pred.teams?.home?.name) : null;
  const swap = pred ? (!!apiHomeCode && apiHomeCode !== home.code) : !!prev?.swap;
  const pick = (ht, at) => (swap ? { home: at, away: ht } : { home: ht, away: at });

  // Upgrade-only merge: each (re)fetch fills in fields it has and NEVER nulls a field
  // that's missing this time — so a sparse refresh can't make a populated Prognose/
  // Quoten section flicker away. Stale fields are simply overwritten when fresh data exists.
  const now = Date.now();
  const out = { ...(prev || {}), home: home.name, away: away.name, swap };
  if (pred) {
    out.predAt = now;
    if (pred.predictions?.percent) {
      const pc = pred.predictions.percent, op = pick(pc.home, pc.away);
      const next = { home: op.home, draw: pc.draw, away: op.away };
      // api-football collapses the win % to a flat 33/33/33 once it has no real
      // prediction (commonly at/after kickoff). Never let that clobber a meaningful
      // value we already captured pre-match → the win chances stay shown through live.
      const flat = (x) => { const v = (s) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0; return v(x.home) === v(x.draw) && v(x.draw) === v(x.away); };
      if (!flat(next) || !out.percent) out.percent = next;
    }
    if (pred.predictions?.advice) out.advice = pred.predictions.advice;
    const form = pick(pred.teams?.home?.league?.form || null, pred.teams?.away?.league?.form || null); // "WWDLW"-ish, best effort
    if (form.home || form.away) out.form = form;
    if (pred.comparison) {
      const cmp = {};
      for (const k of Object.keys(pred.comparison)) cmp[k] = pick(pred.comparison[k]?.home, pred.comparison[k]?.away);
      out.comparison = cmp;
    }
    const radar = teamRadar(pred, swap);
    if (radar.home || radar.away) out.teams = radar;
    if (Array.isArray(pred.h2h) && pred.h2h.length) out.h2h = pred.h2h.slice(-5).map((g) => ({ date: g.fixture?.date, home: g.teams?.home?.name, away: g.teams?.away?.name, goals: g.goals }));
  }
  if (odds) { out.oddsAt = now; out.odds = orientOdds(odds, swap); }
  if (hasInj) out.injuries = injuries.map((i) => ({ team: i.team?.name, player: i.player?.name, reason: i.player?.reason }));
  return out;
}

// One-off champion (Weltmeister) bundle: the valid team codes + group standings.
export async function buildChampionBundle() {
  const teams = Object.keys(TEAMS).map((code) => ({ code, name: teamName(code) }));
  const base = { type: "champion", scoring: { champion_bonus: CHAMP_BONUS }, teams };
  const fdAd = getAdapter("footballdata");
  if (fdAd?.configured?.()) {
    const standings = await budgetedCall("footballdata", () => fdAd.fetchStandings());
    if (standings?.standings) {
      base.source = "football-data";
      base.standings = standings.standings.map((s) => ({
        group: s.group || s.stage || null,
        table: (s.table || []).map((r) => ({
          team: r.team?.name, code: codeForName(r.team?.name), position: r.position,
          points: r.points, played: r.playedGames, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, form: r.form,
        })),
      }));
      return base;
    }
  }
  base.source = fdAd?.configured?.() ? "football-data" : "api-football";
  return base;
}
