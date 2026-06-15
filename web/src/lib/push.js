// Web Push (PWA) client: feature-detect, request permission, (un)subscribe and
// sync per-event prefs with the server. The service worker (registered in
// main.jsx, PROD only) is what actually shows the notifications, so push is
// unavailable in the Vite dev server — the UI degrades gracefully.

export function pushSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator
    && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}
export const permission = () => (pushSupported() ? Notification.permission : "denied");

// VAPID public key (base64url) → Uint8Array for pushManager.subscribe.
function urlBase64ToUint8Array(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
// serviceWorker.ready only resolves once a worker is active (PROD) — guard with a
// timeout so the dev server (no SW) doesn't hang the UI forever.
async function reg() {
  if (!pushSupported()) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
}

const J = async (r, fb) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || fb); return d; };
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export async function currentSubscription() {
  const r = await reg();
  return r ? r.pushManager.getSubscription() : null;
}

// Ask for permission, subscribe this device and register it server-side. Returns { prefs }.
export async function enablePush() {
  if (!pushSupported()) throw new Error("Push wird auf diesem Gerät/Browser nicht unterstützt.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");
  const r = await reg();
  if (!r) throw new Error("Service Worker nicht aktiv (im Dev-Modus deaktiviert).");
  const { publicKey } = await J(await fetch("/api/push/key"), "Kein Schlüssel erhalten");
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  return J(await post("/api/push/subscribe", { subscription: sub.toJSON() }), "Abo fehlgeschlagen");
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) { await post("/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); }
}

export const getPrefs = async () => J(await fetch("/api/push/prefs"), "Einstellungen nicht ladbar"); // { events, prefs, subscribed }
export const setPrefs = async (prefs) => J(await post("/api/push/prefs", { prefs }), "Speichern fehlgeschlagen");
export const sendTest = async () => J(await post("/api/push/test"), "Test fehlgeschlagen");
