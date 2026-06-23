# Contributing

Thanks for your interest in WM-Tippspiel. A few project-specific notes will save you
time — please skim them before opening a PR.

## Repository layout — two independent packages

There is **no root `package.json`** and **no workspace**. `server/` and `web/` are two
independent npm packages, each with its own dependencies and lockfile:

- **`server/`** — Node (ESM) · Express · better-sqlite3. API, cron-driven sync, the
  api-football data source, AI players, web-push. Data lives in SQLite under `DATA_DIR`.
- **`web/`** — Vite 5 · React 19 · Tailwind v4 · HeroUI v3 (beta). The build output goes
  to `server/public` and is served by Express.

Install and run each package on its own.

## Commands

```bash
# server
cd server && npm install
npm test            # node:test — server only; there are no web tests yet
npm run lint

# web — vite MUST run from web/ (cwd matters)
cd web && npm install
npm run build       # prebuild downloads flags/logos/crests, then vite build → server/public
npm run lint
```

`npm run build` in `web/` first runs a `prebuild` step that downloads flags, broadcaster
logos and federation crests into `web/src/assets/`. Those assets are committed and the
scripts skip files that already exist, so a normal build needs no network.

## `data.js` is shared — edit the server copy

`server/data.js` is the **source of truth** for teams + schedule; `web/src/data.js` must
stay **byte-identical** to it. Until the de-duplication on the [roadmap](ROADMAP.md)
lands, edit `server/data.js` and mirror the change into `web/src/data.js` in the same
commit. Never let the two drift.

## Code style

The codebase is **deliberately dense** — single-line helpers, compact JSX. Match the
density of the surrounding code; comments explain the *why*, not the *what*.

- **Do not mass-reformat.** Prettier is configured (`printWidth: 160`) but is
  intentionally **not** run across the tree. A formatting-only change that reflows
  unrelated code will be declined.
- ESLint catches bugs and dead code; leave formatting to your editor within the existing
  style. An `.editorconfig` pins LF / UTF-8 / 2-space and deliberately does **not** trim
  trailing whitespace.

## Scores are strings

Match scores are kept as **strings** (`""` = empty) end-to-end, matching the API payload;
the server validates ranges. Don't turn them into numbers along the data path.

## Commits

One concise line, **English**, conventional-commit style (`feat:`, `fix:`, `docs:`,
`chore:`, …) — no body, no `Co-Authored-By` trailer unless there genuinely is a
co-author. Split work into focused, per-concern commits.
