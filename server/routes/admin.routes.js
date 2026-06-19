// Admin: manual re-sync + user management. Mounted at /api (all requireAdmin).
// Results and the actual champion are fully automatic (end-time polling +
// final-winner detection), so there is no manual result/champion entry.
import { Router } from "express";
import { APP_URL } from "../config.js";
import {
  getMeta, listUsers, createUser, updateUser, deleteUser,
  getUserById, getUserByUsername, getUserByKuerzel, getUserByEntraOid, getUserByEntraUpn, countAdmins,
  getCapabilities, setCapabilities,
  getProviderToken, setProviderToken, providerTokenFromDb, getProviderCaps, setProviderCaps,
  getSourceConfig, setSourceConfig, getLivePollSeconds, setLivePollSeconds,
  listAiPlayers, createAiPlayer, updateAiPlayer, getAiPlayerById,
  setAiProviderKey, getAiProviderKey, setAiProviderTest, aiProviderKeyMeta, aiProviderStats, aiProviderErrors, aiPlayerCountByProvider,
  setAiTestResult, aiPlayerStats, aiLastError, recentAiPredictions, deleteAiPrediction,
  aiRanking, getSetting, setSetting, setTeamMeta, teamOverrides,
} from "../db.js";
import { MATCHES, TEAMS } from "../data.js";
import { kickoff } from "../services/locks.js";
import { AI_PROVIDERS, getAiAdapter, isKnownProvider } from "../services/ai/index.js";
import { buildBundle } from "../services/ai/bundle.js";
import { matchSystemPrompt } from "../services/ai/prompt.js";
import { validateMatchPrediction } from "../services/ai/schema.js";
import { placeTipNow } from "../services/ai/scheduler.js";

const REASONING_DEFAULT = () => getSetting("aiReasoningVisibleAfter", process.env.AI_REASONING_VISIBLE_AFTER || "kickoff");
import { requireAdmin, adminUserDto, hashPassword } from "../middleware/auth.js";
import { sync, runBackfill, prefetchPreviews, getBackfillProgress } from "../services/sync.js";
import { activeSource, getAdapter } from "../services/sources/index.js";
import { effectiveCapabilities, liveDelayMs, inplayOddsEnabled } from "../services/coordinator.js";
import { genPassword, cacheCredential, getCredential, streamCredentialsPdf } from "../services/credentials.js";

const router = Router();
const cleanKuerzel = (k) => ((k || "").trim().toUpperCase() || null);

// Team display overrides (nickname + federation logo). Defaults are build-seeded in the
// frontend; these rows override them. Logo is a data URI (PNG/SVG, ~500 KB cap).
const TEAM_CODES = new Set(Object.keys(TEAMS));
router.get("/admin/teams", requireAdmin, (req, res) => res.json(teamOverrides()));
router.post("/admin/teams/:code", requireAdmin, (req, res) => {
  const code = (req.params.code || "").toUpperCase();
  if (!TEAM_CODES.has(code)) return res.status(400).json({ error: "unbekanntes Team" });
  const b = req.body || {}, patch = {};
  if (Object.prototype.hasOwnProperty.call(b, "nickname")) patch.nickname = typeof b.nickname === "string" && b.nickname.trim() ? b.nickname.trim() : null;
  if (Object.prototype.hasOwnProperty.call(b, "logo")) {
    if (!b.logo) patch.logo = null;
    else if (!/^data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(b.logo)) return res.status(400).json({ error: "Logo muss PNG/SVG/WEBP sein" });
    else if (b.logo.length > 720_000) return res.status(413).json({ error: "Logo zu groß (max ~500 KB)" });
    else patch.logo = b.logo;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: "nichts zu ändern" });
  setTeamMeta(code, patch);
  res.json({ ok: true, overrides: teamOverrides() });
});

router.post("/sync", requireAdmin, async (req, res) => { await sync("manuell"); runBackfill("manuell"); prefetchPreviews().catch((e) => console.error("preview", e)); res.json({ meta: getMeta() }); });
// Force a full re-fetch of scorers/cards/final-clock for ALL finished matches (repairs
// already-stored-but-incomplete data). Runs in the background; spread over the budget.
router.post("/admin/refresh-details", requireAdmin, (req, res) => { runBackfill("manuell-force", { force: true }); res.json({ ok: true }); });
// Progress of the running drain → the "Details neu laden" toast polls this until done.
router.get("/admin/refresh-details/status", requireAdmin, (req, res) => res.json(getBackfillProgress()));

