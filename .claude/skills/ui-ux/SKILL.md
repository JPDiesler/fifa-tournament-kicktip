---
name: ui-ux
description: >-
  Use this skill for ANY frontend or WebUI work in this project — building,
  editing, reviewing, refactoring, or debugging React components, pages,
  layouts, forms, drawers, modals, tables, leaderboards, cards, charts, or any
  .tsx/.jsx UI file. Trigger whenever the task touches rendered interface,
  styling, component selection, props, theming, responsive behavior, loading/
  empty/error states, or data visualization. This project's UI is built with
  HeroUI v3 (@heroui/react) first, Tailwind only as a fallback. The skill
  enforces an MCP-first, plan-first workflow and the project's house rules so
  the UI stays consistent, performant, and coherent across dark and light mode.
---

# UI/UX — HeroUI v3, MCP-First, Plan-First

This is the single source of truth for how UI is built in this project (the WM
2026 Tippspiel: React + Express, Docker, HeroUI v3). It is a **greenfield**
codebase — there is no existing component inventory yet, so this skill is a
*build plan*: create clean, reusable components and reuse them instead of
duplicating variants.

## Priorities (resolve trade-offs in this order)

1. **Consistency** — one coherent look; reuse before reinventing.
2. **Performance** — lean components, lean dependency tree, no needless re-renders.
3. **Speed of delivery** — ship, but never at the cost of 1 or 2.
4. **Accessibility** — largely *inherited* from HeroUI (focus, ARIA, keyboard are
   built in). Do not actively re-engineer a11y; just **never break** what HeroUI
   gives you.

## Golden rule: HeroUI v3 first, Tailwind only as fallback

Build everything from **HeroUI v3 (`@heroui/react`)** components. Reach for raw
Tailwind only when HeroUI genuinely has no component for the job — and then only
for layout (flex/grid/gap/positioning), never to re-style what a HeroUI token or
component already covers.

## Workflow

### 1. Query the HeroUI MCP before writing UI code

The `heroui` MCP server is connected and is the authoritative, always-current
source for component APIs. Your training memory is not. Before writing or
editing any component:

1. `list_components` — confirm the component exists in v3 and get its exact name.
2. `get_component_props` / `get_component_docs` — real prop names, types, slots,
   data-attributes for every component you'll use. Never guess or invent props.
3. `get_component_examples` — pull a canonical usage example before composing.
4. `get_theme_variables` — when color/spacing is involved, use theme tokens.
5. `get_component_source` / `get_component_styles` — only when debugging.

If the MCP server is unreachable, **STOP and tell the user** — do not silently
proceed from memory.

### 2. Plan first, build only after explicit "go"

For any non-trivial UI task, present a **short plan before writing code** and
**wait for the user's go**:

- which HeroUI components you'll use (verified via MCP),
- the layout/responsive approach,
- which new project components you'll create and where they live,
- any state/data needs (loading/empty/error).

Small, obvious edits (a prop tweak, a copy change) can be done directly. The
plan-first rule is for anything that adds components, changes layout, or touches
multiple files.

## Component conventions

- **Greenfield:** create reusable components; check the codebase for an existing
  one before building a new equivalent.
- **Structure** *(assumption — override if you prefer otherwise)*:
  - `src/components/ui/` — thin HeroUI wrappers / shared primitives.
  - `src/components/features/` — domain components (e.g. MatchDetailDrawer,
    Leaderboard, TippForm, AI Reasoning Cards).
