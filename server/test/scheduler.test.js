import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-sched-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

test("aiTipWindow opens [kickoff−10min, kickoff−5min)", async () => {
  const { aiTipWindow } = await import("../services/ai/scheduler.js");
  const { kickoff } = await import("../services/locks.js");
  const ko = kickoff(1);
  assert.ok(aiTipWindow(ko - 8 * 60000).includes(1), "8 min before → in window");
  assert.ok(!aiTipWindow(ko - 20 * 60000).includes(1), "20 min before → too early");
  assert.ok(!aiTipWindow(ko - 3 * 60000).includes(1), "3 min before → already locked");
  assert.ok(!aiTipWindow(ko + 60000).includes(1), "after kickoff → locked");
});

test("aiTipWindow honours a custom lead", async () => {
  const { aiTipWindow } = await import("../services/ai/scheduler.js");
  const { kickoff } = await import("../services/locks.js");
  const ko = kickoff(1);
  // lead 15 → opens earlier (12 min before is in window); the −5 lock still closes it
  assert.ok(aiTipWindow(ko - 12 * 60000, 15).includes(1));
});
