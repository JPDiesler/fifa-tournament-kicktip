import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-liveodds-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
import { apifootball } from "../services/sources/apifootball.adapter.js";

const mockFetch = (json) => { globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => json }); };

test("fetchLiveOdds: picks the main 1X2 value per outcome", async () => {
  mockFetch({ response: [{
    status: { stopped: false, blocked: false, finished: false },
    odds: [{ id: 59, name: "Fulltime Result", values: [
      { value: "Home", odd: "2.10", main: true, suspended: false },
      { value: "Home", odd: "9.99", main: false, suspended: false }, // non-main duplicate → ignored
      { value: "Draw", odd: "3.40", main: true, suspended: false },
      { value: "Away", odd: "3.80", main: true, suspended: false },
    ] }],
  }] });
  const o = await apifootball.fetchLiveOdds(123);
  assert.deepEqual(o, { home: 2.1, draw: 3.4, away: 3.8, bookmaker: null, suspended: false });
});

test("fetchLiveOdds: suspended when the market is stopped", async () => {
  mockFetch({ response: [{
    status: { stopped: true, blocked: false, finished: false },
    odds: [{ name: "Match Winner", values: [
      { value: "Home", odd: "1.5" }, { value: "Draw", odd: "4" }, { value: "Away", odd: "6" },
    ] }],
  }] });
  const o = await apifootball.fetchLiveOdds(1);
  assert.equal(o.suspended, true);
  assert.equal(o.home, 1.5);
});

test("fetchLiveOdds: suspended when a single outcome value is suspended", async () => {
  mockFetch({ response: [{
    status: { stopped: false, blocked: false },
    odds: [{ name: "Fulltime Result", values: [
      { value: "Home", odd: "2", main: true, suspended: true },
      { value: "Draw", odd: "3", main: true }, { value: "Away", odd: "3.5", main: true },
    ] }],
  }] });
  assert.equal((await apifootball.fetchLiveOdds(1)).suspended, true);
});

test("fetchLiveOdds: null when no live odds for the fixture", async () => {
  mockFetch({ response: [] });
  assert.equal(await apifootball.fetchLiveOdds(1), null);
});
