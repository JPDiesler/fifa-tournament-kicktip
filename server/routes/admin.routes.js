// Admin: manual re-sync + user management. Mounted at /api (all requireAdmin).
// Results and the actual champion are fully automatic (end-time polling +
// final-winner detection), so there is no manual result/champion entry.
import { Router } from "express";
import { APP_URL } from "../config.js";
import {
  getMeta, listUsers, createUser, updateUser, deleteUser,
  getUserById, getUserByUsername, getUserByKuerzel, getUserByEntraOid, getUserByEntraUpn, countAdmins,
  getDataToken, setDataToken, dataTokenFromDb, getCapabilities, setCapabilities,
  getProviderToken, setProviderToken, providerTokenFromDb, getProviderCaps, setProviderCaps,
  getSourceConfig, setSourceConfig, getLivePollSeconds, setLivePollSeconds, getProviderDelay,
  listAiPlayers, createAiPlayer, updateAiPlayer, getAiPlayerById, getAiPlayerKey,
  setAiTestResult, aiPlayerStats, aiLastError, recentAiPredictions, deleteAiPrediction,
  aiRanking, getSetting, setSetting,
} from "../db.js";
import { MATCHES } from "../data.js";
import { kickoff } from "../services/locks.js";
import { AI_PROVIDERS, getAiAdapter, isKnownProvider } from "../services/ai/index.js";
import { buildBundle } from "../services/ai/bundle.js";
import { matchSystemPrompt } from "../services/ai/prompt.js";
import { validateMatchPrediction } from "../services/ai/schema.js";
import { placeTipNow } from "../services/ai/scheduler.js";

const REASONING_DEFAULT = () => getSetting("aiReasoningVisibleAfter", process.env.AI_REASONING_VISIBLE_AFTER || "kickoff");
import { requireAdmin, adminUserDto, hashPassword } from "../middleware/auth.js";
import { sync, runBackfill, prefetchPreviews } from "../services/sync.js";
import { activeSource, probeSource, getAdapter, listAdapters, DEFAULT_SOURCE } from "../services/sources/index.js";
import { effectiveCapabilities, effectiveConfig, FEATURES, liveDelayMs } from "../services/coordinator.js";
import { genPassword, cacheCredential, getCredential, streamCredentialsPdf } from "../services/credentials.js";

const router = Router();
const cleanKuerzel = (k) => ((k || "").trim().toUpperCase() || null);

router.post("/sync", requireAdmin, async (req, res) => { await sync("manuell"); runBackfill("manuell"); prefetchPreviews().catch((e) => console.error("preview", e)); res.json({ meta: getMeta() }); });
// Force a full re-fetch of scorers/cards/final-clock for ALL finished matches (repairs
// already-stored-but-incomplete data). Runs in the background; spread over the budget.
router.post("/admin/refresh-details", requireAdmin, (req, res) => { runBackfill("manuell-force", { force: true }); res.json({ ok: true }); });

// ---------- result source / API token ----------
const SOURCE_KEY = (process.env.DATA_SOURCE || "footballdata").toLowerCase();
// Traffic-light state from the last poll: green (ok), red (error), grey (no token),
// amber (configured but never synced yet).
function sourceState(configured, meta) {
  if (!configured) return "unconfigured";
  if (/Sync-Fehler|kein Key|Rate-Limit|Tageslimit/.test(meta.lastSyncMsg || "")) return "error";
  return meta.lastSync ? "ok" : "idle";
}
function sourceStatus() {
  const src = activeSource();
  const token = getDataToken();
  const configured = src.configured();
  const meta = getMeta();
  return {
    name: src.name,
    tokenEditable: SOURCE_KEY === "footballdata",            // token mgmt via web only for football-data
    tokenSource: dataTokenFromDb() ? "db" : (process.env.FOOTBALL_DATA_TOKEN ? "env" : "none"),
    tokenMasked: token ? `••••${token.slice(-4)}` : null,
    rateLimitPerMin: src.rateLimit(),
    dailyLimit: src.dailyLimit(),
    lastSync: meta.lastSync || null,
    lastSyncMsg: meta.lastSyncMsg || "",
    state: sourceState(configured, meta),
    capabilities: getCapabilities(),
  };
}

