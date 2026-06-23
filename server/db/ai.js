import { db, getSetting, setSetting } from "./connection.js";
import { createUser, updateUser } from "./users.js";
import { score, POINTS } from "../services/scoring.js";
import { encryptSecret, decryptSecret } from "../services/secrets.js";

// ---------- AI players (real users marked is_ai=1) ----------
// Create an AI player: a regular user (so its tips flow through the normal
// scoring/leaderboard/state machinery) plus provider/model. The API key is NOT stored
// per player — it's looked up by provider (see the provider-key functions below).
export function createAiPlayer({ kuerzel, name, provider, model, logo = null }) {
  const u = createUser({ kuerzel, name, kind: "ai", is_active: 1 });
  return updateUser(u.id, { is_ai: 1, ai_provider: provider, ai_model: model || null, ai_logo: logo || null });
}
export const getAiPlayerById = (id) => db.prepare("SELECT * FROM users WHERE id=? AND is_ai=1").get(id);
export const listAiPlayers = () =>
  db.prepare("SELECT * FROM users WHERE is_ai=1 ORDER BY kuerzel").all();
export const listActiveAiPlayers = () =>
  db.prepare("SELECT * FROM users WHERE is_ai=1 AND is_active=1 AND kuerzel IS NOT NULL").all();
// Update an AI player (provider/model/logo/name/active). No key here — keys are per-provider.
export function updateAiPlayer(id, { name, provider, model, logo, is_active }) {
  const fields = {};
  if (name !== undefined) fields.name = (name || "").trim() || null;
  if (provider !== undefined) fields.ai_provider = provider;
  if (model !== undefined) fields.ai_model = model || null;
  if (logo !== undefined) fields.ai_logo = logo || null;
  if (is_active !== undefined) fields.is_active = !!is_active;
  return updateUser(id, fields);
}

// ---------- AI provider keys (one encrypted key per provider) ----------
// Set/clear a provider's key (also clears its last test result). "" → cleared.
export function setAiProviderKey(provider, apiKey) {
  const key = (apiKey || "").trim();
  db.prepare(`INSERT INTO ai_provider_keys(provider,key_enc,test_ok,test_at,updated_at) VALUES(?,?,NULL,NULL,datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET key_enc=excluded.key_enc, test_ok=NULL, test_at=NULL, updated_at=datetime('now')`)
    .run(provider, key ? encryptSecret(key) : null);
}
// Decrypt a provider's key — SERVER-SIDE ONLY; never serialise to a client.
export function getAiProviderKey(provider) {
  const r = db.prepare("SELECT key_enc FROM ai_provider_keys WHERE provider=?").get(provider);
  return r?.key_enc ? decryptSecret(r.key_enc) : null;
}
export function setAiProviderTest(provider, ok) {
  db.prepare(`INSERT INTO ai_provider_keys(provider,test_ok,test_at,updated_at) VALUES(?,?,datetime('now'),datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET test_ok=excluded.test_ok, test_at=excluded.test_at`).run(provider, ok ? 1 : 0);
}
// Per-provider model chosen for the connection test (persisted; "" = use the default).
export const getAiProviderModel = (provider) => getSetting(`aiProviderModel:${provider}`, "") || "";
export const setAiProviderModel = (provider, model) => setSetting(`aiProviderModel:${provider}`, (model || "").trim());

