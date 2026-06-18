import { ArrowLeftRight } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import { GoalIcon, CardIcon } from "@/components/MatchIcons.jsx";
import { eventMinute, goalMark, cardKind } from "@/lib/matchtime.js";

// Goals, cards and substitutions merged into one chronological list. `side`
// ("h"/"a") places home on the left, away on the right of the centre axis.
function timelineEvents(detail) {
  const ev = [];
  for (const g of detail?.scorers || []) ev.push({ kind: "goal", side: g.side, minute: g.minute, injury: g.injury, player: g.player, type: g.type });
  for (const c of detail?.cards || []) ev.push({ kind: "card", side: c.side, minute: c.minute, injury: c.injury, player: c.player, card: c.card });
  for (const s of detail?.subs || []) ev.push({ kind: "sub", side: s.side, minute: s.minute, injury: s.injury, in: s.in, out: s.out });
  return ev.sort((a, b) => (a.minute ?? 0) + (a.injury || 0) / 100 - ((b.minute ?? 0) + (b.injury || 0) / 100));
}

function EventIcon({ e }) {
  if (e.kind === "goal") return <GoalIcon size={16} className="shrink-0" />;
  if (e.kind === "card") return <CardIcon kind={cardKind(e.card)} className="shrink-0" />;
  return <ArrowLeftRight size={15} className="shrink-0 text-muted" />;
}

function EventBody({ e }) {
  if (e.kind === "sub") {
    return (
      <div className="min-w-0 leading-tight">
        <div className="truncate font-medium text-emerald-400">{e.in || "—"}</div>
        <div className="truncate text-[11px] text-red-400">{e.out || "—"}</div>
      </div>
    );
  }
  return (
    <div className="min-w-0 truncate font-medium">
      {e.player || "—"}{e.kind === "goal" && goalMark(e.type) ? <span className="text-muted"> {goalMark(e.type)}</span> : null}
    </div>
  );
}

// Chronological match timeline: a central minute axis, home left / away right.
export default function MatchTimeline({ detail, home, away }) {
  const events = timelineEvents(detail);
  if (!events.length) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex min-w-0 items-center gap-1.5"><Flag code={home?.code} sm /><span className="truncate">{home?.label}</span></span>
        <span className="flex min-w-0 items-center justify-end gap-1.5"><span className="truncate">{away?.label}</span><Flag code={away?.code} sm /></span>
      </div>
      <ul className="relative space-y-2.5 before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border">
        {events.map((e, i) => {
          const isAway = e.side === "a";
          return (
            <li key={i} className="relative flex items-center gap-3 text-sm">
              <div className="flex flex-1 justify-end">
                {!isAway && <div className="flex items-center gap-2 text-right">{<EventBody e={e} />}<EventIcon e={e} /></div>}
              </div>
              <span className="z-10 w-11 shrink-0 rounded-full bg-surface py-0.5 text-center text-[11px] font-semibold tabular-nums text-muted ring-1 ring-border">
                {eventMinute(e) || "·"}
              </span>
              <div className="flex flex-1 justify-start">
                {isAway && <div className="flex items-center gap-2"><EventIcon e={e} /><EventBody e={e} /></div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
