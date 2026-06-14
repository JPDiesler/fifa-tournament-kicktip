import { Drawer, Chip } from "@heroui/react";
import { Lock } from "lucide-react";
import Flag from "@/components/Flag.jsx";
import ScoreInput from "./ScoreInput.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import BroadcastButtons from "@/features/broadcasts/BroadcastButtons.jsx";
import { LiveTag, LivePhase } from "./LiveBadge.jsx";
import { PHASES } from "@/lib/scoring.js";
import { countdown, LIVE_DELAY_NOTE } from "@/lib/matchtime.js";

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
  const myPoints = score(myTip, result);
  const home = { label: teamLabel(match, "h"), code: teamCode(match, "h") };
  const away = { label: teamLabel(match, "a"), code: teamCode(match, "a") };
  const ready = !!(home.code && away.code); // pairing fixed (both teams known)?
  const phaseLabel = PHASES.find((p) => p.code === match.ph)?.label || "";
  const cd = !hasResult ? countdown(match.dt) : null;
  const live = st.live?.[n];
  const isLiveMatch = !hasResult && !!live;             // running → show scoreline (0:0 default) + badge
  const lh = live?.h || "0", la = live?.a || "0";

  const others = (board || [])
    .filter((b) => b.p !== me)
    .map((b) => ({ k: b.p, tip: (st.tips[b.p] || {})[n], pts: score((st.tips[b.p] || {})[n], result) }));
  const othersTipped = others.filter((o) => o.tip && (o.tip.h !== "" || o.tip.a !== ""));

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
                    <span className="text-[10px] text-muted">{LIVE_DELAY_NOTE}</span>
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

            {/* where to watch (Germany) */}
            {broadcasts.length > 0 && (
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

            {/* other players' tips */}
            <div>
              <div className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">
                Tipps der anderen{othersTipped.length > 0 ? ` (${othersTipped.length})` : ""}
              </div>
              {!locked ? (
                <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">
                  Werden 5 Minuten vor Anpfiff sichtbar.
                </p>
              ) : othersTipped.length === 0 ? (
                <p className="rounded-xl border border-border bg-overlay p-3 text-center text-xs text-muted">Niemand sonst hat getippt.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                  {othersTipped.map((o, i) => (
                    <div key={o.k} className={`flex items-center justify-between px-3 py-2 text-sm ${i ? "border-t border-border" : ""}`}>
                      <span className="font-semibold">{o.k}</span>
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
