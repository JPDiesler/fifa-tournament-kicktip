// "Where to watch (Germany)": map each match to its broadcasters from two sources —
// the German EPG (linear channels) and a declarative per-tournament rights layer
// (streaming services without EPG). Merged in the `broadcasts` table.
import { MATCHES, TEAMS } from "../data.js";
import { known, norm, tsOf } from "./fixtures.js";
import { fetchEpgProgrammes, RIGHTS, TEAM_ALIASES_DE } from "./epg.js";
import { legacyState, replaceBroadcasts, mergeBroadcasts, getMeta, setMeta } from "../db.js";

// Accepted normalised team names for one side of a match: the static German name
// (+ aliases) for group teams, or the API-resolved name for K.o. matches once the
// pairing is known. null → can't be matched yet (e.g. unresolved K.o. placeholder).
function acceptedNames(side, m, resolved) {
  const code = side === "h" ? m.h : m.a;
  if (known(code)) return [norm(TEAMS[code].name), ...(TEAM_ALIASES_DE[code] || [])].filter(Boolean);
  const r = resolved[m.n];
  const nm = r && (side === "h" ? r.homeName : r.awayName);
  return nm ? [norm(nm)] : null;
}

// Materialise the per-tournament streaming/pay rights into broadcast rows.
export function applyRights() {
  const map = {};
  for (const rule of RIGHTS) {
    const cov = rule.coverage;
    for (const m of MATCHES) {
      const hit = cov === "all"
        || (cov && Array.isArray(cov.phase) && cov.phase.includes(m.ph))
        || (cov && Array.isArray(cov.matches) && cov.matches.includes(m.n));
      if (hit) (map[m.n] ||= []).push(rule.service);
    }
  }
  replaceBroadcasts("rights", map);
}

// Pull the German EPG and map each live match block (channel airing both team names
// across the kickoff window) to its match → linear broadcaster per fixture.
export async function syncBroadcasts(reason = "cron") {
  try {
    const progs = await fetchEpgProgrammes();
    const resolved = legacyState().resolved;
    const map = {};
    let hits = 0;
    for (const m of MATCHES) {
      const home = acceptedNames("h", m, resolved);
      const away = acceptedNames("a", m, resolved);
      if (!home || !away) continue;
      const ts = tsOf(m.dt);
      const services = new Set();
      for (const p of progs) {
        // a live match block starts at/just before kickoff and runs past it
        if (!(p.startMs <= ts + 15 * 60000 && p.stopMs >= ts + 30 * 60000)) continue;
        const text = norm(`${p.title} ${p.sub}`);
        if (home.some((n) => text.includes(n)) && away.some((n) => text.includes(n))) services.add(p.service);
      }
      if (services.size) { map[m.n] = [...services]; hits++; }
    }
    mergeBroadcasts("epg", map); // accumulate — the EPG window rolls, coverage must not
    applyRights();
    const meta = getMeta();
    meta.broadcastSync = new Date().toISOString();
    meta.broadcastMsg = `${reason}: EPG ${progs.length} Sendungen, ${hits} Spiele zugeordnet`;
    setMeta(meta);
    console.log(meta.broadcastMsg);
  } catch (e) {
    const meta = getMeta(); meta.broadcastMsg = "EPG-Fehler: " + e.message; setMeta(meta); console.error("broadcasts", e);
  }
}
