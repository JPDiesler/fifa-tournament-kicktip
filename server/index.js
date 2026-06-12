import express from "express";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { MATCHES, ALIASES, TEAMS } from "./data.js";
import {
  db, stateForUser, leaderboard, matchdayBreakdown, setUserTips, setChamp, setResult, setResolved, clearResolved,
  getMeta, setMeta, setChampionActual, getChampionActual, hasResult,
  getUserByUsername, getUserByEntraOid, getUserByEntraUpn, getUserByKuerzel,
  getUserById, listUsers, createUser, updateUser, deleteUser, countAdmins,
} from "./db.js";
import { isChampLocked } from "./lib/locks.js";
import { matchDueForResult } from "./lib/poller.js";
import { activeSource } from "./lib/sources.js";
import {
  requireAuth, requireAdmin, userDto, adminUserDto, publicConfig,
  hashPassword, verifyPassword, verifyEntraIdToken, bootstrapAdmin,
} from "./lib/auth.js";
import { genPassword, cacheCredential, getCredential, streamCredentialsPdf } from "./lib/credentials.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
// "true"/"false" force the flag; anything else (incl. unset/"auto") → 'auto':
// the cookie is Secure only when the request is HTTPS (via trust proxy). One
// setting then works for both local http and prod behind an HTTPS reverse proxy.
const _cs = (process.env.COOKIE_SECURE || "auto").toLowerCase();
const COOKIE_SECURE = _cs === "true" ? true : _cs === "false" ? false : "auto";

if (SESSION_SECRET === "dev-insecure-secret-change-me") console.warn("⚠  SESSION_SECRET nicht gesetzt — nur für lokale Entwicklung!");

