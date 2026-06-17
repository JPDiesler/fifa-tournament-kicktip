// Result + near-live sync. Thin writer over the coordinator, which fans out
// across providers and returns canonical per-match records (goals already
// oriented to the static home/away). Writing (results/resolved/live), champion
// detection and push hooks stay here; provider fetching + per-feature merge +
// rate budgets live in coordinator.js.
import { TEAMS, MATCHES } from "../data.js";
import { codeForName, FINAL_N } from "./fixtures.js";
import { kickoff } from "./locks.js";
import { fetchMerged, fetchDetails, effectiveCapabilities } from "./coordinator.js";
import { buildPreview } from "./ai/bundle.js";
import {
  setResult, setResolved, clearResolved, replaceLive, liveByMatch,
  getMeta, setMeta, getChampionActual, setChampionActual, setCapabilities,
  setMatchDetail, setMatchFinalTime, setMatchLineups, setMatchStats, setMatchPreview, detailByMatch, setMatchExtIds,
} from "../db.js";
import { notifyKickoff, notifyGoal, notifyFinal } from "./push.js";

// Nominal final clock from the play length: regular → 90', extra time / penalties → 120'.
function finalClockFromRecord(rec) {
  const dur = rec.duration || "REGULAR";
  if (dur === "PENALTY") return { minute: 120, injury: null, phase: "PEN" };
  if (dur === "EXTRA_TIME") return { minute: 120, injury: null, phase: "ET" };
  return { minute: 90, injury: null, phase: null };
}
// Latest goal/card event clock (minute + stoppage) — a provable lower bound on how
// long the match actually ran. null when there are no timed events.
function maxEventClock(detail) {
  let best = null;
  for (const e of [...(detail?.scorers || []), ...(detail?.cards || [])]) {
    if (e.minute == null) continue;
    if (!best || e.minute + (e.injury || 0) > best.minute + (best.injury || 0)) best = { minute: e.minute, injury: e.injury || null };
  }
  return best;
}
// Best final clock = the LARGEST of nominal length, last live snapshot, and latest
// event — so a regular match with a card at 90+2 reads "90+2" instead of bare "90"
// (api-football omits stoppage from the live minute, so events are the better source).
function finalClock(rec, prev, detail) {
  let best = finalClockFromRecord(rec); // nominal baseline carries the phase (ET/PEN)
  const consider = (minute, injury) => {
    if (minute == null) return;
    if (minute + (injury || 0) > best.minute + (best.injury || 0)) best = { minute, injury: injury || null, phase: best.phase };
  };
  consider(rec.minute, rec.injuryTime); // provider's FT elapsed + added time (api-football status.extra)
  if (prev) consider(prev.minute, prev.injury);
  const ev = maxEventClock(detail);
  if (ev) consider(ev.minute, ev.injury);
  return best;
}
// Total played seconds of a final clock, for "only ever upgrade" comparisons (-1 = none).
const finalTot = (f) => (f && f.minute != null ? f.minute + (f.injury || 0) : -1);
// Persist scorers/cards but never let an empty side ERASE already-stored events: a
// provider returns all events of a match at once, so a momentarily empty response is
// a glitch (or an early live snapshot), not a real "no events". Keeps the richer side.
function writeDetail(n, d, have) {
  setMatchDetail(n,
    d.scorers?.length ? d.scorers : have[n]?.scorers || [],
    d.cards?.length ? d.cards : have[n]?.cards || [],
    d.subs?.length ? d.subs : have[n]?.subs || []);
}

