import { useEffect, useState } from "react";
import { Modal, Spinner } from "@heroui/react";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import Flag from "@/components/Flag.jsx";
import { Trophy } from "lucide-react";
import StrategyBadge from "./aiStrategy.jsx";

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const pctNum = (x) => (typeof x === "number" ? Math.round(x * 100) : 0);
const num = (x) => (typeof x === "number" ? x.toFixed(2) : x ?? "—");
const signedPct = (x) => (typeof x === "number" ? `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%` : "—");

// outcome colours, reused across the bar + the market/model comparison + legends
const OUT = [
  { key: "home_win", dv: "devigged_home", label: "Heim", color: "var(--app-accent)" },
  { key: "draw", dv: "devigged_draw", label: "Remis", color: "#f59e0b" },
  { key: "away_win", dv: "devigged_away", label: "Auswärts", color: "#38bdf8" },
];

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

// One team beside the score: flag, country code, nickname (falls back to full name).
function TeamCol({ team }) {
  const name = team?.nickname || team?.label || team?.code || "";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      {team?.code ? <Flag code={team.code} lg /> : <span className="h-7 w-11 rounded-sm bg-overlay" />}
      <span className="text-sm font-bold tracking-wide">{team?.code || "—"}</span>
      <span className="max-w-full truncate text-[11px] text-muted">{name}</span>
    </div>
  );
}

// Outcome probabilities as a single segmented bar + legend (home / draw / away).
function OutcomeBar({ op }) {
  const segs = OUT.map((o) => ({ ...o, v: typeof op[o.key] === "number" ? op[o.key] : 0 }));
  const tot = segs.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded-lg" style={{ background: "var(--overlay)" }}>
        {segs.map((s) => { const w = (s.v / tot) * 100; return (
          <div key={s.key} className="flex items-center justify-center text-[11px] font-bold" style={{ width: `${w}%`, background: s.color, color: "#0a0a0a" }} title={`${s.label} ${pct(s.v)}`}>
            {w >= 16 ? pct(s.v) : ""}
          </div>
        ); })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
        {segs.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: s.color }} />{s.label} <b className="text-foreground">{pct(s.v)}</b></span>)}
      </div>
    </div>
  );
}

