// Pre-match preview for human tippers (api-football). `preview` =
// { home, away, percent:{home,draw,away}, advice, form:{home,away}, h2h[], injuries[] }.
const pct = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
const FORMC = { W: "bg-emerald-500/80", D: "bg-zinc-500/70", L: "bg-red-500/80" };

function FormPills({ s }) {
  const chars = String(s || "").replace(/[^WDL]/gi, "").toUpperCase().slice(-5).split("");
  if (!chars.length) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {chars.map((c, i) => <span key={i} className={`flex size-3.5 items-center justify-center rounded-[3px] text-[8px] font-bold text-white ${FORMC[c] || "bg-zinc-500"}`}>{c}</span>)}
    </span>
  );
}

export default function PreMatch({ preview, home, away }) {
  if (!preview) return null;
  const p = preview.percent;
  const homeLabel = home?.label || preview.home, awayLabel = away?.label || preview.away;
  return (
    <div className="space-y-4 pb-2 text-sm">
      {p && (
        <div>
          <div className="mb-1 flex justify-between gap-2 text-[11px] text-muted">
            <span className="min-w-0 truncate">{homeLabel}</span><span>Remis</span><span className="min-w-0 truncate text-right">{awayLabel}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-overlay">
            <div className="bg-app-accent" style={{ width: `${pct(p.home)}%` }} />
            <div className="bg-foreground/25" style={{ width: `${pct(p.draw)}%` }} />
            <div className="bg-foreground/50" style={{ width: `${pct(p.away)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums">
            <span>{p.home || "–"}</span><span>{p.draw || "–"}</span><span>{p.away || "–"}</span>
          </div>
        </div>
      )}

      {preview.advice && <div className="rounded-lg border border-border bg-overlay p-2 text-xs"><span className="font-semibold">Hinweis:</span> {preview.advice}</div>}

      {preview.form && (preview.form.home || preview.form.away) && (
        <div className="flex items-center justify-between text-xs">
          <FormPills s={preview.form.home} />
          <span className="text-muted">Form (letzte 5)</span>
          <FormPills s={preview.form.away} />
        </div>
      )}

      {preview.h2h?.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Direkter Vergleich</div>
          <ul className="space-y-0.5 text-xs">
            {preview.h2h.map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{g.home} – {g.away}</span>
                <span className="shrink-0 tabular-nums text-muted">{g.goals?.home}:{g.goals?.away}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.injuries?.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Ausfälle</div>
          <ul className="space-y-0.5 text-xs text-muted">
            {preview.injuries.map((x, i) => <li key={i} className="truncate">{x.player}{x.team ? ` · ${x.team}` : ""}{x.reason ? ` (${x.reason})` : ""}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
