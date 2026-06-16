import { test } from "node:test";
import assert from "node:assert/strict";
import { score, POINTS } from "../services/scoring.js";

test("scoring tiers (3 exact / 2 diff / 1 tendency / 0 wrong)", () => {
  assert.equal(score({ h: "2", a: "1" }, { h: "2", a: "1" }), 3); // exact
  assert.equal(score({ h: "2", a: "1" }, { h: "3", a: "2" }), 2); // same goal diff
  assert.equal(score({ h: "3", a: "0" }, { h: "1", a: "0" }), 1); // same tendency
  assert.equal(score({ h: "0", a: "2" }, { h: "1", a: "0" }), 0); // wrong
  assert.equal(score({ h: "", a: "" }, { h: "1", a: "0" }), null); // not scorable
});
test("POINTS is the canonical 3/2/1", () => {
  assert.deepEqual(POINTS, { exact: 3, goal_diff: 2, tendency: 1 });
});
