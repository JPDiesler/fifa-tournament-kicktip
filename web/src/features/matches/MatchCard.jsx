import { Card } from "@heroui/react";
import { Lock, Check } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import { GoalIcon, CardIcon } from "@/components/MatchIcons.jsx";
import BroadcastPill from "@/features/broadcasts/BroadcastPill.jsx";
import LiveBadge, { LiveTag, LivePhase } from "./LiveBadge.jsx";
import { countdown, kickoffMs, eventMinute, goalMark, isRedCard } from "@/lib/matchtime.js";

// Goals + cards for one side ("h"/"a"), oldest first, for the live overview card.
function sideEvents(detail, side) {
  if (!detail) return [];
  const t = (e) => (e.minute ?? 0) + (e.injury ?? 0) / 100;
  const gs = (detail.scorers || []).filter((g) => g.side === side).map((g) => ({ kind: "goal", ...g }));
  const cs = (detail.cards || []).filter((c) => c.side === side).map((c) => ({ kind: "card", ...c }));
  return [...gs, ...cs].sort((a, b) => t(a) - t(b));
}
// One event line; mirrored (icon on the right) for the away column.
function EventLine({ e, align }) {
  return (
    <li className={`flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {e.kind === "goal"
        ? <GoalIcon size={12} className="shrink-0 text-foreground" />
        : <CardIcon red={isRedCard(e.card)} className="shrink-0" />}
      <span className="min-w-0 truncate">
        <span className="tabular-nums text-muted">{eventMinute(e)}</span> {e.player || "—"}
        {e.kind === "goal" && goalMark(e.type) ? ` ${goalMark(e.type)}` : ""}
      </span>
    </li>
  );
}

// Compact, clickable match summary. Tip entry happens in the detail drawer.
// `inactive` = pairing not yet set (K.o.) → not clickable, can't be tipped.
// `broadcasts` = service keys for "where to watch (DE)"; a tiny pill (bottom-left,
// sm+ only) opens the broadcast drawer. On mobile the services live in the detail.
// `live` = delayed in-play state ({ h,a,phase,minute,injury }) from st.live[n];
// shown (score + phase) once a match has kicked off, until the final result lands.
export default function MatchCard({ match, home, away, result, points, hasTip, locked, onOpen, onOpenBroadcasts, compact, inactive, live, detail, broadcasts, serverNow, liveMinuteOn }) {
  const hasResult = result && result.h !== "" && result.a !== "";
  const cd = !hasResult ? countdown(match.dt) : null;
  // "Wo zu sehen?" only makes sense for upcoming/running matches — hide it once a
  // match is over (final result, or kickoff long enough ago to be finished).
  const past = hasResult || kickoffMs(match.dt) + 3 * 3600000 < Date.now();
  // A running match (st.live present) always shows a scoreline — defaulting to 0:0
  // until the (delayed) score arrives — plus a live/phase badge.
  const isLiveMatch = !hasResult && !!live;
  const lh = live?.h || "0", la = live?.a || "0";

  const inner = (
    <Card variant="default" className={`h-full ${inactive ? "" : "transition hover:bg-overlay"} ${live ? "border-app-accent/70" : ""}`}>
      <Card.Content className={compact ? "p-2" : "p-3"}>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">Spiel {match.n} · {match.disp}{compact ? "" : ` · ${match.ven}`}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {hasTip && (
              <span title="getippt" aria-label="getippt" className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check size={11} />
              </span>
            )}
            {locked && <Lock size={12} className="text-muted" />}
            <PointsBadge points={points} />
          </span>
        </div>
        {/* Group-phase cards stack the teams on mobile (Google-style, space-saving):
            Kürzel + flag on two rows, scores aligned on the right. From sm up they
            keep the side-by-side "CODE : CODE" layout (tablet/desktop unchanged). */}
        {compact && (
          <div className="flex items-center justify-between gap-2 text-xs font-semibold sm:hidden">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex min-w-0 items-center gap-1.5"><Flag code={home.code} sm /><span className="truncate">{home.short || home.label}</span></span>
              <span className="flex min-w-0 items-center gap-1.5"><Flag code={away.code} sm /><span className="truncate">{away.short || away.label}</span></span>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              {hasResult ? (
                <div className="flex flex-col items-end font-extrabold"><span>{result.h}</span><span>{result.a}</span></div>
              ) : isLiveMatch ? (
                <div className="flex flex-col items-end font-extrabold leading-tight">
                  <span>{lh}</span><span>{la}</span>
                  <LiveBadge live={live} serverNow={serverNow} liveMinuteOn={liveMinuteOn} className="text-[10px]" />
                </div>
              ) : cd ? (
                <span className="text-muted">{cd}</span>
              ) : (
                <span className="font-bold text-app-accent">läuft</span>
              )}
            </div>
          </div>
        )}
        {/* compact (group grid, ≥sm): teams + score on one line */}
        {compact ? (
          <div className="hidden items-center gap-1 text-xs font-semibold sm:flex">
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
              <span className="truncate">{home.short || home.label}</span><Flag code={home.code} sm />
            </div>
            <div className="min-w-10 text-center">
              {hasResult ? (
                <span className="text-sm font-extrabold tabular-nums">{result.h} : {result.a}</span>
              ) : isLiveMatch ? (
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-sm font-extrabold tabular-nums">{lh} : {la}</span>
                  <LiveBadge live={live} serverNow={serverNow} liveMinuteOn={liveMinuteOn} className="text-[10px]" />
                </div>
              ) : cd ? (
                <span className="text-xs text-muted">{cd}</span>
              ) : (
                <span className="text-xs font-bold text-app-accent">läuft</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Flag code={away.code} sm /><span className="truncate">{away.short || away.label}</span>
            </div>
          </div>
        ) : (
          /* normal card: teams pinned to the edges, big score centered below */
          <div className="flex flex-col items-center gap-1">
            <div className="flex w-full items-center gap-3 text-sm font-semibold">
              <span className="flex min-w-0 flex-1 items-center gap-1.5"><Flag code={home.code} /><span className="truncate">{home.label}</span></span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5"><span className="truncate">{away.label}</span><Flag code={away.code} /></span>
            </div>
            <div className="text-center">
              {hasResult ? (
                <span className="text-4xl font-extrabold tabular-nums">{result.h} : {result.a}</span>
              ) : isLiveMatch ? (
                <div className="flex flex-col items-center gap-1 leading-none">
                  <LiveTag paused={live.phase === "HT"} className="text-[11px]" />
                  <span className="text-4xl font-extrabold tabular-nums">{lh} : {la}</span>
                  <LivePhase live={live} serverNow={serverNow} liveMinuteOn={liveMinuteOn} className="text-[11px]" />
                </div>
              ) : cd ? (
                <span className="text-sm text-muted">{cd}</span>
              ) : (
                <span className="text-sm font-bold text-app-accent">läuft</span>
              )}
            </div>
            {/* live scorers & cards, home on the left, away on the right */}
            {isLiveMatch && detail && (sideEvents(detail, "h").length > 0 || sideEvents(detail, "a").length > 0) && (
              <div className="mt-1.5 grid w-full grid-cols-2 gap-x-3 border-t border-border pt-1.5 text-[11px] leading-snug">
                <ul className="space-y-0.5">
                  {sideEvents(detail, "h").map((e, i) => <EventLine key={`h${i}`} e={e} align="left" />)}
                </ul>
                <ul className="space-y-0.5 text-right">
                  {sideEvents(detail, "a").map((e, i) => <EventLine key={`a${i}`} e={e} align="right" />)}
                </ul>
              </div>
            )}
          </div>
        )}
        {/* where to watch (DE) — tiny pill bottom-left, desktop/tablet only (mobile: in the detail drawer). Hidden once the match is over. */}
        {onOpenBroadcasts && !past && (
          <div className="mt-1.5 hidden sm:flex">
            <BroadcastPill keys={broadcasts} onOpen={onOpenBroadcasts} />
          </div>
        )}
      </Card.Content>
    </Card>
  );

  if (inactive) return <div className="block h-full w-full text-left opacity-50">{inner}</div>;
  // div[role=button] (not <button>) so the broadcaster <a> links nest validly.
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block h-full w-full cursor-pointer text-left">
      {inner}
    </div>
  );
}
