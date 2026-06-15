# `@czo/translation` Sub-Graph Tagging — Design

**Date:** 2026-06-14
**Module:** `@czo/translation`
**Status:** approved, ready for plan

## Goal

Tag the `@czo/translation` GraphQL surface into audience sub-graphs (`@pothos/plugin-sub-graph`): the locale **read** surface into `['public','admin']`, the locale **management** surface (mutations + their errors) into `['admin']`. This is the last module in the sub-graph rollout sprint (foundation #130 → auth #131 → stock-location #132 → price #133 → channel #134 → inventory #135 → attribute #136).

## Nature of the module

`@czo/translation` owns a **platform-global locale registry** — locales are platform-wide (no `organizationId`), one is the platform default. Consumer modules key their translations by a locale `code` via the `translatedField` helper.

- **Reads are public**: storefronts need the locale list + default to render translated content. Already (partially) tagged `['public']` during the foundation work.
- **Management is global-admin**: `createLocale` / `updateLocale` / `deleteLocale` require the **global** `locale:create|update|delete` permission (no org tier). Currently **untagged** → they exist only on the default `/graphql` schema, absent from every named sub-graph.

There is **no org or account tier** (locales are not org-scoped), **no node-guard** (a public node needs no read gate), and **no service / migration / authz change**. This is pure tagging plus one gap-fix.

## Current state (pre-change)

Already tagged `['public']`:
- `locales` query (`drizzleConnection`) — **field-level tag only (1 position)**; the connection-type and edge-type are not explicitly tagged.
- `defaultLocale` query (`drizzleField`)
- `Locale` `drizzleNode`

Untagged (dropped from every named sub-graph, present only on default `/graphql`):
- `locale` (single by-id) query (`drizzleField`) — **the gap**: it is a public read like its siblings but missing the tag.
- `createLocale`, `updateLocale`, `deleteLocale` mutations.
- `LocaleNotFoundError`, `LocaleCodeTakenError` errors. (Kit-shared `ValidationError` / `OptimisticLockError` are tagged centrally in kit — never tag per-module.)

The existing `translation.e2e.test.ts` hits the **default** `/graphql` endpoint, so sub-graph isolation is **not currently tested**.

## Target state

### 1. Reads → `['public','admin']`

Widen the three existing public reads and fix the gap, so the admin app (querying `/graphql/admin`) can read back the locales it manages — self-contained, mirroring the price-module precedent (`resolvePrice` widened `public` → `['public','org']`). Storefronts keep reading from `/graphql/public`.

- `locales` `drizzleConnection` → **full 3-position tag** `['public','admin']`: field options + connection-type (2nd positional arg `{ subGraphs }`) + edge-type (3rd positional arg `{ subGraphs }`). The current 1-position tag is a latent under-tag; the exposure E2E is the guard.
- `defaultLocale` `drizzleField` → `subGraphs: ['public','admin']`.
- `locale` (by-id) `drizzleField` → **add** `subGraphs: ['public','admin']` (the gap-fix).
- `Locale` `drizzleNode` → `subGraphs: ['public','admin']`.

### 2. Mutations → `['admin']`

`createLocale`, `updateLocale`, `deleteLocale` — **5-point tagging** (all three carry an `errors` block):
- `...sg('admin').field` first in the field-options object (3rd arg), so explicit `authScopes` / `resolve` / `description` win via later-wins.
- `...sg('admin').input` first in the input-options object (2nd arg).
- `...sg('admin').payload` first in the payload-options object (4th arg).
- `...sg('admin').errorOpts` merged **inside** the existing `errors: { types: [...], ...sg('admin').errorOpts }`.

No mutation loses its `errors` block, so no error-union regression risk (the reorder-mutation gotcha from attribute does not apply here — every locale mutation already has errors).

### 3. Errors → `['admin']`

`registerError(builder, LocaleNotFound, { name: 'LocaleNotFoundError', subGraphs: ['admin'] })` and the same for `LocaleCodeTaken` (keeping its existing `fields`). Both errors are referenced only by the admin mutations (the by-id `locale` query catches `LocaleNotFound` internally and returns `null`, so it never surfaces the error on a read).

### 4. `sg()` helper

Add the module-local helper at `packages/modules/translation/src/graphql/schema/subgraphs.ts`, identical to every prior module:

```ts
import type { SubGraphName } from '@czo/kit/graphql'

export function sg(...names: SubGraphName[]) {
  const subGraphs = names
  return {
    field: { subGraphs },
    input: { subGraphs },
    payload: { subGraphs },
    errorOpts: { union: { subGraphs }, result: { subGraphs } },
  } as const
}
```

Used as `sg('public', 'admin')` for reads and `sg('admin')` for writes.

### 5. Exposure E2E

Thread a `subGraphs` option through `bootTranslationApp` (forwarded to `bootTestApp`), then add a suite that fetches the named sub-graph endpoints and asserts isolation:

- **`/graphql/public`**: `locales`, `locale`, `defaultLocale` present; `Locale` reachable via `node(id:)`; `createLocale` / `updateLocale` / `deleteLocale` **absent** (introspection or a request that errors with "Cannot query field").
- **`/graphql/admin`**: `createLocale` / `updateLocale` / `deleteLocale` present; `locales` / `locale` / `defaultLocale` present (widened reads).
- Mutations **absent** from `/graphql/public`; reads present on both.

Presence/absence assertions are the guard against silent-drop (under-tagged payload/result types vanish with no build error).

## Out of scope

- No schema migration, no authz/permission change, no new authz helper.
- No node-guard work (`Locale` is a public node; no registry entry needed).
- No change to `translatedField` / `pickTranslation` (consumer-side helper; its field's sub-graph membership is owned by the consumer node, not translation).
- Kit-shared error/scalar/filter types remain untouched.

## Validation

- `pnpm --filter @czo/translation check-types`, `pnpm --filter @czo/translation lint --max-warnings 0`.
- Rebuild kit dist (`pnpm --filter @czo/kit build`) before E2E if kit changed (it will not here, but `life` consumes built kit).
- `pnpm --filter @czo/translation test` (full module suite incl. new exposure E2E).
- `pnpm --filter life check-types` (downstream serving unchanged — `apps/life` already serves `['public','account','org','admin']`).
