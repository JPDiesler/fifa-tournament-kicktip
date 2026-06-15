import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MATCHES, CHAMP_BONUS } from "./data.js";
import { score } from "./services/scoring.js";
import { isTipLocked, isChampLocked, champLockTs, TIP_LOCK_OFFSET_MIN } from "./services/locks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "tippspiel.db");
const LEGACY_JSON = path.join(DATA_DIR, "data.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kuerzel    TEXT UNIQUE,
  name       TEXT,
  kind       TEXT NOT NULL DEFAULT 'basic',   -- 'basic' | 'entra'
  username   TEXT UNIQUE,
  pass_hash  TEXT,
  entra_oid  TEXT UNIQUE,
  entra_upn  TEXT,
  is_admin   INTEGER NOT NULL DEFAULT 0,
  is_superadmin INTEGER NOT NULL DEFAULT 0,   -- the .env operator account; never a player
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tips (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_n INTEGER NOT NULL,
  h TEXT NOT NULL DEFAULT '',
  a TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, match_n)
);
CREATE TABLE IF NOT EXISTS champs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS results (
  match_n INTEGER PRIMARY KEY,
  h TEXT NOT NULL DEFAULT '',
  a TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS resolved (
  match_n   INTEGER PRIMARY KEY,
  home_name TEXT, away_name TEXT, home_code TEXT, away_code TEXT,
  winner    TEXT   -- 'home' | 'away' | null; set for K.o. matches so a
                   -- penalty-shootout winner is known even when the score is level
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS broadcasts (
  match_n INTEGER NOT NULL,
  service TEXT NOT NULL,            -- service key (zdf, ard, magentatv, sky, dazn, prime, netflix, …)
  source  TEXT NOT NULL DEFAULT 'epg', -- provenance: 'epg' (TV guide) | 'rights' (tournament config)
  PRIMARY KEY (match_n, service)
);
-- Transient in-play state (delayed scoreline + match phase) for running matches.
-- DISPLAY ONLY — never used for scoring (that stays on the final results table).
-- The whole table is replaced every sync from the latest fetch, so finished/idle
-- matches drop out automatically.
CREATE TABLE IF NOT EXISTS live (
  match_n INTEGER PRIMARY KEY,
  h      TEXT NOT NULL DEFAULT '',
  a      TEXT NOT NULL DEFAULT '',
  phase  TEXT,             -- 'LIVE' | 'HT' | 'ET' | 'PEN'
  minute INTEGER,
  injury INTEGER,
  as_of  INTEGER           -- server epoch ms when this minute was captured (for the client's local clock)
);
-- Web Push (PWA notifications): one row per subscribed device/browser of a user.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Idempotency ledger: each notifiable event is pushed at most once, even across
-- restarts or repeated syncs. key e.g. 'kickoff:10', 'goal:10:1:0', 'fulltime:10'.
CREATE TABLE IF NOT EXISTS sent_notifications (
  key TEXT PRIMARY KEY,
  at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Per-match scorers/cards (display only), fed by a provider that supports them.
-- JSON arrays; updated each sync for live/just-finished matches.
CREATE TABLE IF NOT EXISTS match_detail (
  match_n    INTEGER PRIMARY KEY,
  scorers    TEXT,
  cards      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration for DBs created before is_superadmin existed.
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "is_superadmin")) {
  db.exec("ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0");
}
// Migration for DBs created before resolved.winner existed.
if (!db.prepare("PRAGMA table_info(resolved)").all().some((c) => c.name === "winner")) {
  db.exec("ALTER TABLE resolved ADD COLUMN winner TEXT");
}
// Migration for DBs created before per-user notification prefs existed.
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "notif_prefs")) {
  db.exec("ALTER TABLE users ADD COLUMN notif_prefs TEXT"); // JSON { kickoff, goal, … } booleans
}
// Migration for DBs created before live.as_of existed.
if (!db.prepare("PRAGMA table_info(live)").all().some((c) => c.name === "as_of")) {
  db.exec("ALTER TABLE live ADD COLUMN as_of INTEGER");
}

// ---------- settings (kv, JSON-encoded) ----------
export const getSetting = (k, def = null) => {
  const r = db.prepare("SELECT value FROM settings WHERE key=?").get(k);
  return r ? JSON.parse(r.value) : def;
};
export const setSetting = (k, v) =>
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(k, JSON.stringify(v));

// ---------- users ----------
export const getUserByKuerzel = (k) => db.prepare("SELECT * FROM users WHERE kuerzel=?").get(k);
const ensureUserByKuerzel = (k) => {
  let u = getUserByKuerzel(k);
  if (!u) {
    const info = db.prepare("INSERT INTO users(kuerzel,name,kind,is_active) VALUES(?,?,?,0)").run(k, k, "basic");
    u = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  }
  return u;
};
const kuerzelById = () => {
  const map = {};
  for (const u of db.prepare("SELECT id,kuerzel FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0").all()) map[u.id] = u.kuerzel;
  return map;
};

// ---------- one-time migration from the legacy /data/data.json blob ----------
function migrateFromJsonIfNeeded() {
  const fresh = db.prepare("SELECT COUNT(*) c FROM users").get().c === 0;
  if (!fresh) return;

  let legacy = null;
  try { if (fs.existsSync(LEGACY_JSON)) legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf8")); } catch (e) { console.error("legacy read", e); }

  const insUser = db.prepare("INSERT OR IGNORE INTO users(kuerzel,name,kind,is_active) VALUES(?,?,?,0)");
  const tx = db.transaction(() => {
    // No predefined players — only re-create accounts that actually had data in the legacy JSON.
    const codes = new Set();
    if (legacy) {
      Object.keys(legacy.tips || {}).forEach((c) => codes.add(c));
      Object.keys(legacy.champs || {}).forEach((c) => codes.add(c));
    }
    for (const c of codes) insUser.run(c, c, "basic");

    if (legacy) {
      const idOf = {};
      for (const u of db.prepare("SELECT id,kuerzel FROM users").all()) idOf[u.kuerzel] = u.id;

      const insTip = db.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)");
      for (const [code, tips] of Object.entries(legacy.tips || {})) {
        const uid = idOf[code]; if (!uid) continue;
        for (const [n, t] of Object.entries(tips || {})) insTip.run(uid, Number(n), String(t.h ?? ""), String(t.a ?? ""));
      }
      const insChamp = db.prepare("INSERT OR REPLACE INTO champs(user_id,code) VALUES(?,?)");
      for (const [code, c] of Object.entries(legacy.champs || {})) { const uid = idOf[code]; if (uid) insChamp.run(uid, c || ""); }
      const insRes = db.prepare("INSERT OR REPLACE INTO results(match_n,h,a) VALUES(?,?,?)");
      for (const [n, r] of Object.entries(legacy.results || {})) insRes.run(Number(n), String(r.h ?? ""), String(r.a ?? ""));
      const insResv = db.prepare("INSERT OR REPLACE INTO resolved(match_n,home_name,away_name,home_code,away_code) VALUES(?,?,?,?,?)");
      for (const [n, rv] of Object.entries(legacy.resolved || {})) insResv.run(Number(n), rv.homeName ?? null, rv.awayName ?? null, rv.homeCode ?? null, rv.awayCode ?? null);
      if (legacy.championActual) setSetting("championActual", legacy.championActual);
      if (legacy.meta) setSetting("meta", legacy.meta);
    }
  });
  tx();

  // Preserve the JSON but stop re-importing it on next boot.
  if (legacy) { try { fs.renameSync(LEGACY_JSON, LEGACY_JSON + ".migrated"); } catch {} }
  console.log(`DB initialised (${legacy ? "migrated legacy data.json" : "fresh"}).`);
}
migrateFromJsonIfNeeded();

if (getSetting("meta") == null) setSetting("meta", { lastSync: null, lastSyncMsg: "noch nie synchronisiert", apiCallsToday: 0, apiCallsDate: "" });
if (getSetting("championActual") == null) setSetting("championActual", "");

// ---------- legacy state shape (keeps the current /api/state contract) ----------
export function legacyState() {
  const kOf = kuerzelById();
  const tips = {};
  for (const row of db.prepare("SELECT user_id,match_n,h,a FROM tips").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    (tips[k] ||= {})[row.match_n] = { h: row.h, a: row.a };
  }
  const champs = {};
  for (const row of db.prepare("SELECT user_id,code FROM champs").all()) { const k = kOf[row.user_id]; if (k) champs[k] = row.code; }
  const results = {};
  for (const row of db.prepare("SELECT match_n,h,a FROM results").all()) results[row.match_n] = { h: row.h, a: row.a };
  const resolved = {};
  for (const row of db.prepare("SELECT * FROM resolved").all())
    resolved[row.match_n] = { homeName: row.home_name, awayName: row.away_name, homeCode: row.home_code, awayCode: row.away_code, winner: row.winner };
  return { tips, champs, results, resolved, live: liveByMatch(), broadcasts: broadcastsByMatch(), championActual: getSetting("championActual", ""), meta: getSetting("meta", {}) };
}

// ---------- per-user state (privacy: others' tips only once a match is locked) ----------
export function stateForUser(meKuerzel) {
  const now = Date.now();
  const lockedMatches = MATCHES.filter((m) => isTipLocked(m.n, now)).map((m) => m.n);
  const lockedSet = new Set(lockedMatches);
  const champLocked = isChampLocked(now);
  const kOf = kuerzelById();

  const tips = {};
  for (const row of db.prepare("SELECT user_id,match_n,h,a FROM tips").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    if (k === meKuerzel || lockedSet.has(row.match_n)) (tips[k] ||= {})[row.match_n] = { h: row.h, a: row.a };
  }
  const champs = {};
  for (const row of db.prepare("SELECT user_id,code FROM champs").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    if (k === meKuerzel || champLocked) champs[k] = row.code;
  }
  const results = {};
  for (const row of db.prepare("SELECT match_n,h,a FROM results").all()) results[row.match_n] = { h: row.h, a: row.a };
  const resolved = {};
  for (const row of db.prepare("SELECT * FROM resolved").all())
    resolved[row.match_n] = { homeName: row.home_name, awayName: row.away_name, homeCode: row.home_code, awayCode: row.away_code, winner: row.winner };

  return {
    me: meKuerzel,
    tips, champs, results, resolved, live: liveByMatch(), broadcasts: broadcastsByMatch(),
    details: detailByMatch(),
    championActual: getSetting("championActual", ""),
    capabilities: getSetting("capabilities", null),
    meta: getSetting("meta", {}),
    locks: { offsetMin: TIP_LOCK_OFFSET_MIN, serverNow: now, champLocked, champLockTs, lockedMatches },
  };
}

// ---------- writes ----------
// Lock-aware tip write: upsert each match, but never modify a match that is
// already locked (server-enforced regardless of what the client sends).
export function setUserTips(kuerzel, tipsObj) {
  const u = ensureUserByKuerzel(kuerzel);
  const ins = db.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)");
  let rejected = 0;
  db.transaction(() => {
    for (const [n, t] of Object.entries(tipsObj || {})) {
      const mn = Number(n);
      if (isTipLocked(mn)) { rejected++; continue; }
      ins.run(u.id, mn, String(t.h ?? ""), String(t.a ?? ""));
    }
  })();
  return { rejected };
}
export function setChamp(kuerzel, code) {
  const u = ensureUserByKuerzel(kuerzel);
  db.prepare("INSERT INTO champs(user_id,code) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code").run(u.id, code || "");
}
export function setResult(n, h, a) {
  db.prepare("INSERT INTO results(match_n,h,a) VALUES(?,?,?) ON CONFLICT(match_n) DO UPDATE SET h=excluded.h,a=excluded.a")
    .run(Number(n), String(h ?? ""), String(a ?? ""));
}
export function setResolved(n, rv) {
  db.prepare(`INSERT INTO resolved(match_n,home_name,away_name,home_code,away_code,winner) VALUES(?,?,?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET home_name=excluded.home_name,away_name=excluded.away_name,home_code=excluded.home_code,away_code=excluded.away_code,winner=excluded.winner`)
    .run(Number(n), rv.homeName ?? null, rv.awayName ?? null, rv.homeCode ?? null, rv.awayCode ?? null, rv.winner ?? null);
}
export const clearResolved = (n) => db.prepare("DELETE FROM resolved WHERE match_n=?").run(Number(n));

