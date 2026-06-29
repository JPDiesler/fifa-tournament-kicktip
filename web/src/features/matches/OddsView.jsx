import { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@heroui/react";
import { parsePct as pctNum } from "@/lib/num.js";

// Rich odds card. Pre-match shows ALL bookmakers (switchable); in-play shows the live
// feed with ↓/↑ movement + "vor X Sek". Per bookmaker: 1X2 (with margin, margin-free
// probability bar, value-bet vs the model) + Über/Unter 2.5, BTTS, and Next Goal (live).
//   odds / live = { update, suspended?, bookmakers:[{ name, mw, ou25, btts, nextGoal, mwPrev? }] }
//   model       = predictions percent { home, draw, away }  (for the value-bet)
const NEUTRAL = "#6b7280";
const fmt = (o) => (o != null ? Number(o).toFixed(2) : "–");

function implied(mw = {}) {
  const inv = (o) => (o && o > 0 ? 1 / o : 0);
  const ih = inv(mw.home), id = inv(mw.draw), ia = inv(mw.away), raw = ih + id + ia, s = raw || 1;
  return { home: ih / s, draw: id / s, away: ia / s, margin: raw > 0 ? raw - 1 : 0 };
}
function ago(update) {
  const t = update ? Date.parse(update) : NaN;
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `vor ${s} Sek`;
  const m = Math.round(s / 60);
  return m < 60 ? `vor ${m} Min` : `vor ${Math.round(m / 60)} Std`;
}

// ↓/↑ movement vs the previous in-play poll (down = shorter odds = green).
function Move({ cur, prev }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return <span className="text-muted">— {fmt(prev)}</span>;
  return <span className={d < 0 ? "text-emerald-500" : "text-red-500"}>{d < 0 ? "↓" : "↑"} {fmt(prev)}</span>;
}
const Pill = ({ label, odd }) => (
  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-overlay px-2 py-1">
    <span className="text-muted">{label}</span><span className="font-bold tabular-nums">{fmt(odd)}</span>
  </span>
);

export default function OddsView({ odds, live, model, home, away, homeColor = "#22c55e", awayColor = "#64748b" }) {
  const [idx, setIdx] = useState(0);
  const isLive = !!(live && live.bookmakers?.length);
  const src = isLive ? live : odds;
  const books = src?.bookmakers || [];
  if (!books.length) return <p className="px-2 py-6 text-center text-xs text-muted">Für dieses Spiel liegen keine belastbaren Quoten vor.</p>;

  const homeLabel = home?.label || "Heim", awayLabel = away?.label || "Gast";
  const cur = Math.min(idx, books.length - 1);
  const bm = books[cur];
  const p = implied(bm.mw || {});
  const cols = [["Heim", "home", homeColor], ["Unent.", "draw", NEUTRAL], ["Ausw.", "away", awayColor]];

  // value-bet: best outcome where the model's probability beats the market by ≥3 pts.
  let value = null;
  if (model) {
    const m = { home: pctNum(model.home) / 100, draw: pctNum(model.draw) / 100, away: pctNum(model.away) / 100 };
    const best = [["home", homeLabel], ["draw", "Remis"], ["away", awayLabel]]
      .map(([k, lab]) => ({ k, lab, edge: m[k] - p[k], mp: m[k], kp: p[k] }))
      .sort((a, b) => b.edge - a.edge)[0];
    if (best && best.mp > 0 && best.edge >= 0.03) value = best;
  }

  return (
    <div className={`space-y-3 pb-2 text-sm ${isLive && src.suspended ? "opacity-60" : ""}`}>
      {books.length > 1 && (
        <div className="flex items-center gap-1">
          <Button isIconOnly variant="tertiary" size="sm" aria-label="Buchmacher zurück" onPress={() => setIdx((cur - 1 + books.length) % books.length)} className="size-6 shrink-0 rounded-full text-muted"><ChevronLeft size={16} /></Button>
          <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {books.map((b, i) => (
              <button key={b.name + i} type="button" onClick={() => setIdx(i)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${i === cur ? "bg-app-accent text-accent-foreground" : "bg-overlay text-muted hover:text-foreground"}`}>{b.name}</button>
            ))}
          </div>
          <Button isIconOnly variant="tertiary" size="sm" aria-label="Buchmacher weiter" onPress={() => setIdx((cur + 1) % books.length)} className="size-6 shrink-0 rounded-full text-muted"><ChevronRight size={16} /></Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Spielausgang</span>
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] text-muted"><span className="size-1.5 animate-pulse rounded-full bg-red-500" />{ago(src.update) || "live"}</span>
            : <span className="text-[10px] text-muted">Pre-Match</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {cols.map(([lab, k, col]) => (
            <div key={k} className="rounded-xl border border-border bg-overlay p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[11px] text-muted"><span className="size-1.5 rounded-full" style={{ background: col }} />{lab}</div>
              <div className="text-lg font-extrabold tabular-nums">{fmt(bm.mw?.[k])}</div>
              {isLive && bm.mwPrev && <div className="text-[10px] tabular-nums"><Move cur={bm.mw?.[k]} prev={bm.mwPrev?.[k]} /></div>}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
            <span>Wahrscheinlichkeit (bereinigt)</span><span>Marge {(p.margin * 100).toFixed(1)}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-overlay">
            <div style={{ width: `${p.home * 100}%`, background: homeColor }} />
            <div className="bg-foreground/30" style={{ width: `${p.draw * 100}%` }} />
            <div style={{ width: `${p.away * 100}%`, background: awayColor }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums">
            <span>{Math.round(p.home * 100)}%</span><span>{Math.round(p.draw * 100)}%</span><span>{Math.round(p.away * 100)}%</span>
          </div>
        </div>

        {value && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-500">
            <Check size={14} className="shrink-0" />
            <span><span className="font-semibold">Value {value.lab}</span> · Modell {Math.round(value.mp * 100)}% vs Markt {Math.round(value.kp * 100)}%</span>
          </div>
        )}

        {(bm.ou25 || bm.btts || bm.nextGoal) && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {bm.ou25?.over != null && <Pill label="Über 2.5" odd={bm.ou25.over} />}
            {bm.ou25?.under != null && <Pill label="Unter 2.5" odd={bm.ou25.under} />}
            {bm.btts?.yes != null && <Pill label="BTTS Ja" odd={bm.btts.yes} />}
            {bm.btts?.no != null && <Pill label="BTTS Nein" odd={bm.btts.no} />}
            {isLive && bm.nextGoal?.home != null && <Pill label={`Nächstes Tor ${homeLabel}`} odd={bm.nextGoal.home} />}
            {isLive && bm.nextGoal?.away != null && <Pill label={`Nächstes Tor ${awayLabel}`} odd={bm.nextGoal.away} />}
            {isLive && bm.nextGoal?.none != null && <Pill label="Kein Tor" odd={bm.nextGoal.none} />}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
          <span>{bm.name} · {isLive ? "In-Play" : "Pre-Match"} · implizite Wahrscheinlichkeit (Marge entfernt)</span>
          {isLive && src.suspended && <span className="font-semibold text-amber-500">ausgesetzt</span>}
        </div>
      </div>
    </div>
  );
}
