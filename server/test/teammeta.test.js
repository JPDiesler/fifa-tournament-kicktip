import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-teammeta-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";
const { setTeamMeta, getTeamMetaRow, teamMetaState, teamOverrides } = await import("../db.js");

test("setTeamMeta: nickname + logo → state delta carries nickname + logoVer, never the bytes", () => {
  setTeamMeta("SUI", { nickname: "Nati", logo: "data:image/svg+xml;base64,AAAA" });
  const s = teamMetaState();
  assert.equal(s.SUI.nickname, "Nati");
  assert.equal(typeof s.SUI.logoVer, "number");
  assert.ok(!("logo" in s.SUI), "state never includes the logo data URI");
  assert.match(getTeamMetaRow("SUI").logo, /^data:image\/svg/);
});

test("setTeamMeta: nickname only → no logoVer in the delta", () => {
  setTeamMeta("GER", { nickname: "Die Mannschaft" });
  assert.equal(teamMetaState().GER.nickname, "Die Mannschaft");
  assert.ok(!("logoVer" in teamMetaState().GER));
});

test("setTeamMeta: partial upsert leaves the untouched column intact", () => {
  setTeamMeta("BRA", { nickname: "Seleção" });
  setTeamMeta("BRA", { logo: "data:image/png;base64,BBBB" });
  assert.equal(teamOverrides().BRA.nickname, "Seleção");
  assert.equal(teamOverrides().BRA.hasLogo, true);
});

test("setTeamMeta: clearing nickname+logo drops it from the state delta", () => {
  setTeamMeta("ESP", { nickname: "La Roja" });
  setTeamMeta("ESP", { nickname: null });
  assert.ok(!teamMetaState().ESP, "no delta once nickname and logo are both empty");
});

test("setTeamMeta: code is normalised to upper case", () => {
  setTeamMeta("fra", { nickname: "Les Bleus" });
  assert.equal(teamOverrides().FRA.nickname, "Les Bleus");
});
