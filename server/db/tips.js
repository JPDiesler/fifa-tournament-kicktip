import { db } from "./connection.js";
import { ensureUserByKuerzel } from "./_shared.js";
import { MATCHES } from "../data.js";
import { isTipLocked } from "../services/locks.js";

// ---------- writes ----------
// Lock-aware tip write: upsert each match, but never modify a match that is
// already locked (server-enforced regardless of what the client sends).
// Server-side tip validation (never trust the client): a score is "" (clear) or a whole
// number 0–99; the match must be a real, unlocked fixture. Anything else is rejected.
const VALID_MATCH_NS = new Set(MATCHES.map((m) => m.n));
const cleanScore = (v) => {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? String(n) : null; // null = invalid → reject
};
export function setUserTips(kuerzel, tipsObj) {
  const u = ensureUserByKuerzel(kuerzel);
  const ins = db.prepare("INSERT OR REPLACE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)");
  let rejected = 0;
  db.transaction(() => {
    for (const [n, t] of Object.entries(tipsObj || {})) {
      const mn = Number(n);
      if (!Number.isInteger(mn) || !VALID_MATCH_NS.has(mn)) { rejected++; continue; } // bogus match
      if (isTipLocked(mn)) { rejected++; continue; }                                   // locked
      const h = cleanScore(t?.h), a = cleanScore(t?.a);
      if (h === null || a === null) { rejected++; continue; }                           // garbage score
      ins.run(u.id, mn, h, a);
    }
  })();
  return { rejected };
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
  db.prepare(`INSERT INTO resolved(match_n,home_name,away_name,home_code,away_code,winner) VALUES(?,?,?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET home_name=excluded.home_name,away_name=excluded.away_name,home_code=excluded.home_code,away_code=excluded.away_code,winner=excluded.winner`)
    .run(Number(n), rv.homeName ?? null, rv.awayName ?? null, rv.homeCode ?? null, rv.awayCode ?? null, rv.winner ?? null);
}
export const clearResolved = (n) => db.prepare("DELETE FROM resolved WHERE match_n=?").run(Number(n));
export const getResolved = (n) => db.prepare("SELECT * FROM resolved WHERE match_n=?").get(Number(n));

export const hasResult = (n) => {
  const r = db.prepare("SELECT h,a FROM results WHERE match_n=?").get(n);
  return !!(r && r.h !== "" && r.a !== "");
};