export async function sync(reason = "cron") {
  try {
    const prevLive = liveByMatch(); // diff target for kickoff/goal detection
    const { fixtures, fetched, errors, providers, byProvider, routing } = await fetchMerged();
    if (!providers.length) {
      const m = getMeta(); m.lastSyncMsg = `${reason}: keine Quelle konfiguriert`; setMeta(m); return;
    }

    const events = [];
    const liveMap = {};
    const have = detailByMatch(); // existing scorers/cards/final clock per match
    let updated = 0, resolvedCount = 0, championCode = null;

    for (const rec of fixtures) {
      const n = rec.n;
      // Persist provider fixture ids so the AI-tip scheduler can build a data bundle
      // for a match without re-fetching the whole fixture list.
      if (rec.extIds && Object.keys(rec.extIds).length) setMatchExtIds(n, rec.extIds);
      if (rec.ko) {
        // K.o.: store the API-resolved teams (+ winner side, so a shootout winner
        // is known even when the fulltime score is level).
        if (rec.homeName && rec.awayName) {
          const winner = rec.winner === "home" || rec.winner === "away" ? rec.winner : null;
          setResolved(n, { homeName: rec.homeName, awayName: rec.awayName, homeCode: codeForName(rec.homeName), awayCode: codeForName(rec.awayName), winner });
          resolvedCount++;
        }
      } else {
        clearResolved(n); // group pairings are static/authoritative
      }

      if (rec.finished && rec.homeGoals != null && rec.awayGoals != null) {
        setResult(n, String(rec.homeGoals), String(rec.awayGoals));
        updated++;
        events.push(() => notifyFinal(n, rec.homeGoals, rec.awayGoals));
      } else if (rec.live) {
        const h = rec.homeGoals ?? 0, a = rec.awayGoals ?? 0; // default 0:0 so a running card always shows a score
        liveMap[n] = { h: String(h), a: String(a), phase: rec.phase, minute: rec.minute, injury: rec.injuryTime };
        const prev = prevLive[n];
        if (!prev) {
          events.push(() => notifyKickoff(n));
        } else {
          const ph = Number(prev.h) || 0, pa = Number(prev.a) || 0;
          if (h > ph || a > pa) events.push(() => notifyGoal(n, h, a, (h - ph) >= (a - pa) ? "h" : "a"));
        }
      }

      // Champion = winner of the final (derived from the winner flag; a shootout
      // title still resolves even though the fulltime score is a draw).
      if (n === FINAL_N && rec.finished && rec.winner && rec.winner !== "draw") {
        championCode = codeForName(rec.winner === "home" ? rec.homeName : rec.awayName);
      }
    }

    // In-play state is fully derived from this fetch → replacing clears finished/idle matches.
    replaceLive(liveMap);
    // Fire queued push notifications (each idempotent + self-contained, fire-and-forget).
    for (const ev of events) { try { ev()?.catch?.((e) => console.error("push", e)); } catch (e) { console.error("push", e); } }
    // Recompute the effective feature capabilities for the frontend.
    setCapabilities(effectiveCapabilities());

    // Scorers/cards for live matches + finished matches lacking detail OR a final
    // clock (the latter forces ONE post-finish refetch → complete stoppage-time cards
    // + an accurate final clock). Only via a provider whose caps support it.
    try {
      const need = new Set([
        ...Object.keys(liveMap).map(Number),
        ...fixtures.filter((f) => f.finished && (have[f.n]?.final == null || !(have[f.n]?.scorers?.length || have[f.n]?.cards?.length) || !have[f.n]?.stats)).map((f) => f.n),
      ]);
      const lineupNs = new Set([...need].filter((n) => !have[n]?.lineups)); // fetch each lineup once
      // statistics: refresh while live, fetch once for finished matches that lack them
      const statsNs = new Set([...Object.keys(liveMap).map(Number), ...fixtures.filter((f) => f.finished && !have[f.n]?.stats).map((f) => f.n)]);
      let details = {};
      if (need.size) {
        const r = await fetchDetails(fixtures, byProvider, routing, need, { lineupNs, statsNs });
        details = r.details;
        for (const [n, d] of Object.entries(details)) writeDetail(n, d, have);
        for (const [n, lu] of Object.entries(r.lineups)) setMatchLineups(n, lu);
        for (const [n, s] of Object.entries(r.stats || {})) setMatchStats(n, s);
        if (r.capped) console.log("Detail-Limit erreicht – einige Spiele ausgelassen.");
      }
      // Final match clock from the best source (live snapshot / events / nominal).
      // Only ever upgrade to a larger time — so a stored nominal 90 becomes 90+2 once
      // a stoppage event is known, but a complete clock is never shrunk.
      for (const f of fixtures) {
        if (!f.finished) continue;
        const cand = finalClock(f, prevLive[f.n], details[f.n] || have[f.n]);
        if (finalTot(cand) > finalTot(have[f.n]?.final)) setMatchFinalTime(f.n, cand);
      }
    } catch (e) { console.error("detail", e); }

    let champMsg = "";
    if (championCode && getChampionActual() !== championCode) {
      setChampionActual(championCode);
      champMsg = `, Weltmeister: ${TEAMS[championCode]?.name || championCode}`;
    }

    // Re-read meta fresh (the coordinator updated providerCalls during the fetch).
    const meta = getMeta();
    meta.lastSync = new Date().toISOString();
    const liveCount = Object.keys(liveMap).length;
    const errInfo = errors.length ? ` · ${errors.join("; ")}` : "";
    meta.lastSyncMsg = `${reason} · ${fetched.join("+") || "—"}: ${fixtures.length} Spiele, ${updated} Ergebnisse, ${resolvedCount} Paarungen${liveCount ? `, ${liveCount} live` : ""}${champMsg}${errInfo}`;
    setMeta(meta);
    console.log(meta.lastSyncMsg);
  } catch (e) {
    const m = getMeta(); m.lastSyncMsg = "Sync-Fehler: " + e.message; setMeta(m); console.error("sync", e);
  }
}

