import { db } from "./connection.js";
import { createUser, updateUser } from "./users.js";
import { score } from "../services/scoring.js";
import { encryptSecret, decryptSecret } from "../services/secrets.js";

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