// Compact stat strip — seamless cells with hairline dividers.
function StatStrip({ items }) {
  if (!items.length) return null;
  return (
    <div className="flex overflow-hidden rounded-xl border border-border bg-overlay">
      {items.map((it, i) => (
        <div key={it.label} className={`flex-1 px-2 py-2 text-center ${i ? "border-l border-border" : ""}`}>
          <div className="text-[9px] uppercase tracking-wide text-muted">{it.label}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// Model vs. de-vigged market — two thin segmented bars so alignment is visible at a glance.
function MarketCompare({ op, mc }) {
  const bar = (get) => (
    <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded bg-overlay">
      {OUT.map((o) => <div key={o.key} style={{ width: `${pctNum(get(o))}%`, background: o.color }} />)}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[10px] text-muted"><span className="w-12 shrink-0">Modell</span>{bar((o) => op[o.key])}</div>
      <div className="flex items-center gap-2 text-[10px] text-muted"><span className="w-12 shrink-0">Markt</span>{bar((o) => mc[o.dv])}</div>
      <div className="text-[11px] text-muted">Übereinstimmung mit dem Wettmarkt <b className="text-foreground">{mc.agreement}</b></div>
    </div>
  );
}

// Model-ensemble weights as a thin stacked bar + legend (statistical / rating / market).
function EnsembleBar({ e }) {
  const segs = [
    { k: "Statistik", w: e.poisson_weight, color: "var(--app-accent)" },
    { k: "Rating", w: e.rating_weight, color: "#a1a1aa" },
    { k: "Markt", w: e.market_weight, color: "#38bdf8" },
  ].filter((s) => typeof s.w === "number" && s.w > 0);
  if (!segs.length) return null;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-overlay">
        {segs.map((s) => <div key={s.k} style={{ width: `${Math.round(s.w * 100)}%`, background: s.color }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
        {segs.map((s) => <span key={s.k} className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm" style={{ background: s.color }} />{s.k} {pct(s.w)}</span>)}
      </div>
    </div>
  );
}

// Alternative scorelines ranked by EV, each with a scaled EV bar.
function Alternatives({ alts }) {
  const maxEv = Math.max(...alts.map((a) => Number(a.ev) || 0), 0.01);
  return (
    <div className="flex flex-col gap-1.5">
      {alts.map((a, i) => (
        <div key={i} className="flex items-center gap-2.5 text-xs">
          <span className="w-9 shrink-0 font-bold tabular-nums">{a.home}:{a.away}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-overlay">
            <div className="h-full rounded-full bg-app-accent/70" style={{ width: `${((Number(a.ev) || 0) / maxEv) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right text-muted tabular-nums">EV {num(Number(a.ev))}</span>
        </div>
      ))}
    </div>
  );
}

// Detail popup for an AI player's tip: a team-matchup header with the predicted score, a
// plain-language verdict, then the model internals (outcome bar, key stats, model-mix,
// market-vs-model, alternatives). Fetched on open; the server gates visibility.
export default function AiReasoning({ matchN, player, providerMeta, home, away, onClose }) {
  const [data, setData] = useState(null); // null = loading | { error } | { prediction, … }

  useEffect(() => {
    if (!player || matchN == null) { setData(null); return; }
    let alive = true;
    setData(null);
    fetch(`/api/ai-prediction?match=${matchN}&player=${encodeURIComponent(player)}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (alive) setData(r.ok ? d : { error: d.error || "nicht verfügbar" }); })
      .catch(() => { if (alive) setData({ error: "Netzwerkfehler" }); });
    return () => { alive = false; };
  }, [player, matchN]);

  const p = data && !data.error ? data.prediction : null;
  const op = p?.outcome_probabilities || {};
  const hasOutcome = op.home_win != null || op.draw != null || op.away_win != null;
  const stats = p ? [
    p.lambda && { label: "Erw. Tore", value: `${num(p.lambda.home)} : ${num(p.lambda.away)}` },
    p.expected_points != null && { label: "Erw. Punkte", value: num(Number(p.expected_points)) },
    p.tip_scoreline_probability != null && { label: "P(genau)", value: pct(p.tip_scoreline_probability) },
    p.confidence && { label: "Konfidenz", value: p.confidence },
  ].filter(Boolean) : [];

  return (
    <Modal.Backdrop isOpen={!!player} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[460px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="flex items-center gap-2">
              {providerMeta?.isAi && <ProviderLogo provider={providerMeta.provider} logo={providerMeta.logo} size={18} />}
              KI-Begründung · {player}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[70dvh] overflow-y-auto">
            {!data ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : data.error ? (
              <p className="rounded-lg border border-border bg-overlay p-3 text-center text-xs text-muted">{data.error}</p>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {/* provider/model + strategy */}
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-muted">{data.provider}{data.model ? ` · ${data.model}` : ""}</span>
                  {p?.strategy && <StrategyBadge strategy={p.strategy} withLabel />}
                </div>

                {/* hero: team matchup with the predicted score */}
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-overlay/40 px-3 py-4">
                  <TeamCol team={home} />
                  <div className="shrink-0 px-1 text-center text-3xl font-extrabold tabular-nums">
                    {data.tip?.h}<span className="mx-1 text-muted">:</span>{data.tip?.a}
                  </div>
                  <TeamCol team={away} />
                </div>

                {/* knockout: who the AI backs to advance (only set on a K.o. Remis tip) */}
                {(data.tip?.w === "h" || data.tip?.w === "a") && (
                  <div className="-mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
                    <Trophy size={13} className="text-app-accent" /> kommt weiter:
                    <Flag code={(data.tip.w === "h" ? home : away).code} sm />
                    <span className="font-semibold text-foreground">{(data.tip.w === "h" ? home : away).label}</span>
                  </div>
                )}

                {/* plain-language reasoning — the takeaway */}
                {p?.reasoning && (
                  <p className="rounded-r-xl border-l-[3px] border-app-accent bg-gradient-to-r from-app-accent/[0.07] to-transparent py-2.5 pl-3.5 pr-3 leading-snug">{p.reasoning}</p>
                )}

                {/* outcome distribution */}
                {hasOutcome && <Section title="Ausgang"><OutcomeBar op={op} /></Section>}

                {/* key numbers */}
                <StatStrip items={stats} />

                {/* alternatives */}
                {p?.alternatives?.length > 0 && <Section title="Alternativen"><Alternatives alts={p.alternatives} /></Section>}

                {/* quiet model group */}
                {(p?.ensemble || p?.market_check) && (
                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    {p?.ensemble && <Section title="Modell-Mix"><EnsembleBar e={p.ensemble} /></Section>}
                    {p?.market_check && <Section title="Markt vs. Modell"><MarketCompare op={op} mc={p.market_check} /></Section>}
                  </div>
                )}

                {/* nuance — technical, de-emphasised */}
                {(p?.risk || p?.strategy_reason) && (
                  <div className="flex flex-col gap-1.5 text-xs text-muted">
                    {p?.risk && <p><b className="text-foreground">Risiko</b> · {p.risk}</p>}
                    {p?.strategy_reason && <p><b className="text-foreground">Strategie</b> · {p.strategy_reason}</p>}
                  </div>
                )}
                {p?.calibration_applied && (
                  <p className="text-[11px] text-muted">
                    Kalibrierung angewandt{p.calibration_adjustments ? `: λ ${signedPct(p.calibration_adjustments.lambda_shift_home)} / ${signedPct(p.calibration_adjustments.lambda_shift_away)}${p.calibration_adjustments.confidence_regressed ? " · Konfidenz↓" : ""}` : ""}.{p.calibration_adjustments?.note ? ` ${p.calibration_adjustments.note}` : ""}
                  </p>
                )}
                {p?.data_completeness?.missing?.length > 0 && (
                  <p className="text-[10px] text-muted">Fehlende Daten: {p.data_completeness.missing.join(", ")}</p>
                )}
              </div>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
