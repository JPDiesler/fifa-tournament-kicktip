// KI-Spieltags-Rückblick — a short, light-hearted German recap of a finished matchday.
// Auto-generated once the day's matches are all done (mirrors runDailySummary's timing),
// stored, and pushed immediately. Tone is enforced purely via the system prompt (friendly
// teasing of the leader, nothing below the belt). Free-text path (no JSON schema).
import { MATCHES, TEAMS } from "../../data.js";
import { kickoff } from "../locks.js";
import { score } from "../scoring.js";
import {
  legacyState, leaderboard, getSetting, getAiProviderKey, getAiProviderModel,
  getMatchdayRecap, setMatchdayRecap,
} from "../../db.js";
import { getAiAdapter } from "./index.js";
import { toAiError } from "./errors.js";
import { notifyMatchdayRecap } from "../push.js";

const PROVIDERS = ["anthropic", "openai", "gemini", "mistral"]; // preference order for the fallback
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Provider for the recap: the admin setting if it has a key, else the first keyed provider.
export function pickRecapProvider() {
  const pref = getSetting("recapProvider", "");
  if (pref && getAiProviderKey(pref)) return pref;
  return PROVIDERS.find((p) => getAiProviderKey(p)) || null;
}

const SYSTEM = "Du bist der Kommentator eines kleinen, privaten WM-Tippspiels unter Freunden. "
  + "Schreibe einen kurzen, lockeren deutschen Spieltags-Rückblick (2–4 Sätze). Sei humorvoll und "
  + "necke den Tabellenführer freundlich. STRIKT verboten: Beleidigungen, Verletzendes, alles unter "
  + "der Gürtellinie, politische oder sensible Themen. Bleib bei Fußball und den Tipps. Keine "
  + "Hashtags, höchstens ein, zwei Emojis. Antworte nur mit dem Rückblick-Text, ohne Vorrede.";

const teamName = (code, n, side, st) =>
  TEAMS[code]?.name || (st.resolved[n] && (side === "h" ? st.resolved[n].homeName : st.resolved[n].awayName)) || code;

// Compact, privacy-safe context (all matches of the day are long-finished) for the prompt.
export function buildRecapContext(ms, st, board) {
  const ergebnisse = ms.map((m) => {
    const r = st.results[m.n] || {};
    return `${teamName(m.h, m.n, "h", st)} ${r.h}:${r.a} ${teamName(m.a, m.n, "a", st)}`;
  });
  const tagespunkte = board
    .map((row) => { let pts = 0; for (const m of ms) { const p = score((st.tips[row.p] || {})[m.n], st.results[m.n]); if (p != null) pts += p; } return { name: row.name, pts }; })
    .filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  return {
    ergebnisse,
    tabelle: board.slice(0, 3).map((r, i) => `${i + 1}. ${r.name} (${r.sum})`),
    tabellenfuehrer: board[0]?.name || null,
    tagesbeste: tagespunkte.slice(0, 3).map((x) => `${x.name} ${x.pts}`),
  };
}

async function generateWithRetry(adapter, args, provider) {
  const delays = [1000, 4000];
  for (let i = 0; ; i++) {
    try { return await adapter.generateText(args); }
    catch (raw) { const e = toAiError(raw, provider); if (!e.retryable || i >= delays.length) throw e; await sleep(delays[i]); }
  }
}

// Generate (+store +push) the recap for the most recent fully-finished day without one yet.
// Skips days older than 24h (no back-fill of the whole tournament on first deploy).
export async function runMatchdayRecap(now = Date.now()) {
  const provider = pickRecapProvider();
  if (!provider) return; // no AI key configured → silently skip (graceful, like AI tips)
  const st = legacyState();
  const byDay = {};
  for (const m of MATCHES) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  for (const day of Object.keys(byDay).sort().reverse()) { // most recent first → one recap per tick
    if (getMatchdayRecap(day)) continue;
    const ms = byDay[day];
    const lastKo = Math.max(...ms.map((m) => kickoff(m.n) || 0));
    const allDone = ms.every((m) => { const r = st.results[m.n]; return r && r.h !== "" && r.a !== ""; });
    if (!allDone || now < lastKo + 2 * 3600_000 || now - lastKo > 24 * 3600_000) continue;
    const adapter = getAiAdapter(provider), apiKey = getAiProviderKey(provider), model = getAiProviderModel(provider) || undefined;
    if (!adapter?.generateText || !apiKey) return;
    try {
      const ctx = buildRecapContext(ms, st, leaderboard());
      const { text } = await generateWithRetry(adapter, { systemPrompt: SYSTEM, prompt: JSON.stringify({ spieltag: day, ...ctx }), apiKey, model }, provider);
      const recap = (text || "").trim();
      if (!recap) return;
      setMatchdayRecap(day, { text: recap, provider, model: model || null });
      await notifyMatchdayRecap(day, recap);
      console.log(`KI-Rückblick ${day} erstellt (${provider}/${model || "default"}).`);
    } catch (e) { console.error("recap", e?.message || e); }
    return; // one per tick, success or fail
  }
}
