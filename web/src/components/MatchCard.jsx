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
        <div className={`flex items-center font-semibold ${compact ? "gap-1 text-xs" : "gap-2 text-sm"}`}>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
            <span className="truncate">{home.label}</span><Flag code={home.code} sm={compact} />
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
            <Flag code={away.code} sm={compact} /><span className="truncate">{away.label}</span>
          </div>
        </div>
      </Card.Content>
    </Card>
  );

  if (inactive) return <div className="block h-full w-full text-left opacity-50">{inner}</div>;
  return <button type="button" onClick={onOpen} className="block h-full w-full text-left">{inner}</button>;
}