router.get("/admin/source", requireAdmin, (req, res) => res.json(sourceStatus()));

router.post("/admin/source", requireAdmin, (req, res) => {
  if (SOURCE_KEY !== "footballdata") return res.status(400).json({ error: "Token-Verwaltung nur für football-data.org" });
  setDataToken(req.body?.token ?? "");   // "" clears the DB override → falls back to FOOTBALL_DATA_TOKEN
  res.json(sourceStatus());
});

router.post("/admin/source/test", requireAdmin, async (req, res) => {
  const result = await probeSource();
  if (result.ok && result.caps) {
    // store per-provider caps; the effective (frontend) caps are derived from these
    setProviderCaps(activeSource().id, {
      ...result.caps,
      rateLimit: activeSource().rateLimit(),
      client: result.client || null,
      checkedAt: new Date().toISOString(),
    });
    setCapabilities(effectiveCapabilities());
  }
  res.json(result);
});

// ---------- multi-provider sources + feature routing ----------
function providerState(ad) {
  if (!ad.configured()) return "unconfigured";
  return getProviderCaps(ad.id) ? "ok" : "idle"; // configured; "ok" once probed
}
router.get("/admin/sources", requireAdmin, (req, res) => {
  const cfg = getSourceConfig() || {};
  const meta = getMeta();
  const today = new Date().toISOString().slice(0, 10);
  const routing = cfg.routing || Object.fromEntries(FEATURES.map((f) => [f, [DEFAULT_SOURCE]]));
  const feeds = {}; // provider id → features it is primary for (the combination view)
  for (const f of FEATURES) { const p = routing[f]?.[0]; if (p) (feeds[p] ||= []).push(f); }
  const sources = listAdapters().map((ad) => {
    const tok = getProviderToken(ad.id);
    const pc = meta.providerCalls?.[ad.id];
    return {
      id: ad.id, name: ad.name,
      configured: ad.configured(),
      enabled: cfg.providers?.[ad.id]?.enabled !== false,
      tokenSource: providerTokenFromDb(ad.id) ? "db" : (tok ? "env" : "none"),
      tokenMasked: tok ? `••••${tok.slice(-4)}` : null,
      rateLimitPerMin: ad.rateLimit(), dailyLimit: ad.dailyLimit(),
      usedToday: pc && pc.date === today ? pc.count : 0,
      delaySeconds: getProviderDelay(ad.id),
      feeds: feeds[ad.id] || [],
      caps: getProviderCaps(ad.id) || ad.declaredCaps(),
      tested: !!getProviderCaps(ad.id),
      state: providerState(ad),
    };
  });
  res.json({
    sources, features: FEATURES, default: DEFAULT_SOURCE, routing,
    providers: cfg.providers || {},
    pollSeconds: getLivePollSeconds(),
    effectivePollSeconds: Math.round(liveDelayMs() / 1000),
    lastSync: meta.lastSync || null, lastSyncMsg: meta.lastSyncMsg || "",
  });
});
router.post("/admin/sources/:id/token", requireAdmin, (req, res) => {
  if (!getAdapter(req.params.id)) return res.status(404).json({ error: "Unbekannter Provider" });
  setProviderToken(req.params.id, req.body?.token ?? "");
  res.json({ ok: true });
});
router.post("/admin/sources/:id/test", requireAdmin, async (req, res) => {
  const ad = getAdapter(req.params.id);
  if (!ad) return res.status(404).json({ error: "Unbekannter Provider" });
  const result = await ad.probe();
  if (result.ok && result.caps) {
    setProviderCaps(ad.id, { ...result.caps, rateLimit: ad.rateLimit(), client: result.client || null, checkedAt: new Date().toISOString() });
    setCapabilities(effectiveCapabilities());
  }
  res.json(result);
});
router.post("/admin/routing", requireAdmin, (req, res) => {
  const cfg = getSourceConfig() || {};
  if (req.body?.providers) cfg.providers = req.body.providers;
  if (req.body?.routing) cfg.routing = req.body.routing;
  setSourceConfig(cfg);
  if (req.body?.pollSeconds != null) setLivePollSeconds(req.body.pollSeconds);
  setCapabilities(effectiveCapabilities());
  res.json({ ok: true, routing: cfg.routing, providers: cfg.providers, pollSeconds: getLivePollSeconds() });
});

