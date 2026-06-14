import { livePhase } from "../lib/matchtime.js";

// "🔴 LIVE" marker (pulsing red dot). At halftime the dot doesn't pulse — the
// ball isn't rolling. Sits ABOVE the score on the big card / detail sheet.
export function LiveTag({ paused = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-red-500 ${className}`}>
      <span className={`inline-block size-1.5 shrink-0 rounded-full bg-red-500 ${paused ? "" : "motion-safe:animate-pulse"}`} aria-hidden />
      LIVE
    </span>
  );
}

// Phase word (läuft / Halbzeit / Verlängerung / Elfmeterschießen) in the accent
// colour, with a Google-style beam sweeping left→right underneath — the beam's
// width matches the phase text. Sits BELOW the score on the big card / detail.
export function LivePhase({ live, className = "" }) {
  if (!live) return null;
  return (
    <span className={`inline-flex flex-col items-stretch gap-1 ${className}`}>
      <span className="font-bold text-app-accent">{livePhase(live)}</span>
      <span className="relative h-0.5 w-full overflow-hidden rounded-full bg-app-accent/20" aria-hidden>
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-app-accent motion-safe:animate-[live-beam_1.4s_ease-in-out_infinite]" />
      </span>
    </span>
  );
}

// Compact inline badge for the narrow group tiles / bracket: red dot + short
// phase (LIVE / HZ / Verl. / Elfer). Renders nothing without a live state.
export default function LiveBadge({ live, className = "" }) {
  if (!live) return null;
  const paused = live.phase === "HT";
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-red-500 ${className}`}>
      <span className={`inline-block size-1.5 shrink-0 rounded-full bg-red-500 ${paused ? "" : "motion-safe:animate-pulse"}`} aria-hidden />
      {livePhase(live, true)}
    </span>
  );
}
