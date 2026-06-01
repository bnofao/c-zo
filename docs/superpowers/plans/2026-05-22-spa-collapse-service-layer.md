# SP-A — Collapse Split Service/Layer Pairs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse every split `services/<name>.ts` (contract) + `layers/<name>.ts` (Live) pair in `@czo/auth` and `@czo/stock-location` into a single `services/<name>.ts` file matching the SP1 pattern (`session.ts`).

**Architecture:** Pure structural refactor — no behavior, signature, or DB change. Each pair's contract and `Layer` body move **verbatim** into one file that ends with `export const layer = Layer.effect(Tag, make)`; the old `layers/<name>.ts` is deleted. Barrels switch to namespace exports (`export * as Organization`); a `tsc`-guided sweep fixes the call sites. Five event-pair collapses and the dead-code cleanup ride along.

**Tech Stack:** `effect@4.0.0-beta.70`, `drizzle-orm@1.0.0-rc.3` (`effect-postgres`), Vitest. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-05-22-spa-collapse-service-layer-design.md`

---

## Conventions for every task

- **The collapse operation** (applied per pair `<name>` in module `<mod>`):
  1. Mirror `services/<name>.ts` and `layers/<name>.ts` into `old/` (see below).
  2. Rewrite `services/<name>.ts` = old contract (verbatim) + old layer body as a
     module-private `make` (verbatim) + the `export const layer` block (Task gives
     the exact block).
  3. Delete `layers/<name>.ts`.
  4. Update `services/index.ts` and `layers/index.ts` barrels (Task gives exact lines).
  5. `tsc`-guided sweep: fix every call site `tsc` flags (transformation table below).
  6. Move the test file `layers/<name>.test.ts` → `services/<name>.test.ts`; update
     its imports + layer-construction calls.
- **`old/` convention:** before deleting or rewriting a file, copy it to
  `old/<original-path>` (e.g. `old/packages/modules/auth/src/layers/actor.ts`).
  `old/` is deleted in the final task. This is the repo's destructive-refactor safety net.
- **Verbatim move:** the contract body (Tag, errors, types, helpers) and the layer
  implementation body are **not edited** — only relocated. Do not "improve",
  rename, or re-order them. The *only* new code is the `export const layer` /
  `export function makeLayer` block and the barrel edits.
- **Import transformation** (apply at every `tsc`-flagged call site):
  | Before | After |
  |---|---|
  | `import { XService } from '@czo/<mod>/services'` | `import { X } from '@czo/<mod>/services'` → use `X.XService` |
  | `import { makeXServiceLive } from '@czo/<mod>/layers'` | `import { X } from '@czo/<mod>/services'` → use `X.makeLayer(...)` or `X.layer` |
  | `import { XServiceLive } from '@czo/<mod>/layers'` | `import { X } from '@czo/<mod>/services'` → use `X.layer` |
  | `import { XService } from '../services/<name>'` (deep) | **unchanged** — deep named imports still resolve |
  | `import { makeXServiceLive } from '../layers/<name>'` (deep) | `import { makeLayer } from '../services/<name>'` |
- **Naming:** every collapsed file exports `layer`. `actor`/`access` additionally
  export `makeLayer(...)` (renamed from `makeXServiceLive`). Tags, errors, and
  types keep their **current names** — only the layer/factory export is renamed.
- **Type-check:** `pnpm check-types` in each touched package; the target is the
  **Task 1 baseline** — no NEW errors. Pre-existing in-flight-migration errors are
  out of scope; never touch them.
- **Tests:** each pair's relocated suite must pass; the SP1 30-test auth suite is
  the cross-cutting regression gate, re-run in Task 12.
- **Commits:** **do NOT commit during execution.** `git add` (stage) only — one
  review + commit after Task 12 (the repo's no-commit-until-final-review
  preference). **Never run `git stash`.** Do not stage the spec or this plan.

---

## File Structure

**Per collapsed pair** — `services/<name>.ts` rewritten, `layers/<name>.ts` deleted,
`layers/<name>.test.ts` → `services/<name>.test.ts`.

**Barrels rewritten:** `auth/src/services/index.ts`, `auth/src/layers/index.ts`,
`stock-location/src/services/index.ts`; `stock-location/src/layers/` **deleted**.

**Deleted:** `auth/src/services/{account,session,twoFactor}.service.ts`;
`stock-location/src/layers/` (whole directory).

**Modified (sweep):** `auth/src/module.ts`, `stock-location/src/plugins/index.ts`,
`auth/src/graphql/index.ts`, `auth/src/plugins/access.ts`,
`stock-location/src/plugins/index.ts`, `stock-location/package.json`, plus whatever
`tsc` flags. `kit/src/graphql/builder.test.ts` + `sdl.test.ts` (Task 11).

**Unchanged:** `auth/src/services/auth.ts`, `auth-instance.ts`,
`layers/auth.ts`, `layers/better-auth/` (SP5 territory); all SP1 single-file
services; `package.json` `exports` for `@czo/auth` (keeps `./layers`).

---

## Task 1: Capture baselines

**Files:** none (measurement task).

- [ ] **Step 1: Record `check-types` baselines**

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types 2>&1 | grep -cE "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -cE "error TS"
cd /workspace/c-zo/packages/modules/stock-location && pnpm check-types 2>&1 | grep -cE "error TS"
```

