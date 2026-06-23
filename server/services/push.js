// Web Push (PWA notifications) — self-hosted via VAPID. Reaches installed PWAs on
// iOS (16.4+), Android and desktop browsers; no native app / app store needed.
// Per-user, per-event opt-in (prefs stored on the user). Every event is delivered
// at most once via the DB idempotency ledger (markSentOnce), so repeated syncs,
// the safety-net sync and restarts never re-fire a notification.
import webpush from "web-push";
import { MATCHES, TEAMS } from "../data.js";
import { score } from "./scoring.js";
import { kickoff, champLockTs, isChampLocked, isTipLocked } from "./locks.js";
import { APP_URL } from "../config.js";
import {
  getSetting, setSetting, markSentOnce, pushRecipients, subscriptionsForUser,
  removePushSubscription, broadcastsByMatch, legacyState, leaderboard,
} from "../db.js";
import { computeAchievements } from "./achievements.js";

// The opt-in event types — keys must match the frontend toggles.
export const EVENTS = ["kickoff", "goal", "phaseChanged", "fulltime", "overtaken", "achievement", "recap", "tipReminder", "champReminder", "dailySummary"];

const REMINDER_LEAD_MIN = Number(process.env.TIP_REMINDER_LEAD_MIN || 60);   // nudge this long before kickoff
const CHAMP_LEAD_MS = Number(process.env.CHAMP_REMINDER_LEAD_H || 24) * 3600_000;

// VAPID keys live in settings, generated once on first use, so the operator needs
// no setup (override with VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY for a fixed pair).
let _ready = false;
function ensureVapid() {
  if (_ready) return getSetting("vapidPublicKey", "");
  let pub = process.env.VAPID_PUBLIC_KEY || getSetting("vapidPublicKey", "");
  let priv = process.env.VAPID_PRIVATE_KEY || getSetting("vapidPrivateKey", "");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    setSetting("vapidPublicKey", pub); setSetting("vapidPrivateKey", priv);
    console.log("Web-Push: VAPID-Schlüssel generiert.");
  }
  webpush.setVapidDetails(vapidSubject(), pub, priv);
  _ready = true;
  return pub;
}
// VAPID "subject" (JWT contact claim). A real https URL is the most widely
// accepted; some services (notably Apple) reject a mailto with "localhost".
// Prefer the configured APP_URL, else a plausible mailto (override via env).
function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (APP_URL.startsWith("https://")) return APP_URL;
  return "mailto:admin@wm-tippspiel.app";
}
export const pushPublicKey = () => ensureVapid();

// Low level: deliver one payload to every device of a user; prune dead endpoints.
// Returns { subs, sent, failed, lastError } so callers can report real outcomes.
async function sendToUser(userId, payload) {
  ensureVapid();
  const body = JSON.stringify(payload);
  const subs = subscriptionsForUser(userId);
  let sent = 0, failed = 0, lastError = null;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent++;
    } catch (e) {
      failed++;
      // The push service's response body usually explains a rejection — keep it.
      lastError = e.body ? `HTTP ${e.statusCode}: ${String(e.body).trim().slice(0, 200)}` : (e.statusCode ? `HTTP ${e.statusCode}` : e.message);
      if (e.statusCode === 404 || e.statusCode === 410) removePushSubscription(s.endpoint); // gone — clean up
      else console.error("push send", lastError);
    }
  }));
  return { subs: subs.length, sent, failed, lastError };
}

// Send a test push to the caller's own devices (the bell panel's "Test senden").
// Returns the delivery detail so the UI/log can show why a test didn't arrive.
export async function sendTest(userId) {
  const r = await sendToUser(userId, { title: "🔔 WM 2026 · Tippspiel", body: "Test-Benachrichtigung – alles eingerichtet! ⚽", tag: "test", renotify: true, vibrate: [80, 40, 80], actions: OPEN });
  console.log(`push test user=${userId}: ${r.sent}/${r.subs} gesendet${r.failed ? `, ${r.failed} fehlgeschlagen (${r.lastError})` : ""}`);
  return r;
}