// Replace ALL broadcast rows for one source with `map` ({ match_n: [serviceKey…] }).
// Sources are independent (e.g. 'epg' and 'rights' are merged on read), so each
// can be refreshed without touching the other. Use for fully-derivable sources
// like 'rights' (computed from config every time).
export function replaceBroadcasts(source, map) {
  const del = db.prepare("DELETE FROM broadcasts WHERE source=?");
  const ins = db.prepare("INSERT OR IGNORE INTO broadcasts(match_n,service,source) VALUES(?,?,?)");
  const tx = db.transaction(() => {
    del.run(source);
    for (const [n, services] of Object.entries(map || {}))
      for (const s of services) ins.run(Number(n), String(s), source);
  });
  tx();
}
// Merge `map` into one source PER MATCH: only matches present in `map` are touched,
// the rest are left intact. This lets the EPG (a rolling ~few-day window) ACCUMULATE
// over the tournament — once a match has been seen it stays, even after it drops out
// of the guide window.
export function mergeBroadcasts(source, map) {
  const del = db.prepare("DELETE FROM broadcasts WHERE source=? AND match_n=?");
  const ins = db.prepare("INSERT OR IGNORE INTO broadcasts(match_n,service,source) VALUES(?,?,?)");
  const tx = db.transaction(() => {
    for (const [n, services] of Object.entries(map || {})) {
      del.run(source, Number(n));
      for (const s of services) ins.run(Number(n), String(s), source);
    }
  });
  tx();
}
// { match_n: [serviceKey…] } — union across all sources, deduped & sorted.
export function broadcastsByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT DISTINCT match_n, service FROM broadcasts ORDER BY service").all())
    (out[r.match_n] ||= []).push(r.service);
  return out;
}