Write the three counts into this plan here before continuing — they are the
no-NEW-errors targets for every sweep.

**Task 1 baseline:** `@czo/kit: 40`, `@czo/auth: 73`, `@czo/stock-location: 109`

- [ ] **Step 2: Record the baseline test state**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/layers 2>&1 | tail -5
```

Confirm the 5 layer suites (`actor`, `access`, `api-key`, `auth`, `organization`,
`user`) currently pass; note any pre-existing failure so it is not blamed on SP-A.

- [ ] **Step 3: Create the `old/` mirror root**

```bash
mkdir -p /workspace/c-zo/old
```

---

## Task 2: Collapse `actor`

**Files:**
- Modify: `packages/modules/auth/src/services/actor.ts`
- Delete: `packages/modules/auth/src/layers/actor.ts`
- Create: `packages/modules/auth/src/services/actor.test.ts` (moved)
- Delete: `packages/modules/auth/src/layers/actor.test.ts`
- Modify: `packages/modules/auth/src/services/index.ts`, `layers/index.ts`

`actor` is a pure `Layer.sync` registry — no DB, no service deps — the safest start.

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/actor.ts old/
cp --parents packages/modules/auth/src/layers/actor.ts old/
cp --parents packages/modules/auth/src/layers/actor.test.ts old/
```

- [ ] **Step 2: Build the merged `services/actor.ts`**

Append the layer implementation to `services/actor.ts`. Take the **entire body**
of `layers/actor.ts` and inline it below the contract, with this export shape
(the old `makeAuthActorServiceLive` becomes `makeLayer`; the old
`AuthActorServiceLive` convenience constant becomes `layer`):

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * Parameterized layer — seed the actor registry and optionally freeze it at
 * boot. Body moved verbatim from the former `layers/actor.ts`.
 */
export function makeLayer(
  initialActors?: InitialActors,
  freezeOnInit = false,
): Layer.Layer<AuthActorService> {
  // <verbatim body of the former makeAuthActorServiceLive>
}

/** Default layer — empty, unfrozen registry. */
export const layer = makeLayer()
```

Keep the `InitialActors` type export. Remove the now-duplicate imports the layer
body brought in if the contract file already imports them; add any the contract
file lacks (`Layer`, etc.).

- [ ] **Step 3: Delete the layer file**

```bash
rm packages/modules/auth/src/layers/actor.ts
```

- [ ] **Step 4: Update the barrels**

In `services/index.ts`, change the `actor` line from `export * from './actor'` to:

```ts
export * as Actor from './actor'
```

In `layers/index.ts`, **delete** the line:

```ts
export { AuthActorServiceLive, type InitialActors, makeAuthActorServiceLive } from './actor'
```

- [ ] **Step 5: Move the test file**

```bash
git mv packages/modules/auth/src/layers/actor.test.ts \
       packages/modules/auth/src/services/actor.test.ts
```

In the moved `services/actor.test.ts`: change `from '../layers/actor'` /
`from './actor'`-style imports to `import * as Actor from './actor'`, and replace
`makeAuthActorServiceLive(...)` → `Actor.makeLayer(...)`, `AuthActorServiceLive`
→ `Actor.layer`, `AuthActorService` → `Actor.AuthActorService`.

- [ ] **Step 6: Sweep the call sites**

Run `cd /workspace/c-zo/packages/modules/auth && pnpm check-types`. For each NEW
error vs the Task 1 baseline, apply the import-transformation table. Known sites:
- `src/module.ts` — `makeAuthActorServiceLive(...)` from `@czo/auth/layers` →
  `Actor.makeLayer(...)`, importing `Actor` from `@czo/auth/services`.
- `src/http/credential.test.ts` — imports `makeAuthActorServiceLive` from
  `../layers/actor` → `import { makeLayer } from '../services/actor'`.

- [ ] **Step 7: Type-check + test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
pnpm vitest run src/services/actor.test.ts
```
Expected: `check-types` back to the Task 1 `@czo/auth` baseline; `actor` suite passes.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 3: Collapse `access`

