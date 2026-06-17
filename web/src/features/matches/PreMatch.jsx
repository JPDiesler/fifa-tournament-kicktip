// Pre-match prognosis for human tippers (api-football /predictions). `preview` =
// { home, away, percent:{home,draw,away}, advice, form:{home,away}, h2h[], injuries[],
//   comparison:{total,att,def,poisson_distribution,h2h,goals,form} (each {home,away} %),
//   teams:{home,away} radar stats }. Shows a single info line when there's nothing solid.
import RadarChart from "@/components/RadarChart.jsx";
import Bar from "@/components/Bar.jsx";

const NEUTRAL = "#6b7280"; // remis / draw
const pct = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; }; // "45%" → 45
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const FORMC = { W: "bg-emerald-500/80", D: "bg-zinc-500/70", L: "bg-red-500/80" };

// Comparison metric → German label (order matches the reference layout).
const CMP_ROWS = [
  ["total", "Stärke"], ["att", "Angriff"], ["def", "Abwehr"],
  ["poisson_distribution", "Poisson"], ["h2h", "Direktvergleich"], ["goals", "Tore (H2H)"], ["form", "Siegchance"],
];
// Radar axes from per-team season stats; only used when the provider has them (0 at a tournament start).
const RADAR_TEAM = [
  { key: "form", label: "Stärke", kind: "pct" }, { key: "att", label: "Angriff", kind: "pct" }, { key: "def", label: "Abwehr", kind: "pct" },
  { key: "wins", label: "Siege", kind: "rate" }, { key: "draws", label: "Remis", kind: "rate" }, { key: "loses", label: "Niederl.", kind: "rate" },
  { key: "goalsFor", label: "Tore", kind: "goals" }, { key: "goalsAgainst", label: "Gegent.", kind: "goals" },
];
// Radar axes from the head-to-head comparison %, which the model provides when it has a prediction.
const RADAR_CMP = [["total", "Stärke"], ["att", "Angriff"], ["def", "Abwehr"], ["poisson_distribution", "Poisson"], ["h2h", "H2H"], ["goals", "Tore"], ["form", "Sieg"]];

function teamAxes(teams) {
  const h = teams?.home, a = teams?.away;
  if (!h && !a) return null;
  const maxG = { goalsFor: Math.max(num(h?.goalsFor), num(a?.goalsFor), 1), goalsAgainst: Math.max(num(h?.goalsAgainst), num(a?.goalsAgainst), 1) };
  const val = (t, ax) => {
    if (!t) return 0;
    if (ax.kind === "pct") return pct(t.last5?.[ax.key]);
    if (ax.kind === "rate") { const p = num(t.played) || (num(t.wins) + num(t.draws) + num(t.loses)); return p ? (num(t[ax.key]) / p) * 100 : 0; }
    return maxG[ax.key] ? (num(t[ax.key]) / maxG[ax.key]) * 100 : 0;
  };
  const axes = RADAR_TEAM.map((ax) => ({ label: ax.label, home: val(h, ax), away: val(a, ax) }));
  return axes.reduce((s, x) => s + x.home + x.away, 0) > 0 ? axes : null; // null when the provider has no stats yet
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

// One outcome (home / draw / away) as a labelled HeroUI bar.
function OutcomeRow({ label, value, color }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums">{Math.round(value)}%</span>
      </div>
      <Bar value={value} fill={color} label={label} />
    </div>
  );
}

// Comparison metric (home% vs away%) as a two-tone HeroUI bar.
function CmpBar({ label, c, homeColor, awayColor }) {
  const h = pct(c?.home), a = pct(c?.away), tot = h + a || 1;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="font-semibold tabular-nums">{Math.round(h)}%</span>
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">{Math.round(a)}%</span>
      </div>
      <Bar value={(h / tot) * 100} fill={homeColor} track={awayColor} label={label} />
    </div>
  );
}

export default function PreMatch({ preview, home, away, homeColor = "#22c55e", awayColor = "#64748b" }) {
  if (!preview) return null;
  const p = preview.percent;
  const homeLabel = home?.label || preview.home, awayLabel = away?.label || preview.away;
  const cmp = preview.comparison;
  // Only metrics that carry a value — api-football returns all-0% for fixtures without a real prediction.
  const cmpRows = cmp ? CMP_ROWS.filter(([k]) => cmp[k] && (pct(cmp[k].home) > 0 || pct(cmp[k].away) > 0)) : [];
  const cmpAxes = cmp ? RADAR_CMP.map(([k, label]) => (cmp[k] ? { label, home: pct(cmp[k].home), away: pct(cmp[k].away) } : null)).filter(Boolean) : [];
  const cmpSignal = cmpAxes.reduce((s, a) => s + a.home + a.away, 0);
  const radarAxes = teamAxes(preview.teams) || (cmpSignal > 0 ? cmpAxes : []);

  const pH = pct(p?.home), pD = pct(p?.draw), pA = pct(p?.away);
  const meaningfulPct = !!p && !(pH === pD && pD === pA); // 33/33/33 = "no edge" → not meaningful
  const advice = preview.advice && !/no predictions available/i.test(preview.advice) ? preview.advice : null;
  const hasForm = !!(preview.form && (preview.form.home || preview.form.away));
  const hasH2h = preview.h2h?.length > 0;
  const reliable = meaningfulPct || radarAxes.length >= 3 || cmpRows.length > 0 || hasForm || hasH2h || advice;

  if (!reliable) return <p className="px-2 py-6 text-center text-xs text-muted">Für dieses Spiel liegen keine belastbaren Prognosedaten vor.</p>;

  return (
    <div className="space-y-4 pb-2 text-sm">
      {meaningfulPct && (
        <div className="space-y-2">
          <OutcomeRow label={`Sieg ${homeLabel}`} value={pH} color={homeColor} />
          <OutcomeRow label="Remis" value={pD} color={NEUTRAL} />
          <OutcomeRow label={`Sieg ${awayLabel}`} value={pA} color={awayColor} />
        </div>
      )}

      {radarAxes.length >= 3 && (
        <div>
          <div className="mb-1 flex items-center justify-center gap-4 text-[11px]">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: homeColor }} /><span className="min-w-0 truncate">{homeLabel}</span></span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: awayColor }} /><span className="min-w-0 truncate">{awayLabel}</span></span>
          </div>
          <RadarChart axes={radarAxes} homeColor={homeColor} awayColor={awayColor} homeLabel={homeLabel} awayLabel={awayLabel} />
        </div>
      )}

      {cmpRows.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Vergleich</div>
          {cmpRows.map(([k, label]) => <CmpBar key={k} label={label} c={cmp[k]} homeColor={homeColor} awayColor={awayColor} />)}
        </div>
      )}

      {advice && <div className="rounded-lg border border-border bg-overlay p-2 text-xs"><span className="font-semibold">Hinweis:</span> {advice}</div>}

      {hasForm && (
        <div className="flex items-center justify-between text-xs">
          <FormPills s={preview.form.home} />
          <span className="text-muted">Form (letzte 5)</span>
          <FormPills s={preview.form.away} />
        </div>
      )}

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