// ---------- result source (api-football, sole provider) ----------
// Connection/token state, the live quota captured on the last probe, the budget
// (rate/day) and the dynamic live-poll interval. "Testen" (POST .../test) refreshes the
// quota + caps; this GET serves the stored snapshot (no external call on load).
router.get("/admin/sources", requireAdmin, (req, res) => {
  const ad = activeSource();
  const meta = getMeta();
  const today = new Date().toISOString().slice(0, 10);
  const tok = getProviderToken(ad.id);
  const caps = getProviderCaps(ad.id);
  const pc = meta.providerCalls?.[ad.id];
  const errorish = /Sync-Fehler|kein Key|Rate-Limit|Tageslimit/.test(meta.lastSyncMsg || "");
  res.json({
    provider: {
      id: ad.id, name: ad.name,
      configured: ad.configured(),
      tokenSource: providerTokenFromDb(ad.id) ? "db" : (tok ? "env" : "none"),
      tokenMasked: tok ? `••••${tok.slice(-4)}` : null,
      rateLimitPerMin: ad.rateLimit(), dailyLimit: ad.dailyLimit(),
      usedToday: pc && pc.date === today ? pc.count : 0,
      caps: caps || ad.declaredCaps(),
      client: caps?.client || null, plan: caps?.plan || null, quota: caps?.quota || null,
      checkedAt: caps?.checkedAt || null, tested: !!caps,
      state: !ad.configured() ? "unconfigured" : errorish ? "error" : caps ? "ok" : "idle",
    },
    capabilities: getCapabilities(),
    pollSeconds: getLivePollSeconds(),
    effectivePollSeconds: Math.round(liveDelayMs() / 1000),
    inplayOdds: inplayOddsEnabled(),
    lastSync: meta.lastSync || null, lastSyncMsg: meta.lastSyncMsg || "",
  });
});

router.post("/admin/sources/:id/token", requireAdmin, (req, res) => {
  if (!getAdapter(req.params.id)) return res.status(404).json({ error: "Unbekannter Provider" });
  setProviderToken(req.params.id, req.body?.token ?? "");
  res.json({ ok: true });
});

// Probe the key (lightweight /status) → store caps + live quota; the effective
// (frontend) capabilities are derived from these.
router.post("/admin/sources/:id/test", requireAdmin, async (req, res) => {
  const ad = getAdapter(req.params.id);
  if (!ad) return res.status(404).json({ error: "Unbekannter Provider" });
  const result = await ad.probe();
  if (result.ok && result.caps) {
    setProviderCaps(ad.id, {
      ...result.caps, rateLimit: ad.rateLimit(),
      client: result.client || null, plan: result.plan || null, quota: result.quota || null,
      checkedAt: new Date().toISOString(),
    });
    setCapabilities(effectiveCapabilities());
  }
  res.json(result);
});

// Budget override (rate/min + daily) + the base live-poll interval.
router.post("/admin/source-config", requireAdmin, (req, res) => {
  const cfg = getSourceConfig() || {};
  if (req.body?.providers) cfg.providers = req.body.providers;
  setSourceConfig(cfg);
  if (req.body?.pollSeconds != null) setLivePollSeconds(req.body.pollSeconds);
  setCapabilities(effectiveCapabilities());
  res.json({ ok: true, providers: cfg.providers, pollSeconds: getLivePollSeconds() });
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
        model: u.ai_model, isActive: !!u.is_active, hasKey: aiProviderKeyMeta(u.ai_provider).hasKey,
        testOk: u.ai_test_ok == null ? null : !!u.ai_test_ok, testAt: u.ai_test_at || null,
        done: s.done, total: s.total, avgTokens: s.avgTokens, avgLatency: s.avgLatency, // success ratio + cost signals
        lastError: le?.error || null, lastErrorMatch: le?.match_n || null,
      };
    }),
  });
});
// Calibration ranking of the AI players (Brier / hit rate / ∅ points).
router.get("/admin/ai-ranking", requireAdmin, (req, res) => res.json({ ranking: aiRanking() }));

