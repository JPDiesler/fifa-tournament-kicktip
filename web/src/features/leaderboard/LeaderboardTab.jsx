import { useState, useMemo } from "react";
import { Table, Pagination, Button, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { Check, X, Share2 } from "lucide-react";
import { known } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import PlayerName from "@/components/PlayerName.jsx";
import ScoreTrend from "./ScoreTrend.jsx";
import RecapCard from "./RecapCard.jsx";
import MyStatsTab from "@/features/stats/MyStatsTab.jsx";
import PointsHistory from "@/features/stats/PointsHistory.jsx";
import Head2Head from "@/features/stats/Head2Head.jsx";
import { playerStats, head2head } from "@/features/stats/stats.js";
import { shareStandings, shareBilanz, shareDuel } from "@/lib/shareImage.js";

const PAGE_SIZES = [10, 25, 50, Infinity]; // Infinity = "Alle"
const SUBTABS = [["gesamt", "Gesamt"], ["persoenlich", "Persönlich"], ["duell", "Duell"]];

// Total = Tipp-Punkte + Erfolgs-Punkte. `sum` (server) already folds the achievement bonus in,
// so the pure tip points (match scores + WM-Tipp) are simply sum − achPoints.
const tipPts = (t) => t.sum - (t.achPoints || 0);
const SORT_VAL = { tipp: tipPts, ach: (t) => t.achPoints || 0, sum: (t) => t.sum, exact: (t) => t.exact };

// "Punktstand" tab: Gesamt (table + chart), Persönlich (Bilanz + history), Duell
// (head-to-head). One toolbar share button (next to the sub-tabs) exports the
// active view as a PNG.
export default function LeaderboardTab({ totals, matchdays = [], me, st, teams, championActual, teamLabel }) {
  const [mode, setMode] = useState("gesamt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [duelA, setDuelA] = useState(null);
  const [duelB, setDuelB] = useState(null);
  const [sortDescriptor, setSortDescriptor] = useState({ column: "sum", direction: "descending" });

  // `totals` arrives in canonical standing order (by sum, then exact) — keep that for ties so the
  // table stays stable, and let the user re-sort by any points column.
  const sorted = useMemo(() => {
    const f = SORT_VAL[sortDescriptor.column] || SORT_VAL.sum;
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;
    const order = new Map(totals.map((t, i) => [t.p, i]));
    return [...totals].sort((a, b) => (f(a) - f(b)) * dir || order.get(a.p) - order.get(b.p));
  }, [totals, sortDescriptor]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = pageSize === Infinity ? sorted : sorted.slice(start, start + pageSize);
  const paged = totals.length > 10; // only show controls beyond the default page
  const today = new Date().toLocaleDateString("de-DE");

  // duel selection lives here so the toolbar share button can reuse it
  const players = totals.map((t) => ({ p: t.p, name: t.name || t.p }));
  const a = duelA || (me && totals.some((t) => t.p === me) ? me : totals[0]?.p);
  const b = duelB || totals.find((t) => t.p !== a)?.p;
  const pickA = (x) => { setDuelA(x); if (x === b) setDuelB(players.find((p) => p.p !== x)?.p); };
  const pickB = (x) => { setDuelB(x); if (x === a) setDuelA(players.find((p) => p.p !== x)?.p); };

  const canShare = (mode === "gesamt" && totals.length > 0) || (mode === "persoenlich" && !!me) || (mode === "duell" && totals.length >= 2);
  const onShare = () => {
    if (mode === "gesamt") shareStandings(totals, { me, date: today });
    else if (mode === "persoenlich" && me) {
      const s = playerStats(me, st);
      const rank = totals.findIndex((r) => r.p === me) + 1;
      const row = totals.find((r) => r.p === me);
      shareBilanz(s, { name: row?.name || me, rank: rank || null, total: row ? row.sum : s.sum, boardLen: totals.length, date: today });
    } else if (mode === "duell") shareDuel(head2head(a, b, st, totals), { date: today });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Ansicht"
          selectedKeys={new Set([mode])} onSelectionChange={(keys) => { const k = [...keys][0]; if (k) setMode(String(k)); }}>
          {SUBTABS.map(([k, l]) => <ToggleButton key={k} id={k}>{l}</ToggleButton>)}
        </ToggleButtonGroup>
        {canShare && (
          <Button isIconOnly variant="secondary" size="sm" aria-label="Als Bild teilen" onPress={onShare}>
            <Share2 size={15} />
          </Button>
        )}
      </div>

      {mode === "gesamt" && (
        <div className="space-y-3">
          <RecapCard recap={st?.recap} />
          <Table variant="primary" aria-label="Rangliste">
            <Table.ScrollContainer>
              <Table.Content aria-label="Rangliste" sortDescriptor={sortDescriptor} onSortChange={(d) => { setSortDescriptor(d); setPage(1); }}>
                <Table.Header>
                  <Table.Column isRowHeader className="whitespace-nowrap px-2 sm:px-4">#</Table.Column>
                  <Table.Column className="whitespace-nowrap px-2 sm:px-4">Spieler</Table.Column>
                  <Table.Column allowsSorting id="tipp" className="whitespace-nowrap px-2 sm:px-4">
                    {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Tipp</Table.SortableColumnHeader>}
                  </Table.Column>
                  <Table.Column allowsSorting id="ach" className="whitespace-nowrap px-2 sm:px-4">
                    {({ sortDirection }) => (
                      <Table.SortableColumnHeader sortDirection={sortDirection}>
                        <span className="sm:hidden">Erf.</span><span className="hidden sm:inline">Erfolge</span>
                      </Table.SortableColumnHeader>
                    )}
                  </Table.Column>
                  <Table.Column allowsSorting id="sum" className="whitespace-nowrap px-2 sm:px-4">
                    {({ sortDirection }) => (
                      <Table.SortableColumnHeader sortDirection={sortDirection}>
                        <span className="sm:hidden">Ges.</span><span className="hidden sm:inline">Gesamt</span>
                      </Table.SortableColumnHeader>
                    )}
                  </Table.Column>
                  <Table.Column allowsSorting id="exact" className="hidden whitespace-nowrap px-2 sm:table-cell sm:px-4">
                    {({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>Exakt</Table.SortableColumnHeader>}
                  </Table.Column>
                  <Table.Column className="hidden whitespace-nowrap px-2 sm:table-cell sm:px-4">WM-Tipp</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((t, i) => (
                    <Table.Row key={t.p} id={t.p} className={t.p === me ? "bg-accent/10" : ""}>
                      <Table.Cell className="px-2 font-bold text-muted sm:px-4">{start + i + 1}</Table.Cell>
                      <Table.Cell className="px-2 sm:px-4">
                        <PlayerName kuerzel={t.p} showName className="max-w-[7.5rem] font-semibold sm:max-w-none" />
                        {t.name && t.name !== t.p && <div className="text-xs text-muted">{t.p}</div>}
                      </Table.Cell>
                      <Table.Cell className="px-2 text-center font-semibold sm:px-4">{tipPts(t)}</Table.Cell>
                      <Table.Cell className="px-2 text-center sm:px-4">
                        <span className={t.achPoints ? "font-semibold text-app-accent" : "text-muted"}>{t.achPoints ? `+${t.achPoints}` : 0}</span>
                      </Table.Cell>
                      <Table.Cell className="px-2 text-center text-base font-bold text-success sm:px-4">{t.sum}</Table.Cell>
                      <Table.Cell className="hidden px-2 text-center text-muted sm:table-cell sm:px-4">{t.exact}</Table.Cell>
                      <Table.Cell className="hidden px-2 sm:table-cell sm:px-4">
                        {t.champ ? (
                          <span className="inline-flex items-center gap-1.5">
                            {known(t.champ) && <Flag code={t.champ} sm />}
                            {/* mobile: flag + code only; from sm up the full team name */}
                            <span className="sm:hidden">{t.champ}</span>
                            <span className="hidden sm:inline">{teams[t.champ] ? teams[t.champ].name : t.champ}</span>
                            {championActual && (t.champHit ? <Check size={14} className="text-success" /> : <X size={14} className="text-muted" />)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>

          {paged && (
            // Pagination root is w-full + justify-between → Summary (page size) sits
            // left, Content (page links) right. flex-row keeps it on one line on mobile.
            <Pagination className="mb-8 flex-row items-center">
              <Pagination.Summary>
                <div className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <span className="mr-1 hidden sm:inline">Pro Seite:</span>
                  <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Pro Seite"
                    selectedKeys={new Set([String(pageSize)])}
                    onSelectionChange={(keys) => { const k = [...keys][0]; if (k != null) { setPageSize(k === "Infinity" ? Infinity : Number(k)); setPage(1); } }}>
                    {PAGE_SIZES.map((s) => <ToggleButton key={String(s)} id={String(s)}>{s === Infinity ? "Alle" : s}</ToggleButton>)}
                  </ToggleButtonGroup>
                </div>
              </Pagination.Summary>
              {pageCount > 1 && (
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous isDisabled={safePage === 1} onPress={() => setPage(safePage - 1)}>
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <Pagination.Item key={p}>
                      <Pagination.Link isActive={p === safePage} onPress={() => setPage(p)}>{p}</Pagination.Link>
                    </Pagination.Item>
                  ))}
                  <Pagination.Item>
                    <Pagination.Next isDisabled={safePage === pageCount} onPress={() => setPage(safePage + 1)}>
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              )}
            </Pagination>
          )}

          <ScoreTrend matchdays={matchdays} totals={totals} me={me} />
        </div>
      )}

      {mode === "persoenlich" && (
        <div className="space-y-3">
          <MyStatsTab me={me} st={st} board={totals} matchdays={matchdays} teams={teams} />
          {me && <PointsHistory me={me} st={st} teamLabel={teamLabel} />}
        </div>
      )}

      {mode === "duell" && (
        <Head2Head st={st} board={totals} teamLabel={teamLabel} a={a} b={b} onA={pickA} onB={pickB} />
      )}
    </div>
  );
}
