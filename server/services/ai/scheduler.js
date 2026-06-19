// AI-player tip scheduler. Runs every minute (cron in index.js). For each active AI
// player and each match whose tip window is open, it makes EXACTLY ONE LLM attempt
// (claimed via the (player,match) PK before the call) and writes the result as a
// regular tip. A champion tip is placed once per player shortly before the K.o. lock.
import { MATCHES, TEAMS } from "../../data.js";
import { kickoff, isTipLocked, isChampLocked, champLockTs } from "../locks.js";
import {
  listActiveAiPlayers, getAiProviderKey, setUserTips, setChamp,
  hasAiPrediction, claimAiPrediction, finishAiPrediction,
  hasAiChamp, claimAiChamp, finishAiChamp,
  getAiPlayerById, getAiPrediction, deleteAiPrediction, calibrationFor,
} from "../../db.js";
import { getAiAdapter } from "./index.js";
import { matchSystemPrompt, championSystemPrompt } from "./prompt.js";
import { buildBundle, buildChampionBundle } from "./bundle.js";
import { validateMatchPrediction, validateChampionPrediction } from "./schema.js";

const LEAD_MIN = Number(process.env.AI_TRIGGER_LEAD_MIN || 10);      // open the window at kickoff−10
const CHAMP_LEAD_MS = Number(process.env.AI_CHAMP_LEAD_MIN || 720) * 60_000; // champion: 12h before K.o.
const FALLBACK = (process.env.AI_FALLBACK || "off").toLowerCase() === "on";

// Strip a known secret from an error message before it is stored/logged.
const redact = (msg, key) => (key ? String(msg).split(key).join("***") : String(msg));

// Matches whose AI-tip window is open: [kickoff−LEAD, kickoff−5min). Pure + exported
// for testing. A match drops out the moment it locks (kickoff−5).
export function aiTipWindow(now = Date.now(), lead = LEAD_MIN) {
  return MATCHES.filter((m) => {
    const ko = kickoff(m.n);
    return ko != null && now >= ko - lead * 60_000 && !isTipLocked(m.n, now);
  }).map((m) => m.n);
}

// One single attempt for (player, match). Claims first (idempotent) → at most one
// LLM call ever. On success writes a regular tip; on failure records 'failed', no retry.
async function tipOne(p, matchN, bundle) {
  if (!claimAiPrediction(p.id, matchN, p.ai_provider, p.ai_model)) return; // already attempted
  const adapter = getAiAdapter(p.ai_provider);
  const apiKey = getAiProviderKey(p.ai_provider);
  if (!adapter || !apiKey) {
    finishAiPrediction(p.id, matchN, { status: "failed", error: adapter ? "Kein API-Key" : "Unbekannter Provider" });
    return;
  }
  try {
    const { prediction, latencyMs, tokens } = await adapter.predict({ systemPrompt: matchSystemPrompt(), bundle, apiKey, model: p.ai_model });
    const { tip } = validateMatchPrediction(prediction);
    setUserTips(p.kuerzel, { [matchN]: tip }); // normal tip path (server re-checks the lock)
    finishAiPrediction(p.id, matchN, { status: "done", tip, prediction, latencyMs, tokens });
    console.log(`KI ${p.kuerzel} Spiel ${matchN}: ${tip.h}:${tip.a} (${p.ai_provider}/${p.ai_model || "default"})`);
  } catch (e) {
    finishAiPrediction(p.id, matchN, { status: "failed", error: redact(e?.message || e, apiKey) });
    if (FALLBACK) setUserTips(p.kuerzel, { [matchN]: { h: "1", a: "1" } }); // deterministic, non-LLM
    console.error(`KI ${p.kuerzel} Spiel ${matchN} fehlgeschlagen:`, redact(e?.message || e, apiKey));
  }
}