**Files:**
- Modify: `packages/modules/auth/src/services/access.ts`
- Delete: `packages/modules/auth/src/layers/access.ts`
- Move: `layers/access.test.ts` → `services/access.test.ts`
- Modify: `services/index.ts`, `layers/index.ts`

Same shape as `actor` — `access` is also a pure `Layer.sync` registry (it builds
on better-auth's `createAccessControl`, but that is a build-time import, not a
`BetterAuth` service dependency).

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/access.ts old/
cp --parents packages/modules/auth/src/layers/access.ts old/
cp --parents packages/modules/auth/src/layers/access.test.ts old/
```

- [ ] **Step 2: Build the merged `services/access.ts`**

Inline the entire `layers/access.ts` body below the contract:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * Parameterized layer — seed the access registry and optionally freeze it at
 * boot. Body moved verbatim from the former `layers/access.ts`.
 */
export function makeLayer(
  initialOptions?: InitialAccessOptions,
  freezeOnInit = false,
): Layer.Layer<AccessService> {
  // <verbatim body of the former makeAccessServiceLive>
}

/** Default layer — empty, unfrozen registry. */
export const layer = makeLayer()
```

Keep the `InitialAccessOptions` type export.

- [ ] **Step 3: Delete the layer file**

```bash
rm packages/modules/auth/src/layers/access.ts
```

- [ ] **Step 4: Update the barrels**

`services/index.ts`: `export * from './access'` → `export * as Access from './access'`.
`layers/index.ts`: delete the line
`export { AccessServiceLive, type InitialAccessOptions, makeAccessServiceLive } from './access'`.

- [ ] **Step 5: Move the test file**

```bash
git mv packages/modules/auth/src/layers/access.test.ts \
       packages/modules/auth/src/services/access.test.ts
```
Update its imports to `import * as Access from './access'`; `makeAccessServiceLive`
→ `Access.makeLayer`, `AccessServiceLive` → `Access.layer`, `AccessService` →
`Access.AccessService`.

- [ ] **Step 6: Sweep the call sites**

`pnpm check-types` in `@czo/auth`; fix NEW errors. Known sites:
- `src/module.ts` — `makeAccessServiceLive(accessOptions as never, false)` →
  `Access.makeLayer(accessOptions as never, false)`.
- `src/plugins/access.ts` — imports `HierarchyLevel` (type) from `@czo/auth/services`
  → `Access.HierarchyLevel`.
- `stock-location/src/plugins/index.ts` — imports `AccessService`, `HierarchyLevel`
  from `@czo/auth/services` → `Access.AccessService`, `Access.HierarchyLevel`. This
  touches `@czo/stock-location`; run its `check-types` too.

- [ ] **Step 7: Type-check + test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
pnpm vitest run src/services/access.test.ts
cd /workspace/c-zo/packages/modules/stock-location && pnpm check-types
```
Expected: both packages back to baseline; `access` suite passes.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/auth/src packages/modules/stock-location/src old/
```

---

## Task 4: Collapse the auth event pairs (`OrganizationEvents`, `UserEvents`)

**Files:**
- Modify: `packages/modules/auth/src/services/events/organization.ts`,
  `services/events/user.ts`
- Delete: `packages/modules/auth/src/layers/events/organization.ts`,
  `layers/events/user.ts`
- Modify: `services/index.ts`, `layers/index.ts`

Two small event-bus pairs. Same mechanic; the layer body is the bus
implementation.

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/events/organization.ts old/
cp --parents packages/modules/auth/src/services/events/user.ts old/
cp --parents packages/modules/auth/src/layers/events/organization.ts old/
cp --parents packages/modules/auth/src/layers/events/user.ts old/
```

- [ ] **Step 2: Merge each event file**

For `services/events/organization.ts` and `services/events/user.ts`, inline the
corresponding `layers/events/<x>.ts` body and append:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

/** Event-bus layer. Body moved verbatim from the former `layers/events/<x>.ts`. */
export const layer = /* <verbatim Layer.* expression from the old layer file> */
```

Match the old `Layer` constructor exactly (`Layer.effect` / `Layer.sync` /
`Layer.scoped` — whichever the old file used).

- [ ] **Step 3: Delete the layer files**

