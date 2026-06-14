// Auth + public runtime config. Mounted at /api.
import { Router } from "express";
import { getUserByUsername, getUserByEntraOid, getUserByEntraUpn, updateUser } from "../db.js";
import { requireAuth, userDto, publicConfig, verifyPassword, verifyEntraIdToken } from "../middleware/auth.js";

const router = Router();

router.get("/config", (req, res) => res.json(publicConfig()));
router.get("/auth/me", requireAuth, (req, res) => res.json({ user: userDto(req.user) }));

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = username ? getUserByUsername(username) : null;
  // Verify credentials first (don't reveal account state before that).
  if (!u || u.kind !== "basic" || !verifyPassword(password || "", u.pass_hash))
    return res.status(401).json({ error: "Benutzername oder Passwort falsch." });
  if (!u.is_active)
    return res.status(403).json({ error: "Dein Zugang ist deaktiviert. Bitte einen Admin kontaktieren." });
  req.session.userId = u.id;
  res.json({ user: userDto(u) });
});

router.post("/auth/entra", async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: "Microsoft-Anmeldung fehlgeschlagen (kein Token)." });
  let c;
  try {
    c = await verifyEntraIdToken(idToken);
  } catch (e) {
    console.error("entra verify:", e.message);
    return res.status(401).json({ error: "Microsoft-Anmeldung ungültig oder abgelaufen. Bitte erneut versuchen." });
  }
  const oid = c.oid;
  const upn = c.preferred_username || c.upn || c.email;
  const u = (oid && getUserByEntraOid(oid)) || (upn && getUserByEntraUpn(upn));
  if (!u)
    return res.status(403).json({ error: `Dein Microsoft-Konto${upn ? ` (${upn})` : ""} ist noch nicht freigeschaltet. Bitte einen Admin um Zugang bitten.` });
  if (!u.is_active)
    return res.status(403).json({ error: "Dein Zugang ist deaktiviert. Bitte einen Admin kontaktieren." });
  if (oid && !u.entra_oid) updateUser(u.id, { entra_oid: oid });
  req.session.userId = u.id;
  res.json({ user: userDto(u) });
});

router.post("/auth/logout", (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

export default router;