// Key presence (masked to the last 4) + last test result + saved test model per provider — never the raw key.
export function aiProviderKeyMeta(provider) {
  const r = db.prepare("SELECT key_enc,test_ok,test_at FROM ai_provider_keys WHERE provider=?").get(provider);
  let masked = null;
  if (r?.key_enc) { try { const k = decryptSecret(r.key_enc); masked = k ? `••••${k.slice(-4)}` : "••••"; } catch { masked = "••••"; } }
  return { hasKey: !!r?.key_enc, masked, testOk: r?.test_ok == null ? null : !!r.test_ok, testAt: r?.test_at || null, model: getAiProviderModel(provider) };
}
// Per-provider request/token/error aggregates from the prediction log → { [provider]: {…} }.
export function aiProviderStats() {
  const out = {};
  for (const r of db.prepare(`SELECT provider, COUNT(*) AS requests, COALESCE(SUM(NULLIF(tokens,0)),0) AS tokens,
    COALESCE(SUM(status='failed'),0) AS errors FROM ai_predictions WHERE provider IS NOT NULL GROUP BY provider`).all())
    out[r.provider] = { requests: r.requests, tokens: r.tokens, errors: r.errors };
  return out;
}
// Recent failed attempts for a provider's error log.
export function aiProviderErrors(provider, limit = 20) {
  return db.prepare(`SELECT p.match_n, p.error, p.model, p.attempted_at, u.kuerzel
    FROM ai_predictions p LEFT JOIN users u ON u.id=p.user_id
    WHERE p.provider=? AND p.status='failed' AND p.error IS NOT NULL ORDER BY p.attempted_at DESC LIMIT ?`).all(provider, limit);
}
// How many AI players use each provider → { [provider]: count }.
export function aiPlayerCountByProvider() {
  const out = {};
  for (const r of db.prepare("SELECT ai_provider AS p, COUNT(*) AS c FROM users WHERE is_ai=1 AND ai_provider IS NOT NULL GROUP BY ai_provider").all())
    out[r.p] = r.c;
  return out;
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

// Per-player tip HISTORY for the v2 self-evaluation (soll-ist): the last `limit`
// resolved tips with predicted lambda/probs vs. the actual result + scored tier, plus
// probability-calibration buckets (predicted dominant-outcome prob vs. realized hit
// rate). Built from stored predictions + results — ZERO api calls. null until ≥3 tips.
// The prompt's guardrails forbid using this for gambler's-fallacy outcome shifts.
export function historyFor(userId, limit = 20) {
  const rows = db.prepare(`SELECT p.match_n, p.tip_h, p.tip_a, p.prediction, r.h AS rh, r.a AS ra
    FROM ai_predictions p JOIN results r ON r.match_n=p.match_n
    WHERE p.user_id=? AND p.status='done' AND p.tip_h IS NOT NULL AND p.tip_a IS NOT NULL AND r.h!='' AND r.a!=''
    ORDER BY p.attempted_at DESC LIMIT ?`).all(userId, limit);
  if (rows.length < 3) return null;
  const tierOf = (pts) => (pts === POINTS.exact ? "exact" : pts === POINTS.goal_diff ? "goal_diff" : pts === POINTS.tendency ? "tendency" : "miss");
  const tips = [], buckets = {};
  for (const x of rows) {
    let pred = null; try { pred = JSON.parse(x.prediction || "null"); } catch { /* skip */ }
    const rh = Number(x.rh), ra = Number(x.ra);
    const actual = rh > ra ? "home" : rh < ra ? "away" : "draw";
    const pts = score({ h: String(x.tip_h), a: String(x.tip_a) }, { h: String(rh), a: String(ra) }) ?? 0;
    tips.push({
      fixture: x.match_n,
      tipped: { home: Number(x.tip_h), away: Number(x.tip_a) },
      predicted_lambda: pred?.lambda ?? null,
      predicted_probs: pred?.outcome_probabilities ?? null,
      actual: { home: rh, away: ra },
      points: pts,
      tier_hit: tierOf(pts),
    });
    const op = pred?.outcome_probabilities;
    if (op) {
      const pr = { home: Number(op.home_win) || 0, draw: Number(op.draw) || 0, away: Number(op.away_win) || 0 };
      const s = pr.home + pr.draw + pr.away || 1;
      for (const o of ["home", "draw", "away"]) pr[o] /= s;
      const dom = ["home", "draw", "away"].reduce((m, o) => (pr[o] > pr[m] ? o : m), "home");
      const b = (Math.floor(pr[dom] * 10) / 10).toFixed(1); // 0.5, 0.6, …
      (buckets[b] ||= { conf: 0, n: 0, hits: 0 });
      buckets[b].conf += pr[dom]; buckets[b].n++; if (dom === actual) buckets[b].hits++;
    }
  }
  const calibration_buckets = Object.keys(buckets).sort().map((b) => {
    const v = buckets[b];
    return { bucket: b, n: v.n, predicted: +(v.conf / v.n).toFixed(2), realized: +(v.hits / v.n).toFixed(2) };
  });
  return { tips, calibration_buckets };
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

// kuerzel → chosen v2 strategy ("ev_neutral" | "variance_seeking" | "variance_averse")
// for one match's done AI predictions (drives the per-tip strategy badge). Empty for v1
// predictions that have no `strategy` field.
export function aiStrategiesForMatch(matchN) {
  const out = {};
  for (const r of db.prepare(`SELECT u.kuerzel AS k, p.prediction FROM ai_predictions p JOIN users u ON u.id=p.user_id
    WHERE p.match_n=? AND p.status='done' AND p.prediction IS NOT NULL AND u.kuerzel IS NOT NULL`).all(Number(matchN))) {
    try { const pr = JSON.parse(r.prediction); if (pr?.strategy) out[r.k] = pr.strategy; } catch { /* skip */ }
  }
  return out;
}

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
