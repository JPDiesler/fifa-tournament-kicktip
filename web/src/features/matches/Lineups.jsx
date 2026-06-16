import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import { flagColor, textOn } from "@/lib/flagColor.js";

const surname = (name) => (name ? name.split(" ").pop() : "");

// api-football role (G/D/M/F) → familiar German abbreviation.
const POS = { G: "TW", D: "ABW", M: "MF", F: "ST" };
const posLabel = (p) => POS[p] || (p || "").toUpperCase();

// Group a startXI by grid row (keeper → attack), each row's players left→right by col.
function rowsOf(startXI) {
  const rows = {};
  for (const p of startXI || []) {
    const [r, c] = (p.grid || "1:1").split(":").map(Number);
    (rows[r] ||= []).push({ ...p, _c: c || 1 });
  }
  return Object.keys(rows).map(Number).sort((a, b) => a - b).map((r) => ({ row: r, players: rows[r].sort((a, b) => a._c - b._c) }));
}

// %-positions for one team filling a full vertical pitch (keeper bottom → attack top).
function positions(startXI) {
  const rows = rowsOf(startXI);
  if (!rows.length) return [];
  const maxRow = Math.max(...rows.map((r) => r.row));
  const out = [];
  for (const { row, players } of rows) {
    const t = maxRow > 1 ? (row - 1) / (maxRow - 1) : 0;
    const y = 92 - t * 80; // keeper 92% → furthest forward 12%
    players.forEach((p, i) => out.push({ ...p, x: ((i + 1) / (players.length + 1)) * 100, y }));
  }
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

function Pitch({ team, color, txt }) {
  const players = positions(team?.startXI);
  // padding-bottom keeps the portrait ratio from the WIDTH (robust inside flex — an
  // aspect-ratio element gets stretched by a taller sibling, padding-bottom doesn't).
  return (
    <div className="relative w-full" style={{ paddingBottom: "150%" }}>
      <div className="absolute inset-0 overflow-hidden rounded-xl border border-border bg-surface">
        <PitchLines />
        {players.map((p, i) => (
          <div key={i} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ring-1 ring-black/30 ring-inset"
              style={{ background: color || "#52525b", color: txt }}>{p.n ?? ""}</span>
            <span className="max-w-16 truncate rounded bg-black/70 px-1 text-[9px] font-medium leading-tight text-white">{surname(p.name)}</span>
            {p.pos ? <span className="text-[8px] font-semibold uppercase leading-none text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">{posLabel(p.pos)}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bench({ team, color, txt }) {
  if (!team?.bench?.length) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Bank · {team.bench.length}</div>
      <ul className="space-y-1">
        {team.bench.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ring-1 ring-black/20 ring-inset"
              style={{ background: color || "#52525b", color: txt }}>{p.n ?? ""}</span>
            <span className="min-w-0 flex-1 truncate">{p.name || "—"}</span>
            {p.pos && <span className="shrink-0 rounded bg-overlay px-1 text-[9px] font-semibold text-muted ring-1 ring-border">{posLabel(p.pos)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Starting lineup, one team per card; switch teams with the arrows. Player dots are
// coloured from the team's flag; names are always shown.
export default function Lineups({ lineups, home, away }) {
  const [idx, setIdx] = useState(0);
  const [color, setColor] = useState(null);

  const sides = [];
  if (lineups?.home?.startXI?.length) sides.push({ team: lineups.home, meta: home });
  if (lineups?.away?.startXI?.length) sides.push({ team: lineups.away, meta: away });
  const cur = sides.length ? sides[Math.min(idx, sides.length - 1)] : null;
  const code = cur?.meta?.code;

  useEffect(() => {
    let alive = true;
    setColor(null);
    flagColor(code).then((c) => { if (alive) setColor(c); });
    return () => { alive = false; };
  }, [code]);

  if (!sides.length) return null;
  const txt = textOn(color);
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
      {cur.team?.coach && <div className="mb-2 text-center text-[11px] text-muted">Trainer: {cur.team.coach}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="mx-auto w-full max-w-[240px] sm:mx-0 sm:w-[46%] sm:max-w-[230px] sm:shrink-0"><Pitch team={cur.team} color={color} txt={txt} /></div>
        <div className="min-w-0 flex-1"><Bench team={cur.team} color={color} txt={txt} /></div>
      </div>
    </div>
  );
}
