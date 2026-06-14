// Auth API helpers. Session is a same-origin httpOnly cookie, so fetch sends it
// automatically — no token handling here.

async function jsonOrThrow(r, fallback) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || fallback);
  return j;
}

export async function getConfig() {
  const r = await fetch("/api/config");
  return r.json();
}

// Returns the current user, or null if not authenticated.
export async function getMe() {
  const r = await fetch("/api/auth/me");
  if (r.status === 401) return null;
  const j = await r.json().catch(() => ({}));
  return j.user || null;
}

export async function loginBasic(username, password) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await jsonOrThrow(r, "Login fehlgeschlagen")).user;
}

export async function loginEntra(idToken) {
  const r = await fetch("/api/auth/entra", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return (await jsonOrThrow(r, "Microsoft-Login fehlgeschlagen")).user;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}
