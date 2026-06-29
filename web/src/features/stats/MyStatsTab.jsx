import { Check, X } from "lucide-react";
import { TEAMS, CHAMP_BONUS } from "@/data";
import { PT, known } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import { playerStats, bestWorstDay } from "./stats.js";
import AchievementsList from "@/features/achievements/AchievementsList.jsx";

const Tile = ({ label, value, sub, valueClass = "" }) => (
  <div className="rounded-xl border border-border bg-surface p-3">
    <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
    <div className={`mt-0.5 text-2xl font-bold ${valueClass}`}>{value}</div>
    {sub && <div className="text-[11px] text-muted">{sub}</div>}
  </div>
);

// Distribution legend: point value → label. Colours come from PT (scoring.js).
const DIST = [[4, "Exakt + Sieger"], [3, "Volltreffer"], [2, "Tordifferenz"], [1, "Tendenz"], [0, "Daneben"]];
const bg = (k) => PT[k].split(" ")[0]; // just the bg-* class of the point colour

// "Bilanz": the current player's personal tipping record.
export default function MyStatsTab({ me, st, board = [], matchdays = [], teams = TEAMS }) {
  if (!me) return <p className="p-8 text-center text-sm text-muted">Für eine Bilanz brauchst du ein Kürzel – bitte den Admin kontaktieren.</p>;

  const s = playerStats(me, st);
  const { best, worst } = bestWorstDay(me, matchdays);
  const rank = board.findIndex((r) => r.p === me) + 1;
  const row = board.find((r) => r.p === me);
  const total = row ? row.sum : s.sum; // leaderboard sum includes the champion bonus
  const champ = st.champs?.[me] || "";
  const championActual = st.championActual || "";
  const champHit = championActual && champ === championActual;

  return (
    <div className="space-y-3">
      {/* hero: total points + rank */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">Gesamtpunkte</div>
          <div className="text-4xl font-extrabold text-success">{total}</div>
          {row?.achPoints > 0 && <div className="text-[11px] text-muted">inkl. +{row.achPoints} aus Erfolgen</div>}
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">Platz</div>
          <div className="text-3xl font-bold">
            {rank ? `#${rank}` : "—"}
            {board.length ? <span className="text-sm font-normal text-muted"> / {board.length}</span> : null}
          </div>
        </div>
      </div>

      {/* key tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Getippt" value={s.tipped} sub={`von ${s.total} Spielen`} />
        <Tile label="Volltreffer" value={s.counts[3]} valueClass="text-emerald-400" />
        <Tile label="Trefferquote" value={`${s.hitRate}%`} sub={`${s.hits}/${s.scored} gewertet`} />
        <Tile label="Ø pro Spiel" value={s.avg.toFixed(2)} />
      </div>

      {/* points distribution */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Verteilung ({s.scored} gewertet)</div>
        {s.scored ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-overlay">
              {DIST.map(([k]) => (s.counts[k] ? <div key={k} className={bg(k)} style={{ width: `${(s.counts[k] / s.scored) * 100}%` }} /> : null))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              {DIST.map(([k, label]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={`inline-block size-2.5 rounded-sm ${bg(k)}`} />
                  <span className="text-muted">{label}</span>
                  <span className="ml-auto font-semibold">{s.counts[k]}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Noch keine gewerteten Tipps.</p>
        )}
      </div>

      {/* streaks */}
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Längste Serie" value={s.longest} sub="Spiele mit Punkten" />
        <Tile label="Aktuelle Serie" value={s.current} sub={s.current ? "läuft 🔥" : "—"} />
      </div>

      {/* best / worst matchday */}
      {(best || worst) && (
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Bester Spieltag" value={best ? `${best.pts} P` : "—"} sub={best?.label} valueClass="text-emerald-400" />
          <Tile label="Schwächster Spieltag" value={worst ? `${worst.pts} P` : "—"} sub={worst?.label} />
        </div>
      )}

      {/* achievements & streaks (points-relevant; tap a badge for details) */}
      <AchievementsList achievements={st.achievements} />

      {/* champion pick */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Weltmeister-Tipp</div>
        {champ ? (
          <div className="flex items-center gap-2">
            {known(champ) && <Flag code={champ} sm />}
            <span className="font-semibold">{teams[champ]?.name || champ}</span>
            {championActual ? (
              champHit
                ? <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-success"><Check size={15} /> getroffen (+{CHAMP_BONUS})</span>
                : <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted"><X size={15} /> daneben</span>
            ) : (
              <span className="ml-auto text-sm text-muted">noch offen</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Kein Weltmeister getippt.</p>
        )}
      </div>
    </div>
  );
}
