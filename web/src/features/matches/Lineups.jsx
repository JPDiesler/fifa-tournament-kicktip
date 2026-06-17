import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Hash, UserRound } from "lucide-react";
import { Popover, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import Flag from "@/components/Flag.jsx";
import { flagColor, textOn } from "@/lib/flagColor.js";
import { playerPhoto, coachPhoto } from "@/lib/media.js";

const surname = (name) => (name ? name.split(" ").pop() : "");

// api-football role (G/D/M/F) → familiar German abbreviation.
const POS = { G: "TW", D: "ABW", M: "MF", F: "ST" };
const posLabel = (p) => POS[p] || (p || "").toUpperCase();

// Tapping a player opens a small card with their photo (api-sports media CDN; hidden
// on 404) + name/number/position. `children` is the trigger (dot or bench row).
function PlayerPop({ p, className = "", children }) {
  return (
    <Popover>
      <button type="button" className={className}>{children}</button>
      <Popover.Content className="w-44">
        <Popover.Dialog className="flex flex-col items-center gap-1.5 p-3 text-center">
          {p.pid && <img src={playerPhoto(p.pid)} alt="" className="size-20 rounded-full bg-overlay object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          <div className="text-sm font-semibold leading-tight">{p.name || "—"}</div>
          <div className="text-xs text-muted">#{p.n ?? "?"}{p.pos ? ` · ${posLabel(p.pos)}` : ""}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

// Match kit colour from api-football lineups → "#rrggbb", else null.
const hex = (c) => { const s = String(c || "").replace(/^#/, ""); return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : null; };
// Dot background/number colour for a player: the real match kit (GK kit for the
// keeper) when the provider supplies it, otherwise the flag-derived fallback.
// kit = team.colors { player:{primary,number}, goalkeeper:{…} }.
function dotStyle(p, kit, fallbackBg, fallbackFg) {
  const set = kit ? (p.pos === "G" && kit.goalkeeper ? kit.goalkeeper : kit.player) : null;
  return {
    background: (set && hex(set.primary)) || fallbackBg || "#52525b",
    color: (set && hex(set.number)) || fallbackFg || "#fff",
  };
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

function Pitch({ team, kit, color, txt, mode }) {
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
              <PlayerPop p={p} className="flex flex-col items-center gap-0.5">
                <span className="relative flex size-7 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold tabular-nums ring-1 ring-black/30 ring-inset"
                  style={dotStyle(p, kit, color, txt)}>
                  {p.n ?? ""}
                  {mode === "photo" && p.pid && <img src={playerPhoto(p.pid)} alt="" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                </span>
                <span className="max-w-16 truncate rounded bg-black/70 px-1 text-[9px] font-medium leading-tight text-white">{surname(p.name)}</span>
                {p.pos ? <span className="text-[8px] font-semibold uppercase leading-none text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.9)]">{posLabel(p.pos)}</span> : null}
              </PlayerPop>
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

function Bench({ team, kit, color, txt }) {
  if (!team?.bench?.length) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Bank · {team.bench.length}</div>
      <ul className="space-y-1">
        {team.bench.map((p, i) => (
          <li key={i}>
            <PlayerPop p={p} className="flex w-full items-center gap-2 rounded text-left text-xs hover:bg-overlay">
              <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold tabular-nums ring-1 ring-black/20 ring-inset"
                style={dotStyle(p, kit, color, txt)}>
                {p.n ?? ""}
                {p.pid && <img src={playerPhoto(p.pid)} alt="" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name || "—"}</span>
              {p.pos && <span className="shrink-0 rounded bg-overlay px-1 text-[9px] font-semibold text-muted ring-1 ring-border">{posLabel(p.pos)}</span>}
            </PlayerPop>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Starting lineup, one team per card; switch teams with the arrows. Player dots use
// the real match kit colours (api-football: home kit vs away change kit), falling
// back to a flag-derived colour; names are always shown.
export default function Lineups({ lineups, home, away }) {
  const [idx, setIdx] = useState(0);
  const [color, setColor] = useState(null);
  const [mode, setMode] = useState("number"); // pitch dots: "number" | "photo"

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
  const kit = cur.team?.colors || null; // real match kit colours (api-football), else flag fallback
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
          <Pitch team={cur.team} kit={kit} color={color} txt={txt} mode={mode} />
          <div className="mt-2 flex justify-center">
            <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Spieler-Anzeige"
              selectedKeys={new Set([mode])} onSelectionChange={(keys) => { const k = [...keys][0]; if (k) setMode(String(k)); }}>
              <ToggleButton id="number" isIconOnly aria-label="Nummern"><Hash size={13} /></ToggleButton>
              <ToggleButton id="photo" isIconOnly aria-label="Fotos"><UserRound size={13} /></ToggleButton>
            </ToggleButtonGroup>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {cur.team?.coach && <CoachCard name={cur.team.coach} id={cur.team.coachId} />}
          <Bench team={cur.team} kit={kit} color={color} txt={txt} />
        </div>
      </div>
    </div>
  );
}
