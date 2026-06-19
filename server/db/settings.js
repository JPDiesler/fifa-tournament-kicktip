import { getSetting, setSetting } from "./connection.js";

export const getMeta = () => getSetting("meta", {});
export const setMeta = (m) => setSetting("meta", m);
export const getChampionActual = () => getSetting("championActual", "");
export const setChampionActual = (c) => setSetting("championActual", c || "");

// EFFECTIVE capabilities (computed by the coordinator from the routing + each
// provider's caps) — drive the frontend feature gating. Shape unchanged.
export const getCapabilities = () => getSetting("capabilities", null);
export const setCapabilities = (c) => setSetting("capabilities", c);

// ---------- result source ----------
// API token, kept in the DB under "token:<id>" with an env fallback (API_FOOTBALL_KEY),
// so it can be set/changed at runtime via the admin UI without a redeploy.
const ENV_TOKEN = { apifootball: () => process.env.API_FOOTBALL_KEY || "" };
export const getProviderToken = (id) => getSetting(`token:${id}`, "") || (ENV_TOKEN[id] ? ENV_TOKEN[id]() : "");
export const setProviderToken = (id, t) => setSetting(`token:${id}`, (t || "").trim());
export const providerTokenFromDb = (id) => !!getSetting(`token:${id}`, "");

// Per-provider probed capabilities (the effective caps above are derived from these).
export const getProviderCaps = (id) => getSetting(`caps:${id}`, null);
export const setProviderCaps = (id, c) => setSetting(`caps:${id}`, c);

// Source config: { providers: { apifootball: { rateLimit, dailyLimit } } } — admin-set
// rate/daily overrides that drive the budget sizing. null → adapter env defaults.
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

// Estimated inherent display delay (seconds) of api-football's LIVE data — used to
// gate "real-time" capabilities and shown to users. Default ~15 s on a paid plan.
const DEFAULT_DELAY = { apifootball: 15 };
export const getProviderDelay = (id) => {
  const d = (getSourceConfig()?.providers || {})[id]?.delaySeconds;
  return Number.isFinite(d) ? d : (DEFAULT_DELAY[id] ?? 60);
};
