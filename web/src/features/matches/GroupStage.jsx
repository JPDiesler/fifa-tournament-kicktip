import { Accordion } from "@heroui/react";
import { groupStandings, thirdPlaceTable } from "./groups.js";
import { PHASES } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import MatchCard from "./MatchCard.jsx";

const TH = "px-1 py-1.5 text-center font-semibold";
const TD = "px-1 py-1.5 text-center text-muted";

// One standings row (shared by the group tables and the best-thirds table). `extra` renders an
// optional trailing cell after the team (the source-group letter in the thirds table).
function StandRow({ t, rank, highlight, extra }) {
  return (
    <tr className={`border-t border-border ${highlight ? "bg-app-accent/10" : ""}`}>
      <td className="px-2 py-1.5 text-muted">{rank}</td>
      <td className="px-1 py-1.5">
        <span className="flex items-center gap-1.5">
          <Flag code={t.code} sm />
          <span className="truncate font-semibold">{t.name}</span>
        </span>
      </td>
      {extra}
      <td className={TD}>{t.sp}</td>
      <td className={TD}>{t.w}</td>
      <td className={TD}>{t.d}</td>
      <td className={TD}>{t.l}</td>
      <td className={`hidden whitespace-nowrap sm:table-cell ${TD}`}>{t.gf}:{t.ga}</td>
      <td className={TD}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
      <td className="px-2 py-1.5 text-center font-bold">{t.pts}</td>
    </tr>
  );
}

// Placeholder row for a group whose third place isn't decided yet — keeps the table at all 12 rows.
function PendingThirdRow({ code }) {
  const dash = <td className={TD}>–</td>;
  return (
    <tr className="border-t border-border text-muted">
      <td className="px-2 py-1.5">–</td>
      <td className="px-1 py-1.5 italic">noch offen</td>
      <td className="px-1 py-1.5 text-center font-semibold">{code}</td>
      {dash}{dash}{dash}{dash}
      <td className={`hidden sm:table-cell ${TD}`}>–</td>
      {dash}
      <td className="px-2 py-1.5 text-center font-bold">–</td>
    </tr>
  );
}

function HeadCells() {
  return (
    <>
      <th className={TH}>Sp</th>
      <th className={TH}>S</th>
      <th className={TH}>U</th>
      <th className={TH}>N</th>
      <th className={`hidden sm:table-cell ${TH}`}>Tore</th>
      <th className={TH}>+/-</th>
      <th className="px-2 py-1.5 text-center font-semibold">Pkt</th>
    </>
  );
}

// Collapsed-state glance: the four teams in standing order (place 1 left → 4 right) as a compact
// right-aligned row, flag over the country code (same flag size as the match cards). Hidden once the
// item is expanded (the full table below then shows the same teams).
function GroupPreview({ table }) {
  return (
    <span className="ml-auto flex items-center gap-2.5 group-aria-[expanded=true]:hidden sm:gap-4">
      {table.map((t) => (
        <span key={t.code} className="flex flex-col items-center gap-0.5">
          <Flag code={t.code} sm />
          <span className="text-[9px] font-semibold uppercase leading-none text-muted">{t.code}</span>
        </span>
      ))}
    </span>
  );
}

// "Gruppenphase" tab: each group is a collapsible accordion item — collapsed shows the group name +
// the four teams in standing order; expanded shows the full standings table + the group's matches.
// Below the groups, the best-thirds table (top 8 highlighted), likewise collapsible.
export default function GroupStage({ groupCodes, matches, teams, st, me, teamLabel, teamCode, score, onOpenMatch, onOpenBroadcasts }) {
  const codes = groupCodes.filter((c) => matches.some((m) => m.ph === c));
  const thirds = thirdPlaceTable(groupCodes, matches, st.results, teams);
  const filled = new Set(thirds.map((t) => t.group));
  const pending = groupCodes.filter((c) => !filled.has(c)); // groups still to be decided → placeholder rows

  return (
    <Accordion variant="default" allowsMultipleExpanded hideSeparator className="space-y-2">
      {codes.map((code) => {
        const ms = matches.filter((m) => m.ph === code);
        const label = PHASES.find((p) => p.code === code)?.label || code;
        const table = groupStandings(code, matches, st.results, teams);
        return (
          <Accordion.Item key={code} id={code} className="overflow-hidden rounded-xl bg-background-secondary">
            <Accordion.Heading>
              <Accordion.Trigger className="group">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
                  <GroupPreview table={table} />
                </span>
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="px-2 py-1.5 text-left font-semibold">#</th>
                        <th className="px-1 py-1.5 text-left font-semibold">Team</th>
                        <HeadCells />
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((t, i) => <StandRow key={t.code} t={t} rank={i + 1} highlight={i < 2} />)}
                    </tbody>
                  </table>
                </div>

                {/* matches as a compact 2×3 grid (3 per row on ≥sm) */}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                        serverNow={st.locks?.serverNow}
                        liveMinuteOn={st.capabilities?.liveMinute === true}
                        broadcasts={st.broadcasts?.[m.n] || []}
                        onOpen={() => onOpenMatch(m.n)}
                        onOpenBroadcasts={() => onOpenBroadcasts(m.n)}
                        compact
                      />
                    );
                  })}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}

      {/* Best third-placed teams — the 8 of 12 that advance (filled as groups finish). */}
      <Accordion.Item id="thirds" className="overflow-hidden rounded-xl bg-background-secondary">
        <Accordion.Heading>
          <Accordion.Trigger className="group">
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 pr-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Beste Drittplatzierte</span>
              <span className="text-[11px] font-normal normal-case text-muted">Top 8 erreichen die K.-o.-Runde</span>
            </span>
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1.5 text-left font-semibold">#</th>
                    <th className="px-1 py-1.5 text-left font-semibold">Team</th>
                    <th className="px-1 py-1.5 text-center font-semibold">Gr.</th>
                    <HeadCells />
                  </tr>
                </thead>
                <tbody>
                  {/* decided thirds ranked + highlighted (top 8 qualify), then one placeholder per open group → always 12 rows */}
                  {thirds.map((t, i) => (
                    <StandRow key={t.code} t={t} rank={i + 1} highlight={i < 8}
                      extra={<td className="px-1 py-1.5 text-center font-semibold text-muted">{t.group}</td>} />
                  ))}
                  {pending.map((code) => <PendingThirdRow key={code} code={code} />)}
                </tbody>
              </table>
            </div>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
