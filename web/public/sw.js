// Minimal service worker for installability + an offline shell.
// Strategy: never touch /api or non-GET; hashed /assets/* are cache-first
// (immutable); navigations/others are network-first with a cache fallback.
const CACHE = "wm-tippspiel-v1";

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
