import { groupStandings } from "./groups.js";
import { PHASES } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import MatchCard from "./MatchCard.jsx";

// "Gruppenphase" tab: per group a standings table (top 2 highlighted) plus the
// group's matches in compact, clickable form.
export default function GroupStage({ groupCodes, matches, teams, st, me, teamLabel, teamCode, score, onOpenMatch, onOpenBroadcasts }) {
  return (
    <div className="space-y-6">
      {groupCodes.map((code) => {
        const ms = matches.filter((m) => m.ph === code);
        if (!ms.length) return null;
        const label = PHASES.find((p) => p.code === code)?.label || code;
        const table = groupStandings(code, matches, st.results, teams);
        return (
          <div key={code}>
            <div className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">{label}</div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1.5 text-left font-semibold">#</th>
                    <th className="px-1 py-1.5 text-left font-semibold">Team</th>
                    <th className="px-1 py-1.5 text-center font-semibold">Sp</th>
                    <th className="hidden px-1 py-1.5 text-center font-semibold sm:table-cell">S</th>
                    <th className="hidden px-1 py-1.5 text-center font-semibold sm:table-cell">U</th>
                    <th className="hidden px-1 py-1.5 text-center font-semibold sm:table-cell">N</th>
                    <th className="hidden px-1 py-1.5 text-center font-semibold sm:table-cell">Tore</th>
                    <th className="px-1 py-1.5 text-center font-semibold">+/-</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Pkt</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((t, i) => (
                    <tr key={t.code} className={`border-t border-border ${i < 2 ? "bg-app-accent/10" : ""}`}>
                      <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                      <td className="px-1 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <Flag code={t.code} sm />
                          <span className="truncate font-semibold">{t.name}</span>
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-center text-muted">{t.sp}</td>
                      <td className="hidden px-1 py-1.5 text-center text-muted sm:table-cell">{t.w}</td>
                      <td className="hidden px-1 py-1.5 text-center text-muted sm:table-cell">{t.d}</td>
                      <td className="hidden px-1 py-1.5 text-center text-muted sm:table-cell">{t.l}</td>
                      <td className="hidden whitespace-nowrap px-1 py-1.5 text-center text-muted sm:table-cell">{t.gf}:{t.ga}</td>
                      <td className="px-1 py-1.5 text-center text-muted">{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* matches as a compact 2×3 grid (3 per row on ≥sm) */}
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ms.map((m) => {
                const result = st.results[m.n];
                const myTip = (st.tips[me] || {})[m.n];
                return (
                  <MatchCard
                    key={m.n}
                    match={m}
                    home={{ label: teamLabel(m, "h"), short: (teamCode(m, "h") || teamLabel(m, "h")).toUpperCase(), code: teamCode(m, "h") }}
                    away={{ label: teamLabel(m, "a"), short: (teamCode(m, "a") || teamLabel(m, "a")).toUpperCase(), code: teamCode(m, "a") }}
                    result={result}
                    points={score(myTip, result)}
                    hasTip={!!(myTip && (myTip.h !== "" || myTip.a !== ""))}
                    locked={(st.locks?.lockedMatches || []).includes(m.n)}
                    live={st.live?.[m.n]}
                    broadcasts={st.broadcasts?.[m.n] || []}
                    onOpen={() => onOpenMatch(m.n)}
                    onOpenBroadcasts={() => onOpenBroadcasts(m.n)}
                    compact
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
