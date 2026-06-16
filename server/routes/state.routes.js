// Player-facing data: state, leaderboard, matchdays, tips, champion. Mounted at /api.
import { Router } from "express";
import { stateForUser, leaderboard, matchdayBreakdown, setUserTips, setChamp, getUserByKuerzel, getAiPrediction, getSetting } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { isChampLocked, kickoff, isTipLocked } from "../services/locks.js";

const router = Router();

router.get("/state", requireAuth, (req, res) => res.json(stateForUser(req.user.kuerzel)));
router.get("/leaderboard", requireAuth, (req, res) => res.json(leaderboard()));
router.get("/matchdays", requireAuth, (req, res) => res.json(matchdayBreakdown()));

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
  res.json({ player: kuerzel, provider: pred.provider, model: pred.model, tip: { h: pred.tip_h, a: pred.tip_a }, prediction: pred.prediction });
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
