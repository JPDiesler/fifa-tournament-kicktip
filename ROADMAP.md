# WM-Tippspiel — Consolidated Roadmap (OSS-readiness · multi-tournament · TypeScript)

## North star

Turn a polished single-purpose WM-2026 prediction game into a **credible, reusable open-source product**: anyone can `docker compose up -d` (no build, no toolchain) and run a Kicktipp-style pool for **any major tournament** (WM/EM/…), with a codebase held to modern OSS standards — **without ever destabilizing the game that is live in production right now (mid-WM-2026, knockouts begin 2026-06-28).**

Three goals, one ordering principle: **ship every zero-runtime-risk and pipeline-only change first; touch live-critical code only in match-day lulls and behind green CI; defer all shape-generalizing refactors (multi-tournament, full TSX) until after the 2026 final (19 Jul).**

---

## Guiding constraints (verified this session against the actual tree)

- **The app is LIVE.** Today is 2026-06-22; group stage is in progress, R32 starts 2026-06-28, final 2026-07-19. `data.js`, `scoring.js`, `locks.js`, `sync.js`, `db/*`, and `index.js`'s boot/poll loop are all on the live hot path.
- **`server/data.js` and `web/src/data.js` are byte-identical** (`diff -q` returns clean). This is the single highest latent-bug surface. They are **two independent npm packages with no root `package.json` and no workspace** — server imports `../data.js` (Node ESM relative), web imports `@/data` (Vite alias to `web/src`). Any unification must respect that there is **no shared module resolution** between them.
- **The engine is already tournament-agnostic for scoring/locking/resolution.** Knockout teams and the champion are filled **live from api-football** by `sync.js setResolved()` (`FINAL_N`-keyed champion detection, matched by kickoff time), *not* by any internal standings/advancement engine. Confirmed `admin.routes.js:3` — "there is no manual result/champion entry." **A key-less deploy is therefore non-functional for live results today.**
- **`Bracket.jsx` winner-feeders are ALREADY data-driven** (`feedersOf` parses `"Sieger Spiel 73" → 73` via `/Spiel (\d+)/` from the data, line 9). The **group-origin** feeders (`"Sieger Gruppe C"`, `"3. (A/B/C/D/F)"`) are *not* parsed into the bracket, and round layout + `P3` (which **already exists** in the WM data) are hardcoded. So the Bracket generalization is variable-depth + optional-3rd-place, **not** "replace German string parsing."
- **Hardcoded landmines (all verified):**
  - `POINTS={exact:3,goal_diff:2,tendency:1}` (`scoring.js`, **snake_case `goal_diff`**) + `CHAMP_BONUS=10` (`data.js`). The **AI EV bundle reads `POINTS.goal_diff` verbatim** (`bundle.js:17`) into the LLM prompt — any rename must keep this in lockstep.
  - **`web/src/lib/scoring.js` hardcodes the literals 3/2/1 inline** (lines 27–29), a *second* duplication independent of `data.js`.
  - `FINAL_N=104` (`fixtures.js`).
  - `tsOf = Date.parse(dt+":00+02:00")` — **MESZ wall-clock hardcoded in BOTH `fixtures.js` AND `locks.js`** (breaks tip-locking for any non-CEST-summer tournament).
  - **`KO_PHASES={R32,R16,QF,SF,FIN}` hardcoded in `locks.js`**, and `champLockTs = Math.min(...matches in KO_PHASES)`. For a tournament whose first KO code isn't in that literal set, `Math.min` over an empty array is `Infinity` ⇒ **champion never locks** (privacy: everyone's champ pick stays hidden forever). This is as tournament-shaped as the `+02:00` hardcode and is load-bearing for champion-lock privacy.
- **Boot is NOT key-guarded.** In `index.js`, only `sync("start")` is behind `src.configured()`. `livePoll()`, `applyRights()`, `syncBroadcasts("start")`, and the `cron.schedule(...)` registrations all run **unconditionally**. A key-less container *will* enter the live-poll loop and call `sync()` when a match window opens — the exact path Phase 4 must harden.
- **Deploy gaps:** no `LICENSE/.editorconfig/.nvmrc/CONTRIBUTING/.github`; Dockerfile uses `npm install` (not `npm ci`) though **both lockfiles ARE committed**; runs as **root**; no `HEALTHCHECK`, no `/healthz`; `docker-compose.yml` has only `build:` (no `image:`). `.dockerignore` excludes `node_modules/server/public/server/data/*.log` but **NOT `.env`** — a secrets-leak risk once a public image is built/pushed.
- **No global auth guard:** `app.js` mounts routers per-prefix; `requireAuth` is applied per-route inside routers (e.g. `state.routes.js`). A `/healthz` added on `app` (not under `/api`) is reachable without a session — which is what a Docker HEALTHCHECK needs.
- **CI offline-safety:** flags + broadcaster assets are committed (101 tracked) and their downloaders skip existing files. `download-team-logos.mjs` only auto-seeds ~36/48 crests and **attempts a network fetch for any missing code on every prebuild** — "committed + idempotent" does **not** automatically mean "exits 0 offline"; this must be verified, not assumed.
- **No TypeScript** (~6.1k LOC web JSX, ~4.9k LOC server JS), deliberately dense style. Tests are server-only (node:test): `scoring/bundle/schema/idempotency/scheduler/adapters/parse/liveodds/playerstats/teammeta/aiproviderkeys`. HeroUI v3 is **beta** (React-Aria-based).

---

## Phase 0 — OSS table-stakes (docs/meta only, ZERO runtime risk) · DO NOW

**Goal:** Land everything that adds files or edits pure docs but touches no code path the live tournament runs on. Unblocks CI, CONTRIBUTING, and the public image; safe mid-knockout.

**Effort: S · Depends on: nothing**

**Deliverables**
- `LICENSE` — **MIT**, © Jan-Philipp Diesler (see keyDecisions); SPDX `license` field in both `package.json`.
- **Asset-provenance note** (in README or `NOTICE`): flags (Wikimedia Commons), broadcaster logos, federation crests (Wikipedia / football-logos.cc) are downloaded at build and are **not** relicensed under MIT — list their sources/licenses to avoid a license-laundering trap.
- `.nvmrc` = `20` (matches server `engines` + Dockerfile `node:20`; local machine runs v25 — pin avoids drift).
- `web/package.json`: add `"engines": { "node": ">=20" }`. Treat `20 LTS` as the **supported line that CI and the image both test** (open-ended `>=20` is documented as "20 is what we ship/test"; a runtime bump is a deliberate, tested change — not an unattended Dependabot bump).
- `.editorconfig`: LF, utf-8, 2-space; **no trailing-whitespace trim** (preserves the deliberately dense files; must not fight unrun Prettier `printWidth:160`).
- `CONTRIBUTING.md`: two independent npm packages / **no root package.json**; **vite must run from `web/`** (cwd matters); server-only node:test; the **deliberate code-density convention** ("do not mass-reformat"); conventional-commit style.
- `README`: add an **English quickstart** above the German body; add a prominent **"`server/data.js` is the source of truth; `web/src/data.js` is generated from it (Phase 1) and MUST NOT be hand-edited"** box (highest-bug-risk fact today — phrased to anticipate the Phase-1 change).

**Acceptance**
- All files present; `npm test`/`npm run build` unchanged; no code file touched. README renders an English path + the data.js box.

---

## Phase 1 — De-duplicate `data.js` (single source of truth, SHAPE-PRESERVING) · keystone

