import { useState } from "react";
import { ToggleButton } from "@heroui/react";

// Spider/radar chart comparing two teams across N axes (api-football style). Custom SVG
// (no chart lib). `axes` = [{ label, home, away }] where home/away are 0–100; the two
// polygons are drawn in the teams' own colours. The legend toggles each team's
// visibility. Renders nothing for fewer than 3 axes.
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const CX = 120, CY = 120, R = 72;

export default function RadarChart({ axes, homeColor = "#22c55e", awayColor = "#64748b", homeLabel = "Heim", awayLabel = "Gast" }) {
  const [show, setShow] = useState({ home: true, away: true });
  const list = (axes || []).filter((a) => a && (a.home != null || a.away != null));
  const N = list.length;
  if (N < 3) return null;
  const angle = (i) => ((-90 + (360 / N) * i) * Math.PI) / 180;
  const point = (i, v) => [CX + R * v * Math.cos(angle(i)), CY + R * v * Math.sin(angle(i))];
  const at = (sel, i) => point(i, clamp01((list[i][sel] ?? 0) / 100));
  const poly = (sel) => list.map((_, i) => at(sel, i).map((x) => x.toFixed(1)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => list.map((_, i) => point(i, f).map((x) => x.toFixed(1)).join(",")).join(" "));
  const dots = (sel, color) => list.map((_, i) => { const [x, y] = at(sel, i); return <circle key={sel + i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.2" fill={color} />; });

  const LegendBtn = ({ side, color, label }) => (
    <ToggleButton isSelected={show[side]} onChange={(v) => setShow((s) => ({ ...s, [side]: v }))} aria-label={label}
      variant="ghost" size="sm"
      className="h-auto gap-1 rounded-full px-1.5 py-0.5 text-xs text-foreground data-[selected=false]:opacity-40 data-[selected=true]:bg-transparent">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className={show[side] ? "min-w-0 truncate" : "min-w-0 truncate line-through"}>{label}</span>
    </ToggleButton>
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-center gap-3 text-[11px]">
        <LegendBtn side="home" color={homeColor} label={homeLabel} />
        <LegendBtn side="away" color={awayColor} label={awayLabel} />
      </div>
      <svg viewBox="0 0 240 240" className="mx-auto block w-full max-w-[260px]" role="img" aria-label={`Radarvergleich ${homeLabel} gegen ${awayLabel}`}>
        <g className="text-border" stroke="currentColor" fill="none" strokeWidth="0.5">
          {rings.map((pts, i) => <polygon key={i} points={pts} />)}
          {list.map((_, i) => { const [x, y] = point(i, 1); return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />; })}
        </g>
        {show.home && <polygon points={poly("home")} fill={homeColor} fillOpacity="0.1" stroke={homeColor} strokeWidth="2" strokeLinejoin="round" />}
        {show.away && <polygon points={poly("away")} fill={awayColor} fillOpacity="0.1" stroke={awayColor} strokeWidth="2" strokeLinejoin="round" />}
        {show.home && dots("home", homeColor)}
        {show.away && dots("away", awayColor)}
        <g className="text-muted" fill="currentColor" fontSize="8.5">
          {list.map((a, i) => {
            const [x, y] = point(i, 1.17);
            const anchor = x < CX - 2 ? "end" : x > CX + 2 ? "start" : "middle";
            return <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle">{a.label}</text>;
          })}
        </g>
      </svg>
    </div>
  );
}
