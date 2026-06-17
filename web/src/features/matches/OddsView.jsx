// 1X2 odds (decimal) + implied probability (bookmaker margin removed by normalizing
// 1/odd), each as a labelled HeroUI bar. Shows in-play odds while the match runs,
// otherwise pre-match odds — and a single info line when no odds are available.
//   odds = { home, draw, away, bookmaker }   (pre-match, oriented to our home/away)
//   live = { home, draw, away, suspended }   (in-play, oriented; null pre-kickoff)
import Bar from "@/components/Bar.jsx";

const NEUTRAL = "#6b7280"; // remis / draw

function implied(o) {
  const inv = (x) => (x && x > 0 ? 1 / x : 0);
  const ih = inv(o.home), id = inv(o.draw), ia = inv(o.away);
  const s = ih + id + ia || 1;
  return { home: ih / s, draw: id / s, away: ia / s };
}

export default function OddsView({ odds, live, home, away, homeColor = "#22c55e", awayColor = "#64748b" }) {
  const hasLive = live && (live.home != null || live.draw != null || live.away != null);
  const src = hasLive ? live : odds;
  const hasOdds = src && (src.home != null || src.draw != null || src.away != null);
  if (!hasOdds) return <p className="px-2 py-6 text-center text-xs text-muted">Für dieses Spiel liegen keine belastbaren Quoten vor.</p>;

  const p = implied(src);
  const rows = [
    { label: `Sieg ${home?.label || "Heim"}`, odd: src.home, p: p.home, color: homeColor },
    { label: "Remis", odd: src.draw, p: p.draw, color: NEUTRAL },
    { label: `Sieg ${away?.label || "Gast"}`, odd: src.away, p: p.away, color: awayColor },
  ];
  return (
    <div className="space-y-3 pb-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        {hasLive
          ? <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-500"><span className="size-1.5 animate-pulse rounded-full bg-red-500" />LIVE-Quoten</span>
          : <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Quoten</span>}
        {hasLive && live.suspended && <span className="text-[10px] text-amber-500">ausgesetzt</span>}
      </div>

      <div className={`space-y-2.5 ${hasLive && live.suspended ? "opacity-50" : ""}`}>
        {rows.map((r, i) => (
          <div key={i}>
            <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{r.odd != null ? r.odd.toFixed(2) : "–"}</span>
                <span className="text-muted"> · {Math.round(r.p * 100)}%</span>
              </span>
            </div>
            <Bar value={r.p * 100} fill={r.color} label={r.label} />
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted">{hasLive ? "In-Play · " : src.bookmaker ? `${src.bookmaker} · ` : ""}implizite Wahrscheinlichkeit (Marge entfernt)</p>
    </div>
  );
}
