// Thin JSON fetch wrapper around the backend API (proxied at /api in dev,
// served from the same origin in production).
export const api = (p, opts = {}) =>
  fetch("/api" + p, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then((r) => r.json());