```bash
rm packages/modules/auth/src/layers/events/organization.ts
rm packages/modules/auth/src/layers/events/user.ts
```

If `layers/events/` is now empty, remove the directory.

- [ ] **Step 4: Update the barrels**

`services/index.ts`: replace `export * from './events/organization'` and
`export * from './events/user'` with:

```ts
export * as OrganizationEvents from './events/organization'
export * as UserEvents from './events/user'
```

`layers/index.ts`: delete the lines exporting `OrganizationEventsLive` and
`UserEventsLive as UserEventBusLive`.

- [ ] **Step 5: Sweep the call sites**

`pnpm check-types` in `@czo/auth`. Known sites:
- `src/module.ts` — `OrganizationEventsLive` / `UserEventBusLive` →
  `OrganizationEvents.layer` / `UserEvents.layer`.
- The `organization`/`user` layer files (Tasks 7–8) consume these event Tags; if
  the sweep flags them now, only fix the import path (`X.<EventTag>`), not logic.

- [ ] **Step 6: Type-check** — `pnpm check-types` back to baseline.

- [ ] **Step 7: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 5: Collapse `StockLocationEvents`

**Files:**
- Modify: `packages/modules/stock-location/src/services/events/stock-location.ts`
- Delete: `packages/modules/stock-location/src/layers/events/stock-location.ts`
- Modify: `stock-location/src/services/index.ts`

- [ ] **Step 1: Verify the events file layout**

`@czo/stock-location`'s `package.json` has a `./events` export pointing at
`./src/events/index.ts`. Confirm whether that is a *separate* directory from
`src/services/events/`:

```bash
ls -la packages/modules/stock-location/src/events 2>/dev/null
ls -la packages/modules/stock-location/src/services/events
cat packages/modules/stock-location/src/events/index.ts 2>/dev/null
```

If `src/events/index.ts` merely re-exports from `src/services/events/`, leave it
as a re-export (update its paths if needed). If it is the *actual* event source,
the event pair lives there — collapse *that* file instead and adjust paths below.
Record the finding here before continuing.

**Finding:** ________________________________________________

- [ ] **Step 2: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/stock-location/src/services/events/stock-location.ts old/
cp --parents packages/modules/stock-location/src/layers/events/stock-location.ts old/
```

- [ ] **Step 3: Merge the event file**

Inline the `layers/events/stock-location.ts` body into
`services/events/stock-location.ts` and append:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

/** Event-bus layer. Body moved verbatim from the former `layers/events/stock-location.ts`. */
export const layer = /* <verbatim Layer.* expression from the old layer file> */
```

- [ ] **Step 4: Delete the layer file**

```bash
rm packages/modules/stock-location/src/layers/events/stock-location.ts
```

- [ ] **Step 5: Barrel — defer**

The `stock-location` `services/index.ts` rewrite (and the `StockLocationModuleLive`
move) happens in Task 6, which collapses the service in the same module. For now,
update only the `StockLocationEvents` export line in `services/index.ts`:
change `export { StockLocationEvents } from './events/stock-location'` +
`export type { StockLocationEvent } from './events/stock-location'` to:

```ts
export * as StockLocationEvents from './events/stock-location'
```

Leave `layers/index.ts` (it still exports `StockLocationServiceLive` until Task 6).
Fix `layers/index.ts`'s `StockLocationEventsLive` import → `StockLocationEvents.layer`.

- [ ] **Step 6: Type-check** — `cd packages/modules/stock-location && pnpm check-types`
  back to baseline.

- [ ] **Step 7: Stage (no commit)**

```bash
git add packages/modules/stock-location/src old/
```

---

## Task 6: Collapse `stock-location` + finish the stock-location module

**Files:**
- Modify: `packages/modules/stock-location/src/services/stock-location.ts`
- Delete: `packages/modules/stock-location/src/layers/stock-location.ts`
- Delete: `packages/modules/stock-location/src/layers/index.ts` (whole `layers/` dir)
- Modify: `stock-location/src/services/index.ts`, `stock-location/src/plugins/index.ts`,
  `stock-location/package.json`

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/stock-location/src/services/stock-location.ts old/
cp --parents packages/modules/stock-location/src/layers/stock-location.ts old/
cp --parents packages/modules/stock-location/src/layers/index.ts old/
```

- [ ] **Step 2: Build the merged `services/stock-location.ts`**

Inline the entire `layers/stock-location.ts` body (the `Effect.gen` `make`, the
`fetchScoped`/`findFirst` closures, the optimistic-locking logic — all verbatim)
below the contract, and append:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

/** Live layer. Body moved verbatim from the former `layers/stock-location.ts`. */
export const layer = Layer.effect(StockLocationService, make)
```