// ---------- index for matching API fixtures to our match numbers ----------
const tsOf = (dtLocal) => Date.parse(dtLocal + ":00+02:00"); // MESZ wall-clock -> epoch ms
const known = (c) => Object.prototype.hasOwnProperty.call(TEAMS, c);
// Group / already-decided matches are keyed by their (unordered) team pair, so
// two matches that kick off at the same minute can never be confused. K.o.
// matches carry placeholder "teams" ("Sieger Gruppe A" …) and are matched by
// kickoff time alone until the API fills in the real qualified teams.
const PAIR_INDEX = new Map(); // "AAA|BBB" (sorted) -> { n, ts, h }
const TIME_ONLY = [];         // [{ n, ts }] for K.o. placeholder matches
for (const m of MATCHES) {
  const ts = tsOf(m.dt);
  if (known(m.h) && known(m.a)) PAIR_INDEX.set([m.h, m.a].sort().join("|"), { n: m.n, ts, h: m.h });
  else TIME_ONLY.push({ n: m.n, ts });
}
const PAIR_TOL = 6 * 60 * 60 * 1000; // same pairing, roughly the same day
const TIME_TOL = 90 * 60 * 1000;     // K.o. fallback window
const norm = (s) => (s || "").normalize("NFKD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase().replace(/[^a-z0-9]/g, "");
const codeForName = (name) => {
  const x = norm(name);
  for (const c in ALIASES) if (ALIASES[c].includes(x)) return c;
  return null;
};
// Map a normalised API fixture to one of our matches.
// Returns { n, swap, ko } or null. `swap` means the fixture's home is our
// match's away (so its goals must be flipped to match our home/away order).
// `usedTimeOnly` guards against two simultaneous K.o. fixtures grabbing the
// same match number.
function matchForFixture(f, usedTimeOnly) {
  const fh = codeForName(f.homeName), fa = codeForName(f.awayName);
  if (fh && fa) {
    const hit = PAIR_INDEX.get([fh, fa].sort().join("|"));
    if (hit && Math.abs(hit.ts - f.dateMs) <= PAIR_TOL) return { n: hit.n, swap: fh !== hit.h, ko: false };
  }
  let best = null, bestDiff = Infinity;
  for (const { n, ts } of TIME_ONLY) {
    if (usedTimeOnly.has(n)) continue;
    const d = Math.abs(ts - f.dateMs);
    if (d < bestDiff) { bestDiff = d; best = n; }
  }
  return best != null && bestDiff <= TIME_TOL ? { n: best, swap: false, ko: true } : null;
}

// ---------- result sync (provider-agnostic; source chosen via DATA_SOURCE) ----------
const FINAL_N = 104; // the World Cup final → its winner is the actual champion
// Per-minute rate guard (the binding limit on the free tiers). In-memory ring of
// recent call timestamps; resets on restart, which is harmless.
const RATE_WINDOW_MS = 60_000;
let recentCalls = [];
function rateOk(perMin) {
  const now = Date.now();
  recentCalls = recentCalls.filter((t) => now - t < RATE_WINDOW_MS);
  return recentCalls.length < perMin;
}
function dailyOk(meta, limit) {
  if (limit == null) return true; // source has no daily cap (e.g. football-data free tier)
  const today = new Date().toISOString().slice(0, 10);
  if (meta.apiCallsDate !== today) { meta.apiCallsDate = today; meta.apiCallsToday = 0; }
  return (meta.apiCallsToday || 0) < limit;
}
async function sync(reason = "cron") {
  const src = activeSource();
  const meta = getMeta();
  const perMin = src.rateLimit();
  const daily = src.dailyLimit();
  if (!src.configured()) { meta.lastSyncMsg = `${src.name}: kein Key/Token gesetzt`; setMeta(meta); return; }
  if (!rateOk(perMin)) { meta.lastSyncMsg = `${src.name}: Rate-Limit (${perMin}/min) – kurz warten`; setMeta(meta); return; }
  if (!dailyOk(meta, daily)) { meta.lastSyncMsg = `${src.name}: Tageslimit (${daily}) erreicht`; setMeta(meta); return; }
  try {
    recentCalls.push(Date.now());
    if (daily != null) meta.apiCallsToday = (meta.apiCallsToday || 0) + 1;
    const list = await src.fetchFixtures(); // normalised fixtures
    let updated = 0, resolvedCount = 0, championCode = null;
    const usedTimeOnly = new Set();
    for (const f of list) {
      if (!f.dateMs) continue;
      const hit = matchForFixture(f, usedTimeOnly);
      if (!hit) continue;
      const { n, swap, ko } = hit;
      if (ko) {
        usedTimeOnly.add(n);
        // K.o.: the API supplies the actual qualified teams — store them for display.
        // Also store the winner side so the bracket can mark the advancing team
        // even when the match was decided in a shootout (level fulltime score).
        if (f.homeName && f.awayName) {
          const winner = f.winner === "home" || f.winner === "away" ? f.winner : null;
          setResolved(n, { homeName: f.homeName, awayName: f.awayName, homeCode: codeForName(f.homeName), awayCode: codeForName(f.awayName), winner });
          resolvedCount++;
        }
      } else {
        // Group: our static pairing is authoritative — never override it with the
        // API's home/away (which may be swapped). Drop any stale resolved row.
        clearResolved(n);
      }
      if (f.finished && f.homeGoals != null && f.awayGoals != null) {
        const [h, a] = swap ? [f.awayGoals, f.homeGoals] : [f.homeGoals, f.awayGoals];
        setResult(n, String(h), String(a));
        updated++;
      }
      // The champion is whoever wins the final — derived from the winner flag so
      // a penalty-shootout title still resolves (the fullTime score is a draw).
      if (n === FINAL_N && f.finished && f.winner && f.winner !== "draw") {
        championCode = codeForName(f.winner === "home" ? f.homeName : f.awayName);
      }
    }
    // Set the actual champion automatically once the final is decided — no admin needed.
    let champMsg = "";
    if (championCode && getChampionActual() !== championCode) {
      setChampionActual(championCode);
      champMsg = `, Weltmeister: ${TEAMS[championCode]?.name || championCode}`;
    }
    meta.lastSync = new Date().toISOString();
    const callInfo = daily != null ? ` (Call ${meta.apiCallsToday}/${daily} heute)` : "";
    meta.lastSyncMsg = `${reason} · ${src.name}: ${list.length} Spiele, ${updated} Ergebnisse, ${resolvedCount} Paarungen${champMsg}${callInfo}`;
    setMeta(meta);
    console.log(meta.lastSyncMsg);
  } catch (e) {
    const m = getMeta(); m.lastSyncMsg = `Sync-Fehler (${src.name}): ` + e.message; setMeta(m); console.error("sync", e);
  }
}

// ---------- app ----------
bootstrapAdmin();
// One-off heal: earlier syncs could cross-assign API fixtures to the wrong match
// when two games kicked off at the same minute, leaving bogus resolved rows on
// group matches. Group pairings are static (authoritative), so drop them here;
// only K.o. matches legitimately carry resolved teams.
for (const m of MATCHES) if (known(m.h) && known(m.a)) clearResolved(m.n);
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const SqliteStore = SqliteStoreFactory(session);
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

// ---------- auth ----------
app.get("/api/config", (req, res) => res.json(publicConfig()));
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: userDto(req.user) }));
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = username ? getUserByUsername(username) : null;
  // Verify credentials first (don't reveal account state before that).
  if (!u || u.kind !== "basic" || !verifyPassword(password || "", u.pass_hash))
    return res.status(401).json({ error: "Benutzername oder Passwort falsch." });
  if (!u.is_active)
    return res.status(403).json({ error: "Dein Zugang ist deaktiviert. Bitte einen Admin kontaktieren." });
  req.session.userId = u.id;
  res.json({ user: userDto(u) });
});
app.post("/api/auth/entra", async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: "Microsoft-Anmeldung fehlgeschlagen (kein Token)." });
  let c;
  try {
    c = await verifyEntraIdToken(idToken);
  } catch (e) {
    console.error("entra verify:", e.message);
    return res.status(401).json({ error: "Microsoft-Anmeldung ungültig oder abgelaufen. Bitte erneut versuchen." });
  }
  const oid = c.oid;
  const upn = c.preferred_username || c.upn || c.email;
  const u = (oid && getUserByEntraOid(oid)) || (upn && getUserByEntraUpn(upn));
  if (!u)
    return res.status(403).json({ error: `Dein Microsoft-Konto${upn ? ` (${upn})` : ""} ist noch nicht freigeschaltet. Bitte einen Admin um Zugang bitten.` });
  if (!u.is_active)
    return res.status(403).json({ error: "Dein Zugang ist deaktiviert. Bitte einen Admin kontaktieren." });
  if (oid && !u.entra_oid) updateUser(u.id, { entra_oid: oid });
  req.session.userId = u.id;
  res.json({ user: userDto(u) });
});
app.post("/api/auth/logout", (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// ---------- data (auth required) ----------
app.get("/api/state", requireAuth, (req, res) => res.json(stateForUser(req.user.kuerzel)));
app.get("/api/leaderboard", requireAuth, (req, res) => res.json(leaderboard()));
app.get("/api/matchdays", requireAuth, (req, res) => res.json(matchdayBreakdown()));
app.post("/api/tips", requireAuth, (req, res) => {
  if (req.user.is_superadmin) return res.status(403).json({ error: "Der Admin-Account nimmt nicht am Tippspiel teil." });
  if (!req.user.kuerzel) return res.status(403).json({ error: "Kein Kürzel zugewiesen – bitte Admin kontaktieren." });
  const { tips } = req.body || {};
  if (!tips || typeof tips !== "object") return res.status(400).json({ error: "bad" });
  const { rejected } = setUserTips(req.user.kuerzel, tips); // locked matches are silently skipped (server-enforced)
  res.json({ ok: true, rejected });
});
app.post("/api/champ", requireAuth, (req, res) => {
  if (req.user.is_superadmin) return res.status(403).json({ error: "Der Admin-Account nimmt nicht am Tippspiel teil." });
  if (!req.user.kuerzel) return res.status(403).json({ error: "Kein Kürzel zugewiesen – bitte Admin kontaktieren." });
  if (isChampLocked()) return res.status(423).json({ error: "Weltmeister-Tipp ist seit K.o.-Start gesperrt" });
  setChamp(req.user.kuerzel, req.body?.code || ""); res.json({ ok: true });
});

// ---------- admin (session-based) ----------
// Results and the actual champion are now fully automatic (end-time polling +
// final-winner detection), so there is no manual result/champion entry. A manual
// re-sync remains available to force a refresh.
app.post("/api/sync", requireAdmin, async (req, res) => { await sync("manuell"); res.json({ meta: getMeta() }); });

// ---------- admin: user management ----------
const APP_URL = process.env.APP_URL || "";
const cleanKuerzel = (k) => ((k || "").trim().toUpperCase() || null);

app.get("/api/admin/users", requireAdmin, (req, res) => res.json(listUsers().map(adminUserDto)));

app.post("/api/admin/users/basic", requireAdmin, (req, res) => {
  const username = (req.body?.username || "").trim();
  const name = (req.body?.name || "").trim() || null;
  const kuerzel = cleanKuerzel(req.body?.kuerzel);
  if (!username) return res.status(400).json({ error: "Benutzername fehlt" });
  if (getUserByUsername(username)) return res.status(409).json({ error: "Benutzername bereits vergeben" });
  if (kuerzel && getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  const password = genPassword();
  const u = createUser({ username, name, kuerzel, kind: "basic", pass_hash: hashPassword(password), is_active: 1 });
  cacheCredential(u.id, { username, password, name, kuerzel });
  res.json({ user: adminUserDto(u), password });
});

app.post("/api/admin/users/entra", requireAdmin, (req, res) => {
  const oid = (req.body?.oid || "").trim() || null;
  const upn = (req.body?.upn || "").trim() || null;
  const name = (req.body?.name || "").trim() || null;
  const kuerzel = cleanKuerzel(req.body?.kuerzel);
  if (!oid && !upn) return res.status(400).json({ error: "UPN oder OID nötig" });
  if (oid && getUserByEntraOid(oid)) return res.status(409).json({ error: "Nutzer bereits angelegt" });
  if (upn && getUserByEntraUpn(upn)) return res.status(409).json({ error: "Nutzer bereits angelegt" });
  if (kuerzel && getUserByKuerzel(kuerzel)) return res.status(409).json({ error: "Kürzel bereits vergeben" });
  const u = createUser({ kind: "entra", entra_oid: oid, entra_upn: upn, name, kuerzel, is_active: 1 });
  res.json({ user: adminUserDto(u) });
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  const b = req.body || {};
  const fields = {};
  if ("kuerzel" in b) {
    const k = cleanKuerzel(b.kuerzel);
    if (k) { const other = getUserByKuerzel(k); if (other && other.id !== u.id) return res.status(409).json({ error: "Kürzel bereits vergeben" }); }
    fields.kuerzel = k;
  }
  if ("name" in b) fields.name = (b.name || "").trim() || null;
  if ("is_admin" in b) fields.is_admin = !!b.is_admin;
  if ("is_active" in b) fields.is_active = !!b.is_active;
  // Don't let the last active admin demote/deactivate into a lockout.
  if (u.is_admin && (fields.is_admin === false || fields.is_active === false) && countAdmins() <= 1)
    return res.status(400).json({ error: "Der letzte aktive Admin kann nicht entfernt werden" });
  res.json({ user: adminUserDto(updateUser(u.id, fields)) });
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u || u.kind !== "basic") return res.status(404).json({ error: "kein Basic-Nutzer" });
  const password = genPassword();
  updateUser(u.id, { pass_hash: hashPassword(password) });
  cacheCredential(u.id, { username: u.username, password, name: u.name, kuerzel: u.kuerzel });
  res.json({ password });
});

app.get("/api/admin/users/:id/credentials.pdf", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).end();
  const cred = getCredential(u.id);
  if (!cred) return res.status(410).json({ error: "Passwort nicht mehr verfügbar – bitte zurücksetzen." });
  streamCredentialsPdf(res, { appUrl: APP_URL, username: cred.username, password: cred.password, name: cred.name, kuerzel: cred.kuerzel });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const u = getUserById(+req.params.id);
  if (!u) return res.status(404).json({ error: "nicht gefunden" });
  if (u.id === req.user.id) return res.status(400).json({ error: "Dich selbst kannst du nicht löschen" });
  if (u.is_admin && countAdmins() <= 1) return res.status(400).json({ error: "Der letzte aktive Admin kann nicht gelöscht werden" });
  deleteUser(u.id);
  res.json({ ok: true });
});