// Place all due match tips this tick. The bundle is built once per match and reused
// across players; LLM calls run concurrently (each player has its own provider/key).
export async function runAiTips(now = Date.now()) {
  const players = listActiveAiPlayers();
  if (!players.length) return;
  const tasks = [];
  for (const n of aiTipWindow(now)) {
    const need = players.filter((p) => !hasAiPrediction(p.id, n));
    if (!need.length) continue;
    const bundle = await buildBundle(n); // null = defer (e.g. K.o. pairing not resolved yet)
    if (!bundle) continue;
    for (const p of need) {
      const cal = calibrationFor(p.id); // per-player self-correction from past tips
      tasks.push(tipOne(p, n, cal ? { ...bundle, calibration: cal } : bundle));
    }
  }
  if (tasks.length) await Promise.all(tasks);
}

// Admin "tip now": force a fresh single attempt for one player (+ optional match),
// with calibration. Deletes any existing row first so it always re-runs (real tip).
export async function placeTipNow(userId, matchN = null) {
  const p = getAiPlayerById(userId);
  if (!p || !p.is_ai) throw new Error("kein KI-Spieler");
  let n = matchN ? Number(matchN) : null;
  if (!n) {
    const now = Date.now();
    for (const m of MATCHES.filter((m) => kickoff(m.n) > now).sort((a, b) => kickoff(a.n) - kickoff(b.n))) {
      if (await buildBundle(m.n)) { n = m.n; break; }
    }
  }
  if (!n) throw new Error("kein passendes Spiel gefunden");
  const bundle = await buildBundle(n);
  if (!bundle) throw new Error("Bundle nicht verfügbar (Paarung evtl. noch offen)");
  deleteAiPrediction(userId, n);
  const cal = calibrationFor(userId);
  await tipOne(p, n, cal ? { ...bundle, calibration: cal } : bundle);
  return { matchN: n, prediction: getAiPrediction(userId, n) };
}

// Place the one-off champion tip per player, once group data is mature and before the
// K.o. lock. One LLM call per player, ever (claimed via the champ-prediction PK).
export async function runAiChamp(now = Date.now()) {
  if (isChampLocked(now) || now < champLockTs - CHAMP_LEAD_MS) return;
  const players = listActiveAiPlayers().filter((p) => !hasAiChamp(p.id));
  if (!players.length) return;
  let bundle = null, validCodes = null;
  const tasks = players.map(async (p) => {
    if (!claimAiChamp(p.id, p.ai_provider, p.ai_model)) return;
    const adapter = getAiAdapter(p.ai_provider);
    const apiKey = getAiProviderKey(p.ai_provider);
    if (!adapter || !apiKey) {
      finishAiChamp(p.id, { status: "failed", error: adapter ? "Kein API-Key" : "Unbekannter Provider" });
      return;
    }
    try {
      if (!bundle) { bundle = await buildChampionBundle(); validCodes = (bundle.teams || []).map((t) => t.code); }
      const { prediction } = await adapter.predict({ systemPrompt: championSystemPrompt(), bundle, apiKey, model: p.ai_model });
      const { code } = validateChampionPrediction(prediction, validCodes);
      setChamp(p.kuerzel, code);
      finishAiChamp(p.id, { status: "done", code, prediction });
      console.log(`KI ${p.kuerzel} Weltmeister: ${TEAMS[code]?.name || code}`);
    } catch (e) {
      finishAiChamp(p.id, { status: "failed", error: redact(e?.message || e, apiKey) });
      console.error(`KI ${p.kuerzel} Champion fehlgeschlagen:`, redact(e?.message || e, apiKey));
    }
  });
  await Promise.all(tasks);
}

let running = false;
// One cron tick: match tips + champion tip, guarded so a slow LLM run never overlaps
// the next minute's tick (the claim already prevents double calls; this avoids pile-up).
export async function runAiScheduler(now = Date.now()) {
  if (running) return;
  running = true;
  try { await runAiTips(now); await runAiChamp(now); }
  catch (e) { console.error("aiScheduler", e); }
  finally { running = false; }
}