// Fan one event out to every eligible recipient. `build(rcpt)` returns that user's
// payload, or null to skip them. Pref default = ON: a freshly subscribed user gets
// everything until they switch a category off.
async function dispatch(eventType, build) {
  ensureVapid();
  await Promise.all(pushRecipients().map((r) => {
    if (r.prefs[eventType] === false) return null;
    const payload = build(r);
    return payload ? sendToUser(r.userId, payload) : null;
  }));
}

// ---- match labels (real team names; API-resolved names for K.o. matches) ----
const SERVICE_LABEL = { ard: "ARD", zdf: "ZDF", magentatv: "MagentaTV", sky: "Sky", dazn: "DAZN", prime: "Prime Video", netflix: "Netflix", rtl: "RTL", eurosport: "Eurosport" };
const byId = Object.fromEntries(MATCHES.map((m) => [m.n, m]));
const sideName = (side, m, resolved) => {
  const code = side === "h" ? m.h : m.a;
  if (TEAMS[code]) return TEAMS[code].name;
  const r = resolved?.[m.n];
  return (r && (side === "h" ? r.homeName : r.awayName)) || (side === "h" ? m.h : m.a);
};
const ptLabel = (pt) => (pt == null ? "kein Tipp" : pt === 1 ? "+1 Punkt" : `+${pt} Punkte`);
// Tap targets (Android/desktop; iOS ignores actions and just opens the app).
const OPEN = [{ action: "open", title: "Öffnen" }];
const TIP = [{ action: "open", title: "Jetzt tippen" }];

// ===== live/result events (called from the sync loop) =====
// Kickoff — broadcast, enriched with the German broadcaster(s) if known.
export async function notifyKickoff(n) {
  if (!markSentOnce(`kickoff:${n}`)) return;
  const m = byId[n]; if (!m) return;
  const st = legacyState();
  const home = sideName("h", m, st.resolved), away = sideName("a", m, st.resolved);
  const where = (broadcastsByMatch()[n] || []).map((s) => SERVICE_LABEL[s] || s).join(", ");
  await dispatch("kickoff", () => ({
    title: `⚽ Anpfiff: ${home} – ${away}`,
    body: where ? `Jetzt live · ${where}` : "Jetzt live",
    tag: `match-${n}`, url: "/", vibrate: [80, 40, 80], actions: OPEN,
  }));
}
// Goal — broadcast; the increased side tells us who scored (score is ~3 min delayed).
export async function notifyGoal(n, h, a, side) {
  if (!markSentOnce(`goal:${n}:${h}:${a}`)) return;
  const m = byId[n]; if (!m) return;
  const st = legacyState();
  const home = sideName("h", m, st.resolved), away = sideName("a", m, st.resolved);
  await dispatch("goal", () => ({
    title: `⚽ Tor für ${side === "h" ? home : away}!`,
    body: `${home} ${h}:${a} ${away}`,
    tag: `match-${n}`, renotify: true, url: "/", vibrate: [120, 60, 120, 60, 200], actions: OPEN,
  }));
}
// Match-phase change — Halbzeit / Pause (vor Verl.) / Verlängerung / Elfmeterschießen /
// Unterbrechung. Driven by the RAW api-football status (not the coarse `phase` enum), so
// BT (Pause) and SUSP/INT (Unterbrochen) are distinct. The score is passed in because the
// live table isn't rewritten until after these events fire. Once per match+status.
const PHASE_LABEL = { HT: "Halbzeit", BT: "Pause", ET: "Verlängerung", P: "Elfmeterschießen", SUSP: "Spiel unterbrochen", INT: "Spiel unterbrochen" };
const PHASE_EMOJI = { HT: "⏸️", BT: "⏸️", ET: "⏱️", P: "🥅", SUSP: "⚠️", INT: "⚠️" };
export async function notifyPhaseChange(n, status, h, a) {
  const label = PHASE_LABEL[status]; if (!label) return; // 1H/2H/… are not notifiable phases
  if (!markSentOnce(`phase:${n}:${status}`)) return;
  const m = byId[n]; if (!m) return;
  const st = legacyState();
  const home = sideName("h", m, st.resolved), away = sideName("a", m, st.resolved);
  await dispatch("phaseChanged", () => ({
    title: `${PHASE_EMOJI[status] || "⏸️"} ${label}: ${home} – ${away}`,
    body: `${home} ${h}:${a} ${away}`,
    tag: `match-${n}`, renotify: true, url: "/", vibrate: [80, 40, 80], actions: OPEN,
  }));
}
// Final whistle — personalised: each player gets the result plus their own points.
export async function notifyFinal(n, h, a) {
  if (!markSentOnce(`fulltime:${n}`)) return;
  const m = byId[n]; if (!m) return;
  const st = legacyState();
  const home = sideName("h", m, st.resolved), away = sideName("a", m, st.resolved);
  const res = { h: String(h), a: String(a) };
  await dispatch("fulltime", (r) => {
    const base = { tag: `match-${n}`, url: "/", requireInteraction: true, vibrate: [200, 100, 200], actions: OPEN };
    if (!r.kuerzel) return { title: `🏁 Endstand: ${home} ${h}:${a} ${away}`, ...base };
    const pt = score((st.tips[r.kuerzel] || {})[n], res);
    return { title: `🏁 ${home} ${h}:${a} ${away}`, body: `Dein Tipp: ${ptLabel(pt)}`, ...base };
  });
}

