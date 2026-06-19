# WM 2026 Tippspiel — Repo Guide

Self-hosted World-Cup-2026 prediction game (Tippspiel) for a small private group. Runs as
a single Docker container `wm-tippspiel`; UI is German.

## Stack & layout
- **server/** — Node (ESM) · Express · better-sqlite3. Cron-driven sync, multi-provider
  data sources, AI players, web-push. DB lives in `DATA_DIR` (`/data` volume).
- **web/** — Vite · React 19 · HeroUI v3 (beta) · Tailwind v4. Built output goes to
  `server/public` (served by Express). PWA (installable on iOS home screen).
- No root package.json — `web/` and `server/` are independent npm packages.

## Commands
- Build web: `cd web && npm run build` (a `prebuild` step downloads flags / broadcaster
  logos / team crests into `src/assets/` — idempotent, committed, so no network at Docker
  build). Always run vite from `web/` (cwd matters).
- Tests: `cd server && npm test` (node:test; mock `globalThis.fetch`, temp `DATA_DIR`).
- Lint: `cd web && npm run lint` · `cd server && npm run lint` (ESLint flat config;
  Prettier is configured but NOT mass-applied — see Conventions).
- Deploy: `docker compose up -d --build` (rebuilds web + server into the image).

## Conventions
- **Commits**: one concise line, English, conventional-commit style. No body, no
  Co-Authored-By trailer. Solo repo → commit to `main` directly, **only when asked**;
  never push unless asked. Split work into focused per-concern commits (hunk-split a file
  that spans concerns).
- **Code style**: deliberately dense — single-line helpers, compact JSX. Match the
  surrounding density; comments explain the *why*, not the *what*. Don't reformat
  wholesale (Prettier `printWidth` is 160 and intentionally not run repo-wide).
- **Scores** are kept as **strings** (`""` = empty) end-to-end to match the API payload;
  the server validates ranges (`db.js` `cleanScore`).
- **Secrets**: AI provider keys are encrypted at rest (`AI_KEY_SECRET`), never sent to the
  frontend, never logged. `.env`/`.env.*` are gitignored — only `.env.example` is tracked.

## Data sources & display
- **Single provider: api-football** (api-sports.io) via `services/coordinator.js` — supplies
  every feature (results, live minute, scorers, cards, lineups, stats, predictions, odds,
  player stats; Season 2026 needs a paid plan). The coordinator keeps a per-feature merge +
  budget structure (one source today); `budgetedCall()` gates every ancillary call against
  per-minute + daily limits. (football-data was removed — api-football is the sole source.)
- **Team kit colours** come from the api-football lineup (`team.colors`), NOT flags
  (`lib/teamColors.js`). **Federation crests** (DFB eagle, Three Lions, …) are seeded from
  **Wikipedia article infoboxes** at build (`web/scripts/download-team-logos.mjs`) — NOT
  from api-football, whose national-team "crest" is just the flag. ~36/48 auto-seed; the
  rest + any override come from the admin **Mannschaften** tab (nickname + logo upload,
  stored in `team_meta`, logo served via `/api/team-logo/:code`, never in the state poll).

## Gotchas
- **HeroUI v3** is beta — verify components via the `heroui-react` MCP. A Popover trigger
  must be a HeroUI `<Button>` or wrapped in `<Popover.Trigger>`; a bare `<button>` does not
  fire (React Aria press handling). No Provider component; requires Tailwind v4.
- **iOS PWA + bottom sheet**: a `position:fixed` drawer sits behind the on-screen keyboard
  (the layout viewport doesn't shrink). `MatchDetail` uses a VisualViewport hook to lift
  the drawer and cap its height.
- **Live data is delayed** on the free tier (near-live, not realtime). The live clock is
  re-anchored to the server feed; updates also pushed over SSE with a poll fallback.