// ---------- AI provider keys (one key per provider; players reference a provider) ----------
router.get("/admin/ai-providers", requireAdmin, (req, res) => {
  const stats = aiProviderStats(), counts = aiPlayerCountByProvider();
  res.json({
    providers: AI_PROVIDERS.map((p) => {
      const s = stats[p.id] || { requests: 0, tokens: 0, errors: 0 };
      return { id: p.id, name: p.name, defaultModel: p.defaultModel, ...aiProviderKeyMeta(p.id), ...s, players: counts[p.id] || 0 };
    }),
  });
});
router.post("/admin/ai-providers/:provider/key", requireAdmin, (req, res) => {
  const provider = (req.params.provider || "").trim();
  if (!isKnownProvider(provider)) return res.status(400).json({ error: "Unbekannter Provider" });
  setAiProviderKey(provider, req.body?.apiKey ?? ""); // "" clears it
  res.json({ ok: true, ...aiProviderKeyMeta(provider) });
});
router.post("/admin/ai-providers/:provider/test", requireAdmin, async (req, res) => {
  const provider = (req.params.provider || "").trim();
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  const apiKey = getAiProviderKey(provider);
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key" });
  try { await adapter.testConnection({ apiKey }); setAiProviderTest(provider, true); res.json({ ok: true }); }
  catch (e) { setAiProviderTest(provider, false); res.json({ ok: false, error: String(e?.message || e).split(apiKey).join("***").slice(0, 300) }); }
});
router.get("/admin/ai-providers/:provider/errors", requireAdmin, (req, res) =>
  res.json({ errors: aiProviderErrors((req.params.provider || "").trim(), 30) }));

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
  if (!kuerzel) return res.status(400).json({ error: "Kürzel fehlt" });
  if (getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  if (!isKnownProvider(provider)) return res.status(400).json({ error: "Unbekannter Provider" });
  // The API key is per provider (set in the Provider tab), not per player.
  const u = createAiPlayer({ kuerzel, name: (b.name || "").trim() || null, provider, model: (b.model || "").trim() || null, logo: (b.logo || "").trim() || null });
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
  const updated = updateAiPlayer(u.id, { name: b.name, provider: b.provider, model: b.model, logo: b.logo, is_active: b.isActive });
  res.json({ player: adminUserDto(updated) });
});
// Minimal connection test (no match prompt). Works for a saved player OR an unsaved
// key (id 0 + provider/apiKey in the body) so the admin can verify before creating.
router.post("/admin/ai-players/:id/test", requireAdmin, async (req, res) => {
  const u = +req.params.id ? getAiPlayerById(+req.params.id) : null;
  const provider = (req.body?.provider || u?.ai_provider || "").trim();
  const model = (req.body?.model || u?.ai_model || "").trim() || undefined;
  const apiKey = getAiProviderKey(provider);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key für diesen Provider" });
  try { await adapter.testConnection({ apiKey, model }); setAiProviderTest(provider, true); res.json({ ok: true }); }
  catch (e) { setAiProviderTest(provider, false); res.json({ ok: false, error: String(e?.message || e).split(apiKey).join("***").slice(0, 300) }); }
});

// Real end-to-end test: run a full prediction for the NEXT upcoming match (with data)
// and return the tip + reasoning WITHOUT saving it — verifies the whole pipeline.
router.post("/admin/ai-players/:id/test-tip", requireAdmin, async (req, res) => {
  const u = +req.params.id ? getAiPlayerById(+req.params.id) : null;
  const provider = (req.body?.provider || u?.ai_provider || "").trim();
  const model = (req.body?.model || u?.ai_model || "").trim() || undefined;
  const apiKey = getAiProviderKey(provider);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key für diesen Provider" });
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
  const apiKey = getAiProviderKey(provider);
  const adapter = getAiAdapter(provider);
  if (!adapter) return res.status(400).json({ error: "Unbekannter Provider" });
  if (!adapter.listModels) return res.json({ models: [] });
  if (!apiKey) return res.status(400).json({ error: "Kein API-Key für diesen Provider" });
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
