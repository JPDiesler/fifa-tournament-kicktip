import { AlertCircle } from "lucide-react";
import { Button } from "@heroui/react";
import { kickoffMs, countdown } from "@/lib/matchtime.js";

// Nudge: how many still-tippable matches the user hasn't tipped, plus the time
// to the literal next kickoff (the next match overall — not the next untipped one).
export default function OpenTipsBanner({ me, st, matches, isConfirmed, onGoToUpcoming }) {
  if (!me) return null;
  const now = Date.now();
  const locked = new Set(st.locks?.lockedMatches || []);
  let count = 0, nextDt = null, nextMs = Infinity;
  for (const m of matches) {
    const ms = kickoffMs(m.dt);
    if (ms > now && ms < nextMs) { nextMs = ms; nextDt = m.dt; } // soonest upcoming kickoff
    if (locked.has(m.n) || ms <= now) continue;
    if (!isConfirmed(m)) continue; // pairing not officially fixed yet (provisional clinch is not tippable)
    const t = (st.tips[me] || {})[m.n];
    if (!(t && (t.h !== "" || t.a !== ""))) count++;
  }
  const champOpen = !st.locks?.champLocked && !st.champs[me];
  if (count === 0 && !champOpen) return null;

  const parts = [];
  if (count) parts.push(`${count} ${count === 1 ? "offener Tipp" : "offene Tipps"}`);
  if (champOpen) parts.push("Weltmeister-Tipp offen");
  const cd = nextDt ? countdown(nextDt) : null;

  return (
    <Button
      onPress={onGoToUpcoming}
      variant="tertiary"
      className="h-auto w-full justify-start gap-2 rounded-xl border border-app-accent/40 bg-app-accent/10 px-3 py-2 text-left text-sm hover:bg-app-accent/15"
    >
      <AlertCircle size={16} className="shrink-0 text-app-accent" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{parts.join(" · ")}</span>
        {cd && <span className="text-muted"> · nächster Anpfiff {cd}</span>}
      </span>
    </Button>
  );
}
