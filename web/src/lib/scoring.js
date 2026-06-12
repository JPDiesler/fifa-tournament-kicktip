import { TEAMS } from "../data.js";

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

// Classic 3/2/1 scoring: 3 = exact score, 2 = correct goal difference,
// 1 = correct tendency (winner/draw), 0 = wrong. null = not yet scorable.
export function score(tip, res) {
  if (!res || res.h === "" || res.a === "" || !tip || tip.h === "" || tip.a === "") return null;
  const th = +tip.h, ta = +tip.a, rh = +res.h, ra = +res.a;
  if (th === rh && ta === ra) return 3;
  if (th - ta === rh - ra) return 2;
  if (Math.sign(th - ta) === Math.sign(rh - ra)) return 1;
  return 0;
}

// Explicit point-badge colors (independent of the monochrome theme accent) so
// scoring stays legible: 3 = green, 2 = blue, 1 = amber, 0 = grey.
export const PT = {
  3: "bg-emerald-500 text-emerald-950",
  2: "bg-sky-500 text-sky-950",
  1: "bg-amber-500 text-amber-950",
  0: "bg-zinc-600 text-zinc-50",
};
