import { useLayoutEffect, useRef, useState } from "react";

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
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

// Line chart of each player's CUMULATIVE points across the scored matchdays.
// Built client-side from the per-day breakdown (`matchdays`, newest-first) and the
// overall standings (`totals`, for the full player list + names). The champion
// bonus is a one-off end bonus and is intentionally not part of this per-matchday
// progression, so the final value can differ from the standings total by +10.
export default function ScoreTrend({ matchdays = [], totals = [], me }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (!matchdays.length) return <p className="p-6 text-center text-sm text-muted">Noch keine ausgewerteten Spieltage.</p>;

  const daysAsc = [...matchdays].reverse(); // server sends newest-first → oldest-first for the x-axis
  const labels = daysAsc.map((d) => d.label.replace(/^\S+,\s*/, "")); // "Do, 11.06." → "11.06."
  const players = totals.map((t) => ({ p: t.p, name: t.name || t.p }));

  const cum = Object.fromEntries(players.map((pl) => [pl.p, 0]));
  const series = Object.fromEntries(players.map((pl) => [pl.p, []]));
  for (const d of daysAsc) {
    const byP = Object.fromEntries(d.rows.map((r) => [r.p, r.pts]));
    for (const pl of players) { cum[pl.p] += byP[pl.p] || 0; series[pl.p].push(cum[pl.p]); }
  }
  // Keep it readable: once anyone has scored, show only players with points (plus
  // you); before that (everyone at 0) show all so the legend isn't empty.
  const anyPoints = players.some((pl) => cum[pl.p] > 0);
  let shown = anyPoints ? players.filter((pl) => cum[pl.p] > 0 || pl.p === me) : players;
  shown = [...shown].sort((a, b) => cum[b.p] - cum[a.p]); // legend high→low
  const colorOf = (pl, i) => (pl.p === me ? "var(--app-accent)" : PALETTE[i % PALETTE.length]);

  const maxY = Math.max(1, ...shown.map((pl) => cum[pl.p]));
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1];

  const H = 260, pad = { t: 14, r: 14, b: 28, l: 28 };
  const innerW = Math.max(0, w - pad.l - pad.r), innerH = H - pad.t - pad.b;
  const n = labels.length;
  const X = (i) => pad.l + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const Y = (v) => pad.t + innerH * (1 - v / top);
  const everyX = Math.ceil(n / 8); // thin out x labels when there are many days

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Punkteverlauf (kumuliert)</div>
      <div ref={wrapRef} className="w-full">
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label="Punkteverlauf je Spieler">
            {ticks.map((t) => (
              <g key={`t${t}`}>
                <line x1={pad.l} y1={Y(t)} x2={w - pad.r} y2={Y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.l - 5} y={Y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">{t}</text>
              </g>
            ))}
            {labels.map((lab, i) => ((i % everyX === 0 || i === n - 1) && (
              <text key={`x${i}`} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{lab}</text>
            )))}
            {shown.map((pl, i) => {
              const isMe = pl.p === me;
              if (n === 1) return null; // single day → only the dot below
              const pts = series[pl.p].map((v, j) => `${X(j)},${Y(v)}`).join(" ");
              return <polyline key={pl.p} points={pts} fill="none" stroke={colorOf(pl, i)} strokeWidth={isMe ? 3 : 1.5} strokeLinejoin="round" strokeLinecap="round" opacity={isMe ? 1 : 0.8} />;
            })}
            {shown.map((pl, i) => {
              const v = series[pl.p][n - 1];
              if (v == null) return null;
              return <circle key={`d${pl.p}`} cx={X(n - 1)} cy={Y(v)} r={pl.p === me ? 3.5 : 2.5} fill={colorOf(pl, i)} />;
            })}
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {shown.map((pl, i) => (
          <span key={pl.p} className={`inline-flex items-center gap-1.5 ${pl.p === me ? "font-bold text-app-accent" : "text-muted"}`}>
            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: colorOf(pl, i) }} />
            {pl.name} <span className="tabular-nums">{cum[pl.p]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
