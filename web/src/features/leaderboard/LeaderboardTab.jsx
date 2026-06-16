import { useState } from "react";
import { Table, Pagination, Button } from "@heroui/react";
import { Check, X, Share2 } from "lucide-react";
import { known } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import PlayerName from "@/components/PlayerName.jsx";
import ScoreTrend from "./ScoreTrend.jsx";
import MyStatsTab from "@/features/stats/MyStatsTab.jsx";
import PointsHistory from "@/features/stats/PointsHistory.jsx";
import Head2Head from "@/features/stats/Head2Head.jsx";
import { playerStats, head2head } from "@/features/stats/stats.js";
import { shareStandings, shareBilanz, shareDuel } from "@/lib/shareImage.js";

const PAGE_SIZES = [10, 25, 50, Infinity]; // Infinity = "Alle"
const SUBTABS = [["gesamt", "Gesamt"], ["persoenlich", "Persönlich"], ["duell", "Duell"]];

// "Punktstand" tab: Gesamt (table + chart), Persönlich (Bilanz + history), Duell
// (head-to-head). One toolbar share button (next to the sub-tabs) exports the
// active view as a PNG.
export default function LeaderboardTab({ totals, matchdays = [], me, st, teams, championActual, teamLabel }) {
  const [mode, setMode] = useState("gesamt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [duelA, setDuelA] = useState(null);
  const [duelB, setDuelB] = useState(null);

  const pageCount = Math.max(1, Math.ceil(totals.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = pageSize === Infinity ? totals : totals.slice(start, start + pageSize);
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
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
          {SUBTABS.map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`rounded-md px-3 py-1 transition ${mode === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted"}`}>
              {l}
            </button>
          ))}
        </div>
        {canShare && (
          <Button isIconOnly variant="secondary" size="sm" aria-label="Als Bild teilen" onPress={onShare}>
            <Share2 size={15} />
          </Button>
        )}
      </div>

      {mode === "gesamt" && (
        <div className="space-y-3">
          <Table variant="primary" aria-label="Rangliste">
            <Table.ScrollContainer>
              <Table.Content aria-label="Rangliste">
                <Table.Header>
                  <Table.Column isRowHeader className="whitespace-nowrap px-2 sm:px-4">#</Table.Column>
                  <Table.Column className="whitespace-nowrap px-2 sm:px-4">Spieler</Table.Column>
                  <Table.Column className="whitespace-nowrap px-2 sm:px-4">
                    <span className="sm:hidden">Pkt</span><span className="hidden sm:inline">Punkte</span>
                  </Table.Column>
                  <Table.Column className="whitespace-nowrap px-2 sm:px-4">Exakt</Table.Column>
                  <Table.Column className="whitespace-nowrap px-2 sm:px-4">WM-Tipp</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((t, i) => (
                    <Table.Row key={t.p} id={t.p} className={t.p === me ? "bg-accent/10" : ""}>
                      <Table.Cell className="px-2 font-bold text-muted sm:px-4">{start + i + 1}</Table.Cell>
                      <Table.Cell className="px-2 sm:px-4">
                        <PlayerName kuerzel={t.p} showName className="max-w-[7.5rem] font-semibold sm:max-w-none" />
                        {t.name && t.name !== t.p && <div className="text-xs text-muted">{t.p}</div>}
                      </Table.Cell>
                      <Table.Cell className="px-2 text-center text-base font-bold text-success sm:px-4">{t.sum}</Table.Cell>
                      <Table.Cell className="px-2 text-center text-muted sm:px-4">{t.exact}</Table.Cell>
                      <Table.Cell className="px-2 sm:px-4">
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
                  <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                    {PAGE_SIZES.map((s) => (
                      <button key={s} onClick={() => { setPageSize(s); setPage(1); }}
                        className={`rounded-md px-2 py-0.5 transition ${pageSize === s ? "bg-accent font-semibold text-accent-foreground" : "text-muted"}`}>
                        {s === Infinity ? "Alle" : s}
                      </button>
                    ))}
                  </div>
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
