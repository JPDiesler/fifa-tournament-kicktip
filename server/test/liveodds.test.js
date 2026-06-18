import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-liveodds-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
import { apifootball } from "../services/sources/apifootball.adapter.js";
import { orientOdds } from "../services/sources/oddsParse.js";

const mockFetch = (json) => { globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => json }); };

test("fetchLiveOdds: parses the live feed into the curated 1X2 shape (main value)", async () => {
  mockFetch({ response: [{
    status: { stopped: false, blocked: false },
    odds: [
      { id: 59, name: "Fulltime Result", values: [
        { value: "Home", odd: "2.10", main: true }, { value: "Home", odd: "9.99", main: false },
        { value: "Draw", odd: "3.40", main: true }, { value: "Away", odd: "3.80", main: true },
      ] },
      { name: "Both Teams Score", values: [{ value: "Yes", odd: "1.8", main: true }, { value: "No", odd: "1.9", main: true }] },
    ],
  }] });
  const o = await apifootball.fetchLiveOdds(1);
  assert.equal(o.suspended, false);
  assert.equal(o.bookmakers.length, 1);
  assert.deepEqual(o.bookmakers[0].mw, { home: 2.1, draw: 3.4, away: 3.8 });
  assert.deepEqual(o.bookmakers[0].btts, { yes: 1.8, no: 1.9 });
});

test("fetchLiveOdds: suspended when the market is stopped", async () => {
  mockFetch({ response: [{ status: { stopped: true }, odds: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.5" }, { value: "Draw", odd: "4" }, { value: "Away", odd: "6" }] }] }] });
  const o = await apifootball.fetchLiveOdds(1);
  assert.equal(o.suspended, true);
  assert.equal(o.bookmakers[0].mw.home, 1.5);
});

test("fetchLiveOdds: null when no live odds for the fixture", async () => {
  mockFetch({ response: [] });
  assert.equal(await apifootball.fetchLiveOdds(1), null);
});

test("orientOdds: flips 1X2 home/away on swap, leaves O/U + BTTS alone", () => {
  const o = { bookmakers: [{ name: "X", mw: { home: 2, draw: 3, away: 4 }, ou25: { over: 1.8, under: 2.0 }, btts: { yes: 1.7, no: 2.1 } }] };
  const f = orientOdds(o, true);
  assert.deepEqual(f.bookmakers[0].mw, { home: 4, draw: 3, away: 2 });
  assert.deepEqual(f.bookmakers[0].ou25, { over: 1.8, under: 2.0 });
  assert.equal(orientOdds(o, false), o); // no-op without swap
});
