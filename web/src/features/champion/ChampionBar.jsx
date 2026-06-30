import { Trophy, Lock, Check, X } from "lucide-react";
import { Card, Chip } from "@heroui/react";
import Flag from "@/components/Flag.jsx";
import TeamSelect from "./TeamSelect.jsx";
import { known } from "@/lib/scoring.js";

// Persistent Weltmeister-Tipp bar shown ABOVE the tabs. (The admin "actual
// champion" control lives in the admin modal now.)
export default function ChampionBar({ me, teams, champ, onSetChamp, champBonus, champLocked, championActual, champs, board, eliminated }) {
  const teamName = (c) => (teams[c] ? teams[c].name : c);
  const isOut = (c) => !!eliminated?.has(c); // team already knocked out → cross the pick out
  // All players' picks grouped by country (no names), most-backed first — revealed at K.o. start.
  const byCountry = {};
  if (champLocked) for (const b of board || []) { const c = champs?.[b.p]; if (c && known(c)) byCountry[c] = (byCountry[c] || 0) + 1; }
  const grouped = Object.entries(byCountry).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <Card variant="default" className="border border-app-accent/30">
      <Card.Content className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex shrink-0 items-center gap-2 text-app-accent">
            <Trophy size={16} />
            <span className="text-sm font-bold text-foreground">Weltmeister</span>
            <span className="text-xs text-muted">+{champBonus} P</span>
            {champLocked && <Chip size="sm" className="border-0 bg-zinc-700 text-[11px] text-zinc-200"><Lock size={10} /> gesperrt</Chip>}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {champLocked ? (
              champ ? (
                <span className="flex items-center gap-2 text-sm">
                  {known(champ) && <Flag code={champ} className={isOut(champ) ? "opacity-50 grayscale" : ""} />}
                  <span className={`font-semibold ${isOut(champ) ? "text-danger line-through" : ""}`}>{teamName(champ)}</span>
                  {championActual && (champ === championActual ? <Check size={15} className="text-success" /> : <X size={15} className="text-muted" />)}
                </span>
              ) : <span className="text-sm text-muted">Kein Weltmeister-Tipp abgegeben.</span>
            ) : (
              <>
                {champ && known(champ) && <Flag code={champ} />}
                <div className="min-w-0 flex-1">
                  <TeamSelect label="Weltmeister-Tipp" placeholder="Land suchen …" value={champ} onChange={onSetChamp} isDisabled={!me} teams={teams} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* all players' picks, grouped by country (no names) — revealed once the K.o. phase starts */}
        {champLocked && grouped.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2 text-xs">
            {grouped.map(([code, n]) => {
              const isActual = championActual && code === championActual;
              const out = isOut(code);
              return (
                <span key={code} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${isActual ? "bg-success/15" : out ? "bg-danger/10" : "bg-overlay"}`}>
                  <Flag code={code} sm className={out ? "opacity-50 grayscale" : ""} />
                  <span className={`font-semibold uppercase ${out ? "text-danger line-through" : ""}`}>{code}</span>
                  {n > 1 && <span className="tabular-nums text-muted">×{n}</span>}
                  {isActual && <Check size={12} className="text-success" />}
                </span>
              );
            })}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
