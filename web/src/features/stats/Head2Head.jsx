import { Swords } from "lucide-react";
import { head2head } from "./stats.js";
import PlayerSelect from "./PlayerSelect.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import WinnerFlag from "@/components/WinnerFlag.jsx";

// Direct comparison of two players. Selection (a/b) is controlled by the parent
// (so the toolbar share button can reuse it). Data via head2head() — accurate on
// scored matches (others' tips are visible once a match is locked).
export default function Head2Head({ st, board = [], teamLabel, a, b, onA, onB }) {
  const players = board.map((p) => ({ p: p.p, name: p.name || p.p }));
  if (players.length < 2) return <p className="p-8 text-center text-sm text-muted">Für einen Vergleich werden mindestens zwei Spieler benötigt.</p>;

  const d = head2head(a, b, st, board);
  const { SA, SB } = d;
  const metrics = [
    { label: "Punkte", a: d.sumA, b: d.sumB },
    { label: "Volltreffer", a: SA.counts[3], b: SB.counts[3] },
    { label: "Trefferquote", a: SA.hitRate, b: SB.hitRate, fmt: (v) => `${v}%` },
    { label: "Ø / Spiel", a: SA.avg, b: SB.avg, fmt: (v) => v.toFixed(2) },
    { label: "Längste Serie", a: SA.longest, b: SB.longest },
  ];
  const side = (mine, other) => (mine > other ? "font-bold text-app-accent" : mine < other ? "text-muted" : "");

  return (
    <div className="space-y-3">
      {/* selectors */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <PlayerSelect players={players} value={a} onChange={onA} ariaLabel="Spieler A" />
        <Swords size={16} className="text-muted" />
        <PlayerSelect players={players} value={b} onChange={onB} ariaLabel="Spieler B" />
      </div>

      {/* headline points */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border bg-surface p-3 text-center">
        <div className="text-3xl font-extrabold text-success">{d.sumA}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted">Punkte</div>
        <div className="text-3xl font-extrabold text-success">{d.sumB}</div>
      </div>

      {/* direct duel record (matches both tipped) */}
      <div className="rounded-xl border border-border bg-surface p-3 text-center text-sm">
        <div className="text-[11px] uppercase tracking-wider text-muted">Direkter Vergleich · {d.duels.length} Spiele beide getippt</div>
        <div className="mt-1 text-lg font-bold tabular-nums">
          <span className={d.aw > d.bw ? "text-app-accent" : ""}>{d.aw}</span>
          <span className="px-2 text-muted">:</span>
          <span className={d.bw > d.aw ? "text-app-accent" : ""}>{d.bw}</span>
          {d.tie > 0 && <span className="ml-2 text-xs font-normal text-muted">· {d.tie} × gleich</span>}
        </div>
      </div>

      {/* metric comparison */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {metrics.map((row, i) => (
          <div key={row.label} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-sm ${i ? "border-t border-border" : ""}`}>
            <div className={`text-right tabular-nums ${side(row.a, row.b)}`}>{row.fmt ? row.fmt(row.a) : row.a}</div>
            <div className="px-2 text-center text-[11px] uppercase tracking-wider text-muted">{row.label}</div>
            <div className={`tabular-nums ${side(row.b, row.a)}`}>{row.fmt ? row.fmt(row.b) : row.b}</div>
          </div>
        ))}
      </div>

      {/* per-match */}
      {d.duels.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Spiel für Spiel</div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {d.duels.map(({ m, pa, pb }) => {
              const ta = st.tips[a][m.n], tb = st.tips[b][m.n], r = st.results[m.n];
              return (
                <li key={m.n} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="flex w-24 items-center justify-end gap-1">
                    <span className={`tabular-nums ${pa > pb ? "font-bold text-app-accent" : "text-muted"}`}>{ta.h}:{ta.a}</span>
                    <WinnerFlag tip={ta} resolved={st.resolved?.[m.n]} arrow={false} />
                    <PointsBadge points={pa} />
                  </div>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="truncate text-[11px]">{teamLabel(m, "h")} – {teamLabel(m, "a")}</div>
                    <div className="text-[10px] tabular-nums text-muted">{r.h}:{r.a}</div>
                  </div>
                  <div className="flex w-24 items-center gap-1">
                    <PointsBadge points={pb} />
                    <WinnerFlag tip={tb} resolved={st.resolved?.[m.n]} arrow={false} />
                    <span className={`tabular-nums ${pb > pa ? "font-bold text-app-accent" : "text-muted"}`}>{tb.h}:{tb.a}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
