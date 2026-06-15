// Result + near-live sync. Thin writer over the coordinator, which fans out
// across providers and returns canonical per-match records (goals already
// oriented to the static home/away). Writing (results/resolved/live), champion
// detection and push hooks stay here; provider fetching + per-feature merge +
// rate budgets live in coordinator.js.
import { TEAMS } from "../data.js";
import { codeForName, FINAL_N } from "./fixtures.js";
import { fetchMerged, fetchDetails, effectiveCapabilities } from "./coordinator.js";
import {
  setResult, setResolved, clearResolved, replaceLive, liveByMatch,
  getMeta, setMeta, getChampionActual, setChampionActual, setCapabilities,
  setMatchDetail, detailByMatch,
} from "../db.js";
import { notifyKickoff, notifyGoal, notifyFinal } from "./push.js";

export async function sync(reason = "cron") {
  try {
    const prevLive = liveByMatch(); // diff target for kickoff/goal detection
    const { fixtures, fetched, errors, providers, byProvider, routing } = await fetchMerged();
    if (!providers.length) {
      const m = getMeta(); m.lastSyncMsg = `${reason}: keine Quelle konfiguriert`; setMeta(m); return;
    }

    const events = [];
    const liveMap = {};
    let updated = 0, resolvedCount = 0, championCode = null;

    for (const rec of fixtures) {
      const n = rec.n;
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

    // Scorers/cards for live + finished-without-detail matches — only fetched via a
    // provider whose caps support them (no extra calls on the football-data default).
    try {
      const have = detailByMatch();
      const need = new Set([...Object.keys(liveMap).map(Number), ...fixtures.filter((f) => f.finished && !have[f.n]).map((f) => f.n)]);
      if (need.size) {
        const { details, capped } = await fetchDetails(fixtures, byProvider, routing, need);
        for (const [n, d] of Object.entries(details)) setMatchDetail(n, d.scorers, d.cards);
        if (capped) console.log("Detail-Limit erreicht – einige Spiele ausgelassen.");
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
