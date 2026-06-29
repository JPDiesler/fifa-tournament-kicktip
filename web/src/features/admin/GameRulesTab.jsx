import { useEffect, useState } from "react";
import { Switch, Description, Spinner, toast } from "@heroui/react";
import { Swords, Shield } from "lucide-react";
import { getGameConfig, setGameConfig } from "./admin.js";

// Global game-rule toggles. Currently just the per-phase Joker. Turning it off hides
// every joker badge + selector and makes scoring ignore stored jokers — the values
// persist in the DB, so flipping it back on restores the players' picks unchanged.
export default function GameRulesTab({ onFlash }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getGameConfig().then(setCfg).catch((e) => onFlash?.(e.message)); }, [onFlash]);

  const toggleJokers = async (v) => {
    setBusy(true);
    try { const d = await setGameConfig({ jokersEnabled: v }); setCfg(d); onFlash?.(v ? "Joker aktiviert" : "Joker deaktiviert"); }
    catch (e) { toast.danger(e.message); } finally { setBusy(false); }
  };

  if (!cfg) return <div className="flex items-center gap-2 text-xs text-muted"><Spinner size="sm" /> Lade …</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-overlay p-4">
        <Switch isSelected={cfg.jokersEnabled} isDisabled={busy} onChange={toggleJokers}>
          <Switch.Content>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <span className="font-semibold">Joker aktivieren</span>
          </Switch.Content>
          <Description className="text-muted">Ein Joker pro Phase (je Gruppe A–L, je K.-o.-Runde). Aus = alle Joker werden ignoriert; gesetzte Joker bleiben gespeichert.</Description>
        </Switch>

        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-amber-500"><Swords size={13} /></span>
            <span><span className="font-semibold text-foreground">Zweischneidiges Schwert</span> — exakter Treffer zählt doppelt (3→6, 4→8), sonst −3 Punkte.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-sky-500/20 text-sky-400"><Shield size={13} /></span>
            <span><span className="font-semibold text-foreground">Schutzschild</span> — exakter Treffer gibt +1 Punkt, kein Risiko nach unten.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
