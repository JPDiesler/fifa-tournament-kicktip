// Admin user-management API helpers.
async function j(r, fallback) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || fallback);
  return d;
}
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export async function listUsers() {
  return j(await fetch("/api/admin/users"), "Konnte Nutzer nicht laden");
}

// ---- result sources (multi-provider) + feature routing ----
export async function getSources() {
  return j(await fetch("/api/admin/sources"), "Quellen nicht ladbar"); // → { sources, features, routing, default, lastSync, lastSyncMsg }
}
export async function setProviderToken(id, token) {
  return j(await post(`/api/admin/sources/${id}/token`, { token }), "Speichern fehlgeschlagen");
}
export async function testProvider(id) {
  return j(await post(`/api/admin/sources/${id}/test`), "Test fehlgeschlagen"); // → { ok, client, availableMinute, caps, … }
}
export async function saveRouting(body) {
  return j(await post("/api/admin/routing", body), "Speichern fehlgeschlagen"); // body: { routing, providers }
}
// Force a full re-fetch of scorers/cards/final-clock for all finished matches (background).
export async function refreshDetails() {
  return j(await post("/api/admin/refresh-details"), "Neu laden fehlgeschlagen");
}
export async function createBasic(body) {
  return j(await post("/api/admin/users/basic", body), "Anlegen fehlgeschlagen"); // { user, password }
}
export async function createEntra(body) {
  return j(await post("/api/admin/users/entra", body), "Anlegen fehlgeschlagen"); // { user }
}
export async function patchUser(id, fields) {
  return j(await fetch(`/api/admin/users/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
  }), "Speichern fehlgeschlagen"); // { user }
}
export async function resetPassword(id) {
  return j(await post(`/api/admin/users/${id}/reset-password`), "Zurücksetzen fehlgeschlagen"); // { password }
}
export async function deleteUser(id) {
  return j(await fetch(`/api/admin/users/${id}`, { method: "DELETE" }), "Löschen fehlgeschlagen");
}

// ---- teams (nickname + federation-logo overrides) ----
export async function getTeamOverrides() {
  return j(await fetch("/api/admin/teams"), "Mannschaften nicht ladbar"); // { [code]: { nickname, hasLogo } }
}
export async function setTeamOverride(code, body) {
  return j(await post(`/api/admin/teams/${code}`, body), "Speichern fehlgeschlagen"); // { ok, overrides }
}

// ---- AI providers (one key per provider) ----
export async function getAiProviders() {
  return j(await fetch("/api/admin/ai-providers"), "Provider nicht ladbar"); // { providers: [{id,name,defaultModel,hasKey,masked,testOk,testAt,requests,tokens,errors,players}] }
}
export async function setAiProviderKey(provider, apiKey) {
  return j(await post(`/api/admin/ai-providers/${provider}/key`, { apiKey }), "Speichern fehlgeschlagen"); // "" clears
}
export async function testAiProvider(provider) {
  return j(await post(`/api/admin/ai-providers/${provider}/test`), "Test fehlgeschlagen"); // { ok, error? }
}
export async function getAiProviderErrors(provider) {
  return j(await fetch(`/api/admin/ai-providers/${provider}/errors`), "Fehlerlog nicht ladbar"); // { errors: [...] }
}

// ---- AI players ----
export async function listAiPlayers() {
  return j(await fetch("/api/admin/ai-players"), "KI-Spieler nicht ladbar"); // { providers, players }
}
export async function createAiPlayer(body) {
  return j(await post("/api/admin/ai-players", body), "Anlegen fehlgeschlagen"); // { player }
}
export async function patchAiPlayer(id, fields) {
  return j(await fetch(`/api/admin/ai-players/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
  }), "Speichern fehlgeschlagen");
}
// Connection test; id 0 = test an unsaved key (provider/apiKey/model in body).
export async function testAiPlayer(id, body) {
  return j(await post(`/api/admin/ai-players/${id}/test`, body), "Test fehlgeschlagen"); // { ok, error? }
}
// Real end-to-end test: a full prediction for the next upcoming match (not saved).
export async function testAiTip(id, body) {
  return j(await post(`/api/admin/ai-players/${id}/test-tip`, body), "Test fehlgeschlagen"); // { ok, match, tip, prediction, error? }
}
export async function listAiPredictions(id) {
  return j(await fetch(`/api/admin/ai-players/${id}/predictions`), "Tipps nicht ladbar"); // { predictions }
}
export async function tipNow(id, matchN) {
  return j(await post(`/api/admin/ai-players/${id}/tip-now`, matchN ? { matchN } : {}), "Tippen fehlgeschlagen"); // { matchN, prediction }
}
export async function resetAiPrediction(id, matchN) {
  return j(await fetch(`/api/admin/ai-players/${id}/predictions/${matchN}`, { method: "DELETE" }), "Zurücksetzen fehlgeschlagen");
}
export async function setAiConfig(body) {
  return j(await post("/api/admin/ai-config", body), "Speichern fehlgeschlagen"); // { reasoningVisibleAfter }
}
export async function getAiRanking() {
  return j(await fetch("/api/admin/ai-ranking"), "Ranking nicht ladbar"); // { ranking: [{kuerzel,provider,brier,hitRate,avgPoints,n}] }
}
// Live model list from the provider (id 0 = use the key in the body).
export async function fetchAiModels(id, body) {
  return j(await post(`/api/admin/ai-players/${id}/models`, body), "Modelle nicht ladbar"); // { models: [{id,label?,contextLimit?}] }
}

// Download the one-time credentials PDF (available only right after create/reset).
export async function downloadCredentialsPdf(id, username) {
  const r = await fetch(`/api/admin/users/${id}/credentials.pdf`);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "PDF nicht verfügbar"); }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wm-tippspiel-${username || "zugang"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
