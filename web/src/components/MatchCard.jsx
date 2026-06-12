import { Card, Chip } from "@heroui/react";
import { Lock, Check } from "lucide-react";
import Flag from "./Flag.jsx";
import PointsBadge from "./PointsBadge.jsx";
import { countdown } from "../lib/matchtime.js";

// Compact, clickable match summary. Tip entry happens in the detail drawer.
// `inactive` = pairing not yet set (K.o.) → not clickable, can't be tipped.
export default function MatchCard({ match, home, away, result, points, hasTip, locked, onOpen, compact, inactive, live }) {
  const hasResult = result && result.h !== "" && result.a !== "";
  const cd = !hasResult ? countdown(match.dt) : null;

  const inner = (
    <Card variant="default" className={`h-full ${inactive ? "" : "transition hover:bg-overlay"} ${live ? "border-app-accent/70" : ""}`}>
      <Card.Content className={compact ? "p-2" : "p-3"}>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">Spiel {match.n} · {match.disp}{compact ? "" : ` · ${match.ven}`}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {hasTip && (
              <Chip size="sm" className="border-0 bg-emerald-500/15 px-1.5 text-[11px] font-semibold text-emerald-400">
                <Check size={11} /> getippt
              </Chip>
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
              ) : cd ? (
                <span className="text-muted">{cd}</span>
              ) : (
                <span className="font-bold text-app-accent">läuft</span>
              )}
            </div>
          </div>
        )}
        <div className={`${compact ? "hidden sm:flex" : "flex"} items-center font-semibold ${compact ? "gap-1 text-xs" : "gap-2 text-sm"}`}>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
            <span className="truncate">{compact ? (home.short || home.label) : home.label}</span><Flag code={home.code} sm={compact} />
          </div>
          <div className={`text-center ${compact ? "min-w-10" : "min-w-14"}`}>
            {hasResult ? (
              <span className={`font-extrabold tabular-nums ${compact ? "text-sm" : "text-lg"}`}>{result.h} : {result.a}</span>
            ) : cd ? (
              <span className="text-xs text-muted">{cd}</span>
            ) : (
              <span className="text-xs font-bold text-app-accent">läuft</span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Flag code={away.code} sm={compact} /><span className="truncate">{compact ? (away.short || away.label) : away.label}</span>
          </div>
        </div>
      </Card.Content>
    </Card>
  );

  if (inactive) return <div className="block h-full w-full text-left opacity-50">{inner}</div>;
  return <button type="button" onClick={onOpen} className="block h-full w-full text-left">{inner}</button>;
}
