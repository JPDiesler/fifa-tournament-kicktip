import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-playerstats-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
import { apifootball } from "../services/sources/apifootball.adapter.js";

const mockFetch = (json) => { globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => json }); };

test("fetchPlayerStats: maps the players feed to a pid-keyed stat block + captain", async () => {
  mockFetch({ response: [
    { team: { name: "A" }, players: [
      { player: { id: 10 }, statistics: [{
        games: { rating: "7.8", minutes: 90, position: "M", captain: true, substitute: false },
        goals: { total: 1, assists: 2, conceded: null, saves: null }, shots: { total: 3, on: 2 },
        passes: { total: 50, key: 4, accuracy: "88" }, tackles: { total: 2, interceptions: 1 },
        duels: { total: 9, won: 6 }, dribbles: { attempts: 4, success: 3 },
        fouls: { drawn: 1, committed: 2 }, cards: { yellow: 1, red: 0 }, penalty: { scored: 0, missed: 0 },
      }] },
      { player: { id: 11 }, statistics: [{ games: { rating: null, minutes: 0, captain: false } }] },
    ] },
  ] });
  const ps = await apifootball.fetchPlayerStats(1);
  assert.equal(ps[10].rating, "7.8");
  assert.equal(ps[10].goals, 1);
  assert.equal(ps[10].assists, 2);
  assert.equal(ps[10].captain, true);
  assert.equal(ps[10].passAcc, "88");
  assert.equal(ps[10].duelsWon, 6);
  assert.equal(ps[11].captain, false);
});

test("fetchPlayerStats: null when the feed is empty", async () => {
  mockFetch({ response: [] });
  assert.equal(await apifootball.fetchPlayerStats(1), null);
});

test("fetchPlayerProfile: maps bio + prefers the World Cup season block", async () => {
  mockFetch({ response: [{
    player: { id: 1464, name: "G. Xhaka", firstname: "Granit", lastname: "Xhaka", age: 33, birth: { date: "1992-09-27" }, nationality: "Switzerland", height: "186 cm", weight: "80 kg", injured: false, photo: "x.png" },
    statistics: [
      { league: { name: "Friendlies" }, games: { appearences: 2 }, goals: { total: 0, assists: 0 } },
      { league: { name: "World Cup" }, games: { appearences: 3 }, goals: { total: 1, assists: 1 } },
    ],
  }] });
  const p = await apifootball.fetchPlayerProfile(1464);
  assert.equal(p.nationality, "Switzerland");
  assert.equal(p.age, 33);
  assert.equal(p.season.league, "World Cup");
  assert.equal(p.season.goals, 1);
});

test("fetchPlayerProfile: null when no player is returned", async () => {
  mockFetch({ response: [] });
  assert.equal(await apifootball.fetchPlayerProfile(1), null);
});