router.get("/admin/users", requireAdmin, (req, res) => res.json(listUsers().map(adminUserDto)));

router.post("/admin/users/basic", requireAdmin, (req, res) => {
  const username = (req.body?.username || "").trim();
  const name = (req.body?.name || "").trim() || null;
  const kuerzel = cleanKuerzel(req.body?.kuerzel);
  if (!username) return res.status(400).json({ error: "Benutzername fehlt" });
  if (getUserByUsername(username)) return res.status(409).json({ error: "Benutzername bereits vergeben" });
  if (kuerzel && getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  const password = genPassword();
  const u = createUser({ username, name, kuerzel, kind: "basic", pass_hash: hashPassword(password), is_active: 1 });
  cacheCredential(u.id, { username, password, name, kuerzel });
  res.json({ user: adminUserDto(u), password });
});

router.post("/admin/users/entra", requireAdmin, (req, res) => {
  const oid = (req.body?.oid || "").trim() || null;
  const upn = (req.body?.upn || "").trim() || null;
  const name = (req.body?.name || "").trim() || null;
  const kuerzel = cleanKuerzel(req.body?.kuerzel);
  if (!oid && !upn) return res.status(400).json({ error: "UPN oder OID nötig" });
  if (oid && getUserByEntraOid(oid)) return res.status(409).json({ error: "Nutzer bereits angelegt" });
  if (upn && getUserByEntraUpn(upn)) return res.status(409).json({ error: "Nutzer bereits angelegt" });
  if (kuerzel && getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  const u = createUser({ kind: "entra", entra_oid: oid, entra_upn: upn, name, kuerzel, is_active: 1 });
  res.json({ user: adminUserDto(u) });
});

router.patch("/admin/users/:id", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  const b = req.body || {};
  const fields = {};
  if ("kuerzel" in b) {
    const k = cleanKuerzel(b.kuerzel);
    if (k) { const other = getUserByKuerzel(k); if (other && other.id !== u.id) return res.status(409).json({ error: "Kürzel bereits vergeben" }); }
    fields.kuerzel = k;
  }
  if ("name" in b) fields.name = (b.name || "").trim() || null;
  if ("is_admin" in b) fields.is_admin = !!b.is_admin;
  if ("is_active" in b) fields.is_active = !!b.is_active;
  // Don't let the last active admin demote/deactivate into a lockout.
  if (u.is_admin && (fields.is_admin === false || fields.is_active === false) && countAdmins() <= 1)
    return res.status(400).json({ error: "Der letzte aktive Admin kann nicht entfernt werden" });
  res.json({ user: adminUserDto(updateUser(u.id, fields)) });
});

router.post("/admin/users/:id/reset-password", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u || u.kind !== "basic") return res.status(404).json({ error: "kein Basic-Nutzer" });
  const password = genPassword();
  updateUser(u.id, { pass_hash: hashPassword(password) });
  cacheCredential(u.id, { username: u.username, password, name: u.name, kuerzel: u.kuerzel });
  res.json({ password });
});

router.get("/admin/users/:id/credentials.pdf", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).end();
  const cred = getCredential(u.id);
  if (!cred) return res.status(410).json({ error: "Passwort nicht mehr verfügbar – bitte zurücksetzen." });
  streamCredentialsPdf(res, { appUrl: APP_URL, username: cred.username, password: cred.password, name: cred.name, kuerzel: cred.kuerzel });
});

