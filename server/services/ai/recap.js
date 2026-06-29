// KI-Spieltags-Rückblick — a short, light-hearted German recap of a finished matchday.
// Auto-generated once the day's matches are all done (mirrors runDailySummary's timing),
// stored, and pushed immediately. Tone is enforced purely via the system prompt (friendly
// teasing of the leader, nothing below the belt). Free-text path (no JSON schema).
import { MATCHES, TEAMS } from "../../data.js";
import { kickoff } from "../locks.js";
import { score } from "../scoring.js";
import {
  legacyState, leaderboard, getSetting, getAiProviderKey, getAiProviderModel,
  getMatchdayRecap, setMatchdayRecap, detailByMatch,
} from "../../db.js";
import { computeAchievements } from "../achievements.js";
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
  + "necke den Tabellenführer freundlich. Greif ruhig auffällige Spielereignisse (späte Tore, "
  + "Eigentore, Platzverweise, Elfmeterschießen) und frisch freigeschaltete Erfolge der Tipper auf, "
  + "wenn sie zum Erzählen taugen. STRIKT verboten: Beleidigungen, Verletzendes, alles unter der "
  + "Gürtellinie, politische oder sensible Themen. Bleib bei Fußball und den Tipps. Keine Hashtags, "
  + "höchstens ein, zwei Emojis. Antworte nur mit dem Rückblick-Text, ohne Vorrede.";

const teamName = (code, n, side, st) =>
  TEAMS[code]?.name || (st.resolved[n] && (side === "h" ? st.resolved[n].homeName : st.resolved[n].awayName)) || code;

// One match's Spielverlauf as a single line: score + goals (with own-goal/penalty tags), red cards
// and a shootout result, in chronological order. Falls back to just the score when no detail exists.
function matchVerlauf(m, st, det) {
  const r = st.results[m.n] || {};
  const head = `${teamName(m.h, m.n, "h", st)} ${r.h}:${r.a} ${teamName(m.a, m.n, "a", st)}`;
  const d = det[m.n];
  if (!d) return head;
  const parts = [];
  const at = (e) => `${e.minute ?? "?"}${e.injury ? "+" + e.injury : ""}'`;
  if (d.scorers?.length) {
    const goals = [...d.scorers]
      .sort((a, b) => ((+a.minute || 0) + (+a.injury || 0)) - ((+b.minute || 0) + (+b.injury || 0)))
      .map((g) => `${at(g)} ${g.player || "?"}${g.type === "own" ? " (ET)" : g.type === "penalty" ? " (FE)" : ""}`);
    parts.push(`Tore: ${goals.join(", ")}`);
  }
  const reds = (d.cards || []).filter((c) => /red/i.test(c.card || "") || /second yellow/i.test(c.card || ""));
  if (reds.length) parts.push(`Rote Karten: ${reds.map((c) => `${at(c)} ${c.player || "?"}`).join(", ")}`);
  if (d.shootout) parts.push(d.pen ? `Elfmeterschießen ${d.pen.home}:${d.pen.away}` : "Elfmeterschießen");
  return parts.length ? `${head} — ${parts.join("; ")}` : head;
}

// Compact, privacy-safe context (all matches of the day are long-finished) for the prompt.
// `det` adds the Spielverlauf per match; `erfolge` is the precomputed list of achievements freshly
// unlocked on this day (see runMatchdayRecap) so the AI can weave them in.
export function buildRecapContext(ms, st, board, det = {}, erfolge = []) {
  const ergebnisse = ms.map((m) => {
    const r = st.results[m.n] || {};
    return `${teamName(m.h, m.n, "h", st)} ${r.h}:${r.a} ${teamName(m.a, m.n, "a", st)}`;
  });
  const tagespunkte = board
    .map((row) => { let pts = 0; for (const m of ms) { const p = score((st.tips[row.p] || {})[m.n], st.results[m.n], st.resolved[m.n]); if (p != null) pts += p; } return { name: row.name, pts }; })
    .filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  return {
    ergebnisse,
    verlaeufe: ms.map((m) => matchVerlauf(m, st, det)),
    tabelle: board.slice(0, 3).map((r, i) => `${i + 1}. ${r.name} (${r.sum})`),
    tabellenfuehrer: board[0]?.name || null,
    tagesbeste: tagespunkte.slice(0, 3).map((x) => `${x.name} ${x.pts}`),
    ...(erfolge.length ? { erfolge } : {}),
  };
}

// Achievements freshly unlocked on this day: diff the unlocked set against the state with the day's
// results removed. Only visible wins are surfaced (hidden "Pleiten" stay secret). → ["Ann: Hellseher"].
function freshAchievements(ms, st, board, det) {
  const dayNs = new Set(ms.map((m) => m.n));
  const before = { ...st, results: Object.fromEntries(Object.entries(st.results).filter(([n]) => !dayNs.has(Number(n)))) };
  const out = [];
  for (const row of board) {
    const had = new Set(computeAchievements(row.p, before, det).filter((a) => a.unlocked).map((a) => a.id));
    const gained = computeAchievements(row.p, st, det).filter((a) => a.unlocked && a.kind === "win" && !had.has(a.id)).map((a) => a.label);
    if (gained.length) out.push(`${row.name}: ${gained.join(", ")}`);
  }
  return out;
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
      const board = leaderboard(), det = detailByMatch();
      const ctx = buildRecapContext(ms, st, board, det, freshAchievements(ms, st, board, det));
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
