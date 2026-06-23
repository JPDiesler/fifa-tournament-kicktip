import { useLayoutEffect, useRef, useState } from "react";
import { Popover, Button, SearchField } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import { usePlayers } from "@/components/PlayerName.jsx";

// Distinct line colours for the players (the current user always uses the app
// accent and is drawn on top). Cycles if there are more players than colours.
const PALETTE = [
  "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6",
  "#84cc16", "#f97316", "#06b6d4", "#a855f7", "#eab308", "#22c55e",
];

// ~`count` round y-axis ticks from 0..max (1/2/5/10-stepped).
function niceTicks(max, count = 4) {
  let step = Math.max(1, Math.ceil(max / count));
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const n = step / mag;
  step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const top = Math.max(step, Math.ceil(max / step) * step); // round the top tick UP past max → no overflow
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

const MODES = [["punkte", "Punkte"], ["platz", "Platz"], ["spieltag", "Spieltag"]];

// Interactive chart of each player's progress across the scored matchdays. Built
// client-side from the per-day breakdown (`matchdays`, newest-first) and the
// standings (`totals`, for the player list + names). Three modes:
//   • punkte   — cumulative points (line per player)
//   • platz    — placement over time (bump chart, rank 1 on top)
//   • spieltag — one player's points per matchday (bars; pick via the legend)
// Hover/tap shows a tooltip for that matchday; tap a legend name to highlight.
// The champion bonus is a one-off end bonus, intentionally not in this per-day
// progression, so a final value can differ from the standings total by +10.
export default function ScoreTrend({ matchdays = [], totals = [], me }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [mode, setMode] = useState("punkte");
  const [highlight, setHighlight] = useState(null); // player key, or null
  const [active, setActive] = useState(null);       // hovered matchday index, or null
  const [pickOpen, setPickOpen] = useState(false);  // player-picker popover
  const [query, setQuery] = useState("");           // player-picker search
  const pmeta = usePlayers();                        // hook: must run before any early return
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (!matchdays.length) return <p className="p-6 text-center text-sm text-muted">Noch keine ausgewerteten Spieltage.</p>;

  // ---- data ----
  const daysAsc = [...matchdays].reverse(); // server sends newest-first → oldest-first for the x-axis
  const labels = daysAsc.map((d) => d.label.replace(/^\S+,\s*/, "")); // "Do, 11.06." → "11.06."
  const players = totals.map((t) => ({ p: t.p, name: t.name || t.p }));
  const n = labels.length;
  const P = players.length;

  const cum = {}, series = {}, daily = {};
  players.forEach((pl) => { cum[pl.p] = 0; series[pl.p] = []; daily[pl.p] = []; });
  daysAsc.forEach((d) => {
    const byP = Object.fromEntries(d.rows.map((r) => [r.p, r.pts]));
    players.forEach((pl) => { const dp = byP[pl.p] || 0; daily[pl.p].push(dp); cum[pl.p] += dp; series[pl.p].push(cum[pl.p]); });
  });
  // placement per day (1 = best) from cumulative points; tiebreak by name for stability
  const rankSeries = {}; players.forEach((pl) => (rankSeries[pl.p] = []));
  for (let i = 0; i < n; i++) {
    const order = [...players].sort((a, b) => (series[b.p][i] - series[a.p][i]) || a.name.localeCompare(b.name));
    order.forEach((pl, idx) => rankSeries[pl.p].push(idx + 1));
  }

  // Keep it readable: once anyone has scored, show only players with points (plus
  // you); before that (everyone at 0) show all so the legend isn't empty.
  const anyPoints = players.some((pl) => cum[pl.p] > 0);
  let shown = anyPoints ? players.filter((pl) => cum[pl.p] > 0 || pl.p === me) : players;
  shown = [...shown].sort((a, b) => cum[b.p] - cum[a.p]); // legend high→low
  const idxOf = Object.fromEntries(shown.map((pl, i) => [pl.p, i]));
  const colorOf = (pl) => (pl.p === me ? "var(--app-accent)" : PALETTE[idxOf[pl.p] % PALETTE.length]);
  // Readable text colour for a coloured Kürzel pill (luminance → black/white;
  // the accent uses its paired foreground token).
  const textOn = (c) => {
    if (!c?.startsWith?.("#")) return "var(--app-accent-foreground)";
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0a0a0a" : "#fff";
  };
  const pill = (code, c, sz = "text-[11px]") => (
    <span className={`rounded-full px-1.5 py-0.5 font-bold leading-none ${sz}`} style={{ background: c, color: textOn(c) }}>{code}</span>
  );
  const focus = (highlight && idxOf[highlight] != null) ? highlight : me; // bars subject
  const focusName = players.find((pl) => pl.p === focus)?.name || focus;

  // ---- geometry ----
  const H = 260, pad = { t: 14, r: 14, b: 28, l: 30 };
  const innerW = Math.max(0, w - pad.l - pad.r), innerH = H - pad.t - pad.b;
  const bin = n ? innerW / n : innerW;
  const Xline = (i) => pad.l + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const Xbar = (i) => pad.l + bin * (i + 0.5);

  const maxCum = Math.max(1, ...shown.map((pl) => cum[pl.p]));
  const ticksP = niceTicks(maxCum); const topP = ticksP[ticksP.length - 1];
  const Yp = (v) => pad.t + innerH * (1 - v / topP);
  const Yr = (r) => (P <= 1 ? pad.t + innerH / 2 : pad.t + innerH * ((r - 1) / (P - 1)));
  const maxD = Math.max(1, ...daily[focus]);
  const ticksB = niceTicks(maxD); const topB = ticksB[ticksB.length - 1];
  const Yb = (v) => pad.t + innerH * (1 - v / topB);

  const everyX = Math.ceil(n / 8); // thin out x labels when there are many days
  const dim = (pl) => highlight && pl.p !== highlight;
  const wide = (pl) => pl.p === me || pl.p === highlight;
  const lineOpacity = (pl) => (dim(pl) ? 0.12 : wide(pl) ? 1 : 0.8);

  // pointer → nearest matchday index
  const onMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left;
    const i = mode === "spieltag"
      ? Math.floor((mx - pad.l) / bin)
      : (n <= 1 ? 0 : Math.round((mx - pad.l) / (innerW / (n - 1))));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const activeX = active == null ? 0 : (mode === "spieltag" ? Xbar(active) : Xline(active));

  // tooltip rows for the active matchday (sorted; reuse the per-mode value)
  const tipRows = () => {
    if (active == null) return [];
    if (mode === "platz")
      return shown.map((pl) => ({ pl, val: `#${rankSeries[pl.p][active]}`, sort: rankSeries[pl.p][active] }))
        .sort((a, b) => a.sort - b.sort);
    const get = mode === "spieltag" ? (p) => daily[p][active] : (p) => series[p][active];
    return shown.map((pl) => ({ pl, val: get(pl.p), sort: get(pl.p) })).sort((a, b) => b.sort - a.sort);
  };
  const title = mode === "platz" ? "Platzierungs-Verlauf"
    : mode === "spieltag" ? `Punkte je Spieltag · ${focusName}`
    : "Punkteverlauf (kumuliert)";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">{title}</div>
        <div className="flex items-center gap-1.5">
          {/* searchable picker — only when the legend would get crowded */}
          {shown.length > 6 && (
            <Popover isOpen={pickOpen} onOpenChange={setPickOpen}>
              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px]">
                {highlight ? pill(highlight, colorOf({ p: highlight }), "text-[10px]") : "Hervorheben"}
                <ChevronDown size={13} />
              </Button>
              <Popover.Content className="w-56">
                <Popover.Dialog className="p-1.5">
                  <SearchField aria-label="Spieler suchen" value={query} onChange={setQuery} className="mb-1">
                    <SearchField.Group>
                      <SearchField.SearchIcon />
                      <SearchField.Input autoFocus placeholder="Spieler suchen …" />
                      <SearchField.ClearButton />
                    </SearchField.Group>
                  </SearchField>
                  <ul className="max-h-56 overflow-y-auto">
                    <li>
                      <button onClick={() => { setHighlight(null); setPickOpen(false); setQuery(""); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-overlay">
                        <span className="size-2.5 rounded-full bg-muted/40" /> Alle anzeigen
                      </button>
                    </li>
                    {shown.filter((pl) => `${pl.name} ${pl.p}`.toLowerCase().includes(query.toLowerCase())).map((pl) => (
                      <li key={pl.p}>
                        <button onClick={() => { setHighlight(pl.p); setPickOpen(false); setQuery(""); }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-overlay ${highlight === pl.p ? "bg-accent/15 font-semibold" : ""}`}>
                          <span className="shrink-0">{pill(pl.p, colorOf(pl), "text-[10px]")}</span>
                          {pmeta[pl.p]?.isAi && <ProviderLogo provider={pmeta[pl.p].provider} logo={pmeta[pl.p].logo} size={12} />}
                          <span className="truncate">{pl.name}</span>
                          {pmeta[pl.p]?.isAi && <span className="shrink-0 rounded bg-app-accent/15 px-1 text-[9px] font-bold uppercase text-app-accent">KI</span>}
                          {pl.p === me && <span className="ml-auto text-[10px] text-app-accent">du</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          )}
          <div className="inline-flex rounded-lg border border-border bg-overlay p-0.5 text-[11px]">
            {MODES.map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); setActive(null); }}
                className={`rounded-md px-2 py-0.5 transition ${mode === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "spieltag" && (
        <div className="mb-1 text-[11px] text-muted">
          Punkte von <span className="font-semibold text-app-accent">{focusName}</span> pro Spieltag (nicht aufsummiert) · anderen Spieler in der Legende antippen
        </div>
      )}

      <div ref={wrapRef} className="relative w-full touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={title}>
            {/* y grid + labels */}
            {mode === "platz"
              ? players.map((_, k) => k + 1).filter((r) => (r - 1) % Math.ceil(P / 6) === 0 || r === P).map((r) => (
                  <g key={`r${r}`}>
                    <line x1={pad.l} y1={Yr(r)} x2={w - pad.r} y2={Yr(r)} stroke="var(--border)" strokeWidth="1" />
                    <text x={pad.l - 5} y={Yr(r)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">{r}</text>
                  </g>
                ))
              : (mode === "spieltag" ? ticksB : ticksP).map((t) => {
                  const y = mode === "spieltag" ? Yb(t) : Yp(t);
                  return (
                    <g key={`t${t}`}>
                      <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="var(--border)" strokeWidth="1" />
                      <text x={pad.l - 5} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">{t}</text>
                    </g>
                  );
                })}

            {/* x labels */}
            {labels.map((lab, i) => ((i % everyX === 0 || i === n - 1) && (
              <text key={`x${i}`} x={mode === "spieltag" ? Xbar(i) : Xline(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{lab}</text>
            )))}

            {/* active matchday guide */}
            {active != null && <line x1={activeX} y1={pad.t} x2={activeX} y2={H - pad.b} stroke="var(--focus)" strokeWidth="1" strokeDasharray="3 3" />}

            {/* ----- content per mode ----- */}
            {mode === "spieltag" ? (
              daily[focus].map((v, i) => {
                const bw = Math.max(2, bin * 0.6), y = Yb(v);
                return (
                  <g key={`b${i}`} opacity={active == null || active === i ? 1 : 0.45}>
                    <rect x={Xbar(i) - bw / 2} y={y} width={bw} height={Math.max(0, H - pad.b - y)} rx="2" fill={colorOf({ p: focus })} />
                    {v > 0 && <text x={Xbar(i)} y={y - 3} textAnchor="middle" fontSize="9" fill="var(--muted)">{v}</text>}
                  </g>
                );
              })
            ) : (
              <>
                {shown.map((pl) => {
                  if (n === 1) return null;
                  const Y = mode === "platz" ? (i) => Yr(rankSeries[pl.p][i]) : (i) => Yp(series[pl.p][i]);
                  const pts = (mode === "platz" ? rankSeries[pl.p] : series[pl.p]).map((_, j) => `${Xline(j)},${Y(j)}`).join(" ");
                  return <polyline key={pl.p} points={pts} fill="none" stroke={colorOf(pl)} strokeWidth={wide(pl) ? 3 : 1.5}
                    strokeLinejoin="round" strokeLinecap="round" opacity={lineOpacity(pl)} />;
                })}
                {/* end dots + active dots */}
                {shown.map((pl) => {
                  const yAt = (i) => (mode === "platz" ? Yr(rankSeries[pl.p][i]) : Yp(series[pl.p][i]));
                  return (
                    <g key={`d${pl.p}`} opacity={lineOpacity(pl)}>
                      <circle cx={Xline(n - 1)} cy={yAt(n - 1)} r={wide(pl) ? 3.5 : 2.5} fill={colorOf(pl)} />
                      {active != null && <circle cx={Xline(active)} cy={yAt(active)} r={wide(pl) ? 3.5 : 2.5} fill={colorOf(pl)} />}
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        )}

        {/* tooltip */}
        {active != null && w > 0 && (
          <div className="pointer-events-none absolute z-10 max-w-[60%]"
            style={{ left: activeX, top: pad.t, transform: `translate(${activeX > w / 2 ? "calc(-100% - 8px)" : "8px"}, 0)` }}>
            <div className="rounded-lg border border-border bg-overlay px-2 py-1.5 text-[11px] shadow-lg">
              <div className="mb-1 font-semibold">{labels[active]}</div>
              <div className="flex flex-col gap-0.5">
                {tipRows().map(({ pl, val }) => (
                  <div key={pl.p} className={`flex items-center gap-1.5 ${pl.p === me ? "font-bold text-app-accent" : ""}`}>
                    <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: colorOf(pl) }} />
                    <span className="min-w-0 truncate">{pl.name}</span>
                    <span className="ml-auto pl-2 tabular-nums">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* legend — coloured Kürzel pills (full names live in the table above). Tap to
          highlight (in Spieltag mode it picks whose bars to show). */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {shown.map((pl) => {
          const sel = highlight === pl.p;
          return (
            <button key={pl.p} onClick={() => setHighlight(sel ? null : pl.p)}
              className={`inline-flex items-center gap-1 rounded-full transition ${highlight && !sel ? "opacity-40" : ""}`}>
              {pill(pl.p, colorOf(pl))}
              <span className="pr-1 tabular-nums text-muted">{cum[pl.p]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
