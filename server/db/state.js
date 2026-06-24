import { db, getSetting } from "./connection.js";
import { kuerzelById } from "./_shared.js";
import { liveByMatch, broadcastsByMatch, detailByMatch, teamMetaState } from "./matches.js";
import { playersMeta } from "./ai.js";
import { latestRecap } from "./recap.js";
import { MATCHES, CHAMP_BONUS } from "../data.js";
import { score } from "../services/scoring.js";
import { computeAchievements, achievementPoints, achievementPointsByDay } from "../services/achievements.js";
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
    // Achievements for the current player — computed from the FULL state (others' tips are
    // needed for lone-wolf/contrarian, but only ever on scored = long-locked matches).
    achievements: meKuerzel ? computeAchievements(meKuerzel, legacyState()) : [],
    recap: latestRecap(), // newest KI matchday recap ({ day, text }) or null
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
      const achPoints = achievementPoints(kuerzel, st); // bonus from unlocked achievements (points-relevant)
      sum += achPoints;
      return { p: kuerzel, name: name || kuerzel, sum, exact, champ: st.champs[kuerzel] || "", champHit, achPoints };
    })
    .sort((a, b) => b.sum - a.sum || b.exact - a.exact);
}

// ---------- pool standings per player (for the AI strategy layer) ----------
// kuerzel → { my_rank, my_points, leader_points, gap_to_leader, gap_to_chasers,
// matches_remaining, field_size } — derived from the same leaderboard the humans see.
// Computed once (one leaderboard build) and looked up per AI player in the scheduler.
export function poolStandingsByKuerzel() {
  const board = leaderboard();
  const played = db.prepare("SELECT COUNT(*) AS c FROM results WHERE h!='' AND a!=''").get().c;
  const matches_remaining = MATCHES.length - played;
  const leader_points = board[0]?.sum ?? 0;
  const field_size = board.length;
  const out = {};
  board.forEach((r, i) => {
    const below = board[i + 1];
    out[r.p] = {
      my_rank: i + 1, my_points: r.sum, leader_points,
      gap_to_leader: leader_points - r.sum,
      gap_to_chasers: below ? r.sum - below.sum : null,
      matches_remaining, field_size,
    };
  });
  return out;
}

// ---------- per-day breakdown (Tagessieger + points per day + achievement bonus) ----------
// Memoised on a results+roster signature: the (heavy) per-day achievement replay only reruns
// when a result actually changes, so the 30s /api/matchdays poll is cheap. Tips on already-
// scored matches are immutable (locked), so they don't affect the signature.
let _mdCache = { sig: null, val: null };
function _mdSig() {
  const players = db.prepare("SELECT COUNT(*) n FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0").get().n;
  const res = db.prepare("SELECT match_n,h,a FROM results WHERE h!='' AND a!='' ORDER BY match_n").all().map((r) => `${r.match_n}:${r.h}:${r.a}`).join(",");
  return `${players}|${res}`;
}
export function matchdayBreakdown() {
  const sig = _mdSig();
  if (_mdCache.sig === sig) return _mdCache.val;
  const st = legacyState();
  const players = db.prepare("SELECT kuerzel, name FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0 ORDER BY kuerzel").all();
  const byDay = {};
  for (const m of MATCHES) {
    const day = m.dt.slice(0, 10);
    (byDay[day] ||= { day, label: m.disp.split(" · ")[0], matches: [] }).matches.push(m);
  }
  const orderedDays = Object.keys(byDay).sort();
  const scorableOf = (matches) => matches.some((m) => { const r = st.results[m.n]; return r && r.h !== "" && r.a !== ""; });
  // chronological scorable days → per-player achievement points NEWLY earned each day
  const achByDay = achievementPointsByDay(st, orderedDays.filter((d) => scorableOf(byDay[d].matches)).map((d) => ({ day: d, matchNs: byDay[d].matches.map((m) => m.n) })));
  const days = [];
  for (const day of orderedDays) {
    const { label, matches } = byDay[day];
    if (!scorableOf(matches)) continue;
    const ach = achByDay[day] || {};
    const rows = players
      .map(({ kuerzel, name }) => {
        let pts = 0, any = false;
        for (const m of matches) {
          const p = score((st.tips[kuerzel] || {})[m.n], st.results[m.n]);
          if (p !== null) { pts += p; any = true; }
        }
        return { p: kuerzel, name: name || kuerzel, pts, achPts: ach[kuerzel] || 0, any };
      })
      .filter((r) => r.any || r.achPts > 0)
      .sort((a, b) => (b.pts + b.achPts) - (a.pts + a.achPts));
    days.push({ day, label, count: matches.length, rows, top: rows.reduce((mx, r) => Math.max(mx, r.pts), 0) });
  }
  const val = days.reverse(); // most recent first
  _mdCache = { sig, val };
  return val;
}
