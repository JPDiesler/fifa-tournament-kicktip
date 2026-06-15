// Result + near-live sync (provider-agnostic; source chosen via DATA_SOURCE).
import { TEAMS } from "../data.js";
import { activeSource } from "./sources.js";
import { matchForFixture, codeForName, FINAL_N } from "./fixtures.js";
import {
  setResult, setResolved, clearResolved, replaceLive, liveByMatch,
  getMeta, setMeta, getChampionActual, setChampionActual,
} from "../db.js";
import { notifyKickoff, notifyGoal, notifyFinal } from "./push.js";

// Per-minute rate guard (the binding limit on the free tiers). In-memory ring of
// recent call timestamps; resets on restart, which is harmless.
const RATE_WINDOW_MS = 60_000;
let recentCalls = [];
function rateOk(perMin) {
  const now = Date.now();
  recentCalls = recentCalls.filter((t) => now - t < RATE_WINDOW_MS);
  return recentCalls.length < perMin;
}
function dailyOk(meta, limit) {
  if (limit == null) return true; // source has no daily cap (e.g. football-data free tier)
  const today = new Date().toISOString().slice(0, 10);
  if (meta.apiCallsDate !== today) { meta.apiCallsDate = today; meta.apiCallsToday = 0; }
  return (meta.apiCallsToday || 0) < limit;
}

export async function sync(reason = "cron") {
  const src = activeSource();
  const meta = getMeta();
  const perMin = src.rateLimit();
  const daily = src.dailyLimit();
  if (!src.configured()) { meta.lastSyncMsg = `${src.name}: kein Key/Token gesetzt`; setMeta(meta); return; }
  if (!rateOk(perMin)) { meta.lastSyncMsg = `${src.name}: Rate-Limit (${perMin}/min) – kurz warten`; setMeta(meta); return; }
  if (!dailyOk(meta, daily)) { meta.lastSyncMsg = `${src.name}: Tageslimit (${daily}) erreicht`; setMeta(meta); return; }
  try {
    recentCalls.push(Date.now());
    if (daily != null) meta.apiCallsToday = (meta.apiCallsToday || 0) + 1;
    const list = await src.fetchFixtures(); // normalised fixtures
    let updated = 0, resolvedCount = 0, championCode = null;
    const usedTimeOnly = new Set();
    const liveMap = {}; // match_n → { h, a, phase, minute, injury } for in-play matches (display only)
    const prevLive = liveByMatch(); // last sync's in-play state — diff it to detect kickoffs/goals
    const events = [];              // push notifications to fire after the DB is updated
    for (const f of list) {
      if (!f.dateMs) continue;
      const hit = matchForFixture(f, usedTimeOnly);
      if (!hit) continue;
      const { n, swap, ko } = hit;
      if (ko) {
        usedTimeOnly.add(n);
        // K.o.: the API supplies the actual qualified teams — store them for display.
        // Also store the winner side so the bracket can mark the advancing team
        // even when the match was decided in a shootout (level fulltime score).
        if (f.homeName && f.awayName) {
          const winner = f.winner === "home" || f.winner === "away" ? f.winner : null;
          setResolved(n, { homeName: f.homeName, awayName: f.awayName, homeCode: codeForName(f.homeName), awayCode: codeForName(f.awayName), winner });
          resolvedCount++;
        }
      } else {
        // Group: our static pairing is authoritative — never override it with the
        // API's home/away (which may be swapped). Drop any stale resolved row.
        clearResolved(n);
      }
      if (f.finished && f.homeGoals != null && f.awayGoals != null) {
        const [h, a] = swap ? [f.awayGoals, f.homeGoals] : [f.homeGoals, f.awayGoals];
        setResult(n, String(h), String(a));
        updated++;
        events.push(() => notifyFinal(n, h, a)); // final whistle (idempotent: fires once)
      } else if (f.live) {
        // In-play: capture the (delayed) scoreline + phase for display only. The
        // delayed feed can report a match live before its score lands → default to
        // 0:0 so the card always shows a running scoreline, never an empty " : ".
        const hasGoals = f.homeGoals != null && f.awayGoals != null;
        const [h, a] = !hasGoals ? [0, 0] : swap ? [f.awayGoals, f.homeGoals] : [f.homeGoals, f.awayGoals];
        liveMap[n] = { h: String(h), a: String(a), phase: f.phase, minute: f.minute, injury: f.injuryTime };
        const prev = prevLive[n];
        if (!prev) {
          events.push(() => notifyKickoff(n)); // newly in play → kickoff
        } else {
          const ph = Number(prev.h) || 0, pa = Number(prev.a) || 0;
          if (h > ph || a > pa) events.push(() => notifyGoal(n, h, a, (h - ph) >= (a - pa) ? "h" : "a"));
        }
      }
      // The champion is whoever wins the final — derived from the winner flag so
      // a penalty-shootout title still resolves (the fullTime score is a draw).
      if (n === FINAL_N && f.finished && f.winner && f.winner !== "draw") {
        championCode = codeForName(f.winner === "home" ? f.homeName : f.awayName);
      }
    }
    // In-play state is fully derived from this fetch — replacing it clears any
    // match that has finished or stopped being live since the previous sync.
    replaceLive(liveMap);
    // Fire the queued push notifications (each is idempotent and self-contained).
    // Fire-and-forget so a slow/failing push never delays or breaks the sync.
    for (const ev of events) { try { ev()?.catch?.((e) => console.error("push", e)); } catch (e) { console.error("push", e); } }
    const liveCount = Object.keys(liveMap).length;
    // Set the actual champion automatically once the final is decided — no admin needed.
    let champMsg = "";
    if (championCode && getChampionActual() !== championCode) {
      setChampionActual(championCode);
      champMsg = `, Weltmeister: ${TEAMS[championCode]?.name || championCode}`;
    }
    meta.lastSync = new Date().toISOString();
    const callInfo = daily != null ? ` (Call ${meta.apiCallsToday}/${daily} heute)` : "";
    const liveInfo = liveCount ? `, ${liveCount} live` : "";
    meta.lastSyncMsg = `${reason} · ${src.name}: ${list.length} Spiele, ${updated} Ergebnisse, ${resolvedCount} Paarungen${liveInfo}${champMsg}${callInfo}`;
    setMeta(meta);
    console.log(meta.lastSyncMsg);
  } catch (e) {
    const m = getMeta(); m.lastSyncMsg = `Sync-Fehler (${src.name}): ` + e.message; setMeta(m); console.error("sync", e);
  }
}