// One-shot detail backfill for matches that finished WITHOUT scorers/cards/final
// clock yet (e.g. while the server was down). One fixtures fetch, then detail for as
// many finished matches as the rate/daily budget allows this pass; the caller re-runs
// it until drained. Writes a (nominal) final clock for every finished match.
// Returns { remaining, fetched, capable } so the caller can stop when there's no
// capable detail provider or no further progress is possible.
// force = re-fetch EVERY finished match's detail (not just those missing data) — for
// a manual "reload details" that repairs already-stored-but-incomplete matches.
// skip = matches already handled this run (so the force loop converges).
export async function backfillDetails({ force = false, skip = null } = {}) {
  const { fixtures, byProvider, routing } = await fetchMerged();
  const have = detailByMatch();
  const need = new Set(fixtures.filter((f) => {
    if (!f.finished || skip?.has(f.n)) return false;
    if (force) return true;
    return have[f.n]?.final == null || !(have[f.n]?.scorers?.length || have[f.n]?.cards?.length) || !have[f.n]?.stats;
  }).map((f) => f.n));
  if (!need.size) return { remaining: 0, fetched: 0, capable: true, queried: [] };

  const lineupNs = force ? need : new Set([...need].filter((n) => !have[n]?.lineups));
  const statsNs = force ? need : new Set([...need].filter((n) => !have[n]?.stats));
  const { details, lineups, stats, capable, queried } = await fetchDetails(fixtures, byProvider, routing, need, { max: need.size, lineupNs, statsNs });
  let fetched = 0;
  for (const [n, d] of Object.entries(details)) { writeDetail(n, d, have); fetched++; }
  for (const [n, lu] of Object.entries(lineups)) setMatchLineups(n, lu);
  for (const [n, s] of Object.entries(stats || {})) setMatchStats(n, s);
  // Final clock for finished matches — upgrade to a larger time from fresh/stored
  // events (corrects an earlier nominal 90 → 90+2), never shrink.
  for (const f of fixtures) {
    if (!f.finished) continue;
    const cand = finalClock(f, null, details[f.n] || have[f.n]);
    if (finalTot(cand) > finalTot(have[f.n]?.final)) setMatchFinalTime(f.n, cand);
  }
  const remaining = force
    ? need.size - queried.length // capped this pass; the rest retries next pass
    : [...need].filter((n) => !details[n] && !(have[n]?.scorers?.length || have[n]?.cards?.length)).length;
  return { remaining, fetched, capable, queried };
}

// Pre-match preview (predictions/form/h2h/injuries) for upcoming matches — fetched
// ONCE per match (kept until kickoff), budget-gated + capped. Surfaced to human
// tippers in the detail carousel. Only api-football provides it.
export async function prefetchPreviews(now = Date.now(), max = 6) {
  const have = detailByMatch();
  const soon = MATCHES
    .filter((m) => {
      const ko = kickoff(m.n);
      if (ko == null || ko <= now || ko - now > 48 * 3600 * 1000) return false; // only upcoming, ≤48h
      const pv = have[m.n]?.preview;
      if (!pv) return true;                                  // no preview yet → fetch
      return !pv.odds && ko - now < 24 * 3600 * 1000;        // have preview but no odds & <24h → retry (odds appear closer to KO)
    })
    .sort((a, b) => kickoff(a.n) - kickoff(b.n))
    .slice(0, max);
  for (const m of soon) {
    try { const p = await buildPreview(m.n); if (p) setMatchPreview(m.n, p); }
    catch (e) { console.error("preview", m.n, e?.message || e); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let backfillRunning = false;

// Drain ALL matches still missing scorers/cards/final-clock: one budget-gated pass
// per minute until nothing is left (or there's no capable detail provider / no
// further progress). Re-entrant-safe — a call while a drain is already in flight is a
// no-op. Fire-and-forget: callers (start, safety sync, manual sync) don't await it.
export async function runBackfill(reason = "start", { force = false } = {}) {
  if (backfillRunning) return;
  backfillRunning = true;
  const done = force ? new Set() : null; // force: remember handled matches so the loop converges
  let pass = 0;
  try {
    for (;;) {
      const { remaining, fetched, capable, queried } = await backfillDetails({ force, skip: done });
      if (done) queried.forEach((n) => done.add(n));
      console.log(`Backfill (${reason}${force ? "/force" : ""}): ${fetched} Spiele geholt, ${remaining} offen`);
      if (!capable || remaining === 0) break;
      if (!force && fetched === 0) break;      // normal: stop once no more progress
      if (force && ++pass >= 30) break;        // force: hard cap (rate budget spreads it over minutes)
      await sleep(60_000); // spread further passes across the per-minute rate budget
    }
  } catch (e) { console.error("backfill", e); }
  finally { backfillRunning = false; }
}