// serve built frontend — hashed assets cache forever, but the index.html shell
// is always revalidated so a rebuilt bundle is picked up immediately.
const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC, {
  setHeaders: (res, p) => {
    if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
    else if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));
app.get("*", (req, res) =>
  res.sendFile(path.join(PUBLIC, "index.html"), { headers: { "Cache-Control": "no-cache" } }));

// Result polling: check every 2 min, but only hit the API when a match is in
// its expected-end window and still has no result — so calls cluster tightly
// around match end-times (incl. halftime, stoppage, extra time and penalties)
// and retry every 2 min until the result lands. One call covers all matches and
// stays far under the per-minute rate limit.
cron.schedule("*/2 * * * *", () => {
  const due = matchDueForResult(hasResult);
  if (due) sync(`Spielende (Spiel ${due})`);
});
// Sparse safety net to catch anything missed (e.g. K.o.-team resolution, late edits).
cron.schedule(process.env.SYNC_CRON || "0 */6 * * *", () => sync("Sicherheits-Sync"));

app.listen(PORT, () => {
  console.log(`WM-Tippspiel läuft auf :${PORT}`);
  const src = activeSource();
  console.log(`Ergebnis-Quelle: ${src.name}${src.configured() ? "" : " (nicht konfiguriert)"}`);
  if (src.configured()) sync("start");
});
