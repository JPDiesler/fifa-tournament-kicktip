// Server-Sent-Events broadcaster for near-real-time live updates (scores, minute,
// phase, in-play odds + a server timestamp the client uses to keep its match clock
// drift-free). Clients subscribe via GET /api/live/stream; the sync loop publishes the
// live payload after each poll — throttled to ~5s, but forced immediately on a
// goal/kickoff/final. A keep-alive ping stops idle connections from being dropped.
const subs = new Set();
let lastSentAt = 0;
const THROTTLE_MS = 5000;

export function addClient(res) {
  subs.add(res);
  res.on("close", () => subs.delete(res));
}

export const liveClientCount = () => subs.size;

function send(res, frame) { try { res.write(frame); } catch { subs.delete(res); } }

// Push the live payload to all subscribers. Throttled to one send per ~5s unless
// `force` (a score/phase change that should appear at once).
export function publishLive(payload, { force = false } = {}) {
  if (!subs.size) return;
  const now = Date.now();
  if (!force && now - lastSentAt < THROTTLE_MS) return;
  lastSentAt = now;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of subs) send(res, frame);
}

// Keep-alive comment so proxies don't drop idle connections (no live match running).
export function pingClients() {
  for (const res of subs) send(res, ":ping\n\n");
}
