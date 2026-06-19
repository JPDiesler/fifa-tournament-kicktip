import { getSetting, setSetting } from "./connection.js";

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
