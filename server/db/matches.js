import { db } from "./connection.js";

// ---------- broadcasts ----------
// Replace ALL broadcast rows for one source with `map` ({ match_n: [serviceKey…] }).
// Sources are independent (e.g. 'epg' and 'rights' are merged on read), so each
// can be refreshed without touching the other. Use for fully-derivable sources
// like 'rights' (computed from config every time).
export function replaceBroadcasts(source, map) {
  const del = db.prepare("DELETE FROM broadcasts WHERE source=?");
  const ins = db.prepare("INSERT OR IGNORE INTO broadcasts(match_n,service,source) VALUES(?,?,?)");
  const tx = db.transaction(() => {
    del.run(source);
    for (const [n, services] of Object.entries(map || {}))
      for (const s of services) ins.run(Number(n), String(s), source);
  });
  tx();
}
// Merge `map` into one source PER MATCH: only matches present in `map` are touched,
// the rest are left intact. This lets the EPG (a rolling ~few-day window) ACCUMULATE
// over the tournament — once a match has been seen it stays, even after it drops out
// of the guide window.
export function mergeBroadcasts(source, map) {
  const del = db.prepare("DELETE FROM broadcasts WHERE source=? AND match_n=?");
  const ins = db.prepare("INSERT OR IGNORE INTO broadcasts(match_n,service,source) VALUES(?,?,?)");
  const tx = db.transaction(() => {
    for (const [n, services] of Object.entries(map || {})) {
      del.run(source, Number(n));
      for (const s of services) ins.run(Number(n), String(s), source);
    }
  });
  tx();
}
// { match_n: [serviceKey…] } — union across all sources, deduped & sorted.
export function broadcastsByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT DISTINCT match_n, service FROM broadcasts ORDER BY service").all())
    (out[r.match_n] ||= []).push(r.service);
  return out;
}

// ---------- live (transient in-play state) ----------
// Replace the whole live table with the currently in-play matches.
// `map` = { match_n: { h, a, phase, minute, injury } } (h/a may be "" before the
// first delayed score arrives). Full replace = matches that finished or stopped
// being live since the last sync simply disappear.
export function replaceLive(map) {
  const asOf = Date.now(); // capture time → the client anchors its local match clock to this
  const del = db.prepare("DELETE FROM live");
  const ins = db.prepare("INSERT INTO live(match_n,h,a,phase,minute,injury,as_of,odds,pen) VALUES(?,?,?,?,?,?,?,?,?)");
  const tx = db.transaction(() => {
    del.run();
    for (const [n, v] of Object.entries(map || {}))
      ins.run(Number(n), String(v.h ?? ""), String(v.a ?? ""), v.phase ?? null, v.minute ?? null, v.injury ?? null, asOf, v.odds ? JSON.stringify(v.odds) : null, v.pen ? JSON.stringify(v.pen) : null);
  });
  tx();
}
// { match_n: { h, a, phase, minute, injury, asOf, odds } } for matches currently in play.
export function liveByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,h,a,phase,minute,injury,as_of,odds,pen FROM live").all())
    out[r.match_n] = { h: r.h, a: r.a, phase: r.phase, minute: r.minute, injury: r.injury, asOf: r.as_of, odds: r.odds ? JSON.parse(r.odds) : null, pen: r.pen ? JSON.parse(r.pen) : null };
  return out;
}

