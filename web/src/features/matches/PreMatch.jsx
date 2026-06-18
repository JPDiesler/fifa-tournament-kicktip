// Pre-match prognosis for human tippers (api-football /predictions). `preview` =
// { home, away, percent, advice, form:{home,away}, h2h[], injuries[], comparison{…},
//   teams:{home,away}{ last5:{form,att,def}, wins,draws,loses,played, goalsFor/Against,
//   gfAvg, gaAvg, timing:{goalsFor,goalsAgainst,yellow,red:[8 %]} } }.
import RadarChart from "@/components/RadarChart.jsx";
import EventTiming from "./EventTiming.jsx";

const pct = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; }; // "45%" → 45
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const FORMC = { W: "bg-emerald-500/80", D: "bg-zinc-500/70", L: "bg-red-500/80" };

// The full strength comparison — ALWAYS shown. Attack/defence/form use each team's
// ABSOLUTE last-5 rating (0–100), so the shown % are real (e.g. 6 % vs 0 %), not the
// head-to-head split that turns 6-vs-0 into 100-vs-0. The remaining metrics are only
// available as the model's head-to-head % and show "keine Daten" when empty.
const CMP_BARS = [
  { key: "total", label: "Stärke" },
  { key: "att", label: "Angriff", rating: "att" },
  { key: "def", label: "Abwehr", rating: "def" },
  { key: "form", label: "Form", rating: "form" },
  { key: "poisson_distribution", label: "Poisson" },
  { key: "h2h", label: "Direktvergleich" },
  { key: "goals", label: "Tore (H2H)" },
];
function barData(b, cmp, teams) {
  let h, a;
  if (b.rating) { h = pct(teams?.home?.last5?.[b.rating]); a = pct(teams?.away?.last5?.[b.rating]); } // absolute rating
  else { const v = cmp?.[b.key]; h = pct(v?.home); a = pct(v?.away); }                                // head-to-head %
  return h === 0 && a === 0 ? null : { home: h, away: a };
}

// Curated radar axes from the always-present per-team ratings (0–100), not the sparse
// W/D/L counts (degenerate at a tournament start). [] when there's no signal at all.
function radarFrom(teams, cmp) {
  const h = teams?.home, a = teams?.away;
  if (!h && !a) return [];
  const gs = (v) => (v == null ? 0 : Math.min(num(v) / 3, 1) * 100);        // goals/game → 0–100 (3+/g = full)
  const ds = (v) => (v == null ? 0 : (1 - Math.min(num(v) / 3, 1)) * 100);  // fewer conceded = higher
  const axes = [
    { label: "Angriff", home: pct(h?.last5?.att), away: pct(a?.last5?.att) },
    { label: "Abwehr", home: pct(h?.last5?.def), away: pct(a?.last5?.def) },
    { label: "Form", home: pct(h?.last5?.form), away: pct(a?.last5?.form) },
    { label: "Stärke", home: pct(cmp?.total?.home), away: pct(cmp?.total?.away) },
    { label: "Tore", home: gs(h?.gfAvg), away: gs(a?.gfAvg) },
    { label: "Defensive", home: ds(h?.gaAvg), away: ds(a?.gaAvg) },
  ];
  return axes.reduce((s, x) => s + x.home + x.away, 0) > 0 ? axes : [];
}

function FormPills({ s }) {
  const chars = String(s || "").replace(/[^WDL]/gi, "").toUpperCase().slice(-5).split("");
  if (!chars.length) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {chars.map((c, i) => <span key={i} className={`flex size-3.5 items-center justify-center rounded-[3px] text-[8px] font-bold text-white ${FORMC[c] || "bg-zinc-500"}`}>{c}</span>)}
    </span>
  );
}

// Win probability as ONE three-colour bar (home | draw | away), in the HeroUI bar look.
function WinBar({ h, d, a, homeColor, awayColor, homeLabel, awayLabel }) {
  const tot = h + d + a || 1;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-[11px] text-muted">
        <span className="min-w-0 truncate">{homeLabel}</span>
        <span className="shrink-0">Remis</span>
        <span className="min-w-0 truncate text-right">{awayLabel}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-overlay">
        <div style={{ width: `${(h / tot) * 100}%`, background: homeColor }} />
        <div className="bg-foreground/30" style={{ width: `${(d / tot) * 100}%` }} />
        <div style={{ width: `${(a / tot) * 100}%`, background: awayColor }} />
      </div>
      <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums">
        <span>{Math.round(h)}%</span><span>{Math.round(d)}%</span><span>{Math.round(a)}%</span>
      </div>
    </div>
  );
}

// Two-team comparison bar: each side fills its OWN value (0–100) from the centre out, so
// the bar widths match the shown percentages exactly (no head-to-head normalisation).
function MirrorBar({ label, home, away, homeColor, awayColor }) {
  const hw = Math.max(0, Math.min(100, home)), aw = Math.max(0, Math.min(100, away));
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="font-semibold tabular-nums">{Math.round(home)}%</span>
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">{Math.round(away)}%</span>
      </div>
      <div className="flex h-2 gap-0.5">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-overlay">
          <div className="h-full rounded-l-full" style={{ width: `${hw}%`, background: homeColor }} />
        </div>
        <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-overlay">
          <div className="h-full rounded-r-full" style={{ width: `${aw}%`, background: awayColor }} />
        </div>
      </div>
    </div>
  );
}

