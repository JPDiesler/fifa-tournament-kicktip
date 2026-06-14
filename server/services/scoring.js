// Classic 3/2/1 scoring (kept identical to the frontend's original logic):
// 3 = exact score, 2 = correct goal difference, 1 = correct tendency, 0 = wrong.
// null = not yet scorable (tip or result missing).
export function score(tip, res) {
  if (!res || res.h === "" || res.a === "" || !tip || tip.h === "" || tip.a === "") return null;
  const th = +tip.h, ta = +tip.a, rh = +res.h, ra = +res.a;
  if (th === rh && ta === ra) return 3;
  if (th - ta === rh - ra) return 2;
  if (Math.sign(th - ta) === Math.sign(rh - ra)) return 1;
  return 0;
}

// Knockout phases (used for the champion-tip lock at K.o. start).
export const KO = ["R32", "R16", "QF", "SF", "FIN"];
