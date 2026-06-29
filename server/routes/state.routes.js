// Player-facing data: state, leaderboard, matchdays, tips, champion. Mounted at /api.
import { Router } from "express";
import { stateForUser, leaderboard, matchdayBreakdown, setUserTips, setChamp, getUserByKuerzel, getUserTip, getAiPrediction, aiStrategiesForMatch, getSetting, liveByMatch, getTeamMetaRow } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { isChampLocked, kickoff, isTipLocked } from "../services/locks.js";
import { addClient } from "../services/liveStream.js";
import { getPlayerProfile } from "../services/coordinator.js";

const router = Router();

// Lazy player profile/bio for the player-detail card. One upstream call per player,
// cached in-memory (bio changes rarely) → repeated opens are free. null → 404.
const profileCache = new Map(); // pid → { at, data }
const PROFILE_TTL = 12 * 3600 * 1000;

router.get("/state", requireAuth, (req, res) => res.json(stateForUser(req.user.kuerzel)));

// Lightweight live snapshot — the in-play map (scores/minute/phase/odds) + the server
// clock, for the client to re-anchor its match clock. Polled by the client as the SSE
// fallback. Reads only the cached DB → no external API call.
router.get("/live", requireAuth, (req, res) => res.json({ serverNow: Date.now(), live: liveByMatch() }));

// SSE stream of the same payload, pushed by the sync loop (~every 5s, immediately on a
// goal/kickoff/final). The client falls back to polling /api/live if the stream can't
// be established (e.g. a buffering reverse proxy).
router.get("/live/stream", requireAuth, (req, res) => {
  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  req.socket?.setTimeout?.(0); // never time out an open SSE connection
  res.write("retry: 5000\n");
  res.write(`data: ${JSON.stringify({ serverNow: Date.now(), live: liveByMatch() })}\n\n`); // immediate snapshot
  addClient(res);
});
router.get("/leaderboard", requireAuth, (req, res) => res.json(leaderboard()));
router.get("/matchdays", requireAuth, (req, res) => res.json(matchdayBreakdown()));

// Admin-uploaded team logo (federation crest override) — served from the DB data URI
// with a long cache (the URL is version-busted via ?v=updated_at). 404 → client falls
// back to the build-bundled crest, then team initials.
router.get("/team-logo/:code", requireAuth, (req, res) => {
  const row = getTeamMetaRow(req.params.code);
  const m = row?.logo && /^data:([^;]+);base64,(.*)$/s.exec(row.logo);
  if (!m) return res.status(404).end();
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(m[2], "base64"));
});

// Player profile/bio (age, nationality, height/weight, season totals) — lazy + cached.
router.get("/player/:pid", requireAuth, async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "bad id" });
  const c = profileCache.get(pid);
  if (c && Date.now() - c.at < PROFILE_TTL) return res.json(c.data);
  try {
    const data = await getPlayerProfile(pid);
    if (!data) return res.status(404).json({ error: "not found" });
    profileCache.set(pid, { at: Date.now(), data });
    res.json(data);
  } catch { res.status(502).json({ error: "fetch failed" }); }
});

// AI-player reasoning for one (match, player). GATED so the analysis can't leak a tip
// advantage: visible only after kickoff (default) or after the tip lock (configurable
// via setting "aiReasoningVisibleAfter" = "kickoff" | "lock").
router.get("/ai-prediction", requireAuth, (req, res) => {
  const matchN = Number(req.query.match);
  const kuerzel = (req.query.player || "").toString();
  if (!matchN || !kuerzel) return res.status(400).json({ error: "bad" });
  const u = getUserByKuerzel(kuerzel);
  if (!u || !u.is_ai) return res.status(404).json({ error: "kein KI-Spieler" });
  const mode = getSetting("aiReasoningVisibleAfter", process.env.AI_REASONING_VISIBLE_AFTER || "kickoff");
  const ko = kickoff(matchN);
  const visible = mode === "lock" ? isTipLocked(matchN) : (ko != null && Date.now() >= ko);
  if (!visible) return res.status(403).json({ error: "Begründung erst nach Anpfiff sichtbar" });
  const pred = getAiPrediction(u.id, matchN);
  if (!pred || pred.status !== "done" || !pred.prediction) return res.status(404).json({ error: "Keine Begründung vorhanden" });
  // The authoritative tip (incl. K.o. winner + joker, both post-budget) lives in the tips table.
  const stored = getUserTip(u.id, matchN);
  const tip = stored ? { h: stored.h, a: stored.a, w: stored.w, joker: stored.joker } : { h: pred.tip_h, a: pred.tip_a, w: "", joker: "" };
  res.json({ player: kuerzel, provider: pred.provider, model: pred.model, tip, prediction: pred.prediction });
});

// All AI players' chosen strategy for one match → { kuerzel: strategy } (for the per-tip
// badge). Same visibility gate as the reasoning above; {} before it's due.
router.get("/ai-strategies", requireAuth, (req, res) => {
  const matchN = Number(req.query.match);
  if (!matchN) return res.status(400).json({ error: "bad" });
  const mode = getSetting("aiReasoningVisibleAfter", process.env.AI_REASONING_VISIBLE_AFTER || "kickoff");
  const ko = kickoff(matchN);
  const visible = mode === "lock" ? isTipLocked(matchN) : (ko != null && Date.now() >= ko);
  res.json({ strategies: visible ? aiStrategiesForMatch(matchN) : {} });
});

router.post("/tips", requireAuth, (req, res) => {
  if (req.user.is_superadmin) return res.status(403).json({ error: "Der Admin-Account nimmt nicht am Tippspiel teil." });
  if (!req.user.kuerzel) return res.status(403).json({ error: "Kein Kürzel zugewiesen – bitte Admin kontaktieren." });
  const { tips } = req.body || {};
  if (!tips || typeof tips !== "object") return res.status(400).json({ error: "bad" });
  const { rejected } = setUserTips(req.user.kuerzel, tips); // locked matches are silently skipped (server-enforced)
  res.json({ ok: true, rejected });
});

router.post("/champ", requireAuth, (req, res) => {
  if (req.user.is_superadmin) return res.status(403).json({ error: "Der Admin-Account nimmt nicht am Tippspiel teil." });
  if (!req.user.kuerzel) return res.status(403).json({ error: "Kein Kürzel zugewiesen – bitte Admin kontaktieren." });
  if (isChampLocked()) return res.status(423).json({ error: "Weltmeister-Tipp ist seit K.o.-Start gesperrt" });
  setChamp(req.user.kuerzel, req.body?.code || ""); res.json({ ok: true });
});

export default router;