The old file exported a plain `StockLocationServiceLive` — the `Layer.effect(...)`
expression it held becomes `export const layer`, with `make` named for the
`Effect.gen` it wrapped.

- [ ] **Step 3: Delete the layer directory**

```bash
rm packages/modules/stock-location/src/layers/stock-location.ts
rm packages/modules/stock-location/src/layers/index.ts
rmdir packages/modules/stock-location/src/layers/events 2>/dev/null || true
rmdir packages/modules/stock-location/src/layers 2>/dev/null || true
```
If `rmdir` fails, something un-migrated remains — stop and investigate.

- [ ] **Step 4: Rewrite `stock-location/src/services/index.ts`**

```ts
import { Layer } from 'effect'
import * as StockLocation from './stock-location'
import * as StockLocationEvents from './events/stock-location'

export { StockLocation, StockLocationEvents }

/**
 * Composite layer for the whole stock-location module. `provideMerge` keeps
 * `StockLocationEvents` visible at the runtime surface so external subscribers
 * can `yield* StockLocationEvents` and call `.subscribe`.
 */
export const StockLocationModuleLive = StockLocation.layer.pipe(
  Layer.provideMerge(StockLocationEvents.layer),
)
```

(`export { StockLocation }` re-exports the `import * as` namespace binding —
equivalent to `export * as StockLocation` but without binding both a local name
and an export of the same name in one module.)

- [ ] **Step 5: Update `package.json`**

Remove the `./layers` entry from `@czo/stock-location`'s `exports` map (the
directory no longer exists). Leave `./services`, `./events`, the rest unchanged.

- [ ] **Step 6: Sweep the call sites**

`pnpm check-types` in `@czo/stock-location`. Known sites:
- `src/plugins/index.ts` — `import { StockLocationModuleLive } from '@czo/stock-location/layers'`
  → `from '@czo/stock-location/services'`.
- `src/graphql/**` — deep imports of `../services/stock-location` named exports
  (`StockLocation`, `CreateStockLocationAddressInput`, …) are **unchanged** (deep
  named imports still resolve).

- [ ] **Step 7: Type-check** — `pnpm check-types` back to the Task 1
  `@czo/stock-location` baseline.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/stock-location old/
```

---

## Task 7: Collapse `user`

**Files:**
- Modify: `packages/modules/auth/src/services/user.ts`
- Delete: `packages/modules/auth/src/layers/user.ts`
- Move: `layers/user.test.ts` → `services/user.test.ts`
- Modify: `services/index.ts`, `layers/index.ts`

`user` is DB-backed; its layer depends on `DrizzleDb`, `BetterAuth`,
`AccessService`, `UserEvents`. The `BetterAuth` dependency stays — SP-A does not
touch it.

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/user.ts old/
cp --parents packages/modules/auth/src/layers/user.ts old/
cp --parents packages/modules/auth/src/layers/user.test.ts old/
```

- [ ] **Step 2: Build the merged `services/user.ts`**

Inline the entire `layers/user.ts` body. The old `makeUserServiceLive()` is a
zero-arg factory — drop the factory wrapper; its `Effect.gen` body becomes the
module-private `make`:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  // <verbatim body of the former makeUserServiceLive's Effect.gen>
})

/** Live layer. */
export const layer = Layer.effect(UserService, make)
```

- [ ] **Step 3: Delete the layer file**

```bash
rm packages/modules/auth/src/layers/user.ts
```

- [ ] **Step 4: Update the barrels**

`services/index.ts`: `export * from './user'` → `export * as User from './user'`.
`layers/index.ts`: delete `export { makeUserServiceLive } from './user'`.

- [ ] **Step 5: Move the test file**

```bash
git mv packages/modules/auth/src/layers/user.test.ts \
       packages/modules/auth/src/services/user.test.ts
