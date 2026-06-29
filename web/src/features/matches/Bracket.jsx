import { useLayoutEffect, useRef, useState } from "react";
import Flag from "@/components/Flag.jsx";
import PointsBadge from "@/components/PointsBadge.jsx";
import { isLive } from "@/lib/matchtime.js";
import LiveBadge from "./LiveBadge.jsx";
import fwc from "@/assets/fwc26.jpg";

// Feeder match numbers parsed from a K.o. slot ("Sieger Spiel 73" → 73).
const feedersOf = (m) => [m.h, m.a].map((s) => { const x = /Spiel (\d+)/.exec(s || ""); return x ? +x[1] : null; });
const HAS_FEEDERS = new Set(["R16", "QF", "SF", "FIN"]);

// Connector from a feeder edge (fx,fy) to a parent edge (px,py) with rounded corners.
function connectorPath(fx, fy, px, py, r = 10) {
  if (Math.abs(py - fy) < 2) return `M ${fx} ${fy} H ${px}`;
  const mid = (fx + px) / 2;
  const dirX = Math.sign(px - fx);
  const dirY = Math.sign(py - fy);
  const rr = Math.max(0, Math.min(r, Math.abs(px - fx) / 2 - 1, Math.abs(py - fy) / 2));
  return `M ${fx} ${fy} H ${mid - rr * dirX} Q ${mid} ${fy} ${mid} ${fy + rr * dirY} V ${py - rr * dirY} Q ${mid} ${py} ${mid + rr * dirX} ${py} H ${px}`;
}

function subtreeByRound(rootN, byN) {
  const rounds = { SF: [], QF: [], R16: [], R32: [] };
  (function walk(n) {
    const m = byN[n]; if (!m) return;
    const [h, a] = feedersOf(m);
    if (h) walk(h);
    rounds[m.ph]?.push(m);
    if (a) walk(a);
  })(rootN);
  return rounds;
}

function TeamRow({ code, label, goal, win, lose }) {
  return (
    <div className={`flex items-center justify-between gap-1 ${win ? "font-bold text-app-accent" : lose ? "text-muted opacity-50" : "text-foreground"}`}>
      <span className="flex min-w-0 items-center gap-1"><Flag code={code} sm /><span className="truncate">{label}</span></span>
      <span className="tabular-nums">{goal}</span>
    </div>
  );
}

function Tile({ m, me, st, teamLabel, teamCode, score, onOpen, setRef, isConfirmed }) {
  const r = st.results[m.n];
  const has = r && r.h !== "" && r.a !== "";
  // K.o. winner side from the source — set even for a penalty shootout, where the
  // fulltime score is level, so the advancing team is still highlighted.
  const koWinner = st.resolved[m.n]?.winner;
  const homeWin = has && (+r.h > +r.a || koWinner === "home");
  const awayWin = has && (+r.a > +r.h || koWinner === "away");
  const decided = homeWin || awayWin;          // winner stands → green frame appears automatically
  const ready = isConfirmed(m);                // official pairing (api-football) → tippable; provisional fills are not
  const live = isLive(m.dt, has);
  const lv = st.live?.[m.n];
  const isLiveMatch = !has && !!lv;          // running → show scoreline (0:0 default)
  const lh = lv?.h || "0", la = lv?.a || "0";
  const pts = score((st.tips[me] || {})[m.n], r);
  const card = (
    <div className={`rounded-lg border bg-overlay p-1.5 text-[11px] ${decided ? "border-app-accent/70" : "border-border"} ${ready ? "transition hover:bg-surface" : "opacity-50"}`}>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted">
        <span>Sp. {m.n}</span>
        {live ? <LiveBadge live={lv || { phase: "LIVE" }} /> : pts != null && <PointsBadge points={pts} />}
      </div>
      <TeamRow code={teamCode(m, "h")} label={teamLabel(m, "h")} goal={has ? r.h : isLiveMatch ? lh : ""} win={homeWin} lose={has && !homeWin} />
      <TeamRow code={teamCode(m, "a")} label={teamLabel(m, "a")} goal={has ? r.a : isLiveMatch ? la : ""} win={awayWin} lose={has && !awayWin} />
    </div>
  );
  return (
    <div ref={setRef} className="relative z-10">
      {ready
        ? <button type="button" onClick={() => onOpen(m.n)} className="block w-full text-left">{card}</button>
        : <div className="block w-full cursor-not-allowed text-left">{card}</div>}
    </div>
  );
}

function Column({ label, matches, tileProps, setRef }) {
  return (
    <div className="flex w-28 shrink-0 flex-col sm:w-32">
      <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="flex flex-1 flex-col justify-around gap-2">
        {matches.map((m) => <Tile key={m.n} m={m} setRef={setRef(m.n)} {...tileProps} />)}
      </div>
    </div>
  );
}

