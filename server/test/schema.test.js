import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMatchPrediction, validateChampionPrediction } from "../services/ai/schema.js";

const okMatch = { tip: { home: 2, away: 1 }, outcome_probabilities: { home_win: 0.6, draw: 0.25, away_win: 0.15 }, tip_scoreline_probability: 0.13 };

test("match: valid → string scores", () => {
  assert.deepEqual(validateMatchPrediction(okMatch).tip, { h: "2", a: "1" });
});
test("match: rejects non-integer tip", () => {
  assert.throws(() => validateMatchPrediction({ ...okMatch, tip: { home: 1.5, away: 0 } }));
});
test("match: rejects negative tip", () => {
  assert.throws(() => validateMatchPrediction({ ...okMatch, tip: { home: -1, away: 0 } }));
});
test("match: rejects probabilities not summing to ~1", () => {
  assert.throws(() => validateMatchPrediction({ ...okMatch, outcome_probabilities: { home_win: 0.6, draw: 0.6, away_win: 0.6 } }));
});
test("match: rejects probabilities out of [0,1]", () => {
  assert.throws(() => validateMatchPrediction({ ...okMatch, outcome_probabilities: { home_win: 1.2, draw: -0.1, away_win: -0.1 } }));
});
test("champion: valid code (case-insensitive)", () => {
  assert.equal(validateChampionPrediction({ champion_code: "ger" }, ["GER", "BRA"]).code, "GER");
});
test("champion: rejects code not in the team list", () => {
  assert.throws(() => validateChampionPrediction({ champion_code: "XXX" }, ["GER", "BRA"]));
});
test("champion: rejects missing code", () => {
  assert.throws(() => validateChampionPrediction({}, ["GER"]));
});
