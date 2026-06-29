// Scoring — kept byte-for-byte equivalent to the frontend's web/src/lib/scoring.js.
// Group games + non-draw K.o. tips: classic 3 = exact, 2 = goal difference, 1 = tendency, 0 = wrong,
// scored against the (final) result. K.o. Remis-Tipp: scored on the 90' stand + the eventual winner
// (see score()), where 4 = exact 90' draw AND the picked winner advanced.
// null = not yet scorable (tip or result missing). POINTS is the single source of truth
// (also fed verbatim into the AI players' EV-maximization bundle).
export const POINTS = { exact: 3, goal_diff: 2, tendency: 1, exact_draw_win: 4 };

const classic = (th, ta, rh, ra) =>
  th === rh && ta === ra ? POINTS.exact
    : th - ta === rh - ra ? POINTS.goal_diff
      : Math.sign(th - ta) === Math.sign(rh - ra) ? POINTS.tendency
        : 0;

// `res` = final result {h,a} (incl. extra time). `resolved` (optional) = the K.o. entry
// { winner:'home'|'away', regHome, regAway }. Pass it for K.o. matches so a Remis-Tipp is scored
// on the 90' stand + the eventual winner (incl. penalties); omit it for group games.
// Base points + whether the tipped scoreline was exact (for the Joker). null if not scorable.
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
    const base = exact ? (winnerRight ? POINTS.exact_draw_win : POINTS.exact) // 4 / 3
      : drawAt90 ? (winnerRight ? POINTS.exact : POINTS.goal_diff)            // 3 / 2
        : (winnerRight ? POINTS.tendency : 0);                                // 1 / 0
    return { base, exact };
  }
  return { base: classic(th, ta, rh, ra), exact: th === rh && ta === ra };
}

// Points a tip earns, INCLUDING its own Joker (tip.joker). The state blanks tip.joker while the
// feature is off → no-op then. Use scoreBase() where the Joker must NOT count (achievements).
export function score(tip, res, resolved) {
  const e = evaluate(tip, res, resolved);
  return e == null ? null : applyJoker(e.base, e.exact, tip?.joker);
}
export function scoreBase(tip, res, resolved) {
  const e = evaluate(tip, res, resolved);
  return e == null ? null : e.base;
}

// Joker layer. 'risk' (Zweischneidiges Schwert): exact scoreline → ×2 (3→6, K.o. exact-draw 4→8),
// anything else → −3. 'safe' (Schutzschild): +1 on an exact scoreline, else unchanged.
export function applyJoker(base, exact, joker) {
  if (joker === "risk") return exact ? base * 2 : -3;
  if (joker === "safe") return exact ? base + 1 : base;
  return base;
}

// Knockout phases (used for the champion-tip lock at K.o. start).
export const KO = ["R32", "R16", "QF", "SF", "FIN"];
