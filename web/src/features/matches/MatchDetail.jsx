import { Drawer, Chip } from "@heroui/react";
import { Lock } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import ScoreInput from "./ScoreInput.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import BroadcastButtons from "@/features/broadcasts/BroadcastButtons.jsx";
import { LiveTag, LivePhase } from "./LiveBadge.jsx";
import { PHASES } from "@/lib/scoring.js";
import { countdown, kickoffMs, LIVE_DELAY_NOTE } from "@/lib/matchtime.js";

// Bottom-sheet detail for one match: final score, your tip (disabled when
// locked), and the other players' tips (revealed only once the match is locked).
export default function MatchDetail({ match, isOpen, onClose, st, board, me, teamLabel, teamCode, score, onTip }) {
  const broadcasts = match ? (st.broadcasts?.[match.n] || []) : [];
  if (!match) {
    return <Drawer.Backdrop isOpen={false} onOpenChange={() => onClose()}><Drawer.Content placement="bottom"><Drawer.Dialog /></Drawer.Content></Drawer.Backdrop>;
  }
  const n = match.n;
  const result = st.results[n];
  const hasResult = result && result.h !== "" && result.a !== "";
  const locked = (st.locks?.lockedMatches || []).includes(n);
  const myTip = (st.tips[me] || {})[n] || { h: "", a: "" };
  const home = { label: teamLabel(match, "h"), code: teamCode(match, "h") };
  const away = { label: teamLabel(match, "a"), code: teamCode(match, "a") };
  const ready = !!(home.code && away.code); // pairing fixed (both teams known)?
  const phaseLabel = PHASES.find((p) => p.code === match.ph)?.label || "";
  const cd = !hasResult ? countdown(match.dt) : null;
  const past = hasResult || kickoffMs(match.dt) + 3 * 3600000 < Date.now(); // match over → hide "where to watch"
  const live = st.live?.[n];
  const isLiveMatch = !hasResult && !!live;             // running → show scoreline (0:0 default) + badge
  const lh = live?.h || "0", la = live?.a || "0";

  // Points score against the final result, or — while a match runs — provisionally
  // against the (delayed) live score. Powers the live tip comparison below.
  const effRes = hasResult ? result : (isLiveMatch ? { h: String(lh), a: String(la) } : null);
  const myPoints = score(myTip, effRes);
  const tipped = (board || [])
    .map((b) => ({ k: b.p, isMe: b.p === me, tip: (st.tips[b.p] || {})[n], pts: score((st.tips[b.p] || {})[n], effRes) }))
    .filter((o) => o.tip && (o.tip.h !== "" || o.tip.a !== ""));
  const displayList = effRes
    ? [...tipped].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)) // live/final → leader first (incl. me)
    : tipped.filter((o) => !o.isMe);                           // pre-score → just the others' tips

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="mx-auto max-h-[88vh] w-full max-w-2xl">
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading className="text-sm text-muted">{phaseLabel} · Spiel {n}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-5 pb-8">
            {/* teams + big score */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <Flag code={home.code} /><span className="truncate text-sm font-semibold">{home.label}</span>
              </div>
              <div className="shrink-0 text-center">
                {hasResult ? (
                  <div className="text-3xl font-extrabold tabular-nums">{result.h}:{result.a}</div>
                ) : isLiveMatch ? (
                  <div className="flex flex-col items-center gap-1 leading-none">
                    <LiveTag paused={live.phase === "HT"} className="text-[11px]" />
                    <div className="text-3xl font-extrabold tabular-nums">{lh}:{la}</div>
                    <LivePhase live={live} className="text-[11px]" />
                    {st.capabilities?.liveMinute !== true && <span className="text-[10px] text-muted">{LIVE_DELAY_NOTE}</span>}
                  </div>
                ) : (
                  <div className={`text-xs ${cd ? "text-muted" : "font-bold text-app-accent"}`}>{cd || "läuft"}</div>
                )}
                <div className="mt-0.5 text-[11px] text-muted">{match.disp}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <Flag code={away.code} /><span className="truncate text-sm font-semibold">{away.label}</span>
              </div>
            </div>

            {/* where to watch (Germany) — hidden once the match is over */}
            {broadcasts.length > 0 && !past && (
              <div>
                <div className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">Wo zu sehen (DE)</div>
                <BroadcastButtons keys={broadcasts} />
              </div>
            )}

            {/* my tip */}
            <div className="rounded-xl border border-border bg-overlay p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold">Dein Tipp</span>
                {locked
                  ? <Chip size="sm" className="border-0 bg-zinc-700 text-xs text-zinc-200"><Lock size={11} /> gesperrt</Chip>
                  : <PointsBadge points={myPoints} />}
              </div>
              <div className="flex items-center justify-center gap-2">
                <ScoreInput value={myTip.h} isDisabled={locked || !me || !ready} onChange={(v) => onTip(n, "h", v)} label="Tipp Heim" />
                <span className="text-muted">:</span>
                <ScoreInput value={myTip.a} isDisabled={locked || !me || !ready} onChange={(v) => onTip(n, "a", v)} label="Tipp Gast" />
                {locked && myPoints !== null && <span className="ml-2"><PointsBadge points={myPoints} /></span>}
              </div>
              {!me && <p className="mt-2 text-center text-xs text-muted">Kein Kürzel zugewiesen.</p>}
              {me && !ready && <p className="mt-2 text-center text-xs text-muted">Paarung steht noch nicht fest – Tippen ab dann möglich.</p>}
            </div>

            {/* tip comparison — live (provisional points vs the delayed score) / final / pending */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  {isLiveMatch ? "Live-Tippvergleich" : hasResult ? "Tippvergleich" : "Tipps der anderen"}
                </span>
                {isLiveMatch && <span className="text-[10px] text-muted">Punkte vorläufig · Stand {lh}:{la}</span>}
              </div>
              {!locked ? (
                <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">
                  Werden 5 Minuten vor Anpfiff sichtbar.
                </p>
              ) : displayList.length === 0 ? (
                <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">Niemand{effRes ? "" : " sonst"} hat getippt.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                  {displayList.map((o, i) => (
                    <div key={o.k} className={`flex items-center justify-between px-3 py-2 text-sm ${i ? "border-t border-border" : ""} ${o.isMe ? "bg-accent/10" : ""}`}>
                      <span className="flex items-center gap-1.5 font-semibold">
                        {effRes && <span className="w-4 text-right text-xs tabular-nums text-muted">{i + 1}</span>}
                        {o.k}{o.isMe && <span className="text-[10px] text-app-accent">du</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{o.tip.h}:{o.tip.a}</span>
                        <PointsBadge points={o.pts} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
