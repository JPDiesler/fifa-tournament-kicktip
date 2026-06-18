import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "@heroui/react";
import Flag from "@/components/Flag.jsx";
import { textOn } from "@/lib/teamColors.js";
import { playerPhoto, coachPhoto } from "@/lib/media.js";

const surname = (name) => (name ? name.split(" ").pop() : "");
const initials = (name) => { const s = surname(name); return s ? s.slice(0, 2).toUpperCase() : "?"; };

// api-football role (G/D/M/F) → familiar German abbreviation.
const POS = { G: "TW", D: "ABW", M: "MF", F: "ST" };
const posLabel = (p) => POS[p] || (p || "").toUpperCase();

// Match the team's card events to a player-id → status ("red" | "yellow"); red (or a
// second yellow) wins. Matching by id is robust to event name abbreviations ("G. Xhaka").
function cardByPid(cards) {
  const m = {};
  for (const c of cards || []) {
    if (c.pid == null) continue;
    const red = /red/i.test(c.card || "") || /second/i.test(c.card || "");
    m[c.pid] = red || m[c.pid] === "red" ? "red" : "yellow";
  }
  return m;
}

// Match-stat rows for the detail card (only the values the feed actually provides). The
// rating + minutes are shown separately, above this grid.
function statRows(s) {
  if (!s) return [];
  const rows = [];
  const push = (label, value) => { if (value != null && value !== "") rows.push([label, value]); };
  if (s.pos === "G") { push("Paraden", s.saves); push("Gegentore", s.conceded); }
  push("Tore", s.goals); push("Vorlagen", s.assists);
  if (s.shots != null) push("Schüsse", `${s.shots}${s.shotsOn != null ? ` (${s.shotsOn})` : ""}`);
  if (s.passes != null) push("Pässe", `${s.passes}${s.passAcc != null ? ` · ${s.passAcc}%` : ""}`);
  push("Schlüsselpässe", s.keyPasses);
  if (s.duelsTotal != null) push("Zweikämpfe", `${s.duelsWon ?? 0}/${s.duelsTotal}`);
  if (s.dribAtt != null) push("Dribblings", `${s.dribSucc ?? 0}/${s.dribAtt}`);
  push("Tacklings", s.tackles); push("Abfangen", s.interceptions);
  push("Fouls", s.foulsComm);
  return rows;
}
const dim = (v, unit) => (v == null || v === "" ? null : /[a-z]/i.test(String(v)) ? String(v) : `${v} ${unit}`);