// Pure rank-diff: who dropped a place and which rival(s) passed them. `before`/`after`
// are leaderboard() arrays (already sorted); rank = index+1. An overtaker was BELOW the
// player before and is ABOVE now. Exported for unit testing.
export function computeOvertakes(before, after) {
  const oldRank = {}, newRank = {}, nameOf = {};
  before.forEach((r, i) => { oldRank[r.p] = i + 1; });
  after.forEach((r, i) => { newRank[r.p] = i + 1; nameOf[r.p] = r.name || r.p; });
  const out = [];
  for (const r of after) {
    const u = r.p, oU = oldRank[u], nU = newRank[u];
    if (oU == null || nU == null || nU <= oU) continue; // didn't drop a place
    const overtakers = after.filter((x) => x.p !== u && oldRank[x.p] > oU && newRank[x.p] < nU).map((x) => nameOf[x.p]);
    if (overtakers.length) out.push({ kuerzel: u, oldRank: oU, newRank: nU, overtakers });
  }
  return out;
}
// Overtake push — tell each player who dropped which rival(s) passed them. Targeted
// (sendToUser), gated by the per-user opt-in. Idempotent on the (player, new-rank,
// overtakers) tuple so the same overtake isn't re-sent on later polls.
export async function notifyOvertakes(before, after) {
  const drops = computeOvertakes(before, after);
  if (!drops.length) return;
  ensureVapid();
  const byKuerzel = {}; for (const r of pushRecipients()) if (r.kuerzel) byKuerzel[r.kuerzel] = r;
  for (const d of drops) {
    const rcpt = byKuerzel[d.kuerzel];
    if (!rcpt || rcpt.prefs.overtaken === false) continue;
    if (!markSentOnce(`overtake:${d.kuerzel}:${d.newRank}:${d.overtakers.join(",")}`)) continue;
    const one = d.overtakers.length === 1, who = one ? d.overtakers[0] : `${d.overtakers.length} Mitspieler`;
    await sendToUser(rcpt.userId, {
      title: "📉 Überholt!",
      body: `${who} ${one ? "hat" : "haben"} dich überholt — jetzt Platz ${d.newRank}.`,
      tag: `rank-${d.kuerzel}`, renotify: true, url: "/", vibrate: [80, 40, 80], actions: OPEN,
    });
  }
}

