import { useEffect, useLayoutEffect, useRef, useState } from "react";

// When events happen across the match, per team — api-football buckets goals/cards into
// 15-min windows and gives the SHARE (%) per window. Smooth monotone lines over time,
// styled like the leaderboard's Punkteverlauf (y-grid, hover guide + tooltip, segmented
// switcher). "Tore" = ONE line per team for when that team scores: A's own scoring timing
// blended with B's conceding timing (A scores ⇔ B concedes). Knockout matches run to 120'
// with Verlängerung / Verl.-Pause markers; group games stop at 90' (no extra time).
// `timing` = { home:{goalsFor,goalsAgainst,yellow,red:[8 %]}, away:{…} }.
const ALL_TICKS = ["15", "30", "45", "60", "75", "90", "105", "120"];
const ALL_MARKERS = [{ i: 2, label: "HZ" }, { i: 5, label: "Verl." }, { i: 6, label: "Pause" }]; // 45' / 90' / 105'
const METRICS = [["goals", "Tore"], ["yellow", "Gelb"], ["red", "Rot"]];
const YTICKS = [0, 25, 50, 75, 100];
const H = 196, pad = { t: 12, r: 12, b: 26, l: 26 };

export default function EventTiming({ timing, knockout = false, homeColor = "#22c55e", awayColor = "#64748b", homeLabel = "Heim", awayLabel = "Gast" }) {
  // Group stage ends at 90' (6 windows, only the Halbzeit marker); knockout adds extra time.
  const TICKS = knockout ? ALL_TICKS : ALL_TICKS.slice(0, 6);
  const MARKERS = knockout ? ALL_MARKERS : ALL_MARKERS.filter((m) => m.i < 3);
  const N = TICKS.length;
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [metric, setMetric] = useState("goals");
  const [active, setActive] = useState(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Touch has no "pointer leave" → once a tap pins the tooltip, a tap anywhere
  // outside the chart dismisses it (mouse still clears on leave; see below).
  useEffect(() => {
    if (active == null) return;
    const onDocDown = (e) => { if (!wrapRef.current?.contains(e.target)) setActive(null); };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [active]);
  if (!timing?.home && !timing?.away) return null;

  const norm = (arr) => { const s = (arr || []).slice(0, N).map((v) => Number(v) || 0); while (s.length < N) s.push(0); return s; };
  // A's goals = A scores OR B concedes → combine A's scoring timing with B's conceding
  // timing into ONE line per team (average where both have data, else the one that does).
  const blend = (a, b) => {
    const A = norm(a), B = norm(b), sa = A.some((v) => v > 0), sb = B.some((v) => v > 0);
    return sa && sb ? A.map((v, i) => (v + B[i]) / 2) : sb && !sa ? B : A;
  };
  const series = metric === "goals"
    ? [
        { label: homeLabel, vals: blend(timing?.home?.goalsFor, timing?.away?.goalsAgainst), color: homeColor },
        { label: awayLabel, vals: blend(timing?.away?.goalsFor, timing?.home?.goalsAgainst), color: awayColor },
      ]
    : [
        { label: homeLabel, vals: norm(timing?.home?.[metric]), color: homeColor },
        { label: awayLabel, vals: norm(timing?.away?.[metric]), color: awayColor },
      ];
  const has = series.some((s) => s.vals.some((v) => v > 0));

  const innerW = Math.max(0, w - pad.l - pad.r), innerH = H - pad.t - pad.b, base = pad.t + innerH;
  const X = (i) => pad.l + (N <= 1 ? innerW / 2 : (innerW * i) / (N - 1));
  const Y = (v) => pad.t + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
  // Monotone cubic spline (Fritsch–Carlson): smooth, never overshoots the data (no dip
  // below the baseline before a rise).
  const smooth = (vals) => {
    const p = vals.map((v, i) => [X(i), Y(v)]);
    const n = p.length;
    if (n < 2) return n ? `M ${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}` : "";
    const dx = [], slope = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; slope[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    const m = new Array(n);
    m[0] = slope[0]; m[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const aa = m[i] / slope[i], bb = m[i + 1] / slope[i], s = aa * aa + bb * bb;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * aa * slope[i]; m[i + 1] = t * bb * slope[i]; }
    }
    let d = `M ${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const c1x = p[i][0] + dx[i] / 3, c1y = p[i][1] + (m[i] * dx[i]) / 3;
      const c2x = p[i + 1][0] - dx[i] / 3, c2y = p[i + 1][1] - (m[i + 1] * dx[i]) / 3;
      d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
    }
    return d;
  };
  const onMove = (e) => {
    const r = wrapRef.current?.getBoundingClientRect(); if (!r || innerW <= 0) return;
    const i = Math.round((e.clientX - r.left - pad.l) / (innerW / (N - 1)));
    setActive(Math.max(0, Math.min(N - 1, i)));
  };
  const activeX = active == null ? 0 : X(active);

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">Ereignis-Timing</div>
        <div className="inline-flex rounded-lg border border-border bg-overlay p-0.5 text-[11px]">
          {METRICS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setMetric(k); setActive(null); }}
              className={`rounded-md px-2 py-0.5 transition ${metric === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerCancel={() => setActive(null)} onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
        {w > 0 && has && (
          <svg width={w} height={H} role="img" aria-label="Ereignis-Timing über die Spielzeit">
            <defs><clipPath id="et-clip"><rect x={pad.l - 3} y={pad.t - 4} width={innerW + 6} height={innerH + 7} /></clipPath></defs>
            {YTICKS.map((t) => (
              <g key={t}>
                <line x1={pad.l} y1={Y(t)} x2={w - pad.r} y2={Y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.l - 5} y={Y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)">{t}</text>
              </g>
            ))}
            {/* phase markers: Halbzeit / Verlängerung / Verl.-Pause */}
            {MARKERS.map((mk) => (
              <g key={mk.label}>
                <line x1={X(mk.i)} y1={pad.t} x2={X(mk.i)} y2={base} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
                <text x={X(mk.i)} y={pad.t - 3} textAnchor="middle" fontSize="7.5" fill="var(--muted)">{mk.label}</text>
              </g>
            ))}
            {TICKS.map((t, i) => <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{t}</text>)}
            {active != null && <line x1={activeX} y1={pad.t} x2={activeX} y2={base} stroke="var(--focus)" strokeWidth="1" strokeDasharray="3 3" />}
            {series.map((s, i) => (
              <path key={i} d={smooth(s.vals)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#et-clip)" />
            ))}
            {active != null && series.map((s, i) => <circle key={"d" + i} cx={X(active)} cy={Y(s.vals[active])} r="3" fill={s.color} clipPath="url(#et-clip)" />)}
          </svg>
        )}
        {w > 0 && !has && <p className="px-2 py-10 text-center text-xs text-muted">Noch keine Daten für diese Auswertung.</p>}

        {active != null && has && w > 0 && (
          <div className="pointer-events-none absolute z-10" style={{ left: activeX, top: pad.t, transform: `translate(${activeX > w / 2 ? "calc(-100% - 8px)" : "8px"}, 0)` }}>
            <div className="rounded-lg border border-border bg-overlay px-2 py-1.5 text-[11px] shadow-lg">
              <div className="mb-1 font-semibold">~{TICKS[active]}′</div>
              <div className="flex flex-col gap-0.5">
                {series.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span className="ml-auto pl-2 tabular-nums">{s.vals[active]}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: homeColor }} /><span className="min-w-0 truncate">{homeLabel}</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: awayColor }} /><span className="min-w-0 truncate">{awayLabel}</span></span>
        </span>
        <span className="text-[10px] text-muted">Minute · Anteil (%)</span>
      </div>
    </div>
  );
}
