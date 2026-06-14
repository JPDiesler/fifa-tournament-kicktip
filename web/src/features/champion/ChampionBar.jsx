import { Trophy, Lock, Check, X } from "lucide-react";
import { Card, Chip } from "@heroui/react";
import Flag from "@/components/Flag.jsx";
import TeamSelect from "./TeamSelect.jsx";
import { known } from "@/lib/scoring.js";

// Persistent Weltmeister-Tipp bar shown ABOVE the tabs. (The admin "actual
// champion" control lives in the admin modal now.)
export default function ChampionBar({ me, teams, champ, onSetChamp, champBonus, champLocked, championActual, champs, board }) {
  const teamName = (c) => (teams[c] ? teams[c].name : c);
  const others = champLocked
    ? (board || []).filter((b) => b.p !== me && champs?.[b.p]).map((b) => ({ k: b.p, code: champs[b.p] }))
    : [];

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
                  {known(champ) && <Flag code={champ} />}
                  <span className="font-semibold">{teamName(champ)}</span>
                  {championActual && (champ === championActual
                    ? <Check size={15} className="text-success" />
                    : <X size={15} className="text-muted" />)}
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

        {/* other players' picks — revealed once the K.o. phase starts */}
        {champLocked && others.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
            {others.map((o) => (
              <span key={o.k} className="inline-flex items-center gap-1.5">
                <span className="font-semibold">{o.k}</span>
                {known(o.code) && <Flag code={o.code} sm />}
                <span className="text-muted">{teamName(o.code)}</span>
                {championActual && (o.code === championActual
                  ? <Check size={12} className="text-success" />
                  : <X size={12} className="text-muted" />)}
              </span>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
