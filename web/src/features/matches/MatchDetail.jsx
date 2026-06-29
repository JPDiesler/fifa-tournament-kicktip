import { useEffect, useMemo, useState } from "react";
import { Drawer, Chip, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Info, AlarmClockOff, Check, Trophy } from "lucide-react";
import { MATCHES } from "@/data";
import Flag from "@/components/Flag.jsx";
import WinnerFlag from "@/components/WinnerFlag.jsx";
import PlayerName from "@/components/PlayerName.jsx";
import Carousel from "@/components/Carousel.jsx";
import AiReasoning from "./AiReasoning.jsx";
import StrategyBadge from "./aiStrategy.jsx";
import ScoreInput from "./ScoreInput.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import BroadcastChips from "@/features/broadcasts/BroadcastChips.jsx";
import { LiveTag, LivePhase } from "./LiveBadge.jsx";
import Lineups from "./Lineups.jsx";
import MatchTimeline from "./MatchTimeline.jsx";
import MatchStats from "./MatchStats.jsx";
import PreMatch from "./PreMatch.jsx";
import OddsView from "./OddsView.jsx";
import { PHASES } from "@/lib/scoring.js";
import PenaltyShootout from "./PenaltyShootout.jsx";
import { countdown, kickoffMs, delayLabel, finalClockLabel } from "@/lib/matchtime.js";
import { kitColor, FALLBACK_HOME, FALLBACK_AWAY } from "@/lib/teamColors.js";

// Last-known match-kit colour per team code, gathered from every match that already has
// a lineup — so charts can be team-coloured even before THIS match's lineup is published
// (api-football only ships kit colours with the lineup, ~40 min before kickoff). A team's
// HOME-kit appearance wins over its change-kit one (closer to its identity colour).
function buildKitColors(st, teamCode) {
  const seen = {}; // code → { color, home }
  for (const m of MATCHES) {
    const lu = st.details?.[m.n]?.lineups;
    if (!lu) continue;
    const hc = teamCode(m, "h"), ac = teamCode(m, "a");
    const hCol = kitColor(lu.home?.colors), aCol = kitColor(lu.away?.colors);
    if (hc && hCol && !seen[hc]?.home) seen[hc] = { color: hCol, home: true };  // home kit wins
    if (ac && aCol && !seen[ac]) seen[ac] = { color: aCol, home: false };       // change kit only as a stopgap
  }
  const out = {};
  for (const k in seen) out[k] = seen[k].color;
  return out;
}

