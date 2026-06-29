import { useMemo, useState } from "react";
import { SearchField, Button, Popover, Switch, Label, ToggleButton, ToggleButtonGroup, Accordion } from "@heroui/react";
import { ArrowDownUp, SlidersHorizontal } from "lucide-react";
import MatchCard from "./MatchCard.jsx";
import { kickoffMs, isLive, delayLabel } from "@/lib/matchtime.js";

const dayKey = (m) => m.dt.slice(0, 10);
const dayLabel = (m) => m.disp.split(" · ")[0]; // "Do, 11.06."
const isGroup = (m) => /^[A-L]$/.test(m.ph);    // group letter vs. K.o. code (R32/R16/QF/SF/P3/FIN)

// "Chronologisch" tab: live matches pinned on top (above the search, unfiltered), then a
// search / sort / filter bar, then ALL matches (past + upcoming). In the default
// chronological view, past matches are tucked into a collapsed accordion so you land on
// the upcoming fixtures; explicit sorts/filters render a flat day-grouped list.
export default function UpcomingTab({ matches, st, me, teamLabel, teamCode, isConfirmed, score, onOpenMatch, onOpenBroadcasts }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("asc");     // "asc" | "desc" | "points"
  const [status, setStatus] = useState("all"); // "all" | "upcoming" | "finished"
  const [phase, setPhase] = useState("all");   // "all" | "group" | "ko"
  const [openOnly, setOpenOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const now = Date.now();
  const hasResult = (m) => { const r = st.results[m.n]; return !!(r && r.h !== "" && r.a !== ""); };
  const isPast = (m) => hasResult(m) || kickoffMs(m.dt) <= now; // played, or already kicked off (live is excluded below)
  const pts = (m) => score((st.tips[me] || {})[m.n], st.results[m.n], st.resolved?.[m.n]);

  const card = (m) => {
    const result = st.results[m.n];
    const myTip = (st.tips[me] || {})[m.n];
    return (
      <MatchCard
        key={m.n}
        match={m}
        home={{ label: teamLabel(m, "h"), code: teamCode(m, "h") }}
        away={{ label: teamLabel(m, "a"), code: teamCode(m, "a") }}
        result={result}
        points={score(myTip, result, st.resolved?.[m.n])}
        joker={myTip?.joker}
        hasTip={!!(myTip && (myTip.h !== "" || myTip.a !== ""))}
        locked={(st.locks?.lockedMatches || []).includes(m.n)}
        inactive={!isConfirmed(m)}
        live={st.live?.[m.n]}
        detail={st.details?.[m.n]}
        serverNow={st.locks?.serverNow}
        liveMinuteOn={st.capabilities?.liveMinute === true}
        broadcasts={st.broadcasts?.[m.n] || []}
        onOpen={() => onOpenMatch(m.n)}
        onOpenBroadcasts={() => onOpenBroadcasts(m.n)}
      />
    );
  };

  // Live matches → pinned bar (always shown, independent of search/sort/filter).
  const liveMatches = useMemo(
    () => matches.filter((m) => isLive(m.dt, hasResult(m), now)).sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt)),
    [matches, st.results, st.live], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const liveSet = useMemo(() => new Set(liveMatches.map((m) => m.n)), [liveMatches]);

  // Filtered + sorted list (live excluded — it lives in the pinned bar).
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = matches.filter((m) => !liveSet.has(m.n));
    if (status === "upcoming") rows = rows.filter((m) => !hasResult(m) && kickoffMs(m.dt) > now);
    else if (status === "finished") rows = rows.filter(hasResult);
    if (phase === "group") rows = rows.filter(isGroup);
    else if (phase === "ko") rows = rows.filter((m) => !isGroup(m));
    if (openOnly) rows = rows.filter((m) => {
      const t = (st.tips[me] || {})[m.n];
      const tipped = t && (t.h !== "" || t.a !== "");
      const locked = (st.locks?.lockedMatches || []).includes(m.n);
      return isConfirmed(m) && !locked && !tipped && kickoffMs(m.dt) > now;
    });
    if (q) rows = rows.filter((m) =>
      `${teamLabel(m, "h")} ${teamLabel(m, "a")} ${teamCode(m, "h") || ""} ${teamCode(m, "a") || ""} ${m.ven} ${m.disp} ${m.ph}`.toLowerCase().includes(q));
    if (sort === "points") rows = [...rows].sort((a, b) => (pts(b) ?? -1) - (pts(a) ?? -1) || kickoffMs(a.dt) - kickoffMs(b.dt));
    else { rows = [...rows].sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt)); if (sort === "desc") rows.reverse(); }
    return rows;
  }, [matches, liveSet, query, sort, status, phase, openOnly, st, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render matches with sticky-free day headers (chrono sorts); flat for the points sort.
  const renderRows = (rows, grouped) => {
    const counts = {};
    if (grouped) for (const m of rows) counts[dayKey(m)] = (counts[dayKey(m)] || 0) + 1;
    const out = [];
    let lastDay = null;
    for (const m of rows) {
      if (grouped) {
        const dk = dayKey(m);
        if (dk !== lastDay) {
          out.push(
            <div key={`d-${dk}`} className="flex items-baseline justify-between px-1 pt-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span>{dayLabel(m)}</span><span className="font-normal normal-case">{counts[dk]} {counts[dk] === 1 ? "Spiel" : "Spiele"}</span>
            </div>,
          );
          lastDay = dk;
        }
      }
      out.push(card(m));
    }
    return out;
  };

  const grouped = sort !== "points";
  const past = sort === "asc" ? list.filter(isPast).reverse() : []; // newest finished match first
  const upcoming = sort === "asc" ? list.filter((m) => !isPast(m)) : [];
  const useAccordion = past.length > 0 && upcoming.length > 0; // both present (default chrono view)

  const activeFilters = (status !== "all" ? 1 : 0) + (phase !== "all" ? 1 : 0) + (openOnly ? 1 : 0);
  const resetFilters = () => { setStatus("all"); setPhase("all"); setOpenOnly(false); };
  const pickOne = (set, close) => (keys) => { const k = [...keys][0]; if (k != null) { set(String(k)); close?.(); } };
  const delay = delayLabel(st.capabilities?.delaySeconds ?? 180);

  return (
    <div className="space-y-3">
      {/* LIVE — pinned above the search, always shown, unaffected by search/sort/filter */}
      {liveMatches.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-app-accent/40 bg-app-accent/5 p-2">
          <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-app-accent">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-app-accent/60" /><span className="relative inline-flex size-2 rounded-full bg-app-accent" /></span>
            Live{delay && <span className="font-normal normal-case text-muted">· {delay}</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">{liveMatches.map(card)}</div>
        </div>
      )}

      {/* Search · Sort · Filter */}
      <div className="flex items-center gap-2">
        <SearchField aria-label="Spiele suchen" value={query} onChange={setQuery} className="min-w-0 flex-1">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Team, Stadion, Spieltag …" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <Popover isOpen={sortOpen} onOpenChange={setSortOpen}>
          <Button variant="secondary" size="sm" aria-label="Sortieren" className="shrink-0"><ArrowDownUp size={15} /></Button>
          <Popover.Content placement="bottom end" className="w-56">
            <Popover.Dialog>
              <Popover.Arrow />
              <Popover.Heading>Sortieren</Popover.Heading>
              <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Sortierung" className="mt-2 w-full"
                selectedKeys={new Set([sort])} onSelectionChange={pickOne(setSort, () => setSortOpen(false))}>
                <ToggleButton id="asc" className="flex-1">Älteste</ToggleButton>
                <ToggleButton id="desc" className="flex-1">Neueste</ToggleButton>
                <ToggleButton id="points" className="flex-1">Punkte</ToggleButton>
              </ToggleButtonGroup>
              <p className="mt-2 text-[11px] text-muted">„Punkte" sortiert beendete Spiele nach deinem erzielten Score.</p>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        <Popover isOpen={filterOpen} onOpenChange={setFilterOpen}>
          <Button variant="secondary" size="sm" aria-label="Filter" className="relative shrink-0">
            <SlidersHorizontal size={15} />
            {activeFilters > 0 && <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-app-accent text-[10px] font-bold text-white">{activeFilters}</span>}
          </Button>
          <Popover.Content placement="bottom end" className="w-64">
            <Popover.Dialog>
              <Popover.Arrow />
              <Popover.Heading className="flex items-center justify-between">Filter{activeFilters > 0 && <Button variant="tertiary" size="sm" onPress={resetFilters}>Zurücksetzen</Button>}</Popover.Heading>
              <div className="mt-2 flex flex-col gap-3">
                <div>
                  <div className="mb-1 text-xs text-muted">Status</div>
                  <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Status" className="w-full"
                    selectedKeys={new Set([status])} onSelectionChange={pickOne(setStatus)}>
                    <ToggleButton id="all" className="flex-1">Alle</ToggleButton>
                    <ToggleButton id="upcoming" className="flex-1">Anstehend</ToggleButton>
                    <ToggleButton id="finished" className="flex-1">Beendet</ToggleButton>
                  </ToggleButtonGroup>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted">Phase</div>
                  <ToggleButtonGroup selectionMode="single" disallowEmptySelection size="sm" aria-label="Phase" className="w-full"
                    selectedKeys={new Set([phase])} onSelectionChange={pickOne(setPhase)}>
                    <ToggleButton id="all" className="flex-1">Alle</ToggleButton>
                    <ToggleButton id="group" className="flex-1">Gruppe</ToggleButton>
                    <ToggleButton id="ko" className="flex-1">K.o.</ToggleButton>
                  </ToggleButtonGroup>
                </div>
                <Switch size="sm" isSelected={openOnly} onChange={setOpenOnly}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label className="text-sm">Nur offene Tipps</Label><span className="text-xs text-muted">tippbar & noch nicht getippt</span></Switch.Content>
                </Switch>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">Keine Spiele für diese Auswahl.</p>
      ) : useAccordion ? (
        <div className="space-y-2">
          <Accordion variant="default" hideSeparator>
            <Accordion.Item id="past" className="overflow-hidden rounded-xl bg-background-secondary">
              <Accordion.Heading>
                <Accordion.Trigger>
                  Vergangene Spiele<span className="ml-1.5 font-normal text-muted">{past.length}</span>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="space-y-2">{renderRows(past, true)}</Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          {renderRows(upcoming, true)}
        </div>
      ) : (
        <div className="space-y-2">{renderRows(list, grouped)}</div>
      )}
    </div>
  );
}
