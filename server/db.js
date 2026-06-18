import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MATCHES, CHAMP_BONUS } from "./data.js";
import { score } from "./services/scoring.js";
import { isTipLocked, isChampLocked, champLockTs, TIP_LOCK_OFFSET_MIN } from "./services/locks.js";
import { encryptSecret, decryptSecret } from "./services/secrets.js";

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
-- JSON arrays; updated each sync for live/just-finished matches. final_* hold the
-- observed final match clock (e.g. 90+5 / 120 / penalties) for finished matches.
CREATE TABLE IF NOT EXISTS match_detail (
  match_n      INTEGER PRIMARY KEY,
  scorers      TEXT,
  cards        TEXT,
  subs         TEXT,    -- JSON: substitutions [{minute,injury,in,out,side}]
  lineups      TEXT,    -- JSON: { home:{formation,coach,startXI,bench}, away:{…} }
  final_minute INTEGER,
  final_injury INTEGER,
  final_phase  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Admin overrides for team display (nickname + federation logo). Build-seeded defaults
-- live in the frontend (NICKNAMES map + bundled crests); a row here overrides one. The
-- logo is a data URI (image/svg+xml or image/png); served via /api/team-logo, never in
-- the state poll. updated_at (ms) doubles as the logo cache-busting version.
CREATE TABLE IF NOT EXISTS team_meta (
  code       TEXT PRIMARY KEY,
  nickname   TEXT,
  logo       TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
-- AI players' per-match LLM predictions (exactly one attempt per match). The
-- (user_id,match_n) PRIMARY KEY is the idempotency guard: a row is CLAIMED
-- (status 'pending') BEFORE the LLM call, so a concurrent/repeated job can never
-- trigger a second call for the same (player, match).
CREATE TABLE IF NOT EXISTS ai_predictions (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_n      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  tip_h        TEXT, tip_a TEXT,
  prediction   TEXT,            -- full canonical JSON returned by the model
  provider     TEXT, model TEXT,
  latency_ms   INTEGER, tokens INTEGER,
  error        TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, match_n)
);
-- AI players' one-off champion (Weltmeister) prediction.
CREATE TABLE IF NOT EXISTS ai_champ_predictions (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  code         TEXT,
  prediction   TEXT,
  provider     TEXT, model TEXT,
  error        TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Provider fixture ids per static match number, persisted each sync so the AI tip
-- scheduler can assemble a data bundle without re-fetching the whole fixture list.
CREATE TABLE IF NOT EXISTS match_ext (
  match_n  INTEGER NOT NULL,
  provider TEXT NOT NULL,
  ext_id   TEXT NOT NULL,
  PRIMARY KEY (match_n, provider)
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
// Migration for DBs created before in-play odds were stored on the live row.
if (!db.prepare("PRAGMA table_info(live)").all().some((c) => c.name === "odds")) {
  db.exec("ALTER TABLE live ADD COLUMN odds TEXT"); // JSON { home, draw, away, suspended } in-play 1X2
}
// Migration for DBs created before match_detail held the final match clock.
{
  const cols = db.prepare("PRAGMA table_info(match_detail)").all().map((c) => c.name);
  if (!cols.includes("final_minute")) db.exec("ALTER TABLE match_detail ADD COLUMN final_minute INTEGER");
  if (!cols.includes("final_injury")) db.exec("ALTER TABLE match_detail ADD COLUMN final_injury INTEGER");
  if (!cols.includes("final_phase")) db.exec("ALTER TABLE match_detail ADD COLUMN final_phase TEXT");
  if (!cols.includes("subs")) db.exec("ALTER TABLE match_detail ADD COLUMN subs TEXT");
  if (!cols.includes("lineups")) db.exec("ALTER TABLE match_detail ADD COLUMN lineups TEXT");
  if (!cols.includes("stats")) db.exec("ALTER TABLE match_detail ADD COLUMN stats TEXT");      // per-team match statistics (possession/shots/xG/…)
  if (!cols.includes("preview")) db.exec("ALTER TABLE match_detail ADD COLUMN preview TEXT");   // pre-match: predictions/form/h2h/injuries
  if (!cols.includes("player_stats")) db.exec("ALTER TABLE match_detail ADD COLUMN player_stats TEXT"); // per-player match stats keyed by player id
}
// Migration for DBs created before AI players existed.
{
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("is_ai")) db.exec("ALTER TABLE users ADD COLUMN is_ai INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes("ai_provider")) db.exec("ALTER TABLE users ADD COLUMN ai_provider TEXT");
  if (!cols.includes("ai_model")) db.exec("ALTER TABLE users ADD COLUMN ai_model TEXT");
  if (!cols.includes("ai_key_enc")) db.exec("ALTER TABLE users ADD COLUMN ai_key_enc TEXT");
  if (!cols.includes("ai_logo")) db.exec("ALTER TABLE users ADD COLUMN ai_logo TEXT");
  if (!cols.includes("ai_test_ok")) db.exec("ALTER TABLE users ADD COLUMN ai_test_ok INTEGER");   // last connection test: 1 ok, 0 fail, null untested
  if (!cols.includes("ai_test_at")) db.exec("ALTER TABLE users ADD COLUMN ai_test_at TEXT");
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
    teamMeta: teamMetaState(),
    players: playersMeta(),
    championActual: getSetting("championActual", ""),
    capabilities: getSetting("capabilities", null),
    meta: getSetting("meta", {}),
    locks: { offsetMin: TIP_LOCK_OFFSET_MIN, serverNow: now, champLocked, champLockTs, lockedMatches },
  };
}

// ---------- writes ----------
// Lock-aware tip write: upsert each match, but never modify a match that is
// already locked (server-enforced regardless of what the client sends).
// Server-side tip validation (never trust the client): a score is "" (clear) or a whole
// number 0–99; the match must be a real, unlocked fixture. Anything else is rejected.
const VALID_MATCH_NS = new Set(MATCHES.map((m) => m.n));
const cleanScore = (v) => {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? String(n) : null; // null = invalid → reject
};
export function setUserTips(kuerzel, tipsObj) {
  const u = ensureUserByKuerzel(kuerzel);
  const ins = db.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)");
  let rejected = 0;
  db.transaction(() => {
    for (const [n, t] of Object.entries(tipsObj || {})) {
      const mn = Number(n);
      if (!Number.isInteger(mn) || !VALID_MATCH_NS.has(mn)) { rejected++; continue; } // bogus match
      if (isTipLocked(mn)) { rejected++; continue; }                                   // locked
      const h = cleanScore(t?.h), a = cleanScore(t?.a);
      if (h === null || a === null) { rejected++; continue; }                           // garbage score
      ins.run(u.id, mn, h, a);
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
export const getResolved = (n) => db.prepare("SELECT * FROM resolved WHERE match_n=?").get(Number(n));

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
  const ins = db.prepare("INSERT INTO live(match_n,h,a,phase,minute,injury,as_of,odds) VALUES(?,?,?,?,?,?,?,?)");
  const tx = db.transaction(() => {
    del.run();
    for (const [n, v] of Object.entries(map || {}))
      ins.run(Number(n), String(v.h ?? ""), String(v.a ?? ""), v.phase ?? null, v.minute ?? null, v.injury ?? null, asOf, v.odds ? JSON.stringify(v.odds) : null);
  });
  tx();
}
// { match_n: { h, a, phase, minute, injury, asOf, odds } } for matches currently in play.
export function liveByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,h,a,phase,minute,injury,as_of,odds FROM live").all())
    out[r.match_n] = { h: r.h, a: r.a, phase: r.phase, minute: r.minute, injury: r.injury, asOf: r.as_of, odds: r.odds ? JSON.parse(r.odds) : null };
  return out;
}
// ---------- per-match scorers/cards/subs + lineups + final clock (display only) ----------
export function setMatchDetail(n, scorers, cards, subs) {
  db.prepare(`INSERT INTO match_detail(match_n,scorers,cards,subs) VALUES(?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET scorers=excluded.scorers, cards=excluded.cards, subs=excluded.subs, updated_at=datetime('now')`)
    .run(Number(n), JSON.stringify(scorers || []), JSON.stringify(cards || []), JSON.stringify(subs || []));
}
// Starting lineups (+bench/formation/coach). Upserts only the lineups column.
export function setMatchLineups(n, lineups) {
  db.prepare(`INSERT INTO match_detail(match_n,lineups) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET lineups=excluded.lineups, updated_at=datetime('now')`)
    .run(Number(n), lineups ? JSON.stringify(lineups) : null);
}
// Per-team match statistics ({ home:{…}, away:{…} }). Upserts only the stats column.
export function setMatchStats(n, stats) {
  db.prepare(`INSERT INTO match_detail(match_n,stats) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET stats=excluded.stats, updated_at=datetime('now')`)
    .run(Number(n), stats ? JSON.stringify(stats) : null);
}
// Per-player match statistics keyed by player id ({ [pid]:{rating,goals,…} }). Upserts
// only the player_stats column.
export function setMatchPlayerStats(n, ps) {
  db.prepare(`INSERT INTO match_detail(match_n,player_stats) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET player_stats=excluded.player_stats, updated_at=datetime('now')`)
    .run(Number(n), ps ? JSON.stringify(ps) : null);
}
// Pre-match preview (predictions/form/h2h/injuries). Upserts only the preview column.
export function setMatchPreview(n, preview) {
  db.prepare(`INSERT INTO match_detail(match_n,preview) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET preview=excluded.preview, updated_at=datetime('now')`)
    .run(Number(n), preview ? JSON.stringify(preview) : null);
}
// Observed final match clock (minute/injury/phase) — written once per match when it
// finishes. Upserts only the final_* columns, leaving any scorers/cards intact.
export function setMatchFinalTime(n, f) {
  db.prepare(`INSERT INTO match_detail(match_n,final_minute,final_injury,final_phase) VALUES(?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET final_minute=excluded.final_minute, final_injury=excluded.final_injury, final_phase=excluded.final_phase, updated_at=datetime('now')`)
    .run(Number(n), f?.minute ?? null, f?.injury ?? null, f?.phase ?? null);
}
export function detailByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,scorers,cards,subs,lineups,stats,preview,player_stats,final_minute,final_injury,final_phase FROM match_detail").all()) {
    try {
      out[r.match_n] = {
        scorers: JSON.parse(r.scorers || "[]"),
        cards: JSON.parse(r.cards || "[]"),
        subs: JSON.parse(r.subs || "[]"),
        lineups: r.lineups ? JSON.parse(r.lineups) : null,
        stats: r.stats ? JSON.parse(r.stats) : null,
        preview: r.preview ? JSON.parse(r.preview) : null,
        playerStats: r.player_stats ? JSON.parse(r.player_stats) : null,
        final: r.final_minute != null ? { minute: r.final_minute, injury: r.final_injury, phase: r.final_phase } : null,
      };
    } catch { /* skip */ }
  }
  return out;
}

export const hasResult = (n) => {
  const r = db.prepare("SELECT h,a FROM results WHERE match_n=?").get(n);
  return !!(r && r.h !== "" && r.a !== "");
};

// ---------- team meta (admin nickname + logo overrides) ----------
// Partial upsert: a key present in `patch` is written (value or null to clear); an absent
// key is left untouched. nickname is capped; logo is a data URI (or null).
export function setTeamMeta(code, patch = {}) {
  const c = String(code || "").toUpperCase();
  if (!c) return;
  const cols = [], vals = [];
  if (Object.prototype.hasOwnProperty.call(patch, "nickname")) { cols.push("nickname"); vals.push(patch.nickname ? String(patch.nickname).slice(0, 60) : null); }
  if (Object.prototype.hasOwnProperty.call(patch, "logo")) { cols.push("logo"); vals.push(patch.logo || null); }
  if (!cols.length) return;
  const names = cols.join(","), ph = cols.map(() => "?").join(","), upd = cols.map((k) => `${k}=excluded.${k}`).join(", ");
  db.prepare(`INSERT INTO team_meta(code,${names},updated_at) VALUES(?,${ph},?)
    ON CONFLICT(code) DO UPDATE SET ${upd}, updated_at=excluded.updated_at`).run(c, ...vals, Date.now());
}
export function getTeamMetaRow(code) {
  return db.prepare("SELECT code,nickname,logo,updated_at FROM team_meta WHERE code=?").get(String(code || "").toUpperCase()) || null;
}
// Player-facing state: only the deltas, WITHOUT the logo bytes (served via /api/team-logo).
// logoVer = updated_at, used by the client to cache-bust the logo URL.
export function teamMetaState() {
  const out = {};
  for (const r of db.prepare("SELECT code,nickname,logo,updated_at FROM team_meta").all()) {
    const m = {};
    if (r.nickname) m.nickname = r.nickname;
    if (r.logo) m.logoVer = r.updated_at;
    if (Object.keys(m).length) out[r.code] = m;
  }
  return out;
}
// Admin editor: nickname override + whether a logo override exists, per code.
export function teamOverrides() {
  const out = {};
  for (const r of db.prepare("SELECT code,nickname,logo FROM team_meta").all()) out[r.code] = { nickname: r.nickname || null, hasLogo: !!r.logo };
  return out;
}

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
export const setLivePollSeconds = (s) => setSetting("livePollSeconds", Math.max(1, Math.min(600, Math.round(Number(s) || 60))));

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
  const allowed = ["kuerzel", "name", "username", "pass_hash", "entra_oid", "entra_upn", "is_admin", "is_active", "is_superadmin",
    "is_ai", "ai_provider", "ai_model", "ai_key_enc", "ai_logo"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return getUserById(id);
  const vals = { id };
  for (const k of keys) vals[k] = typeof fields[k] === "boolean" ? (fields[k] ? 1 : 0) : fields[k];
  db.prepare(`UPDATE users SET ${keys.map((k) => `${k}=@${k}`).join(", ")} WHERE id=@id`).run(vals);
  return getUserById(id);
}
export const deleteUser = (id) => db.prepare("DELETE FROM users WHERE id=?").run(id);

// ---------- AI players (real users marked is_ai=1) ----------
// Create an AI player: a regular user (so its tips flow through the normal
// scoring/leaderboard/state machinery) plus provider/model + an ENCRYPTED key.
export function createAiPlayer({ kuerzel, name, provider, model, apiKey, logo = null }) {
  const u = createUser({ kuerzel, name, kind: "ai", is_active: 1 });
  return updateUser(u.id, {
    is_ai: 1, ai_provider: provider, ai_model: model || null,
    ai_key_enc: encryptSecret(apiKey), ai_logo: logo || null,
  });
}
export const getAiPlayerById = (id) => db.prepare("SELECT * FROM users WHERE id=? AND is_ai=1").get(id);
export const listAiPlayers = () =>
  db.prepare("SELECT * FROM users WHERE is_ai=1 ORDER BY kuerzel").all();
export const listActiveAiPlayers = () =>
  db.prepare("SELECT * FROM users WHERE is_ai=1 AND is_active=1 AND kuerzel IS NOT NULL").all();
// Decrypt the stored provider key — SERVER-SIDE ONLY; never serialise to a client.
export function getAiPlayerKey(id) {
  const u = getAiPlayerById(id);
  return u ? decryptSecret(u.ai_key_enc) : null;
}
// Update an AI player; a new apiKey (if given) is re-encrypted, otherwise left as is.
export function updateAiPlayer(id, { name, provider, model, apiKey, logo, is_active }) {
  const fields = {};
  if (name !== undefined) fields.name = (name || "").trim() || null;
  if (provider !== undefined) fields.ai_provider = provider;
  if (model !== undefined) fields.ai_model = model || null;
  if (logo !== undefined) fields.ai_logo = logo || null;
  if (is_active !== undefined) fields.is_active = !!is_active;
  if (apiKey) fields.ai_key_enc = encryptSecret(apiKey);
  return updateUser(id, fields);
}

// Record the outcome of a connection test (shown as a status dot in the admin UI).
export function setAiTestResult(id, ok) {
  db.prepare("UPDATE users SET ai_test_ok=?, ai_test_at=datetime('now') WHERE id=? AND is_ai=1").run(ok ? 1 : 0, id);
}
// Success ratio + token/latency averages of an AI player's tips (for the admin stats).
export function aiPlayerStats(userId) {
  const r = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status='done'),0) AS done,
    COALESCE(AVG(NULLIF(tokens,0)),0) AS avgTokens, COALESCE(AVG(NULLIF(latency_ms,0)),0) AS avgLatency
    FROM ai_predictions WHERE user_id=?`).get(userId);
  return { done: r.done || 0, total: r.total || 0, avgTokens: Math.round(r.avgTokens || 0), avgLatency: Math.round(r.avgLatency || 0) };
}
// Most recent failed attempt's error (shown in the admin UI), or null.
export function aiLastError(userId) {
  return db.prepare("SELECT error, match_n FROM ai_predictions WHERE user_id=? AND status='failed' AND error IS NOT NULL ORDER BY attempted_at DESC LIMIT 1").get(userId) || null;
}
// Recent attempts for the admin diagnostics list.
export function recentAiPredictions(userId, limit = 30) {
  return db.prepare(`SELECT match_n, status, tip_h, tip_a, error, latency_ms, tokens, attempted_at
    FROM ai_predictions WHERE user_id=? ORDER BY attempted_at DESC LIMIT ?`).all(userId, limit);
}
// Drop a single attempt → the player may be tipped again for that match (admin reset).
export const deleteAiPrediction = (userId, matchN) =>
  db.prepare("DELETE FROM ai_predictions WHERE user_id=? AND match_n=?").run(userId, Number(matchN));

// Per-player calibration from past tips vs results (systematic home/away goal bias),
// fed into the next bundle so the model can self-correct. null until enough history.
export function calibrationFor(userId) {
  const rows = db.prepare(`SELECT p.tip_h AS th, p.tip_a AS ta, r.h AS rh, r.a AS ra
    FROM ai_predictions p JOIN results r ON r.match_n=p.match_n
    WHERE p.user_id=? AND p.status='done' AND p.tip_h IS NOT NULL AND p.tip_a IS NOT NULL AND r.h!='' AND r.a!=''`).all(userId);
  if (rows.length < 3) return null;
  let bh = 0, ba = 0, pts = 0;
  for (const x of rows) {
    bh += Number(x.th) - Number(x.rh);
    ba += Number(x.ta) - Number(x.ra);
    pts += score({ h: String(x.th), a: String(x.ta) }, { h: String(x.rh), a: String(x.ra) }) ?? 0;
  }
  const n = rows.length;
  return {
    tips_evaluated: n,
    avg_points_per_tip: +(pts / n).toFixed(2),
    goal_bias_home: +(bh / n).toFixed(2),
    goal_bias_away: +(ba / n).toFixed(2),
    note: "auto-aggregiert aus bisherigen Tipps vs. Ergebnissen",
  };
}

// Calibration ranking of the AI players over their resolved predictions:
// Brier score (lower = better-calibrated 1X2 probabilities), hit rate (argmax outcome
// correct), and ∅ Kicktipp points. Sorted best-calibration first.
export function aiRanking() {
  const players = db.prepare("SELECT id, kuerzel, name, ai_provider FROM users WHERE is_ai=1 AND kuerzel IS NOT NULL").all();
  const out = players.map((u) => {
    const rows = db.prepare(`SELECT p.prediction, p.tip_h, p.tip_a, r.h AS rh, r.a AS ra
      FROM ai_predictions p JOIN results r ON r.match_n=p.match_n
      WHERE p.user_id=? AND p.status='done' AND r.h!='' AND r.a!=''`).all(u.id);
    let n = 0, brierSum = 0, hits = 0, ptsSum = 0, scored = 0;
    for (const x of rows) {
      const rh = Number(x.rh), ra = Number(x.ra);
      const actual = rh > ra ? "home" : rh < ra ? "away" : "draw";
      let pred = null; try { pred = JSON.parse(x.prediction || "null"); } catch { /* skip */ }
      const op = pred?.outcome_probabilities;
      if (op) {
        const p = { home: Number(op.home_win) || 0, draw: Number(op.draw) || 0, away: Number(op.away_win) || 0 };
        const s = p.home + p.draw + p.away || 1;
        for (const o of ["home", "draw", "away"]) p[o] /= s; // normalize
        let b = 0; for (const o of ["home", "draw", "away"]) b += (p[o] - (o === actual ? 1 : 0)) ** 2;
        brierSum += b;
        if (["home", "draw", "away"].reduce((m, o) => (p[o] > p[m] ? o : m), "home") === actual) hits++;
        n++;
      }
      const pt = score({ h: String(x.tip_h), a: String(x.tip_a) }, { h: String(x.rh), a: String(x.ra) });
      if (pt != null) { ptsSum += pt; scored++; }
    }
    return {
      kuerzel: u.kuerzel, name: u.name || u.kuerzel, provider: u.ai_provider, n,
      brier: n ? +(brierSum / n).toFixed(3) : null,
      hitRate: n ? Math.round((hits / n) * 100) : null,
      avgPoints: scored ? +(ptsSum / scored).toFixed(2) : null,
    };
  });
  return out.sort((a, b) => (a.brier == null) - (b.brier == null) || (a.brier ?? 9) - (b.brier ?? 9) || (b.hitRate ?? -1) - (a.hitRate ?? -1));
}

// kuerzel → { name, isAi, provider, logo } for ALL players (drives frontend display).
export function playersMeta() {
  const out = {};
  for (const u of db.prepare("SELECT kuerzel,name,is_ai,ai_provider,ai_logo FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0").all())
    out[u.kuerzel] = { name: u.name || u.kuerzel, isAi: !!u.is_ai, provider: u.ai_provider || null, logo: u.ai_logo || null };
  return out;
}

// ---------- AI predictions (per-match + champion), with idempotent claim ----------
// Claim (player, match) for an LLM attempt. Returns true ONLY the first time — the
// PK + INSERT OR IGNORE guarantee at most one attempt ever, even across parallel runs.
export const claimAiPrediction = (userId, matchN, provider, model) =>
  db.prepare("INSERT OR IGNORE INTO ai_predictions(user_id,match_n,status,provider,model) VALUES(?,?, 'pending', ?, ?)")
    .run(userId, Number(matchN), provider || null, model || null).changes > 0;
export function finishAiPrediction(userId, matchN, { status, tip, prediction, latencyMs, tokens, error } = {}) {
  db.prepare(`UPDATE ai_predictions SET status=?, tip_h=?, tip_a=?, prediction=?, latency_ms=?, tokens=?, error=?, attempted_at=datetime('now')
    WHERE user_id=? AND match_n=?`)
    .run(status, tip?.h ?? null, tip?.a ?? null, prediction ? JSON.stringify(prediction) : null,
      latencyMs ?? null, tokens ?? null, error ?? null, userId, Number(matchN));
}
export function getAiPrediction(userId, matchN) {
  const r = db.prepare("SELECT * FROM ai_predictions WHERE user_id=? AND match_n=?").get(userId, Number(matchN));
  if (!r) return null;
  return { ...r, prediction: r.prediction ? JSON.parse(r.prediction) : null };
}
export const hasAiPrediction = (userId, matchN) =>
  db.prepare("SELECT 1 FROM ai_predictions WHERE user_id=? AND match_n=? LIMIT 1").get(userId, Number(matchN)) != null;

export const claimAiChamp = (userId, provider, model) =>
  db.prepare("INSERT OR IGNORE INTO ai_champ_predictions(user_id,status,provider,model) VALUES(?, 'pending', ?, ?)")
    .run(userId, provider || null, model || null).changes > 0;
export function finishAiChamp(userId, { status, code, prediction, error } = {}) {
  db.prepare("UPDATE ai_champ_predictions SET status=?, code=?, prediction=?, error=?, attempted_at=datetime('now') WHERE user_id=?")
    .run(status, code ?? null, prediction ? JSON.stringify(prediction) : null, error ?? null, userId);
}
export function getAiChamp(userId) {
  const r = db.prepare("SELECT * FROM ai_champ_predictions WHERE user_id=?").get(userId);
  if (!r) return null;
  return { ...r, prediction: r.prediction ? JSON.parse(r.prediction) : null };
}
export const hasAiChamp = (userId) =>
  db.prepare("SELECT 1 FROM ai_champ_predictions WHERE user_id=? LIMIT 1").get(userId) != null;

// ---------- persisted provider fixture ids (written each sync) ----------
export function setMatchExtIds(n, extIds) {
  const ins = db.prepare("INSERT INTO match_ext(match_n,provider,ext_id) VALUES(?,?,?) ON CONFLICT(match_n,provider) DO UPDATE SET ext_id=excluded.ext_id");
  for (const [provider, extId] of Object.entries(extIds || {})) if (extId != null) ins.run(Number(n), provider, String(extId));
}
export const getMatchExtId = (n, provider) =>
  db.prepare("SELECT ext_id FROM match_ext WHERE match_n=? AND provider=?").get(Number(n), provider)?.ext_id || null;
export function extIdsByMatch(n) {
  const out = {};
  for (const r of db.prepare("SELECT provider,ext_id FROM match_ext WHERE match_n=?").all(Number(n))) out[r.provider] = r.ext_id;
  return out;
}