// Replace the whole live table with the currently in-play matches.
// `map` = { match_n: { h, a, phase, minute, injury } } (h/a may be "" before the
// first delayed score arrives). Full replace = matches that finished or stopped
// being live since the last sync simply disappear.
export function replaceLive(map) {
  const asOf = Date.now(); // capture time → the client anchors its local match clock to this
  const del = db.prepare("DELETE FROM live");
  const ins = db.prepare("INSERT INTO live(match_n,h,a,phase,minute,injury,as_of) VALUES(?,?,?,?,?,?,?)");
  const tx = db.transaction(() => {
    del.run();
    for (const [n, v] of Object.entries(map || {}))
      ins.run(Number(n), String(v.h ?? ""), String(v.a ?? ""), v.phase ?? null, v.minute ?? null, v.injury ?? null, asOf);
  });
  tx();
}
// { match_n: { h, a, phase, minute, injury, asOf } } for matches currently in play.
export function liveByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,h,a,phase,minute,injury,as_of FROM live").all())
    out[r.match_n] = { h: r.h, a: r.a, phase: r.phase, minute: r.minute, injury: r.injury, asOf: r.as_of };
  return out;
}
// ---------- per-match scorers/cards (display only) ----------
export function setMatchDetail(n, scorers, cards) {
  db.prepare(`INSERT INTO match_detail(match_n,scorers,cards) VALUES(?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET scorers=excluded.scorers, cards=excluded.cards, updated_at=datetime('now')`)
    .run(Number(n), JSON.stringify(scorers || []), JSON.stringify(cards || []));
}
export function detailByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,scorers,cards FROM match_detail").all()) {
    try { out[r.match_n] = { scorers: JSON.parse(r.scorers || "[]"), cards: JSON.parse(r.cards || "[]") }; } catch { /* skip */ }
  }
  return out;
}