**Goal:** Collapse the two byte-identical literals into ONE canonical module + a generated twin — eliminating the #1 drift bug **and** laying the foundation for both multi-tournament (it becomes the tournament definition's home) and the shared TS contract. **No shape change, no DB move, no generalization** — a pure mechanical move with existing tests green.

**Effort: M · Depends on: Phase 0**

**Mechanism (decided — resolves the two-package constraint):**
- **`server/data.js` remains the single source of truth**, runtime-imported as plain JS (preserves the zero-server-build constraint — Decision 2).
- **`web/src/data.js` becomes a GENERATED artifact**: add a small copy step to web's existing `prebuild` chain that writes `server/data.js` → `web/src/data.js` (verbatim, with a `// GENERATED — do not edit, see server/data.js` banner). Vite's `@/data` alias keeps working unchanged.
- A **CI check fails the build if the generated twin is stale** (`diff -q server/data.js web/src/data.js`, or regenerate-and-diff) — this *replaces* the manual "must stay identical" discipline with an enforced gate.
- **Not** npm workspaces (would force a root `package.json`, contradicting CLAUDE.md) and **not** a symlink (breaks on Windows/Docker COPY).

**Deliverables**
- The copy/prebuild step + the staleness CI check (folds into Phase 2's workflow).
- Repoint nothing on the server (it already imports `../data.js`); web import sites are unchanged (`@/data`). Verified web consumers: `app/App.jsx`, `features/admin/AdminTeamsTab.jsx`, `features/matches/MatchDetail.jsx`, `features/stats/{PointsHistory,MyStatsTab,stats}.js(x)`, `lib/scoring.js`.
- Update the Phase-0 README box to "single source — edit `server/data.js`; the web copy is generated."
- **Scope note:** this de-dups the *tournament-data literal only*. The hardcoded 3/2/1 in `web/src/lib/scoring.js` is a **separate** duplication addressed in Phase 5 — do not assume Phase 1 fixes it.
- Golden check: `server npm test` green + `web build` green (generates the twin) + manual smoke of `/api/state` and the `Bracket.jsx` render.

**Acceptance**
- `server/data.js` is the only hand-edited tournament-data file; `web/src/data.js` is generated and the staleness check passes; both packages build/test green; `/api/state` and `Bracket.jsx` render identically to before.

> **LIVE-APP RISK:** This touches the import graph of `state.js`, `locks.js`, `tips.js`, `fixtures.js`, `sync.js`. **Merge behind green CI; redeploy to the live instance only in a match-day gap, never mid-match-day.** A broken import or a stale generated twin freezes tipping or scoring.

---

## Phase 2 — CI on PR (the safety net) + dependency automation

**Goal:** A lint+test+build gate **before** any larger refactor, so every later change is validated. Pipeline-only, cannot destabilize the running app.

**Effort: S · Depends on: Phase 0 (lands alongside/just after Phase 1 so the data.js generate+staleness check is CI-validated)**

**Deliverables**
- `.github/workflows/ci.yml` on PR + push to `main`, **node 20 (matching `.nvmrc` + Dockerfile)**: `cd server && npm ci && npm run lint && npm test`; `cd web && npm ci && npm run lint && npm run build`; plus the **Phase-1 data.js staleness check**.
- **Verify offline-safety explicitly, do not assume it:** run the web build with network egress blocked and assert each prebuild script exits 0. If `download-team-logos.mjs` can fail-hard on a missing crest, add a CI/offline skip so a missing *optional* crest is a warning (it already has a `force` flag + fail counter), never a CI failure.
- Dependabot **or** Renovate, weekly, grouped; **`@heroui/*` flagged/pinned and NOT auto-merged** (beta); React 19 / Vite 5 grouped; **the Docker base image / node major is NOT auto-bumped** (runtime change is deliberate).
- CI status badge in README.

**Acceptance**
- A PR runs all jobs green; a deliberately broken lint/test/stale-twin fails the PR; the web build passes with network blocked; a HeroUI bump opens a separate, non-auto-merged PR.

---

## Phase 3 — Dockerfile hardening + `/healthz` + GHCR multi-arch image (the core G1 lever)

**Goal:** Make deploy `docker compose up -d` with **no build and no toolchain** — the single change that delivers "almost anyone can run it." Release-pipeline + image changes only; does **not** alter running app logic (`/healthz` is additive and dependency-free).

**Effort: M · Depends on: Phase 0 (image release job folds in Phase 2's release trigger)**

**Deliverables**
- Dockerfile: `npm install` → **`npm ci`** in both web and deps stages (`npm ci --omit=dev` in deps). **Both lockfiles are already committed** (verified) so this is a drop-in.
- **`GET /healthz`** added **directly on `app` in `app.js`** (NOT under `/api`, so it's reachable without a session for the HEALTHCHECK), registered after `express.json` but **before `express.static` and the `app.get('*')` SPA catch-all** (the catch-all would otherwise return `index.html`). Returns `200 { ok:true, configured: activeSource().configured(), uptime }` reading only in-process state (never the DB on the hot path). **Return a boolean only — never the key or config object.**
- Dockerfile runtime stage: `USER node` + ensure `/app` and `/data` are owned/writable by `node` (better-sqlite3 opens the DB **read-write** at boot; the session store + sync write continuously).
- **`.dockerignore` hardening (do BEFORE the first public push):** add `.env`, `.env.*`, `.git`, local DB/test artifacts. `COPY server/ ./` copies everything not ignored — an unignored `.env` would land in a layer of a **public** image. Add a release-pipeline assertion (e.g. `docker history` / scan) that the built image contains no `.env` or secret material.
- Dockerfile `HEALTHCHECK` hitting `/healthz`; mirror it in `docker-compose.yml` so `up -d` shows healthy.
- `.github/workflows/release.yml`: `setup-qemu` + `buildx` + `build-push-action`, `linux/amd64,linux/arm64`, push on tag `v*` (+ `latest` on default branch), GHCR login via `GITHUB_TOKEN` (`packages:write`), OCI labels, **gha layer cache** (arm64 emulation is slow). Make the GHCR package **public**.
- `docker-compose.yml`: add an **`image: ghcr.io/jpdiesler/…:latest`** default path; keep `build: .` as a documented `compose.dev.yml` / commented alternative so the maintainer's own `--build` habit isn't broken.
- **Volume-ownership upgrade runbook (explicit deliverable, not a footnote):** document the one-time migration for the existing root-owned `wm_data` volume — stop container → `chown -R 1000:1000` (the `node` uid) the volume contents → start the new image as `USER node`. Add an entrypoint guard that **fails fast with a clear message if `/data` is not writable** (so an EACCES on upgrade is diagnosable, not a silent crash loop).
- README: default deploy becomes `docker compose up -d` (prebuilt); "build from source" moves under a Develop heading.

**Acceptance**
- A tagged release publishes an amd64+arm64 image to GHCR; a fresh host runs `docker compose up -d` (image path) with no toolchain and reports healthy; `curl /healthz` → 200 without auth; the image contains no `.env`.

> **LIVE-APP RISK:** USER/healthcheck/volume-ownership change the runtime image. **Validate on a throwaway stack first; do NOT redeploy the live instance mid-knockout.** The chown-on-upgrade is a required, ordered runbook step — skipping it crashes the live DB writes with EACCES.

---

## Phase 4 — Honest API-key story: graceful-optional boot + blunt docs

**Goal:** Remove the "key required to even boot" perception while being **honest** that automatic results/live/bracket need a **paid** api-football plan (Season 2026). Touches the `index.js` boot path + poller/sync guards.

**Effort: M · Depends on: Phase 1**

**Deliverables**
- App boots and serves the UI with `API_FOOTBALL_KEY` empty. **The guard is NOT already complete** — only `sync("start")` is gated today. Gate **all** of these in `index.js` behind `src.configured()` (or an equivalent guard that no-ops cleanly): `livePoll()` (which otherwise calls `anyMatchActive` → `sync()`), `applyRights()`, `syncBroadcasts("start")`, **and** the unconditional `cron.schedule(...)` registrations for `SYNC_CRON`, `PREVIEW_CRON`, `AI_TIP_CRON`, `REMINDER_CRON`, `EPG_CRON` (a key-less box should not spin crons that fetch). EPG/broadcasts may stay on if `EPG_URL/RIGHTS` are configured independently (see Phase 11) — but must not throw when the result provider is absent.
- Friendly multi-line startup banner (keep the existing "nicht konfiguriert" log): where to get a key, that the app still runs, what works without it.
- Frontend: dismissible **admin-only** banner / empty-state when `configured` is false (ride the boolean already in `/healthz` / the admin source payload; never leak the key).
- `.env.example` + README: reword `API_FOOTBALL_KEY` from "Pflicht" to **"optional for booting; required (paid plan, Season 2026) for automatic results/live/knockout-resolution"**, with an explicit "what works without it / what doesn't" list.
- **Defer (explicit later ticket):** admin manual result entry + manual K.o. pairing/champion override — the only thing that would make a key-less knockout truly playable (confirmed absent at `admin.routes.js:3`).
- **Feeds Phase 14:** the graceful key-less boot is exactly the state the Phase-14 setup wizard runs in (it serves the UI with no `API_FOOTBALL_KEY` so the operator can paste the key through the wizard); Phase 14 also turns this honest "what works without it" copy into the wizard's Step 1/Step 3 messaging.

**Acceptance**
- Container boots and serves with no key; **force a match into its live window and assert zero throws and zero outbound fetch** from `livePoll`/crons; README/.env.example state the paid-plan requirement up front; admin shows the unconfigured state.

> **LIVE-APP RISK:** this edits `index.js`'s boot/poll/cron wiring — the live hot path during knockouts. **Merge behind green CI, but do NOT redeploy to the live instance except in a match-day lull.** The live instance has a key and is functionally unaffected, so there is no urgency to redeploy mid-knockout.

> **Honesty note:** there is no internal standings/advancement engine, so "graceful without a key" means the bracket simply never fills. "Graceful" ≠ "fully playable" for K.o. rounds until the deferred manual-entry feature lands.

---

## Phase 5 — Shared, typed API contract (JSDoc/`.d.ts`, NO build step) + collapse scoring duplication

**Goal:** The highest-leverage, lowest-risk slice of "modern OSS / TypeScript." Document the contract that today lives only in maintainers' heads, give an editor-only safety net (Vite/Node ignore types — zero runtime/deploy change), and make the **multi-tournament generator target a frozen, typed shape**.

**Effort: M · Depends on: Phase 1 (done first so the shape is stable; do BEFORE multi-tournament so B-track aims at a fixed contract)**

**Deliverables**
- `shared/contract/index.d.ts`: `ApiState` typed from the **real** `stateForUser` return (`me, tips, champs, results, resolved, live, broadcasts, details, teamMeta, players, championActual, capabilities, meta, locks`) — with honest `?`/unions (the state is **privacy-conditional**: others' `tips`/`champs` appear only once `locked`/`champLocked`, per `state.js:36-43`). Plus `Tip, Result, Resolved{homeName,awayName,homeCode,awayCode,winner}, Live, MatchDetail, Preview, AiPrediction, AiBundle, Leaderboard row, Locks{offsetMin,serverNow,champLocked,champLockTs,lockedMatches}, Capabilities`.
- `shared/contract/tournament.d.ts`: `Team{name,wiki}, Match{n,ph,h,a,ven,dt,disp}, TournamentDef` — the exact shape the future generator must emit.
- **Collapse the scoring duplication (BOTH sources):** one canonical `score()/POINTS` (server stays source of truth; web re-exports via the generated copy + a `.d.ts`). Ship `scoring` in `/api/state` using the **EXISTING server key names** — `{ exact, goal_diff, tendency, champBonus }` (keep `goal_diff` snake_case to match `scoring.js` and the AI bundle; `champBonus` is net-new). `web/src/lib/scoring.js` (currently hardcoding `3/2/1` inline at lines 27–29) and `web/src/data.js CHAMP_BONUS` must read the server value (fallback to today's values for first paint).
- Add a node:test asserting **web↔server scoring parity** over a fixture matrix, AND that `bundle.js`'s `SCORING` object is derived from the same `POINTS` (so the AI EV math can never drift from displayed points — it consumes `POINTS.goal_diff` verbatim today).
- `App.jsx EMPTY_STATE` annotated `@type {import('shared/contract').ApiState}`; `web/jsconfig.json` gains a `shared/*` path (currently only `@/*`); server adds `jsconfig.json` with `checkJs:false` initially.
- CONTRIBUTING: "the API contract lives in `shared/contract` — change it there first."

**Acceptance**
- Editor type-checks `st` consumers against the contract; the parity test passes (web `score()` === server `score()` === values feeding the AI bundle); the leaderboard does not "jump" between optimistic web render and server refresh; deploy command unchanged (no compiler in the pipeline).

---

## Phase 6 — README polish + SECURITY + (deferred, non-blocking) Prettier check

**Goal:** OSS perception (G3) without churning the dense codebase. Lowest deploy-leverage, high legibility.

**Effort: M · Depends on: Phase 2, Phase 3**

**Deliverables**
- README: 2–3 screenshots (leaderboard / match detail / admin) captured against **seeded test data** (`seed.mjs`) — never real player names; one-paragraph pitch + 2-minute quickstart; CI + GHCR badges.
- `SECURITY.md`: how to report; **and** self-hoster guidance that matters now that Phase 3 makes the image trivially deployable — mandatory strong `SESSION_SECRET`/`AI_KEY_SECRET`, `COOKIE_SECURE=auto` behind a TLS proxy, AI provider keys are encrypted at rest (`AI_KEY_SECRET`), and the bootstrap admin password must be changed.
- Add matching `server/.prettierrc.json` + `format:check` script (mirroring web's 160/semi/double-quote). Run `format:check` as a **non-blocking, report-only** CI job scoped to changed files. **NO `prettier --write` over the tree, no blocking gate, no auto-installed pre-commit** — that would reformat the deliberately dense codebase and contradict CLAUDE.md.

**Acceptance**
- README shows screenshots + badges + quickstart; SECURITY.md covers reporting + secret hygiene; `format:check` reports on changed files only and never blocks a PR.

---

> ## ⛔ HARD GATE: everything below is DEFERRED until after the WM-2026 FINAL (2026-07-19)
> The phases below either generalize the live tournament's shape (`data.js`, bracket, timezone, KO-phase set, scoring) or churn ~60 files. Running them while knockouts are live is the single highest-destabilization risk in the roadmap. **Do not start Phase 7+ before the final.**

---

## Phase 7 — Tournament-as-data: generalize the definition (kill the WM-shaped hardcodes)

**Goal:** Turn the (now de-duplicated, server-canonical) `data.js` into a true tournament **definition** the engine reads at startup — generalizing bracket topology, timezone, the KO-phase set, and the WM-specific constants. Keystone of multi-tournament.

**Effort: L · Depends on: Phase 1, Phase 5 (target the frozen typed `TournamentDef`)**

> **Feeds Phase 14:** the `TournamentDef` + `TOURNAMENT_DEFINITION` pointer this phase introduces is what the Phase-14 wizard's tournament step (Step 4) and the Phase-11 switch flow both write — keep the pointer DB-/admin-settable, not env-only.

**Deliverables**
- `server/tournament/definition.js` (or JSON loaded by it): `{ id, name, tz, teams:{code:{name,wiki,aliases}}, groups:[…], matches:[{n,ph,h,a,ven,dtUtc,feeders?}], bracket:{finalN,thirdPlaceN?,rounds:[…],koPhases:[…],feedersOf}, scoring:{exact,goal_diff,tendency,champBonus,champEnabled} }`. The existing 104-match WM-2026 data becomes the **first definition** and must pass current tests (golden, behaviour-preserving).
- Move `FINAL_N` + champion-from-final out of `fixtures.js`/`sync.js` into `def.bracket.finalN`; thread `def` into `fixtures.js`.
- **Kill the `+02:00` hardcode** in `fixtures.js` **AND** `locks.js`: store `dtUtc` as real ISO-UTC + `def.tz`; derive the German `disp` string at render time. Focused test on `locks.js` + the kickoff-time-window K.o. matching (`TIME_TOL=90min`) to prove no off-by-hours lock regression.
- **Generalize `KO_PHASES` + `champLockTs`** (currently hardcoded `{R32,R16,QF,SF,FIN}` in `locks.js`): derive the KO-phase set from `def.bracket.koPhases`; compute `champLockTs` as "first KO kickoff" with an **explicit empty-set guard** (no KO phase ⇒ champion lock disabled, never `Infinity`). Without this fix, a tournament whose first KO code differs leaves the champion pick **permanently unlocked / hidden** (privacy bug).
- Web reads the definition (the Phase-1 generate step now copies the definition, not a hand-maintained twin). `Bracket.jsx` reads `rounds/finalN/thirdPlaceN/feedersOf` from the definition. **Note the actual work:** the `"Sieger Spiel N"` winner-feeder parse (`Bracket.jsx:9`) already generalizes — keep it as a fallback. The real L-work is **variable KO depth / non-symmetric trees + optional 3rd-place game** (`P3` already exists & renders in the WM data; EURO simply omits it) **+ data-driven group-origin feeders** (`"Sieger Gruppe C"`, `"3. (A/B/C/D/F)"`, currently unparsed).
- Replace the hardcoded `fwc26.jpg` final logo + "Weltmeister" wording with definition-driven labels.

**Acceptance**
- The WM-2026 definition reproduces today's behaviour (golden test green); a hand-written EURO-style definition (24 teams, 6 groups, no R32, no 3rd-place) renders a correct bracket, locks tips at the right wall-clock in its own timezone, **and locks the champion at its first KO kickoff** (no `Infinity`).

> **Risks:** `Bracket.jsx` generalization (variable rounds, optional P3, data-driven group-origin feeders) is real **L** UI work hiding inside a "refactor." Timezone + KO-phase-set changes are load-bearing for every lock/EPG comparison and for champion-lock privacy — test first.

---

## Phase 8 — Configurable scoring per tournament (closes the first Kicktipp gap)

**Goal:** Make exact/diff/tendency + champion-bonus-on/off a per-tournament setting, server-authoritative. Small once Phase 5 + Phase 7 put scoring under `def.scoring` and `/api/state`.

**Effort: S · Depends on: Phase 5, Phase 7**

**Deliverables**
- `def.scoring` read by `scoring.js POINTS`, `state.js leaderboard/matchdayBreakdown`, **and the AI EV bundle** (`bundle.js` consumes `POINTS` verbatim — must read the live config, not a cached const; `bundle.test.js` is the guard and moves in lockstep). Keep the `goal_diff` key name end-to-end.
- Admin editor in `AdminModal`: three number inputs + champion-bonus toggle, with a **"results already exist" lock/confirm gate** (changing points mid-tournament silently rewrites the leaderboard).
- Web already consumes scoring from `/api/state` (Phase 5) — no new web hardcode.

**Acceptance**
- Admin sets scoring before any result; leaderboard + AI tips reflect it; edits are blocked/confirm-gated once a result exists; `bundle.test.js` updated and green.

---

## Phase 9 — api-football generator: build a definition from league + season

**Goal:** One-shot generator so a new tournament is "swap the file." Narrower than it sounds — the engine fills K.o. teams **live from the API**, so the generator only needs labels/topology/dates, **not advancement math**.

**Effort: XL · Depends on: Phase 7**

**Deliverables**
- `server/tournament/generate.mjs`: fetch fixtures+standings (reuse `apifootball.adapter.js`, already parameterized by `API_LEAGUE/API_SEASON`) → write a `definition.json`. CLI (`node generate.mjs --league 4 --season 2024`) + an admin "Turnier generieren" action behind the API key.
- **Feeds Phase 14:** this generator (CLI + "Turnier generieren" action) is the engine behind the wizard's Step 4 — expose it so the wizard can drive `generate.mjs` behind the just-entered key, with the committed `definitions/` goldens (`wm-2026.json`, `em-2024.json`) offered as one-click presets. Note for Phase 14: the `API_LEAGUE/API_SEASON` reads it relies on live at `apifootball.adapter.js:49-50`, `:173-174` and `:237` (not line 287) — Phase 14 routes all three through `getTournamentRef()`.
- Round-name → phase mapper (group letter from standings; "Round of 32/16", "Quarter/Semi-finals", "3rd Place", "Final") with a **manual override table** for naming/localization drift, emitting `def.bracket.koPhases` so Phase 7's lock logic stays generic.
- Feeder/topology inference from K.o. round + chronological order; fall back to time-ordered slots where the API doesn't expose the bracket (engine still resolves teams live).
- **Stable team-code assignment** (3-letter IOC-ish) that survives a re-generate, or it orphans `team_meta`/logo overrides.
- **Offline-build reconciliation (cross-ref Phase 2/3):** the generator must emit `teams[code].wiki` filenames AND, in the same step, run `download-flags.mjs`/`download-team-logos.mjs` for the new codes and **commit the assets** — so the normal `web build` stays fully offline (a generated definition must never force a network fetch during the routine build that CI/Docker rely on).
- Committed `definitions/` dir (`wm-2026.json`, `em-2024.json`) as generator goldens + ready-to-run examples.

**Acceptance**
- `generate.mjs --league <EM> --season 2024` produces a definition that renders a correct EM bracket and group stage; re-running it keeps team codes stable; goldens match committed examples; **after generate + asset download + commit, a fresh CI web build runs fully offline.**

> **Risks:** api-football round strings vary/localize per competition — budget a **manual review step**, not full automation. Needs a paid plan to test. Denser EM/old-WM schedules stress the 90-min kickoff-match guard — verify.

---

## Phase 10 — Bonus / special bets (the BIGGEST Kicktipp gap) — net-new, additive

**Goal:** Top scorer, finalists, group winners. The most-wanted feature for a private group. Net-new surface (no existing bonus concept beyond champion), modeled on the working champion `champs/champLock` flow so it's additive and doesn't destabilize match scoring.

**Effort: XL · Depends on: Phase 7, Phase 8**

**Deliverables**
- Schema: `bonus_questions` (per tournament: `id, type[team|player|number|choice], prompt, options, points, lock_ts, correct_answer`) + `bonus_tips` (`user_id, question_id, answer`) + a migration. Optionally fold the champion pick in as a seeded `team`-type question. **Keep `bonus_tips` keyed by `user_id`** so a future `pool_id` retrofit stays additive.
- `db/bonus.js` mirroring `tips.js` lock-aware writes. **Per-question `lock_ts`** (group-winner locks at that group's start; top-scorer at tournament start) — subtler than the single champion lock; **privacy must match tips/champs exactly** (the `state.js:36-43` conditional pattern) or answers leak before lock.
- Fold bonus points into `leaderboard()` alongside the champion bonus; surface in `/api/state` with the same lock-privacy rules.
- **v1 is admin-authored + admin-resolved.** Auto-resolution (group winners from `fetchStandings`, top scorer from accumulated scorers/playerStats) is an **optional later enhancement** with a mandatory manual override — top-scorer aggregation/tie-handling is genuinely hard and deepens the paid-API dependence.
- Web "Bonusfragen" tab: `TeamSelect` (reused from champion) for team-type, player search, number/choice inputs; shows points/lock/correct after resolution.
- **AI players excluded from bonus questions in v1** (match tips + champion only) — call out in the UI that AI vs human aren't strictly comparable on bonus points.

**Acceptance**
- Admin authors + resolves a question; bonus points fold into the leaderboard; answers hidden until each question's lock; server tests cover scoring/lock/resolution/privacy.

---

## Phase 11 — Tournament scoping + thin-data graceful degradation

**Goal:** Make "one deployment per tournament" a clean, documented, switchable model and ensure tournaments with sparse api-football data render without empty shells.

**Effort: M · Depends on: Phase 7**

**Deliverables**
- A "switch tournament" admin/CLI flow: select a definition → **export the finished tournament first**, then wipe match-scoped tables (`results/tips/champs/resolved/live/match_detail/match_ext/broadcasts/ai_*/bonus_*`) while **preserving users + auth** (reuse `seed.mjs`'s reset). Destructive → confirmation required.
- **Export is a concrete, minimal deliverable (not a vague "export history"):** a single "export tournament archive" admin/CLI action that dumps the relevant tables to JSON (+ a rendered leaderboard) into `DATA_DIR`, reusing existing db read helpers — not a new reporting system. **The wipe REFUSES to run unless an export was produced** (or explicit `--force`).
- A `TOURNAMENT_DEFINITION` env/admin pointer so a fresh container boots straight into the chosen tournament; document the one-deployment-per-tournament model in CLAUDE.md + README.
- Make broadcasts/EPG **fully optional**: `EPG_URL/RIGHTS` empty → broadcasts table empty → web hides "Wo zu sehen"; de-couple German-specific RIGHTS from core.
- **Real thin-data QA pass:** a results-only tournament (no scorers/cards/lineups/odds) must render — verify `effectiveCapabilities` downgrades **and** the match-detail UI hides empty Prognose/Quoten/Aufstellung sections (don't just trust the caps flags).
- De-WM-ify remaining strings ("Spiel um Platz 3", champion wording) via definition-driven labels.

**Acceptance**
- Switching tournaments exports history first, preserves users, wipes match data, and refuses to wipe without an export; a thin-data tournament renders cleanly with no empty enrichment shells; EPG-off hides the broadcast UI.

---

## Phase 12 — Web → full TSX + web tests (trailing the feature work)

**Goal:** Complete the G3 TypeScript story on the web (Vite compiles TSX for free — zero deploy cost) and add the missing web/E2E test layer. Sequenced **last** so it doesn't double-churn the files Phase 7/9/11 edit.

**Effort: L · Depends on: Phase 5, Phase 7, Phase 9, Phase 11**

**Deliverables**
- Web: add `typescript` + `tsconfig.json` (`allowJs:true`, `strict:true` but `noImplicitAny:false` during migration, **`skipLibCheck:true` — required for HeroUI v3-beta's shifting types**), `typecheck = tsc --noEmit` as a **separate CI job, non-blocking for the image build** (red types never block `vite build`/deploy).
- Incremental rename **leaf→root**: `lib/*.ts` → `components/*.tsx` → `features/*.tsx` → `App.tsx` last; props typed from `shared/contract` (Phase 5). `.jsx` and `.tsx` coexist during migration. Keep types in signatures, not inline, to preserve density.
- typescript-eslint parser for `.ts/.tsx`; keep the existing "bugs + dead code, formatting to Prettier" rule philosophy.
- Vitest + RTL + jsdom: **scope the first pass to pure-logic + reducers** — `lib/scoring` (reuses the Phase-5 parity goldens), `matchtime`, `num`, and the `App` state-merge/`setTip` reducers (no portals/press). **HeroUI v3-beta component RTL is best-effort:** it is React-Aria-based (portals, press events) and finicky under jsdom — use `userEvent` (not `fireEvent`), and treat `MatchCard`/`LeaderboardTab` RTL as nice-to-have, not a gate.
- One Playwright E2E (login stub → see matches → enter a tip → see it persist), running against a built image + temp `DATA_DIR` (reuse `seed.mjs`), pairing with the Phase-3 `/healthz`. **The Playwright smoke (real browser) is the authoritative UI check** since it sidesteps jsdom's React-Aria gaps. Coverage reported as a CI artifact (**not** a hard gate).

**Acceptance**
- Web builds and deploys unchanged; `tsc --noEmit` runs in CI without blocking the image; Vitest logic suite + the Playwright smoke pass.

---

## Phase 13 — Server typing via JSDoc + checkJs (NO emit, NO build step)

**Goal:** Type the server contract boundary **without** a `tsc` compile — preserving the zero-build deploy (G1) that Phase 3 delivered.

**Effort: L · Depends on: Phase 5, Phase 12**

**Deliverables**
- Server `tsconfig.json` (`checkJs:true, allowJs:true, noEmit:true`), `typecheck = tsc --noEmit` as a CI-only check; `node index.js` keeps running raw `.js`.
- JSDoc `@param/@returns/@type` on the contract-producing functions (`stateForUser`, `leaderboard`, `detailByMatch`, `buildBundle/buildPreview`, `score`) importing `shared/contract`. Wrap better-sqlite3 `.get()/.all()` returns with `@type` casts at the db boundary.
- Enable per-file with `// @ts-check` and ratchet up — do **not** flip `checkJs` globally on day one.
- Dockerfile + `CMD` verified UNCHANGED (still `node index.js`, still copies prebuilt `node_modules`); CONTRIBUTING states "the server stays runnable as plain JS by design — no build step."

**Acceptance**
- `tsc --noEmit` type-checks the server boundary in CI; the runtime image and `docker compose up -d` are byte-for-byte unchanged in behaviour; no compile step added.

---

## Phase 14 — First-run Setup Wizard: the zero-config deploy capstone

**Goal:** A fresh `docker compose up -d` with **no `.env` and no config file beyond the Dockerfile + compose** boots into a guided, browser-based **setup wizard** that configures the whole product end-to-end — bootstrap superadmin, api-football connection, tournament selection, team logos/crests, Entra SSO, and Web-Push — then hands off to the running app. The **master encryption secret is auto-generated and persisted on first boot** (the operator sets nothing). This is the OSS-readiness payoff: every prior generalization (key-less boot, tournament-as-data, the generator, tournament scoping) becomes operable by a non-technical self-hoster through a UI instead of a `.env` file. Almost every step is a **UX layer over endpoints that already exist** — this is wiring + a guarded front door, not a rewrite. It is the LAST phase and the capstone several earlier phases feed into.

**Effort: XL · Depends on: Phase 3 (image + `/healthz` + `USER node` writable `/data` — the master secret lands on that writable volume), Phase 4 (graceful key-less boot — the wizard runs precisely when no key is set and the app must boot + render with no `API_FOOTBALL_KEY`), Phase 5 (the `Capabilities`/config contract the wizard reads), Phase 7 + Phase 9 (tournament-as-data + the api-football generator — Step 4 is the front-end that writes a `definition.json`), Phase 11 (tournament scoping — Step 4 doubles as the runtime tournament-switch UI via the same `TOURNAMENT_DEFINITION` pointer). HARD-GATED until after the 2026-07-19 final.**

**Mechanism (decided — resolves the secret-persistence + config-precedence constraints):**
- **Master secret is auto-provisioned, file-persisted, never regenerated.** On first boot, if no `AI_KEY_SECRET`/`SESSION_SECRET` is set in env **and** no persisted secret file exists, generate one (`crypto.randomBytes(32).toString("hex")`) and write it `0600` to a **distinct artifact in `DATA_DIR`** (e.g. `${DATA_DIR}/master.key`, alongside `tippspiel.db` — `connection.js:7` resolves `DATA_DIR`, `connection.js:11` `mkdirSync`es it). This follows the **existing VAPID auto-provision precedent** (`push.js:25-38` `ensureVapid` reads env-or-DB at `:27-28` and generates + persists at `:29-34` when both are empty) — but the master secret goes to a **`DATA_DIR` file, NOT the `settings` DB**, because it is the very key that derives the AES-256-GCM key (`secrets.js:14` `scryptSync(SECRET, "wm-tippspiel-ai", 32)`) which encrypts the DB's own at-rest secrets (today the per-provider LLM keys in `ai_provider_keys.key_enc`, `connection.js:152-158`). Storing it in the SQLite file it protects would defeat encryption-at-rest entirely. File + `0600` + the Phase-3 `USER node` ownership keeps it out of the DB it protects and out of any image layer. VAPID keys are categorically different — they are signing keys for push, so DB storage is correct for them; add a one-line comment at the resolver pointing at this asymmetry so it isn't "fixed" later by mistake.
- **One env-WINS resolver for every configurable key — but the master secret has a backward-compatible order.** Today three precedence orders contradict each other: the API token is **DB-first** (`getProviderToken` = `getSetting("token:apifootball","") || env`, `db/settings.js:17`), VAPID + rate/daily limits are **env-first** (`push.js:27-28`; `apifootball.adapter.js:287-288`), and the master secret is **env-first** (`secrets.js:9`). Introduce `resolveSetting(key, { envVar, default })` in `db/settings.js` implementing **env-WINS** (`process.env[envVar] ?? getSetting(key) ?? default`) plus `settingSource(key) → "env" | "db" | "default"`, and migrate the token to it (a deliberate behaviour flip — see LIVE-APP RISK). The master-secret resolver replaces `const SECRET = process.env.AI_KEY_SECRET || SESSION_SECRET` (`secrets.js:9`, where `SESSION_SECRET` itself falls back to the dev literal at `config.js:3`) with: **(1)** `AI_KEY_SECRET`; **(2)** `SESSION_SECRET` (legacy 12-factor deploys keep winning so already-encrypted AI keys still decrypt); **(3)** the `DATA_DIR` secret file if present; **(4)** otherwise generate, write `0600`, use it. **Hard rule: never overwrite an existing env value OR an existing secret file** — generation happens only when *all* sources are absent. This also drops the insecure `config.js:3` fallback for the cookie-secret path, so a real deploy is no longer silently insecure.
- **Wizard state is a settings flag.** New `getSetting("setup:completed", false)` (plain JSON via `setSetting`, `connection.js:227-229`) + `getSetting("setup:startedAt")`. While false and no admin exists, all non-asset, non-`/setup`, non-`/api/setup`, non-`/healthz` requests redirect to the wizard; once flipped, `/setup` is dead and the redirect guard is inert.
- **Every step writes through existing DB-backed setters** — no new persistence layer: API token via `setProviderToken("apifootball")` (`db/settings.js:18`), rate/daily via `setSourceConfig` (`db/settings.js:28`), tournament via the Phase-9 generator + Phase-11 `TOURNAMENT_DEFINITION` pointer, logos via the existing `team_meta` (`connection.js:110-115`) + `teamLogos.js` bulk-refresh, Entra via new **plain-JSON** settings keys, Web-Push via the existing auto-gen. The only secret the wizard collects is the api-football token (its own `setProviderToken` path, stored plaintext JSON same as today — tightening that is out of scope); LLM keys keep their dedicated encrypted table via `encryptSecret`/`decryptSecret` (`ai.js:32-42`); the master secret is the one thing the wizard must NEVER write to `settings`.

**Deliverables (ordered: master-secret → config→DB → Entra→DB → wizard flow → hijack protection → re-run):**

- **Boot-time master-secret provisioning** in a small keystore helper + the new resolver in `secrets.js`: generate → write `${DATA_DIR}/master.key` (`0600`, `node`-owned per Phase 3) → feed the effective encryption/session secret. Log a one-line "Master-Schlüssel in DATA_DIR generiert" notice on first generation only; **never log the key, never serialise it to the client** (matching the `secrets.js:1-5` contract). `secrets.js` keeps deriving its single static `KEY` from this secret (`secrets.js:14`) — the AI-key ciphertext format is unchanged. Extend the existing rotation warning (`secrets.js:10-11`): rotating/regenerating the master secret makes stored AI-key ciphertext **permanently and unrecoverably unreadable** (`decryptSecret` returns `null` on key mismatch, `secrets.js:28-38`; there is no re-encrypt routine — `KEY` is derived once at module load) and force-logs-out every session. **The only recovery is re-entering each provider key**, which re-encrypts under the new secret via `setAiProviderKey → encryptSecret` (`ai.js:32-37`). The wizard/admin must therefore refuse to silently overwrite an existing secret file or a present env secret.
- **Single resolver layer + env-as-override surfaced in the UI.** `resolveSetting`/`settingSource` in `db/settings.js`. Every wizard/admin field renders **read-only with an "extern verwaltet (per Umgebungsvariable)" badge** when `settingSource(key) === "env"` (generalising the existing per-token `tokenSource` computation at `admin.routes.js:83`); the write endpoints **refuse with HTTP 409 ("extern verwaltet")** for an env-pinned key so DB and env can't drift. This makes `.env` **optional, not abolished**: bare Docker run → wizard fills the DB; managed deploy → env pins a subset, wizard shows them locked and configures only the rest.
- **Tournament pointer becomes DB-backed (feeds Phase 7/9/11).** `API_LEAGUE`/`API_SEASON` are env-only today, read at call time in the adapter and defaulting `"1"`/`"2026"` at **three sites — `apifootball.adapter.js:49-50` (`fetchFixtures`), `:173-174` (`fetchStandings`), and `:237` (`fetchPlayerProfile`, season only)** (NOT line 287, which is `rateLimit`). Add `getTournamentRef()` → `{ league: resolveSetting("tournament:league",{envVar:"API_LEAGUE",default:"1"}), season: resolveSetting("tournament:season",{envVar:"API_SEASON",default:"2026"}) }` and replace **every** direct `process.env.API_LEAGUE`/`API_SEASON` read at those three sites with it (a partial swap would leave one call path on env-only and silently diverge from the wizard-set tournament). Wizard Step 4 writes these two keys; env still wins for pinned deploys.
- **Make Entra config DB/wizard-settable (the only auth code path that must change).** `middleware/auth.js:13-14` binds `TENANT`/`CLIENT_ID` to `process.env.*` **at module load**, and `entraConfigured()` (`:15`), `publicConfig()` (`:17-25`), `jwks()` (`:28-29`) and `verifyEntraIdToken()` (`:30-37`) all close over those frozen consts. Convert to an `entraCfg()` resolver `{ tenant: resolveSetting("entra:tenantId",{envVar:"ENTRA_TENANT_ID"}), clientId: resolveSetting("entra:clientId",{envVar:"ENTRA_CLIENT_ID"}) }` read **per call** (so a wizard save takes effect without a restart) and **invalidate the `_jwks` memo (`auth.js:28`) when the tenant changes**. Add `POST /api/setup/entra` (admin) writing the two keys. The SPA already consumes this at runtime — `initMsal(entra)` takes `{clientId, authority}` (`msal.js:13-16`). **No client secret is involved** — secretless SPA/public-client PKCE flow (`.env.example:36-40`), so nothing here goes through `encryptSecret` and **no `entra:*Secret` key exists anywhere**.
- **The `/setup` wizard (web) — 8 steps, German UI, on `app` outside `/api` auth, every step a UX layer over existing endpoints:**
  - **(1) Welcome / language** — informational; states what works with vs. without an api-football key (reuse the Phase-4 "what works without it" copy). No writes.
  - **(2) Create local superadmin — MUST come first.** Explicit chicken-and-egg: you cannot log in via Entra to configure Entra (Step 6), so a local password admin must exist first. This **replaces** the current `bootstrapAdmin()` auto-create-with-default-password (`auth.js:90-100`, run unconditionally at `index.js:20`, default password `"wm2026"` at `auth.js:92`) — a standing hijack vector on a public deploy. The wizard collects username + chosen password and calls the existing `createUser({…, is_admin:1, is_superadmin:1})` path (reuse `hashPassword`, `auth.js:9`); `bootstrapAdmin()` becomes a **no-op when setup is incomplete** so no default-password account is ever auto-created on a public image.
  - **(3) api-football key entry with LIVE validation** — UI over `POST /admin/sources/:id/token` (`admin.routes.js:100-104`) then `POST /admin/sources/:id/test` (`admin.routes.js:108-121`) which runs `probe()` (`apifootball.adapter.js:259-281`). Surface the probe's `client`, `plan`, and `quota{minuteLimit,minuteRemaining,dayLimit,dayRemaining,dayUsed}`; **warn that Season 2026 needs a paid plan** (`adapter.js:1-2`). Skippable (Phase-4 graceful boot keeps the app usable without a key).
  - **(4) Tournament selection** — the front-end of the Phase-9 generator, gated on Phase 7/9. Wraps `generate.mjs` (league+season → `definition.json`) behind the just-entered key; offers the committed goldens (`wm-2026.json`, `em-2024.json`) as one-click presets so the step works even before a custom generate. Sets the Phase-11 `TOURNAMENT_DEFINITION` pointer + the `tournament:league`/`tournament:season` keys above. Disabled with a "benötigt Phase 7/9" note if the generator isn't present yet.
  - **(5) Team-logos refresh** — UI over the fully existing bulk job: `POST /admin/teams/refresh-logos` + poll `GET /admin/teams/refresh-logos/status` (`admin.routes.js:42-43` → `teamLogos.js refreshTeamLogos`/`getTeamLogoProgress`). Reuse the existing `LogoProgress` Meter component (`AdminTeamsTab.jsx`) verbatim. Skippable; per-team override stays in the admin Mannschaften tab. No new storage, no new endpoint.
  - **(6) Entra SSO (optional)** — collect `tenantId` + `clientId` only (SPA public client, PKCE, **no client secret**, per `.env.example:36-40`); persist via the `entra:*` settings keys; the SPA picks them up at runtime via `initMsal(entra)` (`msal.js:13-16`). Skippable.
  - **(7) Web-Push (optional)** — VAPID keypair is **already auto-generated/persisted** on first use (`push.js:29-34`); the wizard only collects the VAPID **subject** (a real `https://` URL or `mailto:`, per `push.js:39-46`) and `APP_URL`. Purely `setSetting`; no key handling.
  - **(8) Done** → `setSetting("setup:completed", true)` (add `getSetupState`/`markSetupComplete` helpers next to the existing setters). After this, `/setup` is locked.
- **Server `/api/setup/*` routes** (own router, mounted before the global redirect guard and alongside the existing `/api` mounts at `app.js:30-33`): each step posts to the matching DB setter above; `GET /api/setup/state` is **unauthenticated and returns ONLY booleans** (`{ completed, hasApiToken, entraConfigured, vapidReady, adminBootstrapped }` — NEVER token/secret/key values, mirroring the Phase-3 `/healthz` rule and the `secrets.js:1-5` "never serialise secrets" contract); `POST /api/setup/complete` is admin-gated and flips the flag. The redirect guard in `app.js` must whitelist `/healthz` (a Phase-3 route — there is no `/healthz` in `app.js` today; it arrives with Phase 3) and must no-op the instant setup completes.
- **HIJACK PROTECTION — dual gate (the security crux):** lock once the first superadmin exists **AND** require a one-time `setupToken`. The **lock-on-first-admin** invariant (`countAdmins() > 0`, `users.js:13` = `is_admin=1 AND is_active=1`, or `setup:completed`) is durable but has a **bootstrap window** — between container start and the first admin being created, the wizard is wide open on a public URL, exactly when Step 2 hands out superadmin. So also gate `/setup` (page + its POSTs) behind a `setupToken` **auto-generated on first boot and printed to the container logs** (the only channel a legitimate operator has but a random visitor does not), valid until `setup:completed` flips. This matches the Gitea/Vaultwarden first-run pattern and is strictly stronger than either gate alone.
- **Race + replay hardening.** The Step-2 admin create must be **atomic and idempotent** — wrap the "no admin yet?" check + insert in a single better-sqlite3 transaction and re-assert `countAdmins()===0` inside it (or rely on the `users.username` UNIQUE constraint, `connection.js:23`, + the 409 the route already returns at `admin.routes.js:140`). First writer wins and flips `setup:completed`; the loser gets a clean "setup already completed / admin exists" 409 rather than a second silent superadmin. The single-use setup token (invalidated on first successful admin create) closes the same race from the front door. **Defence in depth:** the wizard's setup-only POSTs live on a router that returns **410 the moment `setup:completed` is true**, so they cannot be replayed post-setup; all *editing* thereafter goes through the normal `requireAdmin` routes.
- **Re-running later — every step editable from the normal admin UI, not one-shot.** Each step targets a tab that already supports re-editing: API key → Quellen (`/admin/sources*`), logos → Mannschaften (`AdminTeamsTab.jsx`), tournament switch → the Phase-11 switch flow, Entra/push subject → a small admin settings panel writing the same `setSetting` keys. So "keys rotate / tournaments switch (Phase 11)" is handled by the normal admin UI, not a second wizard run. A "Setup erneut ausführen" admin action **may** clear `setup:completed` to re-open the wizard (re-printing a fresh token), but the first-admin lock stays so it never becomes an unauthenticated entry point again.
- **`docker-compose.yml` + docs:** ship with **no required env** — just `image:` (Phase 3) + the `wm_data` volume; `.env` becomes fully optional, the wizard is the documented happy path ("Deploy = `docker compose up -d`, then open the app and follow the setup wizard"). Add `.env` and `.env.*` to `.dockerignore` (still missing — currently only `**/node_modules`, `server/public`, `server/data`, `*.log`; folds into the Phase-3 hardening). **Reframe `.env.example`:** drop "Pflicht" from `SESSION_SECRET` (`.env.example:2`), `ADMIN_PASSWORD` (`.env.example:3`), `API_FOOTBALL_KEY` (`.env.example:12`), and `AI_KEY_SECRET` (`.env.example:58`); document each as an **optional override** of a wizard/auto-provisioned value (recommended only for managed/12-factor deploys that want the secret outside the volume). Operational env stays env-only with sane defaults and **no wizard/DB** — `PORT`, `DATA_DIR`, `COOKIE_SECURE`, `APP_URL`, all cron schedules, `EPG_URL`, and the AI/budget tuning knobs.

**Acceptance**
- A **fresh container with an empty environment (no `.env`, only compose + volume)** boots healthy, auto-generates + persists a `0600` `node`-owned master secret in `DATA_DIR`, prints a one-time setup token to the logs, redirects to `/setup`, and a full walk of the wizard leaves the app **fully configured with no operator-edited config file and no container restart**: first admin logs in, the token probes green with real plan/quota, a tournament definition is selected/generated and the bracket renders, logos seed via the existing progress bar, and (if entered) Entra login + Web-Push work.
- **`${DATA_DIR}/master.key` is `0600`**, contains 64 hex chars, is **stable across restarts** (a restart reuses it, does not regenerate it, sessions survive with no forced logout), and **never appears** in logs, any `/api/*` response, or any image layer; an AI provider key set before a restart still `decryptSecret`s cleanly afterward (proving stable scrypt input, `secrets.js:14`).
- **No default-password admin is ever auto-created** on a fresh public image — Step 2 is the only way a superadmin comes into being (the `"wm2026"` path at `auth.js:92` is removed/no-op'd for public deploys).
- **The existing env-based deploy still boots unchanged:** with `SESSION_SECRET`/`API_FOOTBALL_KEY`/`ENTRA_*`/`VAPID_*` set in env (the live instance's shape), those fields render read-only "extern verwaltet"; a write returns 409 and does not mutate the DB; `settingSource()` returns `"env"`; **no `master.key` is written** when an env secret is present; and all previously stored AI keys still decrypt (no ciphertext orphaned by the unify change).
- **Tournament-ref migration is complete:** a grep for `process.env.API_LEAGUE`/`process.env.API_SEASON` in `apifootball.adapter.js` returns **zero** direct reads (all three sites — `:49-50`, `:173-174`, `:237` — now route through `getTournamentRef()`); a wizard-set league/season is honoured by `fetchFixtures`, `fetchStandings` **and** `fetchPlayerProfile`.
- **Precedence flip verified:** after a wizard token save with no env token, `settingSource("token:apifootball") === "db"` and `apifootball.adapter.js:289 configured()` → true; a later-added `API_FOOTBALL_KEY` env var now **WINS** (regression check for the flip away from today's DB-first `db/settings.js:17`).
- **Race test:** two concurrent Step-2 admin-create requests produce exactly one superadmin (second → 409/410), proven by a node:test around the transactional create + `countAdmins()` (`users.js:13`). `/setup` returns 403/410 (not the wizard) for a visitor without the token once any admin exists or `setup:completed` is true; with the token it works only until completion.
- **Entra without restart:** saving tenant/client in the wizard makes `entraConfigured()` true and `verifyEntraIdToken` validate against the new tenant with **no process restart** (the `_jwks` cache at `auth.js:28` is reset on change); confirm no `entra:*Secret` key exists anywhere (secretless PKCE).
- `GET /api/setup/state` returns only booleans; grep its response for token/secret plaintext → absent. The `settings` table contains the new keys as **plaintext JSON** and contains **no secret** (no master secret, no LLM key); `encryptSecret` still owns the LLM keys in `ai_provider_keys` (`ai.js:32-42`).

> **LIVE-APP RISK:** This phase is **hard-gated until after the 2026-07-19 final** and sits LAST (after Phase 13). It rewires four live hot-path concerns simultaneously: (1) `secrets.js`'s `SECRET` resolution — the input to the static AES `KEY` (`secrets.js:14`) that decrypts the live instance's stored AI provider keys, where a wrong precedence order or an accidental regenerate orphans those keys (AI players stop tipping) **and** force-logs-out every session, with **no recovery short of re-entering every provider key**; (2) the admin bootstrap (`index.js:20`, `auth.js:90-100`), which reconciles the live operator account on **every** boot — a regression can lock the maintainer out or re-expose a default-password admin; (3) the token precedence flip from today's **DB-first** (`db/settings.js:17`) to **env-WINS**, which on any box that set the token in the admin UI *and* also has `API_FOOTBALL_KEY` in env would suddenly hand control to the env value; and (4) a global redirect guard in `app.js`. The live WM-2026 instance already has every value in env, so it MUST take the **env-override path with byte-for-byte zero behaviour change** (`setup:completed` back-filled true on upgrade, no `master.key` written while `SESSION_SECRET` is in env). The single non-recoverable failure mode is regenerating the master secret on an instance that already has encrypted AI keys (`secrets.js:28-38`) — guard hard against ever overwriting an existing `master.key` or a present env secret. Validate the no-op-when-completed path on a throwaway stack, merge behind green CI, and **never redeploy the live instance mid-knockout**; on rollout, migrate any host that intended the DB token to win by one-time copying env→DB then unsetting the env var.

> **Honesty note:** "Zero-config" means *zero required env to boot and reach the wizard* — not "fully playable with no paid plan." Per Phase 4, automatic results/live/knockout-resolution still require a **paid api-football plan (Season 2026)**, and there is no internal advancement engine, so a key-less bracket simply never fills; the wizard makes that requirement explicit at the API step (Step 3) rather than hiding it in a `.env` comment. The wizard configures **one tournament for this one deployment** — it does not add multi-pool/multi-tournament (see Deferred).

> **Chicken-and-egg note:** Entra (Step 6) is deliberately gated behind a local superadmin (Step 2). You cannot authenticate via Entra to set up Entra; the bootstrap password account is the irreducible first credential and the only login that exists before SSO is wired. Likewise the master secret must be generated **once** and persisted before any secret is encrypted — it is a true encryption-root (unlike VAPID's signing keys), so it lives on the writable `/data` volume the Phase-3 `USER node` change guarantees, never in a settings row.

---

## Deferred / explicitly NOT doing (with rationale)

- **Multi-pool / multi-tournament in one DB:** DEFER indefinitely. Every table is keyed by `match_n` with no tournament/pool column; true multi-pool touches every scoring/state/privacy/AI path for near-zero value to a small private group. The cheap, correct model is **one deployment per tournament + one pool per deployment** (Phase 11). If ever needed: a `pool_id` column on `users` + a leaderboard/state filter — additive, not a separate DB.
- **Setup wizard for multi-tournament selection:** the Phase-14 wizard configures exactly ONE tournament for ONE deployment — it does NOT add multi-pool/multi-tournament selection (still one deployment per tournament, switched via the Phase-11 flow). This is consistent with the existing "Multi-pool / multi-tournament in one DB: DEFER indefinitely" entry above (one deployment per tournament + one pool per deployment).
- **Manual result / K.o. / champion entry:** filed as a later ticket (Phase 4). Only worth it if a key-less, fully-playable deploy becomes a real ask.
- **Top-scorer auto-resolution:** later enhancement on Phase 10; manual override stays mandatory.
- **Repo-wide Prettier reflow / blocking format gate:** never (Phase 6 keeps it report-only).
- **Server compiled-TS (tsc emit):** never — it would reintroduce a build step and break the Phase-3 no-build deploy. Phase 13 uses JSDoc+checkJs by design.
- **npm workspaces / root package.json:** never — contradicts the two-independent-packages design; Phase 1 uses a prebuild copy + staleness check instead.
