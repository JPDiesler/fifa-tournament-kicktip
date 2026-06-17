import { useState } from "react";
import { Drawer, Chip } from "@heroui/react";
import { Lock, Info } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import PlayerName from "@/components/PlayerName.jsx";
import Carousel from "@/components/Carousel.jsx";
import AiReasoning from "./AiReasoning.jsx";
import ScoreInput from "./ScoreInput.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import BroadcastButtons from "@/features/broadcasts/BroadcastButtons.jsx";
import { LiveTag, LivePhase } from "./LiveBadge.jsx";
import Lineups from "./Lineups.jsx";
import MatchTimeline from "./MatchTimeline.jsx";
import MatchStats from "./MatchStats.jsx";
import PreMatch from "./PreMatch.jsx";
import OddsView from "./OddsView.jsx";
import { PHASES } from "@/lib/scoring.js";
import { countdown, kickoffMs, delayLabel, finalClockLabel } from "@/lib/matchtime.js";

// Bottom-sheet detail for one match. A fixed teams+score header on top; below it a
// swipeable carousel whose sections appear only when their data exists (Tipps always,
// then Spielverlauf, Aufstellung — Statistik/Pre-Match plug in here too).
export default function MatchDetail({ match, isOpen, onClose, st, board, me, teamLabel, teamCode, score, onTip }) {
  const [reasonFor, setReasonFor] = useState(null); // kürzel of the AI tip whose reasoning is open
  const broadcasts = match ? (st.broadcasts?.[match.n] || []) : [];
  if (!match) {
    return <Drawer.Backdrop isOpen={false} onOpenChange={() => onClose()}><Drawer.Content placement="bottom"><Drawer.Dialog /></Drawer.Content></Drawer.Backdrop>;
  }
  const n = match.n;
  const result = st.results[n];
  const hasResult = result && result.h !== "" && result.a !== "";
  const locked = (st.locks?.lockedMatches || []).includes(n);
  const myTip = (st.tips[me] || {})[n] || { h: "", a: "" };
  const home = { label: teamLabel(match, "h"), code: teamCode(match, "h") };
  const away = { label: teamLabel(match, "a"), code: teamCode(match, "a") };
  const ready = !!(home.code && away.code); // pairing fixed (both teams known)?
  const phaseLabel = PHASES.find((p) => p.code === match.ph)?.label || "";
  const cd = !hasResult ? countdown(match.dt) : null;
  const past = hasResult || kickoffMs(match.dt) + 3 * 3600000 < Date.now(); // match over → hide "where to watch"
  const live = st.live?.[n];
  const isLiveMatch = !hasResult && !!live;             // running → show scoreline (0:0 default) + badge
  const lh = live?.h || "0", la = live?.a || "0";
  const detail = st.details?.[n]; // { scorers, cards, subs, lineups, … } if a capable provider feeds them

  // Points score against the final result, or — while a match runs — provisionally
  // against the (delayed) live score. Powers the live tip comparison below.
  const effRes = hasResult ? result : (isLiveMatch ? { h: String(lh), a: String(la) } : null);
  const myPoints = score(myTip, effRes);
  const tipped = (board || [])
    .map((b) => ({ k: b.p, isMe: b.p === me, tip: (st.tips[b.p] || {})[n], pts: score((st.tips[b.p] || {})[n], effRes) }))
    .filter((o) => o.tip && (o.tip.h !== "" || o.tip.a !== ""));
  const displayList = effRes
    ? [...tipped].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)) // live/final → leader first (incl. me)
    : tipped.filter((o) => !o.isMe);                           // pre-score → just the others' tips

  // --- carousel sections (only those with data) ---
  const tippsSection = (
    <div className="space-y-5 pb-4">
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
        {!me && <p className="mt-2 text-center text-xs text-muted">Kein Kürzel zugewiesen.</p>}
        {me && !ready && <p className="mt-2 text-center text-xs text-muted">Paarung steht noch nicht fest – Tippen ab dann möglich.</p>}
      </div>

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
                    <span className="tabular-nums">{o.tip.h}:{o.tip.a}</span>
                    <PointsBadge points={o.pts} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const hasStats = detail?.stats && (Object.keys(detail.stats.home || {}).length > 0 || Object.keys(detail.stats.away || {}).length > 0);
  const preKickoff = !hasResult && !isLiveMatch;
  const sections = [{ id: "tipps", label: "Tipps", content: tippsSection }];
  // pre-match info first (hidden once played)
  if (broadcasts.length > 0 && !past)
    sections.push({ id: "tv", label: "Übertragung", content: <div className="pb-4"><BroadcastButtons keys={broadcasts} /></div> });
  if (detail?.preview && preKickoff)
    sections.push({ id: "prematch", label: "Vorschau", content: <div className="pb-4"><PreMatch preview={detail.preview} home={home} away={away} /></div> });
  if (detail?.preview?.odds && preKickoff)
    sections.push({ id: "quoten", label: "Quoten", content: <div className="pb-4"><OddsView odds={detail.preview.odds} home={home} away={away} /></div> });
  // live / post
  if (detail && (detail.scorers?.length > 0 || detail.cards?.length > 0 || detail.subs?.length > 0))
    sections.push({ id: "verlauf", label: "Spielverlauf", content: <div className="pb-4"><MatchTimeline detail={detail} home={home} away={away} /></div> });
  if (hasStats)
    sections.push({ id: "statistik", label: "Statistik", content: <div className="pb-4"><MatchStats stats={detail.stats} /></div> });
  if (detail?.lineups)
    sections.push({ id: "aufstellung", label: "Aufstellung", content: <div className="pb-4"><Lineups lineups={detail.lineups} home={home} away={away} /></div> });

  return (
    <>
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col">
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
              </div>
            </div>

            {/* swipeable sections (Übertragung / Vorschau / Quoten / Verlauf / Statistik / Aufstellung) */}
            <Carousel sections={sections} className="mt-4" />
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
    <AiReasoning matchN={n} player={reasonFor} providerMeta={reasonFor ? st.players?.[reasonFor] : null} onClose={() => setReasonFor(null)} />
    </>
  );
}