```
Update imports to `import * as User from './user'`; `makeUserServiceLive()` →
`User.layer`; `UserService` → `User.UserService`; error/type refs → `User.<name>`.

- [ ] **Step 6: Sweep the call sites**

`pnpm check-types` in `@czo/auth`. Known sites:
- `src/module.ts` — `makeUserServiceLive()` → `User.layer`.
- `src/graphql/index.ts` — `User` type import from `@czo/auth/services` → already
  the namespace name `User`; reference as `User.User` (the domain row type). If
  the namespace/type-name collision reads poorly, alias at import:
  `import { User as UserNs } from '@czo/auth/services'`.
- `src/graphql/**` — deep imports of `../services/user` are unchanged.

- [ ] **Step 7: Type-check + test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
pnpm vitest run src/services/user.test.ts
```
Expected: baseline restored; `user` suite passes.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 8: Collapse `organization`

**Files:**
- Modify: `packages/modules/auth/src/services/organization.ts`
- Delete: `packages/modules/auth/src/layers/organization.ts`
- Move: `layers/organization.test.ts` → `services/organization.test.ts`
- Modify: `services/index.ts`, `layers/index.ts`

`organization` is the largest pair (≈700 lines merged). Its layer depends on
`DrizzleDb`, `AccessService`, `OrganizationEvents`.

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/organization.ts old/
cp --parents packages/modules/auth/src/layers/organization.ts old/
cp --parents packages/modules/auth/src/layers/organization.test.ts old/
```

- [ ] **Step 2: Build the merged `services/organization.ts`**

Inline the entire `layers/organization.ts` body; drop the zero-arg
`makeOrganizationServiceLive()` wrapper:

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  // <verbatim body of the former makeOrganizationServiceLive's Effect.gen>
})

/** Live layer. */
export const layer = Layer.effect(OrganizationService, make)
```

The layer body yields `access.buildRoles` at build time — keep that verbatim.

- [ ] **Step 3: Delete the layer file**

```bash
rm packages/modules/auth/src/layers/organization.ts
```

- [ ] **Step 4: Update the barrels**

`services/index.ts`: `export * from './organization'` →
`export * as Organization from './organization'`.
`layers/index.ts`: delete `export { makeOrganizationServiceLive } from './organization'`.

- [ ] **Step 5: Move the test file**

```bash
git mv packages/modules/auth/src/layers/organization.test.ts \
       packages/modules/auth/src/services/organization.test.ts
```
Update imports to `import * as Organization from './organization'`;
`makeOrganizationServiceLive()` → `Organization.layer`; service/error/type refs →
`Organization.<name>`.

- [ ] **Step 6: Sweep the call sites**

`pnpm check-types` in `@czo/auth`. Known sites:
- `src/module.ts` — `makeOrganizationServiceLive()` → `Organization.layer`; the
  `OrganizationService` reference in the `ApiKeyServiceLive.pipe(...)` composition
  → `Organization.OrganizationService`.
- `src/graphql/index.ts` — `Organization`, `OrganizationInvitation`,
  `OrganizationMember` type imports → `Organization.<name>`.
- `src/graphql/**` deep imports of `../services/organization` — unchanged.

- [ ] **Step 7: Type-check + test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
pnpm vitest run src/services/organization.test.ts
```
Expected: baseline restored; `organization` suite passes.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 9: Collapse `api-key`

**Files:**
- Modify: `packages/modules/auth/src/services/api-key.ts`
- Delete: `packages/modules/auth/src/layers/api-key.ts`
- Modify: `packages/modules/auth/src/services/api-key.test.ts` (merge target)
- Delete: `packages/modules/auth/src/layers/api-key.test.ts`
- Modify: `services/index.ts`, `layers/index.ts`

`api-key` has tests on **both** sides — they merge into one file. Its layer
depends on `DrizzleDb` and `OrganizationService`.

- [ ] **Step 1: Mirror to `old/`**

```bash
cd /workspace/c-zo
cp --parents packages/modules/auth/src/services/api-key.ts old/
cp --parents packages/modules/auth/src/services/api-key.test.ts old/
cp --parents packages/modules/auth/src/layers/api-key.ts old/
cp --parents packages/modules/auth/src/layers/api-key.test.ts old/
```

- [ ] **Step 2: Build the merged `services/api-key.ts`**

Inline the entire `layers/api-key.ts` body. The old file exported a plain
`ApiKeyServiceLive` (`Layer.effect(ApiKeyService, Effect.gen(...))`):

```ts
// ─── Layer ───────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  // <verbatim body of the former ApiKeyServiceLive's Effect.gen>
})

/** Live layer. */
export const layer = Layer.effect(ApiKeyService, make)
```

- [ ] **Step 3: Delete the layer file**

```bash
rm packages/modules/auth/src/layers/api-key.ts
```

- [ ] **Step 4: Update the barrels**

`services/index.ts`: `export * from './api-key'` → `export * as ApiKey from './api-key'`.
`layers/index.ts`: delete `export { ApiKeyServiceLive } from './api-key'`.

- [ ] **Step 5: Merge the test files**

Append the contents of `layers/api-key.test.ts` into the existing
`services/api-key.test.ts` (de-duplicate any shared imports / setup). Update all
layer construction (`ApiKeyServiceLive` → `ApiKey.layer`) and service refs
(`ApiKeyService` → `ApiKey.ApiKeyService`); imports → `import * as ApiKey from './api-key'`.

```bash
rm packages/modules/auth/src/layers/api-key.test.ts
```

- [ ] **Step 6: Sweep the call sites**

`pnpm check-types` in `@czo/auth`. Known site:
- `src/module.ts` — `ApiKeyServiceLive.pipe(Layer.provideMerge(...))` →
  `ApiKey.layer.pipe(Layer.provideMerge(...))`.

- [ ] **Step 7: Type-check + test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
pnpm vitest run src/services/api-key.test.ts
```
Expected: baseline restored; the merged `api-key` suite passes.

