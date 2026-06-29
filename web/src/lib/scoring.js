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
// null = not yet scorable. `resolved` (optional) = the K.o. entry { winner, regHome, regAway };
// pass it for K.o. matches, omit for group games.
export function score(tip, res, resolved) {
  if (!res || res.h === "" || res.a === "" || !tip || tip.h === "" || tip.a === "") return null;
  const th = +tip.h, ta = +tip.a, rh = +res.h, ra = +res.a;
  // K.o. Remis-Tipp: the eventual winner matters (no draw in the end) → the 6-case table.
  if (resolved && resolved.winner && th === ta) {
    const regH = resolved.regHome != null ? +resolved.regHome : rh; // 90' stand (fallback: final)
    const regA = resolved.regAway != null ? +resolved.regAway : ra;
    const drawAt90 = regH === regA;
    const exactDraw = drawAt90 && th === regH;
    const winSide = resolved.winner === "home" ? "h" : resolved.winner === "away" ? "a" : null;
    const winnerRight = !!winSide && tip.w === winSide;
    if (exactDraw) return winnerRight ? 4 : 3;
    if (drawAt90) return winnerRight ? 3 : 2;
    return winnerRight ? 1 : 0;
  }
  if (th === rh && ta === ra) return 3;
  if (th - ta === rh - ra) return 2;
  if (Math.sign(th - ta) === Math.sign(rh - ra)) return 1;
  return 0;
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
