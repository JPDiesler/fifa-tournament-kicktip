import { db, getSetting } from "./connection.js";
import { kuerzelById } from "./_shared.js";
import { liveByMatch, broadcastsByMatch, detailByMatch, teamMetaState } from "./matches.js";
import { playersMeta } from "./ai.js";
import { MATCHES, CHAMP_BONUS } from "../data.js";
import { score } from "../services/scoring.js";
import { isTipLocked, isChampLocked, champLockTs, TIP_LOCK_OFFSET_MIN } from "../services/locks.js";

// ---------- legacy state shape (keeps the current /api/state contract) ----------
export function legacyState() {
  const kOf = kuerzelById();
  const tips = {};
  for (const row of db.prepare("SELECT user_id,match_n,h,a FROM tips").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    (tips[k] ||= {})[row.match_n] = { h: row.h, a: row.a };
  }
  const champs = {};
  for (const row of db.prepare("SELECT user_id,code FROM champs").all()) { const k = kOf[row.user_id]; if (k) champs[k] = row.code; }
  const results = {};
  for (const row of db.prepare("SELECT match_n,h,a FROM results").all()) results[row.match_n] = { h: row.h, a: row.a };
  const resolved = {};
  for (const row of db.prepare("SELECT * FROM resolved").all())
    resolved[row.match_n] = { homeName: row.home_name, awayName: row.away_name, homeCode: row.home_code, awayCode: row.away_code, winner: row.winner };
  return { tips, champs, results, resolved, live: liveByMatch(), broadcasts: broadcastsByMatch(), championActual: getSetting("championActual", ""), meta: getSetting("meta", {}) };
}

// ---------- per-user state (privacy: others' tips only once a match is locked) ----------
export function stateForUser(meKuerzel) {
  const now = Date.now();
  const lockedMatches = MATCHES.filter((m) => isTipLocked(m.n, now)).map((m) => m.n);
  const lockedSet = new Set(lockedMatches);
  const champLocked = isChampLocked(now);
  const kOf = kuerzelById();

  const tips = {};
  for (const row of db.prepare("SELECT user_id,match_n,h,a FROM tips").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    if (k === meKuerzel || lockedSet.has(row.match_n)) (tips[k] ||= {})[row.match_n] = { h: row.h, a: row.a };
  }
  const champs = {};
  for (const row of db.prepare("SELECT user_id,code FROM champs").all()) {
    const k = kOf[row.user_id]; if (!k) continue;
    if (k === meKuerzel || champLocked) champs[k] = row.code;
  }
  const results = {};
  for (const row of db.prepare("SELECT match_n,h,a FROM results").all()) results[row.match_n] = { h: row.h, a: row.a };
  const resolved = {};
  for (const row of db.prepare("SELECT * FROM resolved").all())
    resolved[row.match_n] = { homeName: row.home_name, awayName: row.away_name, homeCode: row.home_code, awayCode: row.away_code, winner: row.winner };

  return {
    me: meKuerzel,
    tips, champs, results, resolved, live: liveByMatch(), broadcasts: broadcastsByMatch(),
    details: detailByMatch(),
    teamMeta: teamMetaState(),
    players: playersMeta(),
    championActual: getSetting("championActual", ""),
    capabilities: getSetting("capabilities", null),
    meta: getSetting("meta", {}),
    locks: { offsetMin: TIP_LOCK_OFFSET_MIN, serverNow: now, champLocked, champLockTs, lockedMatches },
  };
}

// ---------- leaderboard (server-side scoring) ----------
export function leaderboard() {
  const st = legacyState();
  const players = db.prepare("SELECT kuerzel, name FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0 ORDER BY kuerzel").all();
  const championActual = st.championActual;
  return players
    .map(({ kuerzel, name }) => {
      let sum = 0, exact = 0;
      for (const m of MATCHES) {
        const pt = score((st.tips[kuerzel] || {})[m.n], st.results[m.n]);
        if (pt !== null) { sum += pt; if (pt === 3) exact++; }
      }
      const champHit = !!(championActual && st.champs[kuerzel] === championActual);
      if (champHit) sum += CHAMP_BONUS;
      return { p: kuerzel, name: name || kuerzel, sum, exact, champ: st.champs[kuerzel] || "", champHit };
    })
    .sort((a, b) => b.sum - a.sum || b.exact - a.exact);
}

// ---------- per-day breakdown (Tagessieger + points per day) ----------
export function matchdayBreakdown() {
  const st = legacyState();
  const players = db.prepare("SELECT kuerzel, name FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0 ORDER BY kuerzel").all();
  const byDay = {};
  for (const m of MATCHES) {
    const day = m.dt.slice(0, 10);
    (byDay[day] ||= { day, label: m.disp.split(" · ")[0], matches: [] }).matches.push(m);
  }
  const days = [];
  for (const day of Object.keys(byDay).sort()) {
    const { label, matches } = byDay[day];
    const scorable = matches.some((m) => { const r = st.results[m.n]; return r && r.h !== "" && r.a !== ""; });
    if (!scorable) continue;
    const rows = players
      .map(({ kuerzel, name }) => {
        let pts = 0, any = false;
        for (const m of matches) {
          const p = score((st.tips[kuerzel] || {})[m.n], st.results[m.n]);
          if (p !== null) { pts += p; any = true; }
        }
        return { p: kuerzel, name: name || kuerzel, pts, any };
      })
      .filter((r) => r.any)
      .sort((a, b) => b.pts - a.pts);
    days.push({ day, label, count: matches.length, rows, top: rows.length ? rows[0].pts : 0 });
  }
  return days.reverse(); // most recent first
}
