// Central runtime config from the environment.
export const PORT = process.env.PORT || 8080;
export const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
export const APP_URL = process.env.APP_URL || ""; // shown as the link in the credentials PDF

// "true"/"false" force the flag; anything else (incl. unset/"auto") → 'auto':
// the cookie is Secure only when the request is HTTPS (via trust proxy). One
// setting then works for both local http and prod behind an HTTPS reverse proxy.
const _cs = (process.env.COOKIE_SECURE || "auto").toLowerCase();
export const COOKIE_SECURE = _cs === "true" ? true : _cs === "false" ? false : "auto";

if (SESSION_SECRET === "dev-insecure-secret-change-me") console.warn("⚠  SESSION_SECRET nicht gesetzt — nur für lokale Entwicklung!");
