import { test } from "node:test";
import assert from "node:assert/strict";
import { devig, lambdaFromMarket, precompute } from "../services/ai/math.js";

const SCORING = { exact: 3, goal_diff: 2, tendency: 1 };
const sum3 = (o) => o.home + o.draw + o.away;
const near = (x, y, tol) => Math.abs(x - y) <= tol;

test("devig: removes the overround → fair probs sum to 1, favorite highest", () => {
  const dv = devig(1.9, 3.35, 4.0); // home favourite
  assert.ok(near(sum3(dv), 1, 1e-9), "sums to 1");
  assert.ok(dv.home > dv.away, "home (shorter odds) more likely than away");
  // implied (with vig) home prob 1/1.9≈0.526; de-vigged a touch lower but still dominant
  assert.ok(dv.home > 0.45 && dv.home < 0.6);
});

test("devig: rejects missing/invalid/non-finite legs", () => {
  assert.equal(devig(2.0, null, 3.5), null);
  assert.equal(devig(1.0, 3.0, 4.0), null);       // odds must be > 1
  assert.equal(devig(Infinity, 3.0, 4.0), null);  // non-finite → null (no NaN λ poisoning)
  assert.equal(devig(undefined, undefined, undefined), null);
});

test("lambdaFromMarket: extreme favourite still reproduces the market (λ cap 5.0)", () => {
  const odds = { home: 1.1, draw: 9.0, away: 21.0 }; // heavy home favourite
  const dv = devig(odds.home, odds.draw, odds.away);
  const pc = precompute(odds, SCORING);
  assert.ok(pc.lambda.home > pc.lambda.away, "favourite has more expected goals");
  assert.ok(near(pc.model_probs.home_win, dv.home, 0.04), `model ${pc.model_probs.home_win} ≈ market ${dv.home.toFixed(3)}`);
});

test("lambdaFromMarket: home-favoured market → λ_home > λ_away, and reproduces the market", () => {
  const dv = devig(1.6, 3.8, 5.5);
  const lam = lambdaFromMarket(dv);
  assert.ok(lam.home > lam.away, "more expected goals for the favourite");
  assert.ok(lam.home > 0 && lam.home < 5 && lam.away > 0 && lam.away < 5, "λ in a sane range");
  // the inverted λ, run back through the model, should match the de-vigged market closely
  const pc = precompute({ home: 1.6, draw: 3.8, away: 5.5 }, SCORING);
  assert.ok(near(pc.model_probs.home_win, dv.home, 0.04), `model home ${pc.model_probs.home_win} ≈ market ${dv.home.toFixed(3)}`);
  assert.ok(near(pc.model_probs.away_win, dv.away, 0.04), `model away ${pc.model_probs.away_win} ≈ market ${dv.away.toFixed(3)}`);
  assert.ok(near(pc.model_probs.draw, dv.draw, 0.04), "draw residual matches too");
});

test("precompute: end-to-end shape + market anchoring (Spiel-25-like odds)", () => {
  const pc = precompute({ home: 1.9, draw: 3.35, away: 4.0 }, SCORING);
  assert.ok(pc, "non-null with full odds");
  assert.ok(near(sum3(pc.devigged_probs), 1, 0.01), "devigged sums to 1");
  assert.ok(near(pc.model_probs.home_win + pc.model_probs.draw + pc.model_probs.away_win, 1, 0.02), "model probs sum to ~1");
  assert.equal(pc.score_matrix.length, 7, "7×7 score matrix (0..6)");
  assert.equal(pc.score_matrix[0].length, 7);
  // matrix mass (0..6) should be the bulk of the distribution
  const mass = pc.score_matrix.flat().reduce((s, x) => s + x, 0);
  assert.ok(mass > 0.9, `0..6 covers most mass (${mass.toFixed(3)})`);
  assert.ok(Array.isArray(pc.ev_grid) && pc.ev_grid.length >= 1, "ev grid present");
});

test("evGrid: home-favoured distribution ranks a home win on top, EV descending", () => {
  const pc = precompute({ home: 1.5, draw: 4.0, away: 6.0 }, SCORING); // clear home favourite
  const top = pc.ev_grid[0];
  assert.ok(top.home > top.away, `top EV tip is a home win (${top.home}:${top.away})`);
  for (let i = 1; i < pc.ev_grid.length; i++) assert.ok(pc.ev_grid[i].ev <= pc.ev_grid[i - 1].ev, "EV non-increasing");
  // EV must be a real expectation (≤ max tier) and positive for the favourite's best tip
  assert.ok(top.ev > 0 && top.ev <= SCORING.exact);
});

test("precompute: null when odds are absent", () => {
  assert.equal(precompute(null, SCORING), null);
  assert.equal(precompute({ home: 2.0 }, SCORING), null); // incomplete 1X2
});
