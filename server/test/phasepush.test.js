import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.DATA_DIR ||= fs.mkdtempSync("/tmp/wmt-phase-");
process.env.AI_KEY_SECRET ||= "test-key";
process.env.SESSION_SECRET ||= "test-session";

// notifyPhaseChange is driven by the RAW api-football status. Only Halbzeit/Pause/
// Verlängerung/Elfmeterschießen/Unterbrechung are notifiable; regular-play codes (1H/2H)
// must be ignored. Idempotency is the markSentOnce ledger (key `phase:<n>:<status>`).
// With no push subscriptions dispatch() is a no-op, so we assert on the ledger directly.
test("notifyPhaseChange: notifiable status claims its key once; 1H/2H ignored", async () => {
  const { notifyPhaseChange } = await import("../services/push.js");
  const { markSentOnce } = await import("../db.js");

  // regular play → not notifiable → must NOT consume the ledger
  await notifyPhaseChange(1, "1H", 0, 0);
  assert.equal(markSentOnce("phase:1:1H"), true, "1H never claimed by the push");
  await notifyPhaseChange(1, "2H", 1, 0);
  assert.equal(markSentOnce("phase:1:2H"), true, "2H never claimed by the push");

  // notifiable phases each claim their own key exactly once
  for (const s of ["HT", "BT", "ET", "P", "SUSP"]) {
    await notifyPhaseChange(2, s, 1, 1);
    assert.equal(markSentOnce(`phase:2:${s}`), false, `${s} already claimed by the push`);
  }

  // a repeated phase push is a no-op (idempotent across syncs/restarts)
  await notifyPhaseChange(3, "HT", 0, 0);
  const before = markSentOnce("phase:3:HT"); // false (claimed)
  await notifyPhaseChange(3, "HT", 0, 0);     // repeat → no throw, no re-claim
  assert.equal(before, false);
});

test("computeOvertakes: only players who dropped, naming who passed them", async () => {
  const { computeOvertakes } = await import("../services/push.js");
  const row = (p, name) => ({ p, name });
  // no change → no overtakes
  const same = [row("A", "Ann"), row("B", "Bo"), row("C", "Cy")];
  assert.deepEqual(computeOvertakes(same, same), []);

  // B passes A: before A,B,C → after B,A,C
  const r = computeOvertakes([row("A", "Ann"), row("B", "Bo"), row("C", "Cy")],
    [row("B", "Bo"), row("A", "Ann"), row("C", "Cy")]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { kuerzel: "A", oldRank: 1, newRank: 2, overtakers: ["Bo"] });

  // C and D leapfrog A and B: before A,B,C,D → after C,D,A,B
  const r2 = computeOvertakes(
    ["A", "B", "C", "D"].map((p) => row(p, p)),
    ["C", "D", "A", "B"].map((p) => row(p, p)));
  const a = r2.find((x) => x.kuerzel === "A"), b = r2.find((x) => x.kuerzel === "B");
  assert.deepEqual(a.overtakers, ["C", "D"]);
  assert.deepEqual(b.overtakers, ["C", "D"]);
  assert.equal(a.newRank, 3); assert.equal(b.newRank, 4);
});
