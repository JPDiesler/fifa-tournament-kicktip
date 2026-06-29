import { test } from "node:test";
import assert from "node:assert/strict";
import { score, scoreBase, POINTS } from "../services/scoring.js";

test("scoring tiers (3 exact / 2 diff / 1 tendency / 0 wrong)", () => {
  assert.equal(score({ h: "2", a: "1" }, { h: "2", a: "1" }), 3); // exact
  assert.equal(score({ h: "2", a: "1" }, { h: "3", a: "2" }), 2); // same goal diff
  assert.equal(score({ h: "3", a: "0" }, { h: "1", a: "0" }), 1); // same tendency
  assert.equal(score({ h: "0", a: "2" }, { h: "1", a: "0" }), 0); // wrong
  assert.equal(score({ h: "", a: "" }, { h: "1", a: "0" }), null); // not scorable
});

test("POINTS is the canonical 3/2/1 (+4 for the K.o. exact-draw bonus)", () => {
  assert.deepEqual(POINTS, { exact: 3, goal_diff: 2, tendency: 1, exact_draw_win: 4 });
});

test("K.o. non-draw tip: scored against the final result (incl. extra time)", () => {
  const r = (winner) => ({ winner, regHome: "0", regAway: "0" }); // 90' was 0:0
  assert.equal(score({ h: "0", a: "1" }, { h: "0", a: "1" }, r("away")), 3); // decided in ET 0:1 → exact vs final
  assert.equal(score({ h: "0", a: "1" }, { h: "1", a: "2" }, r("away")), 2); // final 1:2 → same goal diff → 2
  assert.equal(score({ h: "0", a: "1" }, { h: "0", a: "0" }, r("away")), 0); // penalties: level final, non-draw tip → 0
});

test("K.o. Remis-Tipp: 90' draw + eventual winner (4/3/3/2/1/0)", () => {
  const koPen = { winner: "home", regHome: "1", regAway: "1" };  // 90' draw 1:1, home advances
  assert.equal(score({ h: "1", a: "1", w: "h" }, { h: "1", a: "1" }, koPen), 4); // exact draw + winner right
  assert.equal(score({ h: "1", a: "1", w: "a" }, { h: "1", a: "1" }, koPen), 3); // exact draw + winner wrong
  assert.equal(score({ h: "0", a: "0", w: "h" }, { h: "1", a: "1" }, koPen), 3); // draw right, wrong score, winner right
  assert.equal(score({ h: "0", a: "0", w: "a" }, { h: "1", a: "1" }, koPen), 2); // draw right, wrong score, winner wrong
  const koReg = { winner: "home", regHome: "2", regAway: "1" };  // decided in 90', not a draw
  assert.equal(score({ h: "1", a: "1", w: "h" }, { h: "2", a: "1" }, koReg), 1); // no draw 90', winner right
  assert.equal(score({ h: "1", a: "1", w: "a" }, { h: "2", a: "1" }, koReg), 0); // no draw 90', winner wrong
});

const koDraw = { winner: "home", regHome: "1", regAway: "1" }; // exact 90' draw 1:1, home advances
test("Joker Schwert (risk): exact doubles (6/8), anything else −3", () => {
  assert.equal(score({ h: "2", a: "1", joker: "risk" }, { h: "2", a: "1" }), 6);        // normal exact 3→6
  assert.equal(score({ h: "2", a: "1", joker: "risk" }, { h: "3", a: "2" }), -3);       // goal-diff → −3
  assert.equal(score({ h: "2", a: "1", joker: "risk" }, { h: "0", a: "2" }), -3);       // miss → −3
  assert.equal(score({ h: "1", a: "1", w: "h", joker: "risk" }, { h: "1", a: "1" }, koDraw), 8); // exact draw + winner → 4→8
  assert.equal(score({ h: "1", a: "1", w: "a", joker: "risk" }, { h: "1", a: "1" }, koDraw), 6); // exact draw, winner wrong → 3→6
});
test("Joker Schild (safe): +1 on exact, else unchanged", () => {
  assert.equal(score({ h: "2", a: "1", joker: "safe" }, { h: "2", a: "1" }), 4);        // exact 3→4
  assert.equal(score({ h: "2", a: "1", joker: "safe" }, { h: "3", a: "2" }), 2);        // goal-diff unchanged
  assert.equal(score({ h: "1", a: "1", w: "h", joker: "safe" }, { h: "1", a: "1" }, koDraw), 5); // exact draw 4→5
});
test("scoreBase ignores the joker (achievements stay on base points)", () => {
  assert.equal(scoreBase({ h: "2", a: "1", joker: "risk" }, { h: "3", a: "2" }), 2);    // not −3
  assert.equal(scoreBase({ h: "2", a: "1", joker: "safe" }, { h: "2", a: "1" }), 3);    // not 4
});
