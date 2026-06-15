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