// "K.O." tab: two-sided bracket, final in the centre, FWC26 logo above it.
// Connector lines are drawn as an SVG overlay measured from the tile positions.
export default function Bracket({ matches, me, st, teamLabel, teamCode, isConfirmed, score, onOpenMatch }) {
  const byN = Object.fromEntries(matches.map((m) => [m.n, m]));
  const final = byN[104];
  const p3 = byN[103];
  const [lRoot, rRoot] = final ? feedersOf(final) : [null, null];
  const left = subtreeByRound(lRoot, byN);
  const right = subtreeByRound(rRoot, byN);

  const wrapRef = useRef(null);
  const tiles = useRef(new Map());
  const setRef = (n) => (el) => { if (el) tiles.current.set(n, el); else tiles.current.delete(n); };
  const [paths, setPaths] = useState([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const compute = () => {
      const base = wrap.getBoundingClientRect();
      const get = (n) => {
        const el = tiles.current.get(n);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left - base.left, r: r.right - base.left, cx: (r.left + r.right) / 2 - base.left, cy: (r.top + r.bottom) / 2 - base.top };
      };
      const decided = (n) => {
        const r = st.results[n];
        if (!(r && r.h !== "" && r.a !== "")) return false;
        return +r.h !== +r.a || !!st.resolved[n]?.winner; // a shootout winner counts too
      };
      const ds = [];
      for (const m of matches) {
        if (!HAS_FEEDERS.has(m.ph)) continue;
        const P = get(m.n);
        if (!P) continue;
        for (const f of feedersOf(m)) {
          if (!f) continue;
          const F = get(f);
          if (!F) continue;
          const [fx, px] = F.cx < P.cx ? [F.r, P.l] : [F.l, P.r]; // feeder edge → parent edge
          ds.push({ d: connectorPath(fx, F.cy, px, P.cy), won: decided(f) }); // green once that feeder is decided
        }
      }
      ds.sort((a, b) => (a.won ? 1 : 0) - (b.won ? 1 : 0)); // draw green (won) paths last → on top
      setPaths(ds);
      setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    window.addEventListener("resize", compute);
    const t = setTimeout(compute, 200);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); clearTimeout(t); };
  }, [matches, st]);

  const tileProps = { me, st, teamLabel, teamCode, isConfirmed, score, onOpen: onOpenMatch };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface p-3">
      <div ref={wrapRef} className="relative w-max" style={{ minWidth: "1080px" }}>
        <svg className="pointer-events-none absolute left-0 top-0 z-0" width={size.w} height={size.h} fill="none">
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" strokeLinejoin="round" strokeLinecap="round"
              stroke={p.won ? "var(--app-accent)" : "oklch(0.5 0 0)"} strokeWidth={p.won ? 2.5 : 2} />
          ))}
        </svg>

        <div className="relative flex items-stretch gap-8">
          <Column label="1/16" matches={left.R32} tileProps={tileProps} setRef={setRef} />
          <Column label="1/8" matches={left.R16} tileProps={tileProps} setRef={setRef} />
          <Column label="1/4" matches={left.QF} tileProps={tileProps} setRef={setRef} />
          <Column label="1/2" matches={left.SF} tileProps={tileProps} setRef={setRef} />

          <div className="flex w-40 shrink-0 flex-col">
            <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-app-accent">F</div>
            <div className="flex flex-1 flex-col justify-center">
              {/* final sits at the vertical centre (aligned with the semifinals); logo
                  floats above it and the 3rd-place game below — both absolutely placed. */}
              <div className="relative">
                <img src={fwc} alt="FIFA World Cup 26" className="pointer-events-none absolute bottom-full left-1/2 mb-3 h-16 w-auto -translate-x-1/2 rounded-xl opacity-95 ring-1 ring-white/10" />
                {final && <Tile m={final} setRef={setRef(104)} {...tileProps} />}
                {p3 && (
                  <div className="absolute left-0 right-0 top-full mt-3">
                    <div className="mb-0.5 text-center text-[9px] uppercase tracking-wider text-muted">Spiel um Platz 3</div>
                    <Tile m={p3} setRef={setRef(103)} {...tileProps} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <Column label="1/2" matches={right.SF} tileProps={tileProps} setRef={setRef} />
          <Column label="1/4" matches={right.QF} tileProps={tileProps} setRef={setRef} />
          <Column label="1/8" matches={right.R16} tileProps={tileProps} setRef={setRef} />
          <Column label="1/16" matches={right.R32} tileProps={tileProps} setRef={setRef} />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Klick auf ein Spiel zum Tippen · Sieger in der Akzentfarbe, Ausgeschiedene abgedunkelt</p>
    </div>
  );
}