// A bar row with no data — keeps the layout consistent + flags the gap.
function EmptyBar({ label }) {
  return (
    <div className="opacity-60">
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-[10px] text-muted">keine Daten</span>
      </div>
      <div className="h-1.5 rounded-full bg-overlay" />
    </div>
  );
}

// Per-team absolute stats — always present once a team has played. home | label | away.
function StatTable({ teams, homeLabel, awayLabel }) {
  const h = teams?.home, a = teams?.away;
  if (!h && !a) return null;
  const g = (v) => (v == null || v === "" ? "–" : String(v));
  const rec = (t) => (t ? `${num(t.wins)}·${num(t.draws)}·${num(t.loses)}` : "–");
  const rows = [
    { label: "Ø Tore", h: g(h?.gfAvg), a: g(a?.gfAvg) },
    { label: "Ø Gegentore", h: g(h?.gaAvg), a: g(a?.gaAvg) },
    { label: "Bilanz S·U·N", h: rec(h), a: rec(a) },
  ];
  return (
    <div>
      <div className="mb-1 grid grid-cols-3 gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
        <span className="min-w-0 truncate">{homeLabel}</span>
        <span className="text-center">Statistik</span>
        <span className="min-w-0 truncate text-right">{awayLabel}</span>
      </div>
      <div className="rounded-xl border border-border">
        {rows.map((r, i) => (
          <div key={r.label} className={`grid grid-cols-3 items-center gap-2 px-3 py-1.5 text-xs ${i ? "border-t border-border" : ""}`}>
            <span className="font-semibold tabular-nums">{r.h}</span>
            <span className="text-center text-muted">{r.label}</span>
            <span className="text-right font-semibold tabular-nums">{r.a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PreMatch({ preview, home, away, homeColor = "#22c55e", awayColor = "#64748b" }) {
  if (!preview) return null;
  const p = preview.percent;
  const homeLabel = home?.label || preview.home, awayLabel = away?.label || preview.away;
  const cmp = preview.comparison, teams = preview.teams;

  const bars = CMP_BARS.map((b) => ({ ...b, d: barData(b, cmp, teams) }));
  const hasAnyBar = bars.some((b) => b.d);
  const radarAxes = radarFrom(teams, cmp);

  const pH = pct(p?.home), pD = pct(p?.draw), pA = pct(p?.away);
  const meaningfulPct = !!p && !(pH === pD && pD === pA); // 33/33/33 = "no edge" → not meaningful
  const advice = preview.advice && !/no predictions available/i.test(preview.advice) ? preview.advice : null;
  const hasForm = !!(preview.form && (preview.form.home || preview.form.away));
  const hasH2h = preview.h2h?.length > 0;
  const hasStats = !!(teams && (teams.home || teams.away));
  const reliable = meaningfulPct || hasAnyBar || radarAxes.length >= 3 || hasH2h || advice;

  if (!reliable) return <p className="px-2 py-6 text-center text-xs text-muted">Für dieses Spiel liegen keine belastbaren Prognosedaten vor.</p>;

  return (
    <div className="space-y-4 pb-2 text-sm">
      {meaningfulPct && <WinBar h={pH} d={pD} a={pA} homeColor={homeColor} awayColor={awayColor} homeLabel={homeLabel} awayLabel={awayLabel} />}

      {advice && <div className="rounded-lg border border-border bg-overlay p-2 text-xs"><span className="font-semibold">Hinweis:</span> {advice}</div>}

      <div className="space-y-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Kräftevergleich</div>
        {bars.map((b) => (b.d
          ? <MirrorBar key={b.key} label={b.label} home={b.d.home} away={b.d.away} homeColor={homeColor} awayColor={awayColor} />
          : <EmptyBar key={b.key} label={b.label} />))}
      </div>

      {radarAxes.length >= 3 && <RadarChart axes={radarAxes} homeColor={homeColor} awayColor={awayColor} homeLabel={homeLabel} awayLabel={awayLabel} />}

      {teams && (teams.home?.timing || teams.away?.timing) && (
        <EventTiming timing={{ home: teams.home?.timing, away: teams.away?.timing }} homeColor={homeColor} awayColor={awayColor} homeLabel={homeLabel} awayLabel={awayLabel} />
      )}

      {hasForm && (
        <div className="flex items-center justify-between text-xs">
          <FormPills s={preview.form.home} />
          <span className="text-muted">Form (letzte 5)</span>
          <FormPills s={preview.form.away} />
        </div>
      )}

      {hasStats && <StatTable teams={teams} homeLabel={homeLabel} awayLabel={awayLabel} />}

      {hasH2h && (
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