export const hasResult = (n) => {
  const r = db.prepare("SELECT h,a FROM results WHERE match_n=?").get(n);
  return !!(r && r.h !== "" && r.a !== "");
};

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
export const getMeta = () => getSetting("meta", {});
export const setMeta = (m) => setSetting("meta", m);
export const getChampionActual = () => getSetting("championActual", "");
export const setChampionActual = (c) => setSetting("championActual", c || "");

// Result-source API token: a DB override (set via the admin UI) wins over the
// FOOTBALL_DATA_TOKEN env var, so it can be managed at runtime without a redeploy.
export const getDataToken = () => getSetting("footballDataToken", "") || process.env.FOOTBALL_DATA_TOKEN || "";
export const setDataToken = (t) => setSetting("footballDataToken", (t || "").trim());
export const dataTokenFromDb = () => !!getSetting("footballDataToken", "");

// EFFECTIVE capabilities (computed by the coordinator from the routing + each
// provider's caps) — drive the frontend feature gating. Shape unchanged.
export const getCapabilities = () => getSetting("capabilities", null);
export const setCapabilities = (c) => setSetting("capabilities", c);

// ---------- multi-provider sources ----------
// Per-provider token. football-data keeps the legacy "footballDataToken" key for
// backward compatibility; other providers use "token:<id>" with an env fallback.
const ENV_TOKEN = { footballdata: () => process.env.FOOTBALL_DATA_TOKEN || "", apifootball: () => process.env.API_FOOTBALL_KEY || "" };
export const getProviderToken = (id) =>
  id === "footballdata" ? getDataToken() : (getSetting(`token:${id}`, "") || (ENV_TOKEN[id] ? ENV_TOKEN[id]() : ""));