// Tapping a player opens a detail card: photo + name/number/position/captain, the bio
// (age/nationality/height/weight — fetched lazily from /api/player/:pid on open, cached
// server-side) and this match's performance (rating, goals, passes, duels … from the
// stored per-player stats; only present once the match has started).
function PlayerPop({ p, stats, className = "", children }) {
  const [bio, setBio] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const load = () => {
    if (state !== "idle" || !p.pid) return;
    setState("loading");
    fetch(`/api/player/${p.pid}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { setBio(d); setState("done"); })
      .catch(() => setState("error"));
  };
  const rows = statRows(stats);
  const bioLine = bio && [bio.age != null ? `${bio.age} J` : null, bio.nationality, dim(bio.height, "cm"), dim(bio.weight, "kg")].filter(Boolean).join(" · ");
  return (
    <Popover>
      <button type="button" className={className} onClick={load}>{children}</button>
      <Popover.Content className="w-64">
        <Popover.Dialog className="p-3">
          <div className="flex items-center gap-3">
            <span className="relative size-14 shrink-0 rounded-full bg-overlay ring-1 ring-border">
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-muted">{initials(p.name)}</span>
              {p.pid && <img src={playerPhoto(p.pid)} alt="" className="absolute inset-0 size-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold">{p.name || "—"}</span>
                {p.captain && <span className="shrink-0 rounded bg-amber-400 px-1 text-[9px] font-bold leading-tight text-black">C</span>}
              </div>
              <div className="text-xs text-muted">#{p.n ?? "?"}{p.pos ? ` · ${posLabel(p.pos)}` : ""}</div>
            </div>
          </div>

          {(state === "loading" || bioLine) && (
            <div className="mt-1.5 text-[11px] text-muted">{state === "loading" ? "lädt …" : bioLine}</div>
          )}

          {stats?.rating && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-overlay px-2 py-1">
              <span className="text-[11px] text-muted">Note{stats.min != null ? ` · ${stats.min}′` : ""}{stats.sub ? " · eingewechselt" : ""}</span>
              <span className="text-sm font-extrabold tabular-nums">{stats.rating}</span>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {rows.map(([l, v]) => (
                <div key={l} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted">{l}</span><span className="font-semibold tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          )}

          {(stats?.yellow > 0 || stats?.red > 0) && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              Karten
              {stats.yellow > 0 && <span className="inline-block h-3 w-2 rounded-[2px] bg-yellow-400" />}
              {stats.red > 0 && <span className="inline-block h-3 w-2 rounded-[2px] bg-red-500" />}
            </div>
          )}

          {/* pre-match (no match stats yet): show the season totals from the bio instead */}
          {!stats && bio?.season && (
            <div className="mt-2 text-[11px] text-muted">{bio.season.league}: {bio.season.apps ?? 0} Spiele · {bio.season.goals ?? 0} Tore{bio.season.assists != null ? ` · ${bio.season.assists} Vorl.` : ""}</div>
          )}
          {!stats && state === "done" && !bio?.season && <div className="mt-2 text-[11px] text-muted">Noch keine Spieldaten.</div>}
          {!stats && state === "error" && <div className="mt-2 text-[11px] text-muted">Keine weiteren Daten verfügbar.</div>}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

// Match kit colour from api-football lineups → "#rrggbb", else null.
const hex = (c) => { const s = String(c || "").replace(/^#/, ""); return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : null; };
// Number-badge background/text colour for a player: the real match kit (GK kit for the
// keeper) when the provider supplies it, otherwise the flag-derived fallback.
// kit = team.colors { player:{primary,number}, goalkeeper:{…} }.
function numberStyle(p, kit, fallbackBg, fallbackFg) {
  const set = kit ? (p.pos === "G" && kit.goalkeeper ? kit.goalkeeper : kit.player) : null;
  return {
    background: (set && hex(set.primary)) || fallbackBg || "#52525b",
    color: (set && hex(set.number)) || fallbackFg || "#fff",
  };
}

// One player: a photo avatar (initials fallback) with the jersey-coloured number badge,
// plus a captain (C) and a yellow/red-card badge when they apply. Used on the pitch and
// on the bench (sizes differ via `variant`).
const VARIANT = {
  pitch: {
    avatar: "size-9", badge: "size-4 text-[8px]", card: "h-3 w-2", initials: "text-[10px]",
    name: "max-w-16 truncate rounded bg-black/70 px-1 text-[9px] font-medium leading-tight text-white",
    pos: "text-[8px] font-semibold uppercase leading-none text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]",
  },
  bench: {
    avatar: "size-11", badge: "size-4 text-[9px]", card: "h-3 w-2", initials: "text-xs",
    name: "w-full truncate text-center text-[11px] font-semibold leading-tight",
    pos: "text-[8px] font-semibold uppercase leading-none text-muted",
  },
};
function PlayerChip({ p, kit, color, txt, card, stats, variant }) {
  const v = VARIANT[variant];
  return (
    <PlayerPop p={p} stats={stats} className="flex flex-col items-center gap-1">
      <span className={`relative ${v.avatar} shrink-0 rounded-full bg-overlay ring-1 ring-border`}>
        <span className={`absolute inset-0 flex items-center justify-center font-bold text-muted ${v.initials}`}>{initials(p.name)}</span>
        {p.pid && <img src={playerPhoto(p.pid)} alt="" className="absolute inset-0 size-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
        {/* number badge (jersey colours), bottom-right */}
        <span className={`absolute -bottom-1 -right-1 ${v.badge} flex items-center justify-center rounded-full font-bold leading-none tabular-nums ring-1 ring-black/25`} style={numberStyle(p, kit, color, txt)}>{p.n ?? ""}</span>
        {/* captain, top-left */}
        {p.captain && <span className={`absolute -left-1 -top-1 ${v.badge} flex items-center justify-center rounded-full bg-amber-400 font-bold leading-none text-black ring-1 ring-white/80`}>C</span>}
        {/* yellow/red card, top-right */}
        {card && <span aria-label={card === "red" ? "Rote Karte" : "Gelbe Karte"} className={`absolute -right-1 -top-1 ${v.card} rounded-[2px] ${card === "red" ? "bg-red-500" : "bg-yellow-400"} ring-1 ring-black/40`} />}
      </span>
      <span className={v.name}>{surname(p.name)}</span>
      {p.pos ? <span className={v.pos}>{posLabel(p.pos)}</span> : null}
    </PlayerPop>
  );
}

// Order the XI into lines from own goal (keeper) to attack. Prefer the provider's
// grid ("row:col"); if that's missing — everyone would collapse onto one line — fall
// back to the formation string ("4-2-3-1"), and finally to the position buckets.
function linesOf(xi, formation) {
  const byRow = {};
  let haveGrid = false;
  for (const p of xi) {
    if (p.grid) haveGrid = true;
    const [r, c] = (p.grid || "1:1").split(":").map(Number);
    (byRow[r] ||= []).push({ ...p, _c: c || 1 });
  }
  const rowKeys = Object.keys(byRow).map(Number).sort((a, b) => a - b);
  if (haveGrid && rowKeys.length >= 2) return rowKeys.map((r) => byRow[r].sort((a, b) => a._c - b._c));

  // formation fallback: keeper first, then one line per number (must total the XI).
  const counts = (formation || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  if (counts.length && counts.reduce((a, b) => a + b, 0) === xi.length - 1) {
    const lines = [xi.slice(0, 1)];
    let i = 1;
    for (const c of counts) { lines.push(xi.slice(i, i + c)); i += c; }
    return lines;
  }

  // position-bucket fallback (G → D → M → F → anything else).
  const order = ["G", "D", "M", "F"];
  const buckets = {};
  for (const p of xi) (buckets[p.pos] ||= []).push(p);
  const lines = order.map((k) => buckets[k]).filter(Boolean);
  for (const k of Object.keys(buckets)) if (!order.includes(k)) lines.push(buckets[k]);
  return lines.length ? lines : [xi];
}

// %-positions for one team filling a full vertical pitch (keeper bottom → attack top).
function positions(startXI, formation) {
  const lines = linesOf(startXI || [], formation);
  if (!lines.length) return [];
  const maxRow = lines.length - 1;
  const out = [];
  lines.forEach((players, ri) => {
    const y = 92 - (maxRow > 0 ? ri / maxRow : 0) * 80; // keeper 92% → furthest forward 12%
    players.forEach((p, i) => out.push({ ...p, x: ((i + 1) / (players.length + 1)) * 100, y }));
  });
  return out;
}

// SVG pitch markings (real proportions, viewBox 68×105) — boundary, halfway line,
// centre circle/spot, both penalty boxes, goal areas (6-yd) and penalty arcs.
function PitchLines() {
  return (
    <svg viewBox="0 0 68 105" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-foreground/25" fill="none" stroke="currentColor" strokeWidth="0.6">
      <rect x="0.7" y="0.7" width="66.6" height="103.6" rx="1.5" />
      <line x1="0.7" y1="52.5" x2="67.3" y2="52.5" />
      <circle cx="34" cy="52.5" r="9.15" />
      <circle cx="34" cy="52.5" r="0.6" fill="currentColor" stroke="none" />
      {/* bottom (own) goal */}
      <rect x="13.84" y="87.8" width="40.32" height="16.5" />
      <rect x="24.84" y="98.8" width="18.32" height="5.5" />
      <circle cx="34" cy="93.3" r="0.6" fill="currentColor" stroke="none" />
      <path d="M26.69 87.8 A9.15 9.15 0 0 1 41.31 87.8" />
      {/* top (attacking) goal */}
      <rect x="13.84" y="0.7" width="40.32" height="16.5" />
      <rect x="24.84" y="0.7" width="18.32" height="5.5" />
      <circle cx="34" cy="11.7" r="0.6" fill="currentColor" stroke="none" />
      <path d="M26.69 17.2 A9.15 9.15 0 0 0 41.31 17.2" />
    </svg>
  );
}

function Pitch({ team, kit, color, txt, cards, pstats }) {
  const players = positions(team?.startXI, team?.formation);
  // padding-bottom keeps the portrait ratio from the WIDTH (robust inside flex — an
  // aspect-ratio element gets stretched by a taller sibling, padding-bottom doesn't).
  return (
    <div className="relative w-full" style={{ paddingBottom: "150%" }}>
      <div className="absolute inset-0 overflow-hidden rounded-xl border border-border bg-surface">
        {/* inner inset = breathing room between the card edge and the pitch boundary
            (absolute children ignore padding, so we need a positioned inset box) */}
        <div className="absolute inset-2.5">
          <PitchLines />
          {players.map((p, i) => (
            <div key={i} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <PlayerChip p={p} kit={kit} color={color} txt={txt} card={cards[p.pid]} stats={pstats?.[p.pid]} variant="pitch" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Coach with photo (api-sports media CDN; hidden on 404).
function CoachCard({ name, id }) {
  const photo = coachPhoto(id);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-overlay p-2">
      {photo && <img src={photo} alt="" className="size-9 shrink-0 rounded-full bg-surface object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted">Trainer</div>
        <div className="truncate text-sm font-semibold">{name}</div>
      </div>
    </div>
  );
}

function Bench({ team, kit, color, txt, cards, pstats }) {
  if (!team?.bench?.length) return null;
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Bank · {team.bench.length}</div>
      <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-3">
        {team.bench.map((p, i) => <PlayerChip key={i} p={p} kit={kit} color={color} txt={txt} card={cards[p.pid]} stats={pstats?.[p.pid]} variant="bench" />)}
      </div>
    </div>
  );
}

// Starting lineup, one team per card; switch teams with the arrows. Players show their
// photo with the real match-kit number badge (api-football: home kit vs away change
// kit), plus a captain badge and a yellow/red-card badge from the match events. Tapping
// a player opens a detail card (bio + this match's stats).
export default function Lineups({ lineups, home, away, cards, playerStats }) {
  const [idx, setIdx] = useState(0);

  const sides = [];
  if (lineups?.home?.startXI?.length) sides.push({ team: lineups.home, meta: home });
  if (lineups?.away?.startXI?.length) sides.push({ team: lineups.away, meta: away });
  const cur = sides.length ? sides[Math.min(idx, sides.length - 1)] : null;

  if (!sides.length) return null;
  const kit = cur.team?.colors || null;        // real match kit colours (api-football)
  const color = hex(kit?.player?.primary);     // number-badge fallback bg = kit primary (or neutral default)
  const txt = textOn(color);
  const cardMap = cardByPid(cards);            // player id → "yellow" | "red" (both teams)
  const arrow = "flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-foreground disabled:opacity-30";

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <button type="button" aria-label="Team zurück" className={arrow} disabled={sides.length < 2} onClick={() => setIdx((i) => (i + sides.length - 1) % sides.length)}><ChevronLeft size={18} /></button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <Flag code={cur.meta?.code} />
          <span className="truncate font-bold">{cur.meta?.label || "—"}</span>
          {cur.team?.formation && <span className="shrink-0 text-xs tabular-nums text-muted">{cur.team.formation}</span>}
        </div>
        <button type="button" aria-label="Team weiter" className={arrow} disabled={sides.length < 2} onClick={() => setIdx((i) => (i + 1) % sides.length)}><ChevronRight size={18} /></button>
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="mx-auto w-full max-w-[300px] sm:mx-0 sm:w-[54%] sm:max-w-[330px] sm:shrink-0">
          <Pitch team={cur.team} kit={kit} color={color} txt={txt} cards={cardMap} pstats={playerStats} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {cur.team?.coach && <CoachCard name={cur.team.coach} id={cur.team.coachId} />}
          <Bench team={cur.team} kit={kit} color={color} txt={txt} cards={cardMap} pstats={playerStats} />
        </div>
      </div>
    </div>
  );
}
