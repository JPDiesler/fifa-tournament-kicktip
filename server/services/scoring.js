// Classic 3/2/1 scoring (kept identical to the frontend's original logic):
// 3 = exact score, 2 = correct goal difference, 1 = correct tendency, 0 = wrong.
// null = not yet scorable (tip or result missing). POINTS is the single source of
// truth (also fed verbatim into the AI players' EV-maximization bundle).
export const POINTS = { exact: 3, goal_diff: 2, tendency: 1 };
export function score(tip, res) {
  if (!res || res.h === "" || res.a === "" || !tip || tip.h === "" || tip.a === "") return null;
  const th = +tip.h, ta = +tip.a, rh = +res.h, ra = +res.a;
  if (th === rh && ta === ra) return POINTS.exact;
  if (th - ta === rh - ra) return POINTS.goal_diff;
  if (Math.sign(th - ta) === Math.sign(rh - ra)) return POINTS.tendency;
  return 0;
}

// Knockout phases (used for the champion-tip lock at K.o. start).
export const KO = ["R32", "R16", "QF", "SF", "FIN"];
