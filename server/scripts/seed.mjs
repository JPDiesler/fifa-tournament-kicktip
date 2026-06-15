// Fill the (local) DB with fake test data to preview the leaderboard, charts,
// Bilanz and notifications. Operates on the same DB as the app (DATA_DIR), so in
// Docker run it against the wm_data volume:
//
//   docker compose run --rm wm-tippspiel node scripts/seed.mjs        # seed (24 matches scored)
//   docker compose run --rm wm-tippspiel node scripts/seed.mjs 40     # seed, 40 matches scored
//   docker compose run --rm wm-tippspiel node scripts/seed.mjs clear  # remove the fake players only
//   docker compose run --rm wm-tippspiel node scripts/seed.mjs reset  # wipe ALL game data + fake players
//
// Safe by design: real tips are never overwritten (gaps are filled with INSERT OR
// IGNORE); only the listed fake players are added; `clear` removes just those.
import { db, createUser, getUserByKuerzel, listUsers, deleteUser, setResult, setChampionActual } from "../db.js";
import { MATCHES, TEAMS } from "../data.js";

db.pragma("busy_timeout = 5000"); // tolerate the running app briefly holding the DB

// Recognisable fake players (kuerzel = how clear() finds them; no password → they
// can't log in, they just populate the standings).
const FAKE = [
  ["Anna", "Anna M."], ["Ben", "Ben K."], ["Clara", "Clara S."], ["David", "David R."],
  ["Eva", "Eva L."], ["Finn", "Finn T."], ["Greta", "Greta W."], ["Hugo", "Hugo P."],
];
const FAKE_KEYS = new Set(FAKE.map(([k]) => k));

const args = process.argv.slice(2);
const mode = args.find((a) => isNaN(Number(a))) || "seed";
const N = Number(args.find((a) => !isNaN(Number(a)))) || 24; // matches given a result

// Plausible-ish scoreline: skews low (0–2), occasional 3–4.
const goal = () => { const r = Math.random(); return r < 0.3 ? 0 : r < 0.62 ? 1 : r < 0.85 ? 2 : r < 0.96 ? 3 : 4; };
const ko = (m) => Date.parse(m.dt + ":00+02:00");
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function clearFake() {
  let n = 0;
  for (const k of FAKE_KEYS) { const u = getUserByKuerzel(k); if (u) { deleteUser(u.id); n++; } } // FK cascade drops their tips/champs
  console.log(`✓ ${n} Test-Spieler entfernt (Ergebnisse/echte Nutzer bleiben).`);
}

function reset() {
  clearFake();
  db.exec("DELETE FROM tips; DELETE FROM champs; DELETE FROM results; DELETE FROM resolved; DELETE FROM live;");
  setChampionActual("");
  console.log("✓ Alle Spieldaten zurückgesetzt (Tipps, Tipp-Ergebnisse, Paarungen, Weltmeister).");
}

function seed() {
  // 1) ensure the fake players exist
  let created = 0;
  for (const [kuerzel, name] of FAKE) {
    if (!getUserByKuerzel(kuerzel)) { createUser({ kuerzel, name, kind: "basic", is_active: 1 }); created++; }
  }

  // 2) every non-superadmin player gets tips for ALL matches — gaps only, never
  //    overwriting an existing (real) tip — plus a champion pick if they lack one.
  const players = listUsers().filter((u) => u.kuerzel && !u.is_superadmin);
  const insTip = db.prepare("INSERT OR IGNORE INTO tips(user_id,match_n,h,a) VALUES(?,?,?,?)");
  const insChamp = db.prepare("INSERT OR IGNORE INTO champs(user_id,code) VALUES(?,?)");
  const codes = Object.keys(TEAMS);
  let tips = 0;
  const tx = db.transaction(() => {
    for (const u of players) {
      for (const m of MATCHES) tips += insTip.run(u.id, m.n, String(goal()), String(goal())).changes;
      insChamp.run(u.id, pick(codes));
    }
  });
  tx();

  // 3) results for the first N matches (chronological) → fills several matchdays
  //    so the leaderboard, the trend chart and the Bilanz have something to show.
  const chrono = [...MATCHES].sort((a, b) => ko(a) - ko(b)).slice(0, Math.min(N, MATCHES.length));
  for (const m of chrono) setResult(m.n, String(goal()), String(goal()));

  console.log(`✓ Seed fertig: ${players.length} Spieler (${created} neu angelegt), ${tips} Tipps ergänzt, ${chrono.length} Spiele mit Ergebnis.`);
  console.log("  → App neu laden; Punktstand/Gesamt + Diagramm + Persönlich sind jetzt gefüllt.");
}

if (mode === "clear") clearFake();
else if (mode === "reset") reset();
else seed();