router.delete("/admin/users/:id", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  if (u.id === req.user.id) return res.status(400).json({ error: "Dich selbst kannst du nicht löschen" });
  if (u.is_admin && countAdmins() <= 1) return res.status(400).json({ error: "Der letzte aktive Admin kann nicht gelöscht werden" });
  deleteUser(u.id);
  res.json({ ok: true });
});

// ---------- AI players (admin-only; API keys are write-only + never returned) ----------
router.get("/admin/ai-players", requireAdmin, (req, res) => {
  res.json({
    providers: AI_PROVIDERS, // [{ id, name, defaultModel }]
    config: { reasoningVisibleAfter: REASONING_DEFAULT() },
    players: listAiPlayers().map((u) => {
      const s = aiPlayerStats(u.id);
      const le = aiLastError(u.id);
      return {
        id: u.id, kuerzel: u.kuerzel, name: u.name, provider: u.ai_provider,
        model: u.ai_model, isActive: !!u.is_active, hasKey: !!u.ai_key_enc,
        testOk: u.ai_test_ok == null ? null : !!u.ai_test_ok, testAt: u.ai_test_at || null,
        done: s.done, total: s.total, avgTokens: s.avgTokens, avgLatency: s.avgLatency, // success ratio + cost signals
        lastError: le?.error || null, lastErrorMatch: le?.match_n || null,
      };
    }),
  });
});
// Calibration ranking of the AI players (Brier / hit rate / ∅ points).
router.get("/admin/ai-ranking", requireAdmin, (req, res) => res.json({ ranking: aiRanking() }));

// AI-wide config (e.g. when the reasoning becomes visible).
router.post("/admin/ai-config", requireAdmin, (req, res) => {
  const mode = req.body?.reasoningVisibleAfter;
  if (mode && !["kickoff", "lock"].includes(mode)) return res.status(400).json({ error: "ungültiger Wert" });
  if (mode) setSetting("aiReasoningVisibleAfter", mode);
  res.json({ ok: true, reasoningVisibleAfter: REASONING_DEFAULT() });
});
router.post("/admin/ai-players", requireAdmin, (req, res) => {
  const b = req.body || {};
  const kuerzel = cleanKuerzel(b.kuerzel);
  const provider = (b.provider || "").trim();
  const apiKey = (b.apiKey || "").trim();
  if (!kuerzel) return res.status(400).json({ error: "Kürzel fehlt" });
  if (getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  if (!isKnownProvider(provider)) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!apiKey) return res.status(400).json({ error: "API-Key fehlt" });
  const u = createAiPlayer({ kuerzel, name: (b.name || "").trim() || null, provider, model: (b.model || "").trim() || null, apiKey, logo: (b.logo || "").trim() || null });
  res.json({ player: adminUserDto(u) });
});
router.patch("/admin/ai-players/:id", requireAdmin, (req, res) => {
  const u = getAiPlayerById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  const b = req.body || {};
  if (b.provider && !isKnownProvider(b.provider)) return res.status(400).json({ error: "Unbekannter Provider" });
  if ("kuerzel" in b) {
    const k = cleanKuerzel(b.kuerzel);
    if (k && k !== u.kuerzel) { const other = getUserByKuerzel(k); if (other) return res.status(409).json({ error: "Kürzel bereits vergeben" }); updateUser(u.id, { kuerzel: k }); }
  }
  const updated = updateAiPlayer(u.id, { name: b.name, provider: b.provider, model: b.model, logo: b.logo, apiKey: b.apiKey, is_active: b.isActive });
  res.json({ player: adminUserDto(updated) });
});
// Minimal connection test (no match prompt). Works for a saved player OR an unsaved
// key (id 0 + provider/apiKey in the body) so the admin can verify before creating.
router.post("/admin/ai-players/:id/test", requireAdmin, async (req, res) => {
  const u = +req.params.id ? getAiPlayerById(+req.params.id) : null;
  const provider = (req.body?.provider || u?.ai_provider || "").trim();
  const model = (req.body?.model || u?.ai_model || "").trim() || undefined;
  const apiKey = (req.body?.apiKey || "").trim() || (u ? getAiPlayerKey(u.id) : null);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key" });
  try { await adapter.testConnection({ apiKey, model }); if (u) setAiTestResult(u.id, true); res.json({ ok: true }); }
  catch (e) { if (u) setAiTestResult(u.id, false); res.json({ ok: false, error: String(e?.message || e).split(apiKey).join("***").slice(0, 300) }); }
});