export const setProviderToken = (id, t) =>
  id === "footballdata" ? setDataToken(t) : setSetting(`token:${id}`, (t || "").trim());
export const providerTokenFromDb = (id) =>
  id === "footballdata" ? dataTokenFromDb() : !!getSetting(`token:${id}`, "");

// Per-provider probed capabilities (the effective caps above are derived from these).
export const getProviderCaps = (id) => getSetting(`caps:${id}`, null);
export const setProviderCaps = (id, c) => setSetting(`caps:${id}`, c);

// Source config: { providers: { id: { enabled, rateLimit, dailyLimit } }, routing: { feature: [id, …] } }.
// null = no config → coordinator falls back to the DATA_SOURCE provider for all features.
export const getSourceConfig = () => getSetting("sourceConfig", null);
export const setSourceConfig = (cfg) => setSetting("sourceConfig", cfg);

// Per-provider rate/daily overrides (admin-set). undefined → adapter uses its env
// default; dailyLimit === null → explicitly "no cap".
export function getProviderLimits(id) {
  const p = (getSourceConfig()?.providers || {})[id] || {};
  return { rateLimit: p.rateLimit, dailyLimit: p.dailyLimit };
}

// Base live-poll interval (seconds) while a match runs. Default 60 (= prior cron).
export const getLivePollSeconds = () => Number(getSetting("livePollSeconds", 60)) || 60;
export const setLivePollSeconds = (s) => setSetting("livePollSeconds", Math.max(10, Math.min(600, Math.round(Number(s) || 60))));

// Estimated inherent display delay (seconds) of a provider's LIVE data — shown to
// users and used to gate "real-time" capabilities. Admin-set per provider; sensible
// defaults (football-data free ~3 min; api-football ~15 s).
const DEFAULT_DELAY = { footballdata: 180, apifootball: 15 };
export const getProviderDelay = (id) => {
  const d = (getSourceConfig()?.providers || {})[id]?.delaySeconds;
  return Number.isFinite(d) ? d : (DEFAULT_DELAY[id] ?? 60);
};

