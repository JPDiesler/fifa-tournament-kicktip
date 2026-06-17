// Spider/radar chart comparing two teams across N axes (api-football style). Custom
// SVG (no chart lib). `axes` = [{ label, home, away }] where home/away are 0–100;
// the two polygons are drawn in the teams' own colours. < 3 axes → renders nothing.
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const CX = 120, CY = 120, R = 72;

export default function RadarChart({ axes, homeColor = "#22c55e", awayColor = "#64748b", homeLabel = "Heim", awayLabel = "Gast" }) {
  const list = (axes || []).filter((a) => a && (a.home != null || a.away != null));
  const N = list.length;
  if (N < 3) return null;
  const angle = (i) => ((-90 + (360 / N) * i) * Math.PI) / 180;
  const point = (i, v) => [CX + R * v * Math.cos(angle(i)), CY + R * v * Math.sin(angle(i))];
  const poly = (sel) => list.map((a, i) => point(i, clamp01((a[sel] ?? 0) / 100)).map((x) => x.toFixed(1)).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => list.map((_, i) => point(i, f).map((x) => x.toFixed(1)).join(",")).join(" "));

  return (
    <svg viewBox="0 0 240 240" className="mx-auto block w-full max-w-[260px]" role="img" aria-label={`Radarvergleich ${homeLabel} gegen ${awayLabel}`}>
      <g className="text-border" stroke="currentColor" fill="none" strokeWidth="0.5">
        {rings.map((pts, i) => <polygon key={i} points={pts} />)}
        {list.map((_, i) => { const [x, y] = point(i, 1); return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />; })}
      </g>
      <polygon points={poly("away")} fill={awayColor} fillOpacity="0.15" stroke={awayColor} strokeWidth="1.5" strokeLinejoin="round" />
      <polygon points={poly("home")} fill={homeColor} fillOpacity="0.22" stroke={homeColor} strokeWidth="1.5" strokeLinejoin="round" />
      <g className="text-muted" fill="currentColor" fontSize="8.5">
        {list.map((a, i) => {
          const [x, y] = point(i, 1.17);
          const anchor = x < CX - 2 ? "end" : x > CX + 2 ? "start" : "middle";
          return <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle">{a.label}</text>;
        })}
      </g>
    </svg>
  );
}
