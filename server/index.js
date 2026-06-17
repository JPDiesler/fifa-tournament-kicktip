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
import { activeSource } from "./services/sources/index.js";
import { anyMatchActive } from "./services/poller.js";
import { sync, runBackfill, prefetchPreviews } from "./services/sync.js";
import { liveDelayMs } from "./services/coordinator.js";
import { applyRights, syncBroadcasts } from "./services/broadcasts.js";
import { runTipReminders, runChampReminder, runDailySummary } from "./services/push.js";
import { runAiScheduler } from "./services/ai/scheduler.js";

bootstrapAdmin();
// One-off heal: earlier syncs could cross-assign API fixtures to the wrong match
// when two games kicked off at the same minute, leaving bogus resolved rows on
// group matches. Group pairings are static (authoritative), so drop them here;
// only K.o. matches legitimately carry resolved teams.
for (const m of MATCHES) if (known(m.h) && known(m.a)) clearResolved(m.n);

// Result + near-live polling. Only hit the API while a match is actually running
// (kickoff → expected end, incl. halftime, stoppage, extra time, penalties) and
// still has no final result. Self-scheduling so the interval is DYNAMIC: the
// configured base interval (default 60s) while live, throttled down if a routed
// provider's daily budget is running low (liveDelayMs); 60s idle checks otherwise.
async function livePoll() {
  let live = false;
  try {
    const due = anyMatchActive(hasResult);
    if (due) { live = true; await sync(`live/Spielende (Spiel ${due})`); }
  } catch (e) { console.error("livePoll", e); }
  setTimeout(livePoll, live ? liveDelayMs() : 60_000);
}
// Sparse safety net to catch anything missed (e.g. K.o.-team resolution, late edits),
// then drain any finished matches still missing scorers/cards/final-clock.
cron.schedule(process.env.SYNC_CRON || "0 */6 * * *", async () => { await sync("Sicherheits-Sync"); runBackfill("Sicherheits-Sync"); prefetchPreviews().catch((e) => console.error("preview", e)); });
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
// AI players: place each due match tip (≥5 min before kickoff, triggered at −10) and
// the one-off champion tip. Idempotent (one LLM call per player+match), so a per-minute
// cadence only affects timeliness, never duplicates.
cron.schedule(process.env.AI_TIP_CRON || "* * * * *", () => runAiScheduler().catch((e) => console.error("aiScheduler", e)));

app.listen(PORT, () => {
  console.log(`WM-Tippspiel läuft auf :${PORT}`);
  const src = activeSource();
  console.log(`Ergebnis-Quelle: ${src.name}${src.configured() ? "" : " (nicht konfiguriert)"}`);
  if (src.configured()) { sync("start"); setTimeout(() => runBackfill("start"), 8_000); setTimeout(() => prefetchPreviews().catch((e) => console.error("preview", e)), 12_000); } // backfill + pre-match previews after the start sync
  applyRights();              // streaming/pay rights are static — available immediately
  syncBroadcasts("start");    // EPG download runs in the background, won't block boot
  livePoll();                 // start the dynamic near-live polling loop
});
