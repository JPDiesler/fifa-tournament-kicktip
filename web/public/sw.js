// Minimal service worker for installability + an offline shell + Web Push.
// Strategy: never touch /api or non-GET; hashed /assets/* are cache-first
// (immutable); navigations/others are network-first with a cache fallback.
const CACHE = "wm-tippspiel-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; }))
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
  );
});

// ---- Web Push: show the notification the server sent (JSON payload) ----
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || "WM-Tippspiel";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "/icon.jpg",
    badge: "/icon.jpg",
    tag: d.tag,                 // same tag collapses/replaces an earlier one (e.g. per match)
    renotify: !!d.renotify,     // re-alert even when replacing a same-tag notification
    data: { url: d.url || "/" },
  }));
});

// ---- focus an existing tab (or open one) on click ----
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.navigate(url); } catch {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
