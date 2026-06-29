import { Accordion, Table } from "@heroui/react";
import { groupStandings, thirdPlaceTable } from "./groups.js";
import { PHASES } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import MatchCard from "./MatchCard.jsx";

const TH = "px-1 py-1.5 text-center font-semibold text-muted";
const TD = "px-1 py-1.5 text-center text-muted";

// Cells/columns are returned as arrays (not wrapper components) so they stay direct Table
// children — React Aria collections don't traverse custom components to find Column/Cell.
const statColumns = () => [
  <Table.Column key="sp" className={TH}>Sp</Table.Column>,
  <Table.Column key="w" className={TH}>S</Table.Column>,
  <Table.Column key="d" className={TH}>U</Table.Column>,
  <Table.Column key="l" className={TH}>N</Table.Column>,
  <Table.Column key="gf" className={`hidden sm:table-cell ${TH}`}>Tore</Table.Column>,
  <Table.Column key="gd" className={TH}>+/-</Table.Column>,
  <Table.Column key="pts" className="px-2 py-1.5 text-center font-semibold text-muted">Pkt</Table.Column>,
];
const statCells = (t) => [
  <Table.Cell key="sp" className={TD}>{t.sp}</Table.Cell>,
  <Table.Cell key="w" className={TD}>{t.w}</Table.Cell>,
  <Table.Cell key="d" className={TD}>{t.d}</Table.Cell>,
  <Table.Cell key="l" className={TD}>{t.l}</Table.Cell>,
  <Table.Cell key="gf" className={`hidden whitespace-nowrap sm:table-cell ${TD}`}>{t.gf}:{t.ga}</Table.Cell>,
  <Table.Cell key="gd" className={TD}>{t.gd > 0 ? `+${t.gd}` : t.gd}</Table.Cell>,
  <Table.Cell key="pts" className="px-2 py-1.5 text-center font-bold">{t.pts}</Table.Cell>,
];

// One standings row's cells (rank, team, [source group], stats). `extra` inserts the
// group-letter cell used only by the best-thirds table.
const rowCells = (t, rank, extra) => [
  <Table.Cell key="rank" className="px-2 py-1.5 text-muted">{rank}</Table.Cell>,
  <Table.Cell key="team" className="px-1 py-1.5" textValue={t.name}>
    <span className="flex items-center gap-1.5"><Flag code={t.code} sm /><span className="truncate font-semibold">{t.name}</span></span>
  </Table.Cell>,
  ...(extra ? [extra] : []),
  ...statCells(t),
];

// Placeholder row cells for a group whose third place isn't decided yet — keeps the thirds table at 12 rows.
const pendingCells = (code) => [
  <Table.Cell key="rank" className="px-2 py-1.5">–</Table.Cell>,
  <Table.Cell key="team" className="px-1 py-1.5 italic" textValue="noch offen">noch offen</Table.Cell>,
  <Table.Cell key="gr" className="px-1 py-1.5 text-center font-semibold">{code}</Table.Cell>,
  <Table.Cell key="sp" className={TD}>–</Table.Cell>,
  <Table.Cell key="w" className={TD}>–</Table.Cell>,
  <Table.Cell key="d" className={TD}>–</Table.Cell>,
  <Table.Cell key="l" className={TD}>–</Table.Cell>,
  <Table.Cell key="gf" className={`hidden sm:table-cell ${TD}`}>–</Table.Cell>,
  <Table.Cell key="gd" className={TD}>–</Table.Cell>,
  <Table.Cell key="pts" className="px-2 py-1.5 text-center font-bold">–</Table.Cell>,
];

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
                <Table variant="primary" aria-label={`Tabelle ${label}`} className="text-xs">
                  <Table.ScrollContainer>
                    <Table.Content aria-label={`Tabelle ${label}`}>
                      <Table.Header>
                        <Table.Column className="px-2 py-1.5 text-left font-semibold text-muted">#</Table.Column>
                        <Table.Column isRowHeader className="px-1 py-1.5 text-left font-semibold text-muted">Team</Table.Column>
                        {statColumns()}
                      </Table.Header>
                      <Table.Body>
                        {table.map((t, i) => (
                          <Table.Row key={t.code} id={t.code} className={i < 2 ? "*:bg-app-accent/10" : ""}>
                            {rowCells(t, i + 1)}
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>

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
                        joker={myTip?.joker}
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
            <Table variant="primary" aria-label="Beste Drittplatzierte" className="text-xs">
              <Table.ScrollContainer>
                <Table.Content aria-label="Beste Drittplatzierte">
                  <Table.Header>
                    <Table.Column className="px-2 py-1.5 text-left font-semibold text-muted">#</Table.Column>
                    <Table.Column isRowHeader className="px-1 py-1.5 text-left font-semibold text-muted">Team</Table.Column>
                    <Table.Column className="px-1 py-1.5 text-center font-semibold text-muted">Gr.</Table.Column>
                    {statColumns()}
                  </Table.Header>
                  <Table.Body>
                    {/* decided thirds ranked + highlighted (top 8 qualify), then one placeholder per open group → always 12 rows */}
                    {[
                      ...thirds.map((t, i) => (
                        <Table.Row key={t.code} id={t.code} className={i < 8 ? "*:bg-app-accent/10" : ""}>
                          {rowCells(t, i + 1, <Table.Cell key="gr" className="px-1 py-1.5 text-center font-semibold text-muted">{t.group}</Table.Cell>)}
                        </Table.Row>
                      )),
                      ...pending.map((code) => (
                        <Table.Row key={`p-${code}`} id={`p-${code}`} className="text-muted">
                          {pendingCells(code)}
                        </Table.Row>
                      )),
                    ]}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