- [ ] **Step 8: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 10: Delete the legacy `*.service.ts` files

**Files:**
- Delete: `packages/modules/auth/src/services/{account,session,twoFactor}.service.ts`
- Modify: `packages/modules/auth/src/services/index.ts`,
  `packages/modules/auth/src/graphql/schema/index.ts`

These three files are dead — commented out of every barrel, no importers (verified
in brainstorming), and 2FA is dropped from the migration entirely.

- [ ] **Step 1: Re-verify no importers**

```bash
cd /workspace/c-zo
git grep -nE "account\.service|session\.service|twoFactor\.service" -- packages apps
```
Expected: only commented-out lines in `services/index.ts` and a comment in
`graphql/schema/index.ts`. If any **live** import appears, stop and report.

- [ ] **Step 2: Mirror to `old/`**

```bash
cp --parents packages/modules/auth/src/services/account.service.ts old/
cp --parents packages/modules/auth/src/services/session.service.ts old/
cp --parents packages/modules/auth/src/services/twoFactor.service.ts old/
```

- [ ] **Step 3: Delete the files**

```bash
rm packages/modules/auth/src/services/account.service.ts
rm packages/modules/auth/src/services/session.service.ts
rm packages/modules/auth/src/services/twoFactor.service.ts
```

- [ ] **Step 4: Remove the dead barrel lines**

In `services/index.ts`, delete the commented-out lines:
`// export * from './account.service'`, `// export * from './session.service'`,
`// export * from './twoFactor.service'`. In `graphql/schema/index.ts`, remove the
stale comment referencing the parked `twoFactor.service.ts`.

- [ ] **Step 5: Type-check**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
```
Expected: baseline unchanged.

- [ ] **Step 6: Stage (no commit)**

```bash
git add packages/modules/auth/src old/
```

---

## Task 11: Repair `builder.test.ts` / `sdl.test.ts`

**Files:**
- Modify: `packages/kit/src/graphql/builder.test.ts`
- Modify: `packages/kit/src/graphql/sdl.test.ts`

Both suites import `initBuilder` / `buildSchema`, which `builder.ts` stopped
exporting at the Pothos migration (`8b45f17a`). Rewrite them against the current
API.

- [ ] **Step 1: Mirror to `old/` + inventory the current API**

```bash
cd /workspace/c-zo
cp --parents packages/kit/src/graphql/builder.test.ts old/
cp --parents packages/kit/src/graphql/sdl.test.ts old/
grep -nE "^export (function|const|class)" packages/kit/src/graphql/builder.ts
```
The current builder exposes `GraphQLBuilder` (a `Context.Service`),
`makeGraphQLBuilder(...)`, and `setupBuilder` (via the `SchemaBuilder` type). The
old `initBuilder` / `buildSchema` / `registerSchema` free functions are gone.

- [ ] **Step 2: Rewrite the suites against `makeGraphQLBuilder`**

Rewrite `builder.test.ts` and `sdl.test.ts` so each test obtains a builder via the
current `makeGraphQLBuilder` API and builds a schema through it, instead of the
removed `initBuilder` / `buildSchema`. Preserve each test's **intent** (the
assertions about scalars, SDL output, lexicographic sort, `verifySDL`
true/false) — only the construction calls change. Drop the `db`/`relations`
mock plumbing the old free functions needed if `makeGraphQLBuilder` does not
require it.

> This is a genuine rewrite, not a mechanical sweep — inspect `builder.ts`'s
> current exports and the SP1 examples (`sdl.ts` itself is unchanged) to model
> the new construction. If the builder's API cannot produce a schema the way
> `sdl.test.ts` needs, stop and report rather than weakening the assertions.

- [ ] **Step 3: Run both suites**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/graphql/builder.test.ts src/graphql/sdl.test.ts
```
Expected: PASS — every test green (no `initBuilder is not a function`).

