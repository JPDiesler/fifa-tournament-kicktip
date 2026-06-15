// Entry point: boot the DB-backed admin, heal stale rows, schedule the result/
// broadcast polling, and start listening. The Express app lives in app.js; the
// domain logic in services/.
import cron from "node-cron";
import { app } from "./app.js";
import { PORT } from "./config.js";
import { MATCHES } from "./data.js";
import { clearResolved, hasResult } from "./db.js";
import { known } from "./services/fixtures.js";
import { bootstrapAdmin } from "./middleware/auth.js";
import { activeSource } from "./services/sources.js";
import { anyMatchActive } from "./services/poller.js";
import { sync } from "./services/sync.js";
import { applyRights, syncBroadcasts } from "./services/broadcasts.js";
import { runTipReminders, runChampReminder, runDailySummary } from "./services/push.js";

bootstrapAdmin();
// One-off heal: earlier syncs could cross-assign API fixtures to the wrong match
// when two games kicked off at the same minute, leaving bogus resolved rows on
// group matches. Group pairings are static (authoritative), so drop them here;
// only K.o. matches legitimately carry resolved teams.
for (const m of MATCHES) if (known(m.h) && known(m.a)) clearResolved(m.n);

// Result + near-live polling: check every minute, but only hit the API while a
// match is actually running (kickoff → expected end, incl. halftime, stoppage,
// extra time and penalties) and still has no final result. That yields the
// delayed live scoreline + phase during the game and the final result at the end.
// One call covers all matches at once, so this is ~1 call/min while games run —
// far under the per-minute rate limit; idle otherwise.
cron.schedule("* * * * *", () => {
  const due = anyMatchActive(hasResult);
  if (due) sync(`live/Spielende (Spiel ${due})`);
});
// Sparse safety net to catch anything missed (e.g. K.o.-team resolution, late edits).
cron.schedule(process.env.SYNC_CRON || "0 */6 * * *", () => sync("Sicherheits-Sync"));
// "Where to watch": the EPG only spans a few days and changes slowly, so a daily
// refresh is plenty (it also re-applies the streaming rights config).
cron.schedule(process.env.EPG_CRON || "30 4 * * *", () => syncBroadcasts("täglich"));
// Push reminders: tip nudges + the champion-tip reminder run a few times an hour;
// the daily summary is checked on the same tick and fires once per finished day.
// Each is idempotent, so the cadence only affects timeliness, never duplicates.
cron.schedule(process.env.REMINDER_CRON || "*/10 * * * *", () => {
  runTipReminders().catch((e) => console.error("tipReminders", e));
  runChampReminder().catch((e) => console.error("champReminder", e));
  runDailySummary().catch((e) => console.error("dailySummary", e));
});

app.listen(PORT, () => {
  console.log(`WM-Tippspiel läuft auf :${PORT}`);
  const src = activeSource();
  console.log(`Ergebnis-Quelle: ${src.name}${src.configured() ? "" : " (nicht konfiguriert)"}`);
  if (src.configured()) sync("start");
  applyRights();              // streaming/pay rights are static — available immediately
  syncBroadcasts("start");    // EPG download runs in the background, won't block boot
});
