// Unifies the four provider SDKs' wildly different error shapes (Anthropic / OpenAI /
// Gemini / Mistral) into ONE transparent AiError: { provider, status, code, transient,
// message }. `code` is a coarse, provider-agnostic category that drives the retry policy
// (only `transient` codes are retried) and a clean German message for storage + the admin
// diagnostics. API keys are never part of the message (the caller still redacts defensively).

const LABEL = {
  overloaded: "Anbieter überlastet",
  rate_limit: "Rate-Limit erreicht",
  timeout: "Zeitüberschreitung",
  network: "Netzwerkfehler",
  server: "Server-Fehler beim Anbieter",
  auth: "API-Key ungültig oder abgelehnt",
  bad_request: "Ungültige Anfrage",
  invalid_response: "Ungültige Antwort (kein gültiges JSON)",
  unknown: "Unbekannter Fehler",
};
// `transient` = the failure is not the caller's fault (capacity/timing/network) vs. a
// permanent auth/bad-request/invalid-response/unknown error. `retryable` is the subset we
// actually retry: a FAST-failing transient. `timeout` is transient but NOT retried — the
// per-call timeout is long (slow reasoning), so retrying it could overrun the tip window.
const TRANSIENT = new Set(["overloaded", "rate_limit", "timeout", "network", "server"]);
const RETRYABLE = new Set(["overloaded", "rate_limit", "network", "server"]);

export class AiError extends Error {
  constructor({ provider, status, code, message }) {
    super(message);
    this.name = "AiError";
    this.provider = provider || null;
    this.status = status ?? null;
    this.code = code;
    this.transient = TRANSIENT.has(code);
    this.retryable = RETRYABLE.has(code);
  }
}

// Numeric HTTP status from whichever field the SDK used (string codes like "ECONNRESET"
// are NOT statuses → ignored here, handled by the keyword fallback below).
function httpStatus(e) {
  const s = e?.status ?? e?.statusCode ?? e?.response?.status;
  const n = Number(s);
  return Number.isInteger(n) && n >= 100 && n < 600 ? n : null;
}

// Map any provider error / parse error to { status, code }. Permanent categories are
// matched BEFORE transient ones so an auth/bad-request error can never be retried.
function categorize(e) {
  const status = httpStatus(e);
  const type = String(e?.error?.type || e?.type || e?.code || "").toLowerCase(); // anthropic e.error.type, openai e.code/e.type
  const name = String(e?.name || "").toLowerCase();
  const msg = String(e?.message || e || "").toLowerCase();
  const hay = `${type} ${msg} ${name}`;

  // permanent first
  if (status === 401 || status === 403 || /authentication|permission|unauthor|invalid.*api.?key|forbidden/.test(hay)) return { status, code: "auth" };
  if (status === 400 || status === 422 || /invalid_request|invalid request|bad request|unprocessable/.test(hay)) return { status, code: "bad_request" };
  if (/json|objekt|leere modell|modell-antwort|unexpected token|unexpected end/.test(hay)) return { status, code: "invalid_response" };
  // transient
  if (status === 429 || /rate.?limit|too many requests|quota|429/.test(hay)) return { status, code: "rate_limit" };
  if (status === 529 || /overload|529/.test(hay)) return { status, code: "overloaded" };
  if (status === 408 || status === 504 || /timeout|timed out|etimedout|abort|deadline/.test(hay)) return { status, code: "timeout" };
  if (/econnreset|enotfound|eai_again|econnrefused|fetch failed|socket hang|network|getaddrinfo/.test(hay)) return { status, code: "network" };
  if ((status && status >= 500) || /server error|internal|unavailable|bad gateway|service unavailable|overloaded|temporarily|try again|503|502|500/.test(hay)) return { status, code: "server" };
  return { status, code: "unknown" };
}

// Normalize any caught error to an AiError (idempotent). `detail` keeps a short slice of
// the original message for transparency; the category + status lead the message.
export function toAiError(e, provider) {
  if (e instanceof AiError) return e;
  const { status, code } = categorize(e);
  const detail = String(e?.message ?? e ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  const message = `${LABEL[code]}${status ? ` (${status})` : ""}${detail ? ` – ${detail}` : ""}`;
  return new AiError({ provider, status, code, message });
}