- [ ] **Step 4: Type-check**

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types
```
Expected: the `@czo/kit` count is **at or below** the Task 1 baseline (the two
test files previously contributed errors — repairing them may lower it).

- [ ] **Step 5: Stage (no commit)**

```bash
git add packages/kit/src old/
```

---

## Task 12: Final verification

- [ ] **Step 1: Monorepo type-check** — every package at or below its Task 1 baseline:

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
cd /workspace/c-zo/packages/modules/stock-location && pnpm check-types
```

- [ ] **Step 2: Full auth + stock-location test run**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run
cd /workspace/c-zo/packages/modules/stock-location && pnpm vitest run
```
Expected: the 5 relocated suites (`actor`, `access`, `user`, `organization`,
`api-key`) + the SP1 30-test suite all pass; no new failures vs Task 1.

- [ ] **Step 3: Confirm no split pairs remain in scope**

```bash
cd /workspace/c-zo
ls packages/modules/auth/src/layers/        # expect only: auth.ts, better-auth/, index.ts
ls packages/modules/stock-location/src/layers/ 2>/dev/null  # expect: no such directory
```

- [ ] **Step 4: Confirm the namespace barrels**

```bash
git grep -n "export \* as" packages/modules/auth/src/services/index.ts \
  packages/modules/stock-location/src/services/index.ts
```
Expected: `Access`, `Actor`, `ApiKey`, `Organization`, `User`, `OrganizationEvents`,
`UserEvents` (auth) and `StockLocation`, `StockLocationEvents` (stock-location),
alongside the SP1 namespaces.

- [ ] **Step 5: Remove the `old/` mirror**

```bash
rm -rf /workspace/c-zo/old
```

- [ ] **Step 6: Stage everything for the final review**

```bash
git add -A packages/modules/auth packages/modules/stock-location packages/kit/src
```

Leave it staged and uncommitted — the user runs the final review and commits SP-A
as one unit.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §2 collapse, verbatim guarantees | Tasks 2–9 (per-pair) |
| §3 scope — 6 service pairs | Tasks 2, 3, 6, 7, 8, 9 |
| §3 scope — 3 event sub-pairs | Tasks 4, 5 |
| §4 collapsed file shape | every collapse task, Step 2 |
| §5 factory normalization | Tasks 2–3 (`makeLayer`), 7–9 (`layer`) |
| §6 barrels & exports | every collapse task, Step 4; Task 6 Step 4 |
| §6 stock-location `./layers` export dropped | Task 6 Step 5 |
| §7 event sub-pairs | Tasks 4, 5 |
| §8 test relocation | Tasks 2, 3, 7, 8, 9 (Step 5) |
| §8 builder/sdl test repair | Task 11 |
| §9 legacy cleanup | Task 10 |
| §10 import sweep & verification | every task Step 6–7; Task 12 |
| §11 sequencing | Task order 1→12 |
| §12.1 event barrel naming | Tasks 4, 5 (Step 4) |
| §12.2 stock-location `./events` | Task 5 Step 1 (verify) |
| §12.3 `StockLocationModuleLive` home | Task 6 Step 4 |
| §12.4 baseline capture | Task 1 |
| §12.5 factory rename consumers | Tasks 2, 3 (Step 6) |

## Notes / risks

- **Verbatim discipline is the whole game.** The contract and layer bodies are
  *not* edited — only relocated. Any diff inside those bodies is a bug. The only
  authored code is the `layer`/`makeLayer` export block and the barrel/sweep edits.
- The monorepo carries a large pre-existing in-flight-migration error count. The
  Task 1 baselines are the contract — only NEW errors are SP-A's; pre-existing
  ones must never be "fixed".
- **Namespace/type-name collisions** — `export * as User` then a `User` domain
  type inside makes `User.User`. Acceptable (it follows the SP1 `AuthEvents`
  precedent); alias at the import site if a consumer reads poorly (Task 7 Step 6).
- `auth.ts` / `auth-instance.ts` / `layers/better-auth/` stay split — they are
  better-auth glue, deleted in SP5. `@czo/auth` keeps its `./layers` export.
- Task 5 Step 1 front-loads the one structural unknown (the stock-location
  `./events` directory vs `services/events/`). If it diverges from the plan's
  assumption, that step records the finding and the engineer adapts Tasks 5–6.
- **Never `git stash`** (it silently reverted work in a prior session).
