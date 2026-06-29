import { db, getSetting } from "./connection.js";
import { ensureUserByKuerzel } from "./_shared.js";
import { getUserByKuerzel } from "./users.js";
import { MATCHES } from "../data.js";
import { isTipLocked } from "../services/locks.js";

// ---------- writes ----------
// Lock-aware tip write: upsert each match, but never modify a match that is
// already locked (server-enforced regardless of what the client sends).
// Server-side tip validation (never trust the client): a score is "" (clear) or a whole
// number 0–99; the match must be a real, unlocked fixture. Anything else is rejected.
const VALID_MATCH_NS = new Set(MATCHES.map((m) => m.n));
// Single-elimination K.o. matches (no draw in the final outcome) → a Remis-Tipp must also name
// the eventual winner. Group games (A–L) and anything else never carry a winner pick.
const KO_PHASES = new Set(["R32", "R16", "QF", "SF", "P3", "FIN"]);
const KO_MATCH_NS = new Set(MATCHES.filter((m) => KO_PHASES.has(m.ph)).map((m) => m.n));
const cleanScore = (v) => {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? String(n) : null; // null = invalid → reject
};
const cleanWinner = (v) => (v === "h" || v === "a" ? v : ""); // K.o. Remis-Tipp: getippter Sieger
const cleanJoker = (v) => (v === "risk" || v === "safe" ? v : ""); // 'risk' (Schwert) | 'safe' (Schild)
const PHASE_MATCHES = {}; for (const m of MATCHES) (PHASE_MATCHES[m.ph] ||= []).push(m.n); // ph → matches (1 Joker/Phase)
const phaseOf = Object.fromEntries(MATCHES.map((m) => [m.n, m.ph]));
export function setUserTips(kuerzel, tipsObj) {
  const u = ensureUserByKuerzel(kuerzel);
  const jokersOn = getSetting("jokersEnabled", false);
  const ins = db.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a,w,joker) VALUES(?,?,?,?,?,?)");
  let rejected = 0;
  db.transaction(() => {
    for (const [n, t] of Object.entries(tipsObj || {})) {
      const mn = Number(n);
      if (!Number.isInteger(mn) || !VALID_MATCH_NS.has(mn)) { rejected++; continue; } // bogus match
      if (isTipLocked(mn)) { rejected++; continue; }                                   // locked
      const h = cleanScore(t?.h), a = cleanScore(t?.a);
      if (h === null || a === null) { rejected++; continue; }                           // garbage score
      // winner pick only kept for a draw tip on a K.o. match; cleared otherwise
      const w = (KO_MATCH_NS.has(mn) && h !== "" && h === a) ? cleanWinner(t?.w) : "";
      const joker = jokersOn ? cleanJoker(t?.joker) : ""; // ignored entirely while jokers are off
      ins.run(u.id, mn, h, a, w, joker);
      // budget: at most one joker per phase → clear it on the player's OTHER matches of that phase
      if (joker) {
        const others = (PHASE_MATCHES[phaseOf[mn]] || []).filter((x) => x !== mn);
        if (others.length) db.prepare(`UPDATE tips SET joker='' WHERE user_id=? AND joker!='' AND match_n IN (${others.join(",")})`).run(u.id);
      }
    }
  })();
  return { rejected };
}
// One user's stored tip for a match → { h, a, w, joker } (joker blanked while the feature is off),
// or null. Used by the AI-reasoning route to show the actually-placed tip incl. winner + joker.
export function getUserTip(userId, matchN) {
  const r = db.prepare("SELECT h,a,w,joker FROM tips WHERE user_id=? AND match_n=?").get(Number(userId), Number(matchN));
  if (!r) return null;
  return { h: r.h, a: r.a, w: r.w, joker: getSetting("jokersEnabled", false) ? r.joker : "" };
}

// AI joker budget for (player, match): is the phase's single joker still free here? `enabled` =
// global toggle; `available` = no joker already sits on ANOTHER match of this match's phase. The
// scheduler hands this to the LLM (so it won't propose a joker it can't place) and clamps with it.
export function aiJokerContext(kuerzel, matchN) {
  const enabled = getSetting("jokersEnabled", false) === true;
  const u = getUserByKuerzel(kuerzel);
  if (!enabled || !u) return { enabled, available: false };
  const others = (PHASE_MATCHES[phaseOf[Number(matchN)]] || []).filter((x) => x !== Number(matchN));
  const taken = others.length && db.prepare(`SELECT 1 FROM tips WHERE user_id=? AND joker!='' AND match_n IN (${others.join(",")}) LIMIT 1`).get(u.id);
  return { enabled, available: !taken };
}
export function setChamp(kuerzel, code) {
  const u = ensureUserByKuerzel(kuerzel);
  db.prepare("INSERT INTO champs(user_id,code) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code").run(u.id, code || "");
}
export function setResult(n, h, a) {
  db.prepare("INSERT INTO results(match_n,h,a) VALUES(?,?,?) ON CONFLICT(match_n) DO UPDATE SET h=excluded.h,a=excluded.a")
    .run(Number(n), String(h ?? ""), String(a ?? ""));
}
export function setResolved(n, rv) {
  db.prepare(`INSERT INTO resolved(match_n,home_name,away_name,home_code,away_code,reg_home,reg_away,winner) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET home_name=excluded.home_name,away_name=excluded.away_name,home_code=excluded.home_code,away_code=excluded.away_code,reg_home=excluded.reg_home,reg_away=excluded.reg_away,winner=excluded.winner`)
    .run(Number(n), rv.homeName ?? null, rv.awayName ?? null, rv.homeCode ?? null, rv.awayCode ?? null, rv.regHome ?? null, rv.regAway ?? null, rv.winner ?? null);
}
export const clearResolved = (n) => db.prepare("DELETE FROM resolved WHERE match_n=?").run(Number(n));
export const getResolved = (n) => db.prepare("SELECT * FROM resolved WHERE match_n=?").get(Number(n));

export const hasResult = (n) => {
  const r = db.prepare("SELECT h,a FROM results WHERE match_n=?").get(n);
  return !!(r && r.h !== "" && r.a !== "");
};