// ---------- per-match scorers/cards/subs + lineups + final clock (display only) ----------
export function setMatchDetail(n, scorers, cards, subs, shootout = null) {
  db.prepare(`INSERT INTO match_detail(match_n,scorers,cards,subs,shootout) VALUES(?,?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET scorers=excluded.scorers, cards=excluded.cards, subs=excluded.subs, shootout=excluded.shootout, updated_at=datetime('now')`)
    .run(Number(n), JSON.stringify(scorers || []), JSON.stringify(cards || []), JSON.stringify(subs || []), shootout ? JSON.stringify(shootout) : null);
}
// Starting lineups (+bench/formation/coach). Upserts only the lineups column.
export function setMatchLineups(n, lineups) {
  db.prepare(`INSERT INTO match_detail(match_n,lineups) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET lineups=excluded.lineups, updated_at=datetime('now')`)
    .run(Number(n), lineups ? JSON.stringify(lineups) : null);
}
// Per-team match statistics ({ home:{…}, away:{…} }). Upserts only the stats column.
export function setMatchStats(n, stats) {
  db.prepare(`INSERT INTO match_detail(match_n,stats) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET stats=excluded.stats, updated_at=datetime('now')`)
    .run(Number(n), stats ? JSON.stringify(stats) : null);
}
// Per-player match statistics keyed by player id ({ [pid]:{rating,goals,…} }). Upserts
// only the player_stats column.
export function setMatchPlayerStats(n, ps) {
  db.prepare(`INSERT INTO match_detail(match_n,player_stats) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET player_stats=excluded.player_stats, updated_at=datetime('now')`)
    .run(Number(n), ps ? JSON.stringify(ps) : null);
}
// Pre-match preview (predictions/form/h2h/injuries). Upserts only the preview column.
export function setMatchPreview(n, preview) {
  db.prepare(`INSERT INTO match_detail(match_n,preview) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET preview=excluded.preview, updated_at=datetime('now')`)
    .run(Number(n), preview ? JSON.stringify(preview) : null);
}
// One match's cached preview (predictions/form/h2h/injuries/odds), or null. Used by the
// AI bundle to read the already-fetched pre-match odds without a new api-football call.
export function getMatchPreview(n) {
  const r = db.prepare("SELECT preview FROM match_detail WHERE match_n=?").get(Number(n));
  if (!r?.preview) return null;
  try { return JSON.parse(r.preview); } catch { return null; }
}
// Observed final match clock (minute/injury/phase) — written once per match when it
// finishes. Upserts only the final_* columns, leaving any scorers/cards intact.
export function setMatchFinalTime(n, f) {
  db.prepare(`INSERT INTO match_detail(match_n,final_minute,final_injury,final_phase) VALUES(?,?,?,?)
    ON CONFLICT(match_n) DO UPDATE SET final_minute=excluded.final_minute, final_injury=excluded.final_injury, final_phase=excluded.final_phase, updated_at=datetime('now')`)
    .run(Number(n), f?.minute ?? null, f?.injury ?? null, f?.phase ?? null);
}
// Penalty-shootout result of a finished K.o. match ({ home, away }). Upserts only the pen column.
export function setMatchPenalty(n, pen) {
  db.prepare(`INSERT INTO match_detail(match_n,pen) VALUES(?,?)
    ON CONFLICT(match_n) DO UPDATE SET pen=excluded.pen, updated_at=datetime('now')`)
    .run(Number(n), pen ? JSON.stringify(pen) : null);
}
export function detailByMatch() {
  const out = {};
  for (const r of db.prepare("SELECT match_n,scorers,cards,subs,lineups,stats,preview,player_stats,final_minute,final_injury,final_phase,pen,shootout FROM match_detail").all()) {
    try {
      out[r.match_n] = {
        scorers: JSON.parse(r.scorers || "[]"),
        cards: JSON.parse(r.cards || "[]"),
        subs: JSON.parse(r.subs || "[]"),
        lineups: r.lineups ? JSON.parse(r.lineups) : null,
        stats: r.stats ? JSON.parse(r.stats) : null,
        preview: r.preview ? JSON.parse(r.preview) : null,
        playerStats: r.player_stats ? JSON.parse(r.player_stats) : null,
        final: r.final_minute != null ? { minute: r.final_minute, injury: r.final_injury, phase: r.final_phase } : null,
        pen: r.pen ? JSON.parse(r.pen) : null,
        shootout: r.shootout ? JSON.parse(r.shootout) : null,
      };
    } catch { /* skip */ }
  }
  return out;
}

// ---------- team meta (admin nickname + logo overrides) ----------
// Partial upsert: a key present in `patch` is written (value or null to clear); an absent
// key is left untouched. nickname is capped; logo is a data URI (or null).
export function setTeamMeta(code, patch = {}) {
  const c = String(code || "").toUpperCase();
  if (!c) return;
  const cols = [], vals = [];
  if (Object.prototype.hasOwnProperty.call(patch, "nickname")) { cols.push("nickname"); vals.push(patch.nickname ? String(patch.nickname).slice(0, 60) : null); }
  if (Object.prototype.hasOwnProperty.call(patch, "logo")) { cols.push("logo"); vals.push(patch.logo || null); }
  if (!cols.length) return;
  const names = cols.join(","), ph = cols.map(() => "?").join(","), upd = cols.map((k) => `${k}=excluded.${k}`).join(", ");
  db.prepare(`INSERT INTO team_meta(code,${names},updated_at) VALUES(?,${ph},?)
    ON CONFLICT(code) DO UPDATE SET ${upd}, updated_at=excluded.updated_at`).run(c, ...vals, Date.now());
}
export function getTeamMetaRow(code) {
  return db.prepare("SELECT code,nickname,logo,updated_at FROM team_meta WHERE code=?").get(String(code || "").toUpperCase()) || null;
}
// Player-facing state: only the deltas, WITHOUT the logo bytes (served via /api/team-logo).
// logoVer = updated_at, used by the client to cache-bust the logo URL.
export function teamMetaState() {
  const out = {};
  for (const r of db.prepare("SELECT code,nickname,logo,updated_at FROM team_meta").all()) {
    const m = {};
    if (r.nickname) m.nickname = r.nickname;
    if (r.logo) m.logoVer = r.updated_at;
    if (Object.keys(m).length) out[r.code] = m;
  }
  return out;
}
// Admin editor: nickname override + whether a logo override exists, per code.
export function teamOverrides() {
  const out = {};
  for (const r of db.prepare("SELECT code,nickname,logo FROM team_meta").all()) out[r.code] = { nickname: r.nickname || null, hasLogo: !!r.logo };
  return out;
}

// ---------- persisted provider fixture ids (written each sync) ----------
export function setMatchExtIds(n, extIds) {
  const ins = db.prepare("INSERT INTO match_ext(match_n,provider,ext_id) VALUES(?,?,?) ON CONFLICT(match_n,provider) DO UPDATE SET ext_id=excluded.ext_id");
  for (const [provider, extId] of Object.entries(extIds || {})) if (extId != null) ins.run(Number(n), provider, String(extId));
}
export const getMatchExtId = (n, provider) =>
  db.prepare("SELECT ext_id FROM match_ext WHERE match_n=? AND provider=?").get(Number(n), provider)?.ext_id || null;
export function extIdsByMatch(n) {
  const out = {};
  for (const r of db.prepare("SELECT provider,ext_id FROM match_ext WHERE match_n=?").all(Number(n))) out[r.provider] = r.ext_id;
  return out;
}
