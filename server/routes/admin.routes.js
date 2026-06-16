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
} from "../db.js";
import { requireAdmin, adminUserDto, hashPassword } from "../middleware/auth.js";
import { sync, runBackfill } from "../services/sync.js";
import { activeSource, probeSource, getAdapter, listAdapters, DEFAULT_SOURCE } from "../services/sources/index.js";
import { effectiveCapabilities, effectiveConfig, FEATURES, liveDelayMs } from "../services/coordinator.js";
import { genPassword, cacheCredential, getCredential, streamCredentialsPdf } from "../services/credentials.js";

const router = Router();
const cleanKuerzel = (k) => ((k || "").trim().toUpperCase() || null);

router.post("/sync", requireAdmin, async (req, res) => { await sync("manuell"); runBackfill("manuell"); res.json({ meta: getMeta() }); });

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

export default router;