// Bottom-sheet detail for one match. A fixed teams+score header on top; below it a
// swipeable carousel whose sections appear only when their data exists (Tipps always,
// then Spielverlauf, Aufstellung — Statistik/Pre-Match plug in here too).
export default function MatchDetail({ match, isOpen, onClose, st, board, me, teamLabel, teamCode, isConfirmed, score, onTip }) {
  const [reasonFor, setReasonFor] = useState(null); // kürzel of the AI tip whose reasoning is open
  const [aiStrategies, setAiStrategies] = useState({}); // kuerzel → strategy, for the per-tip badge
  const broadcasts = match ? (st.broadcasts?.[match.n] || []) : [];
  const kitByCode = useMemo(() => buildKitColors(st, teamCode), [st.details, teamCode]);
  // Fetch the AI players' chosen strategies once the tips are visible (locked) AND keep them
  // available after full-time (a finished match always has a result). {} for v1 predictions
  // without a strategy.
  const stratLocked = !!(isOpen && match && ((st.locks?.lockedMatches || []).includes(match.n) || (st.results?.[match.n]?.h ?? "") !== ""));
  useEffect(() => {
    setAiStrategies({});
    if (!stratLocked) return;
    let alive = true;
    fetch(`/api/ai-strategies?match=${match.n}`).then((r) => (r.ok ? r.json() : { strategies: {} })).then((d) => { if (alive) setAiStrategies(d.strategies || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [stratLocked, match]);
  if (!match) {
    return <Drawer.Backdrop isOpen={false} onOpenChange={() => onClose()}><Drawer.Content placement="bottom"><Drawer.Dialog /></Drawer.Content></Drawer.Backdrop>;
  }
  const n = match.n;
  const result = st.results[n];
  const hasResult = result && result.h !== "" && result.a !== "";
  const locked = (st.locks?.lockedMatches || []).includes(n);
  const myTip = (st.tips[me] || {})[n] || { h: "", a: "", w: "" };
  // Admin team overrides: nickname + logo (logo served via a versioned URL, not in state).
  const teamMetaFor = (code) => { const m = st.teamMeta?.[code]; return { nickname: m?.nickname, logo: m?.logoVer ? `/api/team-logo/${code}?v=${m.logoVer}` : undefined }; };
  const home = { label: teamLabel(match, "h"), code: teamCode(match, "h"), ...teamMetaFor(teamCode(match, "h")) };
  const away = { label: teamLabel(match, "a"), code: teamCode(match, "a"), ...teamMetaFor(teamCode(match, "a")) };
  const ready = isConfirmed(match); // official pairing (api-football) → tippable; a provisional clinch is not
  const phaseLabel = PHASES.find((p) => p.code === match.ph)?.label || "";
  const knockout = ["R32", "R16", "QF", "SF", "P3", "FIN"].includes(match.ph); // group games (A–L) have no extra time
  const isDrawTip = myTip.h !== "" && myTip.a !== "" && myTip.h === myTip.a;     // K.o. Remis-Tipp → braucht Sieger-Pick
  const winTeam = myTip.w === "h" ? home : myTip.w === "a" ? away : null;        // getippter Sieger (h/a)
  const cd = !hasResult ? countdown(match.dt) : null;
  const past = hasResult || kickoffMs(match.dt) + 3 * 3600000 < Date.now(); // match over → hide "where to watch"
  const live = st.live?.[n];
  const isLiveMatch = !hasResult && !!live;             // running → show scoreline (0:0 default) + badge
  const lh = live?.h || "0", la = live?.a || "0";
  const detail = st.details?.[n]; // { scorers, cards, subs, lineups, … } if a capable provider feeds them

  // Points score against the final result, or — while a match runs — provisionally
  // against the (delayed) live score. Powers the live tip comparison below.
  const effRes = hasResult ? result : (isLiveMatch ? { h: String(lh), a: String(la) } : null);
  const myPoints = score(myTip, effRes, st.resolved?.[n]);
  const tipped = (board || [])
    .map((b) => ({ k: b.p, isMe: b.p === me, tip: (st.tips[b.p] || {})[n], pts: score((st.tips[b.p] || {})[n], effRes, st.resolved?.[n]) }))
    .filter((o) => o.tip && (o.tip.h !== "" || o.tip.a !== ""));
  const displayList = effRes
    ? [...tipped].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)) // live/final → leader first (incl. me)
    : tipped.filter((o) => !o.isMe);                           // pre-score → just the others' tips
  // Players who didn't submit a tip before the lock → a "Deadline verpasst" hint (once tips are revealed).
  const missed = locked ? (board || []).filter((b) => { const t = (st.tips[b.p] || {})[n]; return !(t && (t.h !== "" || t.a !== "")); }) : [];

  // "Dein Tipp" lives directly in the (single-scroll) Drawer.Body below — NOT inside the swipe
  // carousel. The carousel pins a fixed pixel height and each slide scrolls on its own, so a focused
  // native input there scrolled the slide while the over-tall dialog overflowed the top on iOS. In
  // the plain body, react-aria simply scrolls the focused field into view above the keyboard.
  const tipCard = (
    <div className="rounded-xl border border-border bg-overlay p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold">Dein Tipp</span>
        {locked
          ? <Chip size="sm" className="border-0 bg-zinc-700 text-xs text-zinc-200"><Lock size={11} /> gesperrt</Chip>
          : <PointsBadge points={myPoints} />}
      </div>
      <div className="flex items-center justify-center gap-2">
        <ScoreInput value={myTip.h} isDisabled={locked || !me || !ready} onChange={(v) => onTip(n, "h", v)} label="Tipp Heim" />
        <span className="text-muted">:</span>
        <ScoreInput value={myTip.a} isDisabled={locked || !me || !ready} onChange={(v) => onTip(n, "a", v)} label="Tipp Gast" />
        {locked && myPoints !== null && <span className="ml-2"><PointsBadge points={myPoints} /></span>}
      </div>
      {/* K.o.: a Remis tip needs the eventual winner — reveals as soon as a draw is entered */}
      <AnimatePresence initial={false}>
        {knockout && isDrawTip && (
          <motion.div key="ko-winner" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="overflow-hidden">
            <div className="mt-3 flex flex-col items-center gap-2 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Trophy size={13} className="text-app-accent" /> Wer kommt weiter? <span className="font-normal text-muted">(n. Verl./Elfmeter)</span>
              </span>
              {locked ? (
                winTeam
                  ? <span className="flex items-center gap-1.5 rounded-lg bg-app-accent/15 px-2.5 py-1 text-sm font-semibold"><Flag code={winTeam.code} sm /> {winTeam.label} <Check size={14} className="text-app-accent" /></span>
                  : <span className="text-sm text-muted">nicht festgelegt</span>
              ) : (
                <>
                  <ToggleButtonGroup selectionMode="single" isDetached aria-label="Wer kommt weiter?" className="w-full gap-2" isDisabled={!me || !ready}
                    selectedKeys={myTip.w ? new Set([myTip.w]) : new Set()}
                    onSelectionChange={(keys) => onTip(n, "w", String([...keys][0] ?? ""))}>
                    {[["h", home], ["a", away]].map(([side, t]) => (
                      <ToggleButton key={side} id={side} variant="ghost"
                        className="relative h-auto flex-1 flex-col gap-1.5 rounded-xl border border-border p-3 data-[selected=false]:opacity-60 data-[selected=true]:border-app-accent data-[selected=true]:bg-app-accent/15">
                        {({ isSelected }) => (
                          <>
                            {isSelected && <Check size={15} className="absolute right-2 top-2 text-app-accent" />}
                            <Flag code={t.code} lg />
                            <span className="text-center text-xs font-semibold leading-tight">{t.label}</span>
                          </>
                        )}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  {!myTip.w && <span className="text-[11px] font-medium text-warning">Bitte Sieger festlegen</span>}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!me && <p className="mt-2 text-center text-xs text-muted">Kein Kürzel zugewiesen.</p>}
      {me && !ready && <p className="mt-2 text-center text-xs text-muted">Paarung steht noch nicht fest – Tippen ab dann möglich.</p>}
    </div>
  );

  // --- carousel sections (only those with data); the "Tipps" tab = the OTHERS' comparison ---
  const tippsSection = (
    <div className="pb-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            {isLiveMatch ? "Live-Tippvergleich" : hasResult ? "Tippvergleich" : "Tipps der anderen"}
          </span>
          {isLiveMatch && <span className="text-[10px] text-muted">Punkte vorläufig · Stand {lh}:{la}</span>}
        </div>
        {!locked ? (
          <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">Werden 5 Minuten vor Anpfiff sichtbar.</p>
        ) : displayList.length === 0 ? (
          <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">Niemand{effRes ? "" : " sonst"} hat getippt.</p>
        ) : (
          <div className="rounded-xl border border-border">
            {displayList.map((o, i) => {
              const isAi = !!st.players?.[o.k]?.isAi; // AI tips are clickable → reasoning
              return (
                <div key={o.k}
                  role={isAi ? "button" : undefined} tabIndex={isAi ? 0 : undefined}
                  onClick={isAi ? () => setReasonFor(o.k) : undefined}
                  onKeyDown={isAi ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setReasonFor(o.k); } } : undefined}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${i ? "border-t border-border" : ""} ${o.isMe ? "bg-accent/10" : ""} ${isAi ? "cursor-pointer hover:bg-overlay" : ""}`}>
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {effRes && <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>}
                    <PlayerName kuerzel={o.k} />{o.isMe && <span className="shrink-0 text-[10px] text-app-accent">du</span>}
                    {isAi && <Info size={13} className="shrink-0 text-muted" />}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isAi && <StrategyBadge strategy={aiStrategies[o.k]} />}
                    <span className="tabular-nums">{o.tip.h}:{o.tip.a}</span>
                    <WinnerFlag tip={o.tip} resolved={st.resolved?.[n]} />
                    <PointsBadge points={o.pts} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {locked && missed.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-overlay/40 px-3 py-2 text-[11px] text-muted">
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold"><AlarmClockOff size={12} /> Deadline verpasst:</span>
            {missed.map((b) => <span key={b.p} className={b.p === me ? "font-semibold text-app-accent" : ""}><PlayerName kuerzel={b.p} /></span>)}
          </div>
        )}
      </div>
    </div>
  );

  const hasStats = detail?.stats && (Object.keys(detail.stats.home || {}).length > 0 || Object.keys(detail.stats.away || {}).length > 0);
  const preview = detail?.preview;
  const liveOdds = isLiveMatch ? live?.odds : null;
  // Home/away chart colours: this match's kit (with the lineup) → the team's last-known
  // kit from an earlier match → neutral fallback.
  const homeColor = kitColor(detail?.lineups?.home?.colors) || kitByCode[home.code] || FALLBACK_HOME;
  const awayColor = kitColor(detail?.lineups?.away?.colors) || kitByCode[away.code] || FALLBACK_AWAY;
  // Prognose: pre-match forecast — shown through the live phase, hidden once finished.
  // The tab appears whenever we have a preview; PreMatch itself shows an info line when
  // the data isn't solid (api-football has no real prediction for some fixtures).
  const hasPrognose = !hasResult && !!preview;
  // Quoten: pre-match (all bookmakers) and/or in-play. Shown while not finished and there
  // are actual odds to display.
  const hasOdds = !hasResult && ((preview?.odds?.bookmakers?.length) || (liveOdds?.bookmakers?.length));
  // Order: Tipps · Spielverlauf · Aufstellung · Statistik · Prognose · Quoten (only those with data).
  const sections = [{ id: "tipps", label: "Tipps", content: tippsSection }];
  if (detail && (detail.scorers?.length > 0 || detail.cards?.length > 0 || detail.subs?.length > 0))
    sections.push({ id: "verlauf", label: "Spielverlauf", content: <div className="pb-4"><MatchTimeline detail={detail} home={home} away={away} /></div> });
  if (detail?.lineups)
    sections.push({ id: "aufstellung", label: "Aufstellung", content: <div className="pb-4"><Lineups lineups={detail.lineups} home={home} away={away} cards={detail.cards} playerStats={detail.playerStats} /></div> });
  if (hasStats)
    sections.push({ id: "statistik", label: "Statistik", content: <div className="pb-4"><MatchStats stats={detail.stats} homeColor={homeColor} awayColor={awayColor} /></div> });
  if (hasPrognose)
    sections.push({ id: "prognose", label: "Prognose", content: <div className="pb-4"><PreMatch preview={preview} home={home} away={away} homeColor={homeColor} awayColor={awayColor} knockout={knockout} /></div> });
  if (hasOdds)
    sections.push({ id: "quoten", label: "Quoten", content: <div className="pb-4"><OddsView odds={preview?.odds} live={liveOdds} model={preview?.percent} home={home} away={away} homeColor={homeColor} awayColor={awayColor} /></div> });

  return (
    <>
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content placement="bottom">
        {/* HeroUI bottom-aligns the sheet inside a fixed wrapper sized to --visual-viewport-height
            (it shrinks with the on-screen keyboard). Cap the sheet to min(88vh, that height): 88vh is
            the partial-sheet look when the keyboard is closed, but `vh` tracks the LAYOUT viewport
            (doesn't shrink on iOS), so without the var clamp a focused score input lets the
            bottom-aligned dialog overflow the top of the visible area ("flies up"). A class (not an
            inline style) keeps HeroUI's touchAction:'none', so drag-to-close still works. */}
        <Drawer.Dialog className="mx-auto flex w-full max-w-2xl flex-col max-h-[min(88vh,var(--visual-viewport-height))]">
          <Drawer.Handle />
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading className="text-sm text-muted">{phaseLabel} · Spiel {n}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
            {/* fixed: teams + big score */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <Flag code={home.code} /><span className="truncate text-sm font-semibold">{home.label}</span>
                <PenaltyShootout shootout={detail?.shootout} pen={hasResult ? detail?.pen : live?.pen} side="h" size="lg" className="mt-1.5" />
              </div>
              <div className="shrink-0 text-center">
                {hasResult ? (
                  <>
                    <div className="text-3xl font-extrabold tabular-nums">{result.h}:{result.a}</div>
                    {finalClockLabel(detail?.final) && <div className="text-[11px] text-muted">{finalClockLabel(detail.final)}</div>}
                  </>
                ) : isLiveMatch ? (
                  <div className="flex flex-col items-center gap-1 leading-none">
                    <LiveTag paused={live.phase === "HT"} className="text-[11px]" />
                    <div className="text-3xl font-extrabold tabular-nums">{lh}:{la}</div>
                    <LivePhase live={live} serverNow={st.locks?.serverNow} liveMinuteOn={st.capabilities?.liveMinute === true} className="text-[11px]" />
                    {delayLabel(st.capabilities?.delaySeconds ?? 180) && <span className="text-[10px] text-muted">{delayLabel(st.capabilities?.delaySeconds ?? 180)}</span>}
                  </div>
                ) : (
                  <div className={`text-xs ${cd ? "text-muted" : "font-bold text-app-accent"}`}>{cd || "läuft"}</div>
                )}
                <div className="mt-0.5 text-[11px] text-muted">{match.disp}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <Flag code={away.code} /><span className="truncate text-sm font-semibold">{away.label}</span>
                <PenaltyShootout shootout={detail?.shootout} pen={hasResult ? detail?.pen : live?.pen} side="a" size="lg" className="mt-1.5" />
              </div>
            </div>

            {/* where to watch: compact, centred logo chips under the score (hidden once played) */}
            {broadcasts.length > 0 && !past && <BroadcastChips keys={broadcasts} />}

            {/* your tip — in the body's single scroll (NOT the carousel) so the native keyboard
                reveals the focused field in place instead of overflowing the top on iOS */}
            <div className="mt-4">{tipCard}</div>

            {/* swipeable sections (Tippvergleich / Verlauf / Aufstellung / Statistik / Prognose / Quoten) */}
            <Carousel sections={sections} className="mt-4" />
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
    <AiReasoning matchN={n} player={reasonFor} providerMeta={reasonFor ? st.players?.[reasonFor] : null} home={home} away={away} onClose={() => setReasonFor(null)} />
    </>
  );
}
