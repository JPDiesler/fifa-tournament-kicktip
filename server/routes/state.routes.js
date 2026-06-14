// Player-facing data: state, leaderboard, matchdays, tips, champion. Mounted at /api.
import { Router } from "express";
import { stateForUser, leaderboard, matchdayBreakdown, setUserTips, setChamp } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { isChampLocked } from "../services/locks.js";

const router = Router();

router.get("/state", requireAuth, (req, res) => res.json(stateForUser(req.user.kuerzel)));
router.get("/leaderboard", requireAuth, (req, res) => res.json(leaderboard()));
router.get("/matchdays", requireAuth, (req, res) => res.json(matchdayBreakdown()));

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
