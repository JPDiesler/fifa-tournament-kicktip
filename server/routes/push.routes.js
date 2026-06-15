// Web Push: VAPID key, subscription lifecycle and per-user prefs. Mounted at /api.
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { addPushSubscription, removePushSubscription, getNotifPrefs, setNotifPrefs, hasPushSubscription } from "../db.js";
import { pushPublicKey, sendTest, EVENTS } from "../services/push.js";

const router = Router();

// Public: the VAPID public key the browser needs to create a subscription.
router.get("/push/key", (req, res) => res.json({ publicKey: pushPublicKey() }));

router.get("/push/prefs", requireAuth, (req, res) =>
  res.json({ events: EVENTS, prefs: getNotifPrefs(req.user.id), subscribed: hasPushSubscription(req.user.id) }));

router.post("/push/prefs", requireAuth, (req, res) => {
  const { prefs } = req.body || {};
  if (!prefs || typeof prefs !== "object") return res.status(400).json({ error: "bad" });
  const clean = {};
  for (const e of EVENTS) if (e in prefs) clean[e] = !!prefs[e];
  setNotifPrefs(req.user.id, clean);
  res.json({ ok: true, prefs: clean });
});

router.post("/push/subscribe", requireAuth, (req, res) => {
  try { addPushSubscription(req.user.id, req.body?.subscription); res.json({ ok: true, prefs: getNotifPrefs(req.user.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/push/unsubscribe", requireAuth, (req, res) => {
  if (req.body?.endpoint) removePushSubscription(req.body.endpoint);
  res.json({ ok: true });
});

router.post("/push/test", requireAuth, async (req, res) => {
  try {
    const r = await sendTest(req.user.id);
    if (r.subs === 0) return res.status(400).json({ error: "Kein Gerät registriert – bitte zuerst aktivieren." });
    if (r.sent === 0) return res.status(502).json({ error: r.lastError || "Push-Dienst hat die Nachricht abgelehnt." });
    res.json({ ok: true, sent: r.sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
