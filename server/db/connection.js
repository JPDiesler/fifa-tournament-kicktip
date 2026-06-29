import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
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
  w TEXT NOT NULL DEFAULT '',   -- K.o. Remis-Tipp: getippter Sieger 'h'/'a' (sonst '')
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
  reg_home  TEXT, reg_away TEXT,  -- score after 90' (regulation), oriented to our home/away;
                                  -- null = not captured / decided in 90'. Used for K.o. Remis-Tipp scoring.
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
-- One LLM API key per provider (encrypted). AI players reference a provider; the key is
-- looked up by provider, not stored per player. test_ok/test_at = last connection test.
CREATE TABLE IF NOT EXISTS ai_provider_keys (
  provider   TEXT PRIMARY KEY,
  key_enc    TEXT,
  test_ok    INTEGER,
  test_at    TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- AI-generated matchday recap (one per finished calendar day). Surfaced on the standings
-- and pushed once; also a building block for the later "Turnier-Wrapped".
CREATE TABLE IF NOT EXISTS matchday_recaps (
  day        TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
  text       TEXT NOT NULL,
  provider   TEXT,
  model      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: consolidate legacy per-player AI keys → per-provider (first key per provider
// wins). Runs once, while no provider key is set yet; the encryption secret is unchanged
// so the ciphertext is copied verbatim.
if (db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "ai_key_enc")
  && !db.prepare("SELECT 1 FROM ai_provider_keys WHERE key_enc IS NOT NULL LIMIT 1").get()) {
  for (const r of db.prepare("SELECT ai_provider, ai_key_enc FROM users WHERE is_ai=1 AND ai_key_enc IS NOT NULL AND ai_provider IS NOT NULL").all())
    db.prepare("INSERT OR IGNORE INTO ai_provider_keys(provider, key_enc) VALUES(?, ?)").run(r.ai_provider, r.ai_key_enc);
}

// Migration for DBs created before is_superadmin existed.
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "is_superadmin")) {
  db.exec("ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0");
}
// Migration for DBs created before resolved.winner existed.
if (!db.prepare("PRAGMA table_info(resolved)").all().some((c) => c.name === "winner")) {
  db.exec("ALTER TABLE resolved ADD COLUMN winner TEXT");
}
// Migration for the K.o. Remis-Tipp scoring: 90' (regulation) score + the tipped winner.
{
  const rcols = db.prepare("PRAGMA table_info(resolved)").all().map((c) => c.name);
  if (!rcols.includes("reg_home")) db.exec("ALTER TABLE resolved ADD COLUMN reg_home TEXT");
  if (!rcols.includes("reg_away")) db.exec("ALTER TABLE resolved ADD COLUMN reg_away TEXT");
  if (!db.prepare("PRAGMA table_info(tips)").all().some((c) => c.name === "w"))
    db.exec("ALTER TABLE tips ADD COLUMN w TEXT NOT NULL DEFAULT ''");
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
// Migration for DBs created before the penalty-shootout tally was stored on the live row.
if (!db.prepare("PRAGMA table_info(live)").all().some((c) => c.name === "pen")) {
  db.exec("ALTER TABLE live ADD COLUMN pen TEXT"); // JSON { home, away } shootout tally (K.o., status "P")
}
// Migration for DBs created before the raw api-football status was stored on the live row.
if (!db.prepare("PRAGMA table_info(live)").all().some((c) => c.name === "status")) {
  db.exec("ALTER TABLE live ADD COLUMN status TEXT"); // raw status short (1H/HT/BT/ET/P/SUSP/INT/…) → phase-change pushes
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
  if (!cols.includes("pen")) db.exec("ALTER TABLE match_detail ADD COLUMN pen TEXT");                   // JSON { home, away } shootout result of a finished K.o. match
  if (!cols.includes("shootout")) db.exec("ALTER TABLE match_detail ADD COLUMN shootout TEXT");          // JSON { home:[{scored}], away:[{scored}] } per-kick shootout sequence
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
// Kept here (not in settings.js) because the load-time migration + defaults below
// depend on them, and settings.js / state.js import them from here.
export const getSetting = (k, def = null) => {
  const r = db.prepare("SELECT value FROM settings WHERE key=?").get(k);
  return r ? JSON.parse(r.value) : def;
};
export const setSetting = (k, v) =>
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(k, JSON.stringify(v));

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
