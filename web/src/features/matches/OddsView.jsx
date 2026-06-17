// Pre-match 1X2 odds (decimal) + implied probability (bookmaker margin removed by
// normalizing 1/odd). `odds` = { home, draw, away, bookmaker } already oriented to
// our home/away.
export default function OddsView({ odds, home, away }) {
  if (!odds) return null;
  const inv = (o) => (o && o > 0 ? 1 / o : 0);
  const ih = inv(odds.home), id = inv(odds.draw), ia = inv(odds.away);
  const s = ih + id + ia || 1;
  const rows = [
    { label: `Sieg ${home?.label || "Heim"}`, odd: odds.home, p: ih / s },
    { label: "Remis", odd: odds.draw, p: id / s },
    { label: `Sieg ${away?.label || "Gast"}`, odd: odds.away, p: ia / s },
  ];
  return (
    <div className="space-y-3 pb-2 text-sm">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{r.odd != null ? r.odd.toFixed(2) : "–"}</span>
              <span className="text-muted"> · {Math.round(r.p * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-overlay"><div className="h-1.5 rounded-full bg-app-accent" style={{ width: `${r.p * 100}%` }} /></div>
        </div>
      ))}
      {odds.bookmaker && <p className="text-[10px] text-muted">Quelle: {odds.bookmaker} · implizite Wahrscheinlichkeit (Marge entfernt)</p>}
    </div>
  );
}
