# design-sync notes — @workspace/ui → "c-zo UI"

Project: https://claude.ai/design/p/fa62a698-2a27-4116-8e56-76bc8945fba3

## Stack

- shadcn/ui on **Base UI** primitives (`@base-ui/react`), **Nova** preset
  (`style: base-nova`), Tailwind v4. Light **and** dark tokens (`.dark`), Geist font.
- **37 components synced.** Authored previews (27): Alert, Avatar, Badge, Breadcrumb,
  Button, ButtonGroup, Calendar, Card, Checkbox, Collapsible, Empty, Input, InputGroup,
  Item, Label, NativeSelect, Pagination, RadioGroup, ScrollArea, Separator, Skeleton,
  Switch, Table, Tabs, Textarea, Toggle, ToggleGroup. Floor cards (interaction/overlay,
  importable but no static preview): AlertDialog, Combobox, Dialog, Drawer, DropdownMenu,
  Popover, Select, Sheet, Tooltip. (DatePicker renders its closed trigger — real
  content, not floor — but has no authored preview.)
- **EXCLUDED (in the kit but NOT synced):**
  - `Sidebar` — app shell, needs `SidebarProvider` context, not a composable primitive.
  - `Resizable` — drag-interaction layout AND has no root `Resizable` export (only
    `ResizablePanelGroup`/`ResizablePanel`/`ResizableHandle`), so no component name
    matches an export. Left out of `.ds-entry.mjs` + `cfg.componentSrcMap`.
- **`cfg.provider: TooltipProvider`** wraps every preview so Tooltip-dependent
  renders don't crash (harmless context for the rest). Changing it invalidates
  ALL grades (preview-affecting config), so a re-sync re-grades everything.

## Shape & how this repo is wired

- **package shape, synth-entry (no `dist`).** `@workspace/ui` ships source TSX only
  (exports map points at `src/*.tsx`); there is no build and no `.d.ts` tree.
- **`packages/ui/.ds-entry.mjs`** (gitignored) is a generated barrel re-exporting
  the synced components (all except `Sidebar`). The converter is run with
  `--entry packages/ui/.ds-entry.mjs` so `PKG_DIR` resolves to `packages/ui`
  (without it, synth mode looks in `node_modules/@workspace/ui`, which never
  exists for a self package).
- **`cfg.componentSrcMap`** pins the synced components — with no `.d.ts`,
  export-based discovery finds nothing, so the map is what populates the list.
  Add a component here AND in `.ds-entry.mjs` to include it.
- **`--node-modules packages/ui/node_modules`** — that's where `react`/`react-dom`
  resolve (the repo root has no hoisted `react`).
- **`cfg.tsconfig: tsconfig.json`** lets esbuild resolve the `@workspace/ui/*`
  path alias used inside the components (`@workspace/ui/lib/utils`).

## REQUIRED pre-step on every (re)sync: compile the Tailwind CSS

`@workspace/ui` has **no compiled CSS** — components are styled with Tailwind v4
utility classes + the token custom-properties in `src/styles/globals.css`. The
converter copies `cfg.cssEntry` verbatim, so the CSS must be pre-compiled:

```
node .design-sync/build-css.mjs        # writes packages/ui/.ds-compiled.css (cfg.cssEntry, gitignored)
```

Run it **before** `package-build.mjs` / `resync.mjs`, and **again whenever a
preview's classes change** (it scans `src/**` + `.design-sync/previews/**`).
It also ships a **curated safelist** (brand-token utilities + common
layout/spacing/type classes) so the design agent's NEW compositions render
on-brand — `styles.css` is a closed utility set, not the live Tailwind engine.
**If a design needs a utility outside the safelist, add it to `build-css.mjs`'s
`safelist` and re-run.** Tailwind packages are resolved transitively through
`@tailwindcss/postcss` (a direct dep) — `@tailwindcss/node`/`oxide` are not
directly resolvable from the package.

## Full (re)build sequence

```
node .design-sync/build-css.mjs
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules packages/ui/node_modules --entry packages/ui/.ds-entry.mjs \
  --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]
```

## Environment

- **Playwright needs OS libs** here (libnspr4 etc. were missing): the browser
  download alone isn't enough — run `npx playwright install-deps chromium`
  (needs sudo; available in this env) once, then `chromium.launch()` works.

## Known render warns

- None. Render check is 6/6 clean.

## Nova preset deps (in packages/ui)

- `globals.css` now `@import`s `shadcn/tailwind.css` (Nova base styles, resolved
  via shadcn's `style` export condition) and `@fontsource-variable/geist`. So
  `packages/ui` must keep `shadcn`, `@fontsource-variable/geist`, and
  `@base-ui/react` as deps (all in the workspace catalog). `build-css.mjs`
  compiles all of this fine via `@tailwindcss/node`.

## Re-sync risks (watch-list)

- **CSS pre-compile is out of band.** `resync.mjs` does NOT run `build-css.mjs`.
  Forget it and a styling change silently won't reach the bundle. Always run it first.
- **Safelist drift.** The shipped utility surface is the `safelist` in
  `build-css.mjs`, not all of Tailwind. New brand tokens added to `globals.css`
  must also be added to `SEMANTIC_TOKENS` there or their utilities won't ship.
- **Dark mode exists now.** `globals.css` ships `:root` + `.dark` (Nova). Previews
  render light; the conventions header documents both.
- **Barrel must track the component set.** Adding a component means adding it to
  `packages/ui/.ds-entry.mjs` AND `cfg.componentSrcMap` (both gitignored/config),
  else it won't bundle or be discovered.
- **Group is `general`.** All 6 live under `components/general/` (src path has no
  meaningful grouping dir). Regroup via a `cfg.docsMap` category stub if desired.
- **Theme can change under you.** Switching shadcn presets / re-running `shadcn init`
  rewrites `globals.css` and may re-introduce duplicate imports — dedupe and re-run
  `build-css.mjs` before syncing.
