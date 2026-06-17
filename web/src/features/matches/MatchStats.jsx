import Bar from "@/components/Bar.jsx";

// Per-team match statistics as two-tone HeroUI bars (home share filled in the home
// colour, remainder in the away colour). `stats` = { home:{possession,shots,xg,…},
// away:{…} } from api-football (values may be raw strings like "56%"). Only rows with
// at least one value are shown.
const STAT_ROWS = [
  ["possession", "Ballbesitz"], ["xg", "xG"], ["shots", "Schüsse"], ["shotsOnGoal", "aufs Tor"],
  ["corners", "Ecken"], ["fouls", "Fouls"], ["offsides", "Abseits"], ["saves", "Paraden"],
  ["passes", "Pässe"], ["passAccuracy", "Passquote"],
];
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const show = (v) => (v == null || v === "" ? "–" : String(v));

export default function MatchStats({ stats, homeColor = "#22c55e", awayColor = "#64748b" }) {
  const h = stats?.home || {}, a = stats?.away || {};
  const rows = STAT_ROWS.filter(([k]) => h[k] != null || a[k] != null);
  if (!rows.length) return <p className="p-4 text-center text-xs text-muted">Noch keine Statistik verfügbar.</p>;
  return (
    <div className="space-y-2.5 pb-2">
      {rows.map(([k, label]) => {
        const hv = num(h[k]), av = num(a[k]), tot = hv + av;
        const hp = tot ? (hv / tot) * 100 : 50;
        return (
          <div key={k}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className="font-semibold tabular-nums">{show(h[k])}</span>
              <span className="text-muted">{label}</span>
              <span className="font-semibold tabular-nums">{show(a[k])}</span>
            </div>
            <Bar value={hp} fill={homeColor} track={awayColor} label={label} />
          </div>
        );
      })}
    </div>
  );
}