// ===== time-based reminders (called from a cron) =====
// Nudge anyone who hasn't tipped a match that kicks off within the lead window
// (and is still tippable). Once per user+match.
export async function runTipReminders(now = Date.now()) {
  ensureVapid();
  const due = MATCHES.filter((m) => {
    const k = kickoff(m.n);
    return k != null && (k - now) / 60000 <= REMINDER_LEAD_MIN && !isTipLocked(m.n, now);
  });
  if (!due.length) return;
  const st = legacyState();
  for (const r of pushRecipients()) {
    if (r.prefs.tipReminder === false || !r.kuerzel) continue;
    const mine = st.tips[r.kuerzel] || {};
    for (const m of due) {
      const t = mine[m.n];
      if (t && (t.h !== "" || t.a !== "")) continue;            // already tipped
      if (!markSentOnce(`tipReminder:${m.n}:${r.userId}`)) continue;
      const home = sideName("h", m, st.resolved), away = sideName("a", m, st.resolved);
      await sendToUser(r.userId, { title: "⏰ Tipp nicht vergessen!", body: `${home} – ${away} startet bald – du hast noch keinen Tipp.`, tag: `tip-${m.n}`, url: "/", requireInteraction: true, vibrate: [80, 40, 80], actions: TIP });
    }
  }
}
// Remind anyone without a champion pick shortly before the K.o.-start lock. Once per user.
export async function runChampReminder(now = Date.now()) {
  ensureVapid();
  if (isChampLocked(now) || champLockTs - now > CHAMP_LEAD_MS) return;
  const st = legacyState();
  for (const r of pushRecipients()) {
    if (r.prefs.champReminder === false || !r.kuerzel || st.champs[r.kuerzel]) continue;
    if (!markSentOnce(`champReminder:${r.userId}`)) continue;
    await sendToUser(r.userId, { title: "🏆 Weltmeister-Tipp", body: "Letzte Chance, deinen Weltmeister zu tippen — bald gesperrt!", tag: "champ", url: "/", requireInteraction: true, actions: TIP });
  }
}
// Evening wrap-up: once a day's matches are all decided, push each player their
// points for the day + current rank. Only recent days (≤24h) to avoid back-fill.
export async function runDailySummary(now = Date.now()) {
  ensureVapid();
  const st = legacyState();
  const rankOf = {}; leaderboard().forEach((row, i) => { rankOf[row.p] = i + 1; });
  const byDay = {};
  for (const m of MATCHES) (byDay[m.dt.slice(0, 10)] ||= []).push(m);
  for (const [day, ms] of Object.entries(byDay)) {
    const lastKo = Math.max(...ms.map((m) => kickoff(m.n) || 0));
    const allDone = ms.every((m) => { const res = st.results[m.n]; return res && res.h !== "" && res.a !== ""; });
    if (!allDone || now < lastKo + 2 * 3600_000 || now - lastKo > 24 * 3600_000) continue;
    for (const r of pushRecipients()) {
      if (r.prefs.dailySummary === false || !r.kuerzel) continue;
      if (!markSentOnce(`dailySummary:${day}:${r.userId}`)) continue;
      let pts = 0;
      for (const m of ms) { const p = score((st.tips[r.kuerzel] || {})[m.n], st.results[m.n]); if (p != null) pts += p; }
      const rank = rankOf[r.kuerzel];
      await sendToUser(r.userId, { title: "📊 Spieltag ausgewertet", body: `Heute ${pts === 1 ? "1 Punkt" : `${pts} Punkte`}${rank ? ` · Platz ${rank}` : ""}.`, tag: `day-${day}`, url: "/", actions: OPEN });
    }
  }
}
// Newly unlocked achievements → one push per (player, achievement), ever. Unlock is
// monotonic, so the markSentOnce ledger is the natural guard. Run from the reminder cron.
export async function runAchievementNotifications() {
  ensureVapid();
  const st = legacyState();
  for (const r of pushRecipients()) {
    if (r.prefs.achievement === false || !r.kuerzel) continue;
    for (const a of computeAchievements(r.kuerzel, st)) {
      if (!a.unlocked || !markSentOnce(`achv:${r.userId}:${a.id}`)) continue;
      await sendToUser(r.userId, {
        title: `🏅 Erfolg freigeschaltet: ${a.label}`,
        body: `${a.description} +${a.points === 1 ? "1 Punkt" : `${a.points} Punkte`}.`,
        tag: `achv-${a.id}`, url: "/", vibrate: [80, 40, 80], actions: OPEN,
      });
    }
  }
}
