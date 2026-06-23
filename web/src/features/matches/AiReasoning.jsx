import { useEffect, useState } from "react";
import { Modal, Spinner } from "@heroui/react";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import StrategyBadge from "./aiStrategy.jsx";

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const num = (x) => (typeof x === "number" ? x.toFixed(2) : x ?? "—");
const signedPct = (x) => (typeof x === "number" ? `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%` : "—");

function Stat({ label, v }) {
  return (
    <div className="rounded-lg border border-border bg-overlay p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}

// v2 model-ensemble weights as a thin stacked bar + legend (statistical / rating / market).
function EnsembleBar({ e }) {
  const segs = [
    { k: "Poisson", w: e.poisson_weight, cls: "bg-app-accent" },
    { k: "Rating", w: e.rating_weight, cls: "bg-slate-400" },
    { k: "Markt", w: e.market_weight, cls: "bg-sky-500" },
  ].filter((s) => typeof s.w === "number" && s.w > 0);
  if (!segs.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Modell-Mix</div>
      <div className="flex h-2 overflow-hidden rounded-full bg-overlay">
        {segs.map((s) => <div key={s.k} className={s.cls} style={{ width: `${Math.round(s.w * 100)}%` }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
        {segs.map((s) => <span key={s.k} className="flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${s.cls}`} />{s.k} {pct(s.w)}</span>)}
      </div>
    </div>
  );
}

// Detail popup for an AI player's tip: the full canonical prediction (German reasoning,
// model, λ, outcome probabilities, confidence, risk). Fetched on open; the server gates
// visibility (only after kickoff/lock) and answers 403 before that.
export default function AiReasoning({ matchN, player, providerMeta, onClose }) {
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
          <Modal.Body>
            {!data ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : data.error ? (
              <p className="rounded-lg border border-border bg-overlay p-3 text-center text-xs text-muted">{data.error}</p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-muted">{data.provider}{data.model ? ` · ${data.model}` : ""}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p?.strategy && <StrategyBadge strategy={p.strategy} withLabel />}
                    <span className="text-lg font-extrabold tabular-nums">{data.tip?.h}:{data.tip?.a}</span>
                  </span>
                </div>
                {p?.reasoning && <p className="rounded-lg border border-border bg-overlay p-3 leading-snug">{p.reasoning}</p>}
                {p?.risk && <p className="text-xs text-muted"><b className="text-foreground">Risiko:</b> {p.risk}</p>}
                {p?.strategy_reason && <p className="text-xs text-muted"><b className="text-foreground">Strategie:</b> {p.strategy_reason}</p>}
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Heimsieg" v={pct(op.home_win)} />
                  <Stat label="Remis" v={pct(op.draw)} />
                  <Stat label="Auswärts" v={pct(op.away_win)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {p?.lambda && <Stat label="λ Heim / Gast" v={`${num(p.lambda.home)} / ${num(p.lambda.away)}`} />}
                  {p?.expected_points != null && <Stat label="Erwart. Punkte" v={num(Number(p.expected_points))} />}
                  {p?.tip_scoreline_probability != null && <Stat label="P(genau)" v={pct(p.tip_scoreline_probability)} />}
                  {p?.confidence && <Stat label="Konfidenz" v={p.confidence} />}
                </div>
                {p?.ensemble && <EnsembleBar e={p.ensemble} />}
                {p?.market_check && (
                  <p className="text-xs text-muted">
                    <b className="text-foreground">Markt (de-vig):</b> {pct(p.market_check.devigged_home)} / {pct(p.market_check.devigged_draw)} / {pct(p.market_check.devigged_away)} · Übereinstimmung {p.market_check.agreement}
                  </p>
                )}
                {p?.alternatives?.length > 0 && (
                  <p className="text-xs text-muted">
                    <b className="text-foreground">Alternativen:</b> {p.alternatives.map((a) => `${a.home}:${a.away} (EV ${num(Number(a.ev))})`).join(" · ")}
                  </p>
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