- **Naming:** PascalCase filenames (`MatchDetailDrawer.tsx`).
- **File vs folder:** simple component → single `.tsx` file. Complex component →
  its own folder with a barrel `index.ts`. Use barrel exports **only** for
  complex components, not everywhere (keeps tree-shaking clean — priority #2).
- **Line budget** *(assumption — adjust if you want 200/300)*: soft limit
  **~250 lines** per file. Past that, extract a subcomponent rather than
  hard-truncating. An overlong file usually means a child component wants out.

## Tailwind fallback rules

When Tailwind is unavoidable:

- **No arbitrary values** (`w-[327px]`, `text-[#1a1a1a]`, `gap-[13px]`). They are
  the main reason a UI drifts apart over time. Use the scale only.
- Tailwind utilities must map to the **HeroUI theme tokens / spacing scale**, not
  raw values.
- Use a **`cn()` helper** (clsx + `tailwind-merge`) for all conditional class
  composition. If it doesn't exist yet, create it once in `src/lib/utils.ts`.
- Tailwind is a **layout filler** (flex, grid, gap, alignment) — not a substitute
  for HeroUI components or tokens.

## Theming

- **Colors:** neutral for now (no brand palette defined yet). Build on the HeroUI
  default theme; do not hardcode a palette.
- **Typography & spacing:** HeroUI defaults.
- **Dark mode is the default. A working toggle to light mode is MANDATORY.**
  This is the single most important theming rule: **every component must work in
  both modes.** That means colors come **exclusively from theme tokens** —
  never a mode-dependent hardcode, never a raw hex. Verify a new view in both
  modes before considering it done.

## Hard "don'ts" (never do these)

- ❌ Raw `<button>` / `<input>` / `<select>` (and friends) — use the HeroUI
  component instead.
- ❌ Hardcoded hex colors or inline `style={{ ... }}`.
- ❌ Custom modals / drawers / tooltips — use the HeroUI equivalents.
- ❌ `any` in TypeScript. Type everything; derive types from schemas where possible.
- ❌ Arbitrary Tailwind values.

## Responsive

- **Equal-weight responsive** (not mobile- or desktop-first): one responsive
  component tree that adapts, not separate mobile/desktop layouts.
- **Standard breakpoints** (`sm` / `md` / `lg` / `xl`) — no custom breakpoints.
- Layout baseline *(assumption — override if you want something stricter)*:
  centered container with a sensible **max content width**, **uniform container
  padding** across pages so it doesn't sprawl on large monitors.

## States — mandatory

**Every data-dependent view must ship Loading, Empty, and Error states.** No
exceptions; this is a definition-of-done item.

- **Loading:** HeroUI `Skeleton` (preferred for content shape) or `Spinner`.
- **Empty:** a deliberate empty view (message + optional action), never a blank
  table or silent nothing.
- **Error:** surfaced via HeroUI `Toast` (transient) or inline error (persistent),
  with a retry path where it makes sense.

## Animation

- **HeroUI components:** use their built-in transitions. Don't override them.
- **Own feature components:** may and should use **`framer-motion`** — kept
  subtle and consistent so motion reinforces the coherent look rather than
  competing with it.

## Forms, icons, charts

- **Forms:** built **entirely from HeroUI form components** (no raw inputs).
  Validation and type-safety via **`zod`** schemas — the schema is the single
  source of truth for both runtime validation and TS types (no `any`). Wire
  HeroUI's validation slots/data-attributes to the zod result.
- **Icons:** **`lucide-react`** only. Don't mix icon sets.
- **Charts:** **Recharts**, themed via **theme tokens / CSS variables** so dark
  and light both work automatically — never hardcode chart colors. Datasets here
  are small (tables, W/D/L probabilities, a handful of fixtures), so SVG is the
  right choice; do not reach for a Canvas library.
  - **Score-probability matrix** (Poisson / Dixon-Coles, e.g. 0–5 × 0–5 goals):
    Recharts is weak at heatmaps — use a **token-styled CSS grid** instead (HeroUI
    colors, no chart-lib overhead). Reach for a heavier lib (e.g. ECharts) only if
    real heatmaps/sankey/etc. become a genuine requirement — and then ask first.

## Dependencies

**Never add an npm package on your own initiative. Always ask first** and
explain why it's needed and what it costs (bundle size, maintenance). Keeps the
dependency tree lean and consistent (priority #1 and #2).

## Definition of done (check before returning UI code)

- [ ] A plan was shown and approved for any non-trivial UI work.
- [ ] Every HeroUI component used was verified against the MCP this session.
- [ ] No invented props; all props match the MCP's reported signature.
- [ ] HeroUI-first; Tailwind only as layout fallback, with the `cn()` helper and
      no arbitrary values.
- [ ] No hardcoded colors, no inline styles, no raw form elements, no custom
      modal/drawer/tooltip, no `any`.
- [ ] Works in **both dark and light mode** (verified).
- [ ] Responsive across `sm`/`md`/`lg`/`xl`.
- [ ] Loading, Empty, and Error states present for data-dependent views.
- [ ] Forms use HeroUI components + zod; icons are lucide-react; charts use
      Recharts with token theming.
- [ ] No new dependency added without asking.
