import MatchCard from "./MatchCard.jsx";
import { kickoffMs, isLive } from "../lib/matchtime.js";

// "Anstehend" tab: live matches first (accent-bordered), a divider, then the
// upcoming matches (soonest first). Tapping opens the drawer.
export default function UpcomingTab({ matches, st, me, teamLabel, teamCode, score, onOpenMatch }) {
  const now = Date.now();
  const hasResult = (m) => { const r = st.results[m.n]; return !!(r && r.h !== "" && r.a !== ""); };
  const live = matches.filter((m) => isLive(m.dt, hasResult(m), now)).sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt));
  const upcoming = matches.filter((m) => kickoffMs(m.dt) > now).sort((a, b) => kickoffMs(a.dt) - kickoffMs(b.dt));

  const card = (m, extra) => {
    const result = st.results[m.n];
    const myTip = (st.tips[me] || {})[m.n];
    return (
      <MatchCard
        key={m.n}
        match={m}
        home={{ label: teamLabel(m, "h"), code: teamCode(m, "h") }}
        away={{ label: teamLabel(m, "a"), code: teamCode(m, "a") }}
        result={result}
        points={score(myTip, result)}
        hasTip={!!(myTip && (myTip.h !== "" || myTip.a !== ""))}
        locked={(st.locks?.lockedMatches || []).includes(m.n)}
        inactive={!(teamCode(m, "h") && teamCode(m, "a"))}
        onOpen={() => onOpenMatch(m.n)}
        {...extra}
      />
    );
  };

  if (!live.length && !upcoming.length) return <p className="p-8 text-center text-sm text-muted">Keine anstehenden Spiele.</p>;

  return (
    <div className="space-y-2">
      {live.length > 0 && (
        <>
          <div className="px-1 text-xs font-bold uppercase tracking-wider text-app-accent">Live</div>
          {live.map((m) => card(m, { live: true }))}
          <div className="my-3 border-t border-border" />
          {upcoming.length > 0 && <div className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Anstehend</div>}
        </>
      )}
      {upcoming.map((m) => card(m))}
    </div>
  );
}
