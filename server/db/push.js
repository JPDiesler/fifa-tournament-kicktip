import { db } from "./connection.js";

// ---------- web push (subscriptions, per-user prefs, idempotency) ----------
const parsePrefs = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };

// Upsert by endpoint: the same device re-subscribing (or moving to another user)
// updates the existing row instead of duplicating it.
export function addPushSubscription(userId, sub) {
  const endpoint = sub?.endpoint, p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("ungültige Push-Subscription");
  db.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`)
    .run(userId, endpoint, p256dh, auth);
}
export const removePushSubscription = (endpoint) =>
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(endpoint);
export const subscriptionsForUser = (userId) =>
  db.prepare("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?").all(userId);
export const hasPushSubscription = (userId) =>
  db.prepare("SELECT 1 FROM push_subscriptions WHERE user_id=? LIMIT 1").get(userId) != null;

// Distinct active users with ≥1 subscription, plus their kuerzel and parsed prefs.
export function pushRecipients() {
  return db.prepare(`SELECT DISTINCT u.id AS userId, u.kuerzel AS kuerzel, u.notif_prefs AS prefs
    FROM users u JOIN push_subscriptions p ON p.user_id=u.id WHERE u.is_active=1`).all()
    .map((r) => ({ userId: r.userId, kuerzel: r.kuerzel, prefs: parsePrefs(r.prefs) }));
}
export const getNotifPrefs = (userId) =>
  parsePrefs(db.prepare("SELECT notif_prefs FROM users WHERE id=?").get(userId)?.notif_prefs);
export const setNotifPrefs = (userId, prefs) =>
  db.prepare("UPDATE users SET notif_prefs=? WHERE id=?").run(JSON.stringify(prefs || {}), userId);

// Claim an event key; returns true only the FIRST time (false if already sent).
export function markSentOnce(key) {
  return db.prepare("INSERT OR IGNORE INTO sent_notifications(key) VALUES(?)").run(key).changes > 0;
}
