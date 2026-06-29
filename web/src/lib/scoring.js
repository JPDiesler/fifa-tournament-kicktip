import { TEAMS } from "@/data";

// Tournament phases in display order (group stage A–L, then the K.o. rounds).
export const PHASES = [
  ["A", "Gruppe A"], ["B", "Gruppe B"], ["C", "Gruppe C"], ["D", "Gruppe D"],
  ["E", "Gruppe E"], ["F", "Gruppe F"], ["G", "Gruppe G"], ["H", "Gruppe H"],
  ["I", "Gruppe I"], ["J", "Gruppe J"], ["K", "Gruppe K"], ["L", "Gruppe L"],
  ["R32", "Sechzehntelfinale"], ["R16", "Achtelfinale"], ["QF", "Viertelfinale"],
  ["SF", "Halbfinale"], ["P3", "Spiel um Platz 3"], ["FIN", "Finale"],
].map(([code, label]) => ({ code, label }));

// The knockout phases shown in the bracket view.
export const KO = ["R32", "R16", "QF", "SF", "FIN"];

export const flagUrl = (code) =>
  TEAMS[code]
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(TEAMS[code].wiki)}?width=80`
    : null;

export const known = (c) => !!TEAMS[c];

// Scoring — kept identical to the server's services/scoring.js.
// 3 = exact, 2 = goal difference, 1 = tendency, 0 = wrong, scored against the (final) result.
// K.o. Remis-Tipp: scored on the 90' stand + the eventual winner (see below) → up to 4.
// `resolved` (optional) = the K.o. entry { winner, regHome, regAway }; pass it for K.o. matches.
// evaluate() returns { base, exact } (joker-free): base feeds tip-quality stats, exact feeds the joker.
function evaluate(tip, res, resolved) {
  if (!res || res.h === "" || res.a === "" || !tip || tip.h === "" || tip.a === "") return null;
  const th = +tip.h, ta = +tip.a, rh = +res.h, ra = +res.a;
  // K.o. Remis-Tipp: the eventual winner matters (no draw in the end) → the 6-case table.
  if (resolved && resolved.winner && th === ta) {
    const regH = resolved.regHome != null ? +resolved.regHome : rh; // 90' stand (fallback: final)
    const regA = resolved.regAway != null ? +resolved.regAway : ra;
    const drawAt90 = regH === regA;
    const exact = drawAt90 && th === regH; // exact 90' draw (winner-independent)
    const winSide = resolved.winner === "home" ? "h" : resolved.winner === "away" ? "a" : null;
    const winnerRight = !!winSide && tip.w === winSide;
    const base = exact ? (winnerRight ? 4 : 3) : drawAt90 ? (winnerRight ? 3 : 2) : (winnerRight ? 1 : 0);
    return { base, exact };
  }
  return { base: th === rh && ta === ra ? 3 : th - ta === rh - ra ? 2 : Math.sign(th - ta) === Math.sign(rh - ra) ? 1 : 0, exact: th === rh && ta === ra };
}

// Joker (auf dem Tipp): 'risk' (Schwert) exakt → ×2 (3→6, K.o. 4→8), sonst −3; 'safe' (Schild) exakt → +1.
// Der State leert tip.joker, solange das Feature deaktiviert ist → dann wirkungslos.
export function applyJoker(base, exact, joker) {
  if (joker === "risk") return exact ? base * 2 : -3;
  if (joker === "safe") return exact ? base + 1 : base;
  return base;
}

// Points INCLUDING the tip's own joker — what counts for the total/leaderboard. null until scorable.
export function score(tip, res, resolved) {
  const e = evaluate(tip, res, resolved);
  return e == null ? null : applyJoker(e.base, e.exact, tip?.joker);
}
// Base points, joker ignored — for tip-quality stats (Volltreffer/Quote/Serie) + parity with achievements.
export function scoreBase(tip, res, resolved) {
  const e = evaluate(tip, res, resolved);
  return e == null ? null : e.base;
}

// Explicit point-badge colors (independent of the monochrome theme accent) so
// scoring stays legible: 4 = violet (rare K.o. exact-draw + winner), 3 = green,
// 2 = blue, 1 = amber, 0 = grey.
export const PT = {
  4: "bg-violet-500 text-violet-50",
  3: "bg-emerald-500 text-emerald-950",
  2: "bg-sky-500 text-sky-950",
  1: "bg-amber-500 text-amber-950",
  0: "bg-zinc-600 text-zinc-50",
};

// Joker results leave the 0–4 range: a risk miss goes negative, a boosted hit (safe +1 /
// risk ×2 → 5/6/8) goes above 4. Colour by sign/size so a point badge is never blank —
// penalty in red, boosted total in fuchsia, the regular tiers via PT.
export const ptClass = (p) =>
  p < 0 ? "bg-rose-600 text-rose-50" : p >= 5 ? "bg-fuchsia-500 text-fuchsia-50" : PT[p] || "bg-zinc-600 text-zinc-50";
