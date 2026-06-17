import { useEffect, useRef, useState } from "react";
import { livePhase, clockBoundary, liveBaseSeconds, formatClock, clockRunning } from "@/lib/matchtime.js";

// Local match clock. The authoritative time is the feed minute + server staleness
// (serverNow − as_of) — skew-free and identical on every device. Re-anchors on each
// sync (and minute/phase change): within a phase it moves FORWARD and ticks smoothly,
// but is capped so the local free-run can never drift more than DRIFT_TOL ahead of the
// feed (a delayed/coarse minute can't run away, and all devices converge). Returns
// { short:"67'"/"45+2'", long:"67:23"/"45+2" } or null. Only active when liveMinute is
// supported; minute-resolution source → seconds are approximate but smooth.
const DRIFT_TOL = 90; // s the local tick may lead the feed before being pulled back

function useLiveClock(live, serverNow, enabled) {
  const [, tick] = useState(0);
  const anchor = useRef(null); // { at, baseSec, boundary, running, phase }

  useEffect(() => {
    if (!enabled || live?.minute == null) { anchor.current = null; tick((x) => x + 1); return; }
    const a = anchor.current;
    const samePhase = a && a.phase === live.phase;
    const cur = a ? a.baseSec + (a.running ? Math.max(0, (Date.now() - a.at) / 1000) : 0) : 0;
    const feedSec = liveBaseSeconds(live, serverNow); // feed minute + server staleness (skew-free)
    // same phase → keep moving forward, but clamp within [feedSec, feedSec + DRIFT_TOL]
    // so it never rewinds yet can't run minutes ahead of the (delayed) feed; new phase
    // → anchor straight to the feed.
    const baseSec = samePhase ? Math.min(Math.max(feedSec, cur), feedSec + DRIFT_TOL) : feedSec;
    anchor.current = { at: Date.now(), baseSec, boundary: clockBoundary(live), running: clockRunning(live), phase: live.phase };
    tick((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, live?.minute, live?.phase, serverNow]); // re-sync to the feed on every sync

  useEffect(() => {
    if (!enabled || !clockRunning(live)) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [enabled, live?.phase, live?.minute]);

  const a = anchor.current;
  if (!a) return null;
  const totalSec = a.baseSec + (a.running ? Math.max(0, (Date.now() - a.at) / 1000) : 0);
  const m = Math.max(0, Math.floor(totalSec / 60));
  const short = formatClock(totalSec, a.boundary);
  // long form adds seconds during regular play; stoppage stays minute-only ("45+2").
  const long = m <= a.boundary ? `${m}:${String(Math.floor(totalSec % 60)).padStart(2, "0")}` : short.replace(/'$/, "");
  return { short, long };
}

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

// Phase word (läuft / 67' / Halbzeit / Verlängerung / Elfmeterschießen) in the
// accent colour, with a Google-style beam sweeping underneath. The minute ticks
// locally when liveMinute is supported (serverNow + liveMinuteOn).
export function LivePhase({ live, serverNow, liveMinuteOn = false, className = "" }) {
  const clock = useLiveClock(live, serverNow, liveMinuteOn);
  if (!live) return null;
  return (
    <span className={`inline-flex flex-col items-stretch gap-1 ${className}`}>
      <span className="font-bold text-app-accent tabular-nums">{livePhase(live, false, clock?.long)}</span>
      <span className="relative h-0.5 w-full overflow-hidden rounded-full bg-app-accent/20" aria-hidden>
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-app-accent motion-safe:animate-[live-beam_1.4s_ease-in-out_infinite]" />
      </span>
    </span>
  );
}

// Compact inline badge for the narrow group tiles / bracket: red dot + short
// phase (LIVE / 67' / HZ / Verl. / Elfer). Renders nothing without a live state.
export default function LiveBadge({ live, serverNow, liveMinuteOn = false, className = "" }) {
  const clock = useLiveClock(live, serverNow, liveMinuteOn);
  if (!live) return null;
  const paused = live.phase === "HT";
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-red-500 ${className}`}>
      <span className={`inline-block size-1.5 shrink-0 rounded-full bg-red-500 ${paused ? "" : "motion-safe:animate-pulse"}`} aria-hidden />
      {livePhase(live, true, clock?.short)}
    </span>
  );
}