// ---------- leaderboard (server-side scoring) ----------
export function leaderboard() {
  const st = legacyState();
  const players = db.prepare("SELECT kuerzel, name FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0 ORDER BY kuerzel").all();
  const championActual = st.championActual;
  return players
    .map(({ kuerzel, name }) => {
      let sum = 0, exact = 0;
      for (const m of MATCHES) {
        const pt = score((st.tips[kuerzel] || {})[m.n], st.results[m.n]);
        if (pt !== null) { sum += pt; if (pt === 3) exact++; }
      }
      const champHit = !!(championActual && st.champs[kuerzel] === championActual);
      if (champHit) sum += CHAMP_BONUS;
      return { p: kuerzel, name: name || kuerzel, sum, exact, champ: st.champs[kuerzel] || "", champHit };
    })
    .sort((a, b) => b.sum - a.sum || b.exact - a.exact);
}

// ---------- per-day breakdown (Tagessieger + points per day) ----------
export function matchdayBreakdown() {
  const st = legacyState();
  const players = db.prepare("SELECT kuerzel, name FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0 ORDER BY kuerzel").all();
  const byDay = {};
  for (const m of MATCHES) {
    const day = m.dt.slice(0, 10);
    (byDay[day] ||= { day, label: m.disp.split(" · ")[0], matches: [] }).matches.push(m);
  }
  const days = [];
  for (const day of Object.keys(byDay).sort()) {
    const { label, matches } = byDay[day];
    const scorable = matches.some((m) => { const r = st.results[m.n]; return r && r.h !== "" && r.a !== ""; });
    if (!scorable) continue;
    const rows = players
      .map(({ kuerzel, name }) => {
        let pts = 0, any = false;
        for (const m of matches) {
          const p = score((st.tips[kuerzel] || {})[m.n], st.results[m.n]);
          if (p !== null) { pts += p; any = true; }
        }
        return { p: kuerzel, name: name || kuerzel, pts, any };
      })
      .filter((r) => r.any)
      .sort((a, b) => b.pts - a.pts);
    days.push({ day, label, count: matches.length, rows, top: rows.length ? rows[0].pts : 0 });
  }
  return days.reverse(); // most recent first
}

// ---------- user CRUD (auth + admin management) ----------
export const getUserById = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);
export const getUserByUsername = (u) => db.prepare("SELECT * FROM users WHERE username=?").get(u);
export const getUserByEntraOid = (oid) => db.prepare("SELECT * FROM users WHERE entra_oid=?").get(oid);
export const getUserByEntraUpn = (upn) => db.prepare("SELECT * FROM users WHERE lower(entra_upn)=lower(?)").get(upn);
export const listUsers = () =>
  db.prepare("SELECT * FROM users ORDER BY (kuerzel IS NULL), kuerzel, username, entra_upn").all();
export const countAdmins = () => db.prepare("SELECT COUNT(*) c FROM users WHERE is_admin=1 AND is_active=1").get().c;

export function createUser({
  kuerzel = null, name = null, kind = "basic", username = null, pass_hash = null,
  entra_oid = null, entra_upn = null, is_admin = 0, is_active = 1, is_superadmin = 0,
}) {
  const info = db
    .prepare(`INSERT INTO users(kuerzel,name,kind,username,pass_hash,entra_oid,entra_upn,is_admin,is_active,is_superadmin)
              VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(kuerzel, name, kind, username, pass_hash, entra_oid, entra_upn, is_admin ? 1 : 0, is_active ? 1 : 0, is_superadmin ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}
export function updateUser(id, fields) {
  const allowed = ["kuerzel", "name", "username", "pass_hash", "entra_oid", "entra_upn", "is_admin", "is_active", "is_superadmin"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return getUserById(id);
  const vals = { id };
  for (const k of keys) vals[k] = typeof fields[k] === "boolean" ? (fields[k] ? 1 : 0) : fields[k];
  db.prepare(`UPDATE users SET ${keys.map((k) => `${k}=@${k}`).join(", ")} WHERE id=@id`).run(vals);
  return getUserById(id);
}
export const deleteUser = (id) => db.prepare("DELETE FROM users WHERE id=?").run(id);