// Real end-to-end test: run a full prediction for the NEXT upcoming match (with data)
// and return the tip + reasoning WITHOUT saving it — verifies the whole pipeline.
router.post("/admin/ai-players/:id/test-tip", requireAdmin, async (req, res) => {
  const u = +req.params.id ? getAiPlayerById(+req.params.id) : null;
  const provider = (req.body?.provider || u?.ai_provider || "").trim();
  const model = (req.body?.model || u?.ai_model || "").trim() || undefined;
  const apiKey = (req.body?.apiKey || "").trim() || (u ? getAiPlayerKey(u.id) : null);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key" });
  const now = Date.now();
  const upcoming = MATCHES.filter((m) => kickoff(m.n) > now).sort((a, b) => kickoff(a.n) - kickoff(b.n));
  let bundle = null, match = null;
  for (const m of upcoming) { const b = await buildBundle(m.n); if (b) { bundle = b; match = m; break; } }
  if (!bundle) return res.status(400).json({ error: "Kein anstehendes Spiel mit Daten verfügbar" });
  try {
    const { prediction, latencyMs, tokens } = await adapter.predict({ systemPrompt: matchSystemPrompt(), bundle, apiKey, model });
    const { tip } = validateMatchPrediction(prediction);
    if (u) setAiTestResult(u.id, true);
    res.json({ ok: true, match: { n: match.n, home: bundle.fixture.home, away: bundle.fixture.away, kickoff: match.dt }, tip, prediction, latencyMs, tokens });
  } catch (e) {
    if (u) setAiTestResult(u.id, false);
    res.json({ ok: false, error: String(e?.message || e).split(apiKey).join("***").slice(0, 300) });
  }
});

// Live model list from the provider (for the admin model picker). Uses the saved key
// (id) or an unsaved one (body.apiKey). Includes context limits where the API gives them.
router.post("/admin/ai-players/:id/models", requireAdmin, async (req, res) => {
  const u = +req.params.id ? getAiPlayerById(+req.params.id) : null;
  const provider = (req.body?.provider || u?.ai_provider || "").trim();
  const apiKey = (req.body?.apiKey || "").trim() || (u ? getAiPlayerKey(u.id) : null);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!adapter.listModels) return res.json({ models: [] });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key" });
  try { res.json({ models: await adapter.listModels({ apiKey }) }); }
  catch (e) { res.status(400).json({ error: String(e?.message || e).split(apiKey).join("***").slice(0, 300) }); }
});

// Recent attempts (diagnostics): match, status, tip, error, tokens, latency.
router.get("/admin/ai-players/:id/predictions", requireAdmin, (req, res) => {
  const u = getAiPlayerById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  res.json({ predictions: recentAiPredictions(u.id, 30) });
});
// Reset one attempt (delete the row) → the player may be tipped again for that match.
router.delete("/admin/ai-players/:id/predictions/:matchN", requireAdmin, (req, res) => {
  const u = getAiPlayerById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  deleteAiPrediction(u.id, +req.params.matchN);
  res.json({ ok: true });
});
// Tip NOW: force a fresh real attempt immediately (optionally a specific match) —
// bypasses the −10-min window for testing. Writes the tip if the match isn't locked.
router.post("/admin/ai-players/:id/tip-now", requireAdmin, async (req, res) => {
  const u = getAiPlayerById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  try { const r = await placeTipNow(u.id, req.body?.matchN || null); res.json({ ok: true, ...r }); }
  catch (e) { res.status(400).json({ error: String(e?.message || e).slice(0, 300) }); }
});

export default router;
