import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-bundle-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

test("buildBundle: group match → real scoring + canonical sides", async () => {
  const { buildBundle } = await import("../services/ai/bundle.js");
  const b = await buildBundle(9); // GER vs CUW
  assert.equal(b.source, "api-football"); // api-football is the sole source (unconfigured in tests → minimal bundle)
  assert.deepEqual(b.scoring, { exact: 3, goal_diff: 2, tendency: 1 }); // app's real values, not the spec example 4/3/2
  assert.equal(b.fixture.home.code, "GER");
  assert.equal(b.fixture.away.code, "CUW");
  assert.equal(b.fixture.stage, "group");
  assert.equal(b.fixture.neutral_venue, true);
});

test("buildBundle: K.o. is null until resolved, then carries the real teams", async () => {
  const { buildBundle } = await import("../services/ai/bundle.js");
  const db = await import("../db.js");
  assert.equal(await buildBundle(104), null, "final unresolved → defer");
  db.setResolved(104, { homeName: "Argentinien", awayName: "Frankreich", homeCode: "ARG", awayCode: "FRA", winner: null });
  const k = await buildBundle(104);
  assert.equal(k.fixture.home.code, "ARG");
  assert.equal(k.fixture.away.code, "FRA");
  assert.equal(k.fixture.stage, "knockout");
});

test("buildChampionBundle: valid codes + champion bonus", async () => {
  const { buildChampionBundle } = await import("../services/ai/bundle.js");
  const c = await buildChampionBundle();
  assert.equal(c.scoring.champion_bonus, 10);
  assert.equal(c.teams.length, 48);
  assert.ok(c.teams.some((t) => t.code === "GER"));
});
