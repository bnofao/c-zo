# SP-A — Collapse split service/layer pairs to the single-file pattern

**Date:** 2026-05-22
**Status:** Design approved, pending spec review
**Sub-project:** SP-A — intermediate refactor between SP1 and SP2 of the
"drop better-auth, go Effect-native" migration (sibling of the completed SP-B).

---

## 1. Context

The Effect-TS services in `@czo/auth` and `@czo/stock-location` follow a
**split** layout inherited from the `auth/apiKey` pilot:

- Contract — `packages/modules/<module>/src/services/<name>.ts`: the
  `Context.Service` Tag, interface, `Data.TaggedError`s, input/option/domain
  types, pure helpers.
- Live — `packages/modules/<module>/src/layers/<name>.ts`: the
  `Layer.effect`/`Layer.sync` implementation.

SP1 superseded this with a **single-file** pattern: `services/session.ts`,
`services/cookie.ts`, `services/password.ts` each hold *both* the contract and
the `Layer` (`export const layer`), with **no `layers/` counterpart**. SP1's
spec made this explicit: "the contract-here / layer-there split is dropped for
new code."

SP-A retrofits the SP1 pattern onto the older split pairs, so the whole
Effect-DI surface follows one convention. It is a **pure structural refactor**
— no behavior, signature, or database change.

---

## 2. Goal & guarantees

Collapse each in-scope `services/<name>.ts` + `layers/<name>.ts` pair into a
single `services/<name>.ts` file matching `session.ts`.

**Guarantees — nothing changes but file location and export shape:**

- Every `Context.Service` Tag, `Data.TaggedError`, error union, input/option/
  domain type, and pure helper is moved **verbatim**.
- Every `Layer` implementation body is moved **verbatim**.
- Method signatures, error channels, and runtime behavior are **byte-identical**.
- **Zero** database / migration change.
- GraphQL resolvers, HTTP handlers, and `module.ts` runtime composition behave
  identically; only import paths and the layer-construction call shape change.

The contract for "done": each touched package's `pnpm check-types` returns to a
captured pre-SP-A baseline (no NEW errors), and every existing test suite passes
(see §10).

---

## 3. Scope

### In scope — 6 service pairs

| Pair | Module | `layers/` impl style today |
|---|---|---|
| `actor` | auth | `Layer.sync`, parameterized factory, no DB |
| `access` | auth | `Layer.sync`, parameterized factory, no DB |
| `organization` | auth | `Layer.effect`, zero-arg factory, DB-backed |
| `user` | auth | `Layer.effect`, zero-arg factory, DB-backed |
| `api-key` | auth | `Layer.effect`, plain Live, DB-backed |
| `stock-location` | stock-location | `Layer.effect`, plain Live, DB-backed |

### In scope — 3 event sub-pairs

`OrganizationEvents`, `UserEvents` (auth) and `StockLocationEvents`
(stock-location) carry the **same** `services/events/<x>.ts` +
`layers/events/<x>.ts` split. SP1 already made `events/auth.ts` single-file;
SP-A collapses these three the same way (§7). Folding them in lets
stock-location's `layers/` directory be removed entirely and shrinks auth's
`layers/` to only the better-auth glue.

### Out of scope

- `auth` (`services/auth.ts` + `layers/auth.ts`), `auth-instance.ts`, and
  `layers/better-auth/` — these *are* the better-auth integration; **SP5
  deletes them**. Collapsing their file structure now is churn on doomed files.
- The SP1 single-file services (`session`, `cookie`, `password`, `events/auth`)
  — already in the target pattern.
- `apps/mazo` / `@czo/app` — no split service pairs of their own.
- Any behavior, schema, or dependency change.

---

## 4. The collapsed file shape

Each `services/<name>.ts` after collapse, top-to-bottom — mirroring `session.ts`:

```text
imports
─ Contract ─  Context.Service Tag · Data.TaggedError classes · error-union type ·
              input/option/domain types · pure helpers   (verbatim from the old
              services/<name>.ts)
─ Impl ─────  module-private `make` Effect, or the Layer.sync/Layer.effect body
              (verbatim from the old layers/<name>.ts)
─ Layer ────  export const layer = Layer.effect(Tag, make)   (or Layer.sync)
```

The old `layers/<name>.ts` is **deleted**. Per the repo's destructive-refactor
convention, the deleted/rewritten files are first mirrored into `old/<path>`;
`old/` is removed at the end of implementation.

---

## 5. Factory normalization

The six pairs expose their `Layer` three different ways today. Collapsed, they
unify on a `layer` export (matching `session.ts`):

| Pair(s) | Today | Collapsed |
|---|---|---|
| `organization`, `user` | `makeXServiceLive()` — a zero-argument factory | `export const layer` — the pointless factory is dropped |
| `api-key`, `stock-location` | a plain `XServiceLive` constant | `export const layer` — renamed |
| `actor`, `access` | `makeXServiceLive(opts?, freeze?)` **+** an `XServiceLive` convenience constant | `export const layer` (the no-arg default) **+** `export function makeLayer(opts?, freeze?)` |

`actor` and `access` genuinely need parameterization — they seed closure-local
registries from `InitialActors` / `InitialAccessOptions` at construction. They
keep a factory, renamed `makeLayer` so it reads cleanly under the namespace
(`Actor.makeLayer(...)`, `Access.makeLayer(...)`). The `InitialActors` /
`InitialAccessOptions` types are kept and exported.

---

## 6. Barrels & exports

**Convention (decided): Approach A — full SP1 parity.** Every collapsed file
exports `layer`; a flat `export *` would collide on that name, so the barrels
namespace-export, exactly as SP1 does for `Session`/`Cookie`/`Password`.

### `@czo/auth`

`src/services/index.ts` — the 5 collapsed pairs become namespace exports,
joining the existing SP1 namespaces:

```ts
export * as Access from './access'
export * as Actor from './actor'
export * as ApiKey from './api-key'
export * as Organization from './organization'
export * as User from './user'
// existing SP1: Cookie, Password, Session, AuthEvents
// untouched flat: auth, auth-instance, utils/validate-roles
```

`src/layers/index.ts` — drops the 5 collapsed entries; retains only the
better-auth glue (`AuthServiceLive`, `makeBetterAuthLive`, the `Auth` type).
The event entries (`OrganizationEventsLive`, `UserEventsLive`) move out when the
event sub-pairs collapse (§7). `@czo/auth`'s `./layers` package.json export is
**kept** — `auth.ts` + `better-auth/` still live there.

### `@czo/stock-location`

`src/services/index.ts` — `export * as StockLocation from './stock-location'`.
The `StockLocationModuleLive` composite (`StockLocationServiceLive` +
`StockLocationEventsLive`, today defined in `layers/index.ts`) moves into
`services/index.ts`, since both halves now live under `services/`.

With its service and event pairs collapsed, stock-location's `layers/`
directory is **deleted entirely**, and the `./layers` entry is removed from its
`package.json` `exports` map.

### Consumer impact

- **Deep imports are unaffected** — `import { OrganizationService } from
  '../services/organization'` keeps resolving the named export directly; the
  `layer` name only collides through a barrel `export *`. GraphQL resolver
  files, which deep-import service Tags, need no change.
- **Barrel consumers switch to the namespace form** — `module.ts`,
  `graphql/index.ts`, `plugins/access.ts`, and stock-location's
  `plugins/index.ts` move to `Organization.OrganizationService`,
  `Access.makeLayer(...)`, etc. This is a `tsc`-guided sweep (the SP-B method).

### File size

Merged `organization.ts` is the largest at ≈700 lines (298 + 412) — within the
800-line hard cap in `coding-style.md`, and consistent with treating one
service as one cohesive unit (SP1's `session.ts` is a single file). The others
land between 186 and 575 lines.

---

## 7. Event sub-pairs

`OrganizationEvents`, `UserEvents`, `StockLocationEvents` collapse by the same
mechanic: `services/events/<x>.ts` absorbs its `layers/events/<x>.ts` body and
exports `layer`. Their barrels switch to namespace exports following the SP1
`events/auth.ts` precedent (`export * as AuthEvents from './events/auth'`).

`OrganizationEventsLive` / `UserEventsLive` leave `layers/index.ts`;
`StockLocationEventsLive` leaves stock-location's `layers/index.ts` (which is
then deleted). The exact namespace naming for the event barrels — and whether
to keep stock-location's separate `./events` package.json export — is a
planning-phase detail (§12).

---

## 8. Test files

- Each `layers/<name>.test.ts` moves to `services/<name>.test.ts` (5 auth
  suites: `actor` 225L, `organization` 362L, `user` 313L, `api-key` 226L,
  `access` 174L).
- **`api-key`** has tests on *both* sides today — the existing
  `services/api-key.test.ts` (41L) and the relocated layer suite merge into one
  `services/api-key.test.ts`.
- Test bodies update layer construction from `makeXServiceLive(...)` /
  `XServiceLive` to `<Namespace>.layer` / `<Namespace>.makeLayer(...)`, and fix
  the `../layers/<name>` imports.
- `stock-location` has no existing tests — nothing to move.

### Folded-in: `builder.test.ts` / `sdl.test.ts` repair

`packages/kit/src/graphql/builder.test.ts` and `sdl.test.ts` are currently
broken — they import `initBuilder` / `buildSchema`, which `builder.ts` stopped
exporting at the Pothos migration (`8b45f17a`). SP-A includes a final task to
rewrite both suites against the current `GraphQLBuilder` / `makeGraphQLBuilder`
API so they compile and run again. (Unrelated to the service/layer pattern, but
folded in as a "fix structural drift" pass.)

---

## 9. Legacy cleanup

Three orphaned legacy files in `auth/src/services/` — `account.service.ts`,
`session.service.ts`, `twoFactor.service.ts` — are dead code: commented out of
every barrel, no importers, and 2FA was dropped from the migration entirely.
SP-A deletes all three (mirrored to `old/` first) and removes their
commented-out barrel lines.

---

## 10. Import sweep & verification

`tsc`-guided, exactly as SP-B: collapse a pair, then fix every call site `tsc`
flags until the package returns to its captured baseline. The flagged sites
are concentrated in:

- `auth/src/module.ts` — the layer-composition block.
- `stock-location/src/plugins/index.ts` — imports `StockLocationModuleLive`.
- test files importing `../layers/<name>`.
- `graphql/index.ts` / `plugins/access.ts` — barrel type imports.

**Verification gate** — per pair, and once at the end:

- `pnpm check-types` per package back to the pre-SP-A baseline — **no NEW
  errors**. Pre-existing in-flight-migration errors are out of scope and never
  "fixed."
- The 5 relocated auth suites + `api-key` tests + the SP1 30-test suite all
  pass.
- `builder.test.ts` / `sdl.test.ts` compile and pass.
- `old/` is removed.

**Commits:** staged but **not committed** during execution — one review +
commit after the final task, per the repo's no-auto-commit-until-review
preference. Never `git stash`.

---

## 11. Sequencing

One pair per task; dependency-shallowest first so each step's sweep is small:

1. **`actor`**, **`access`** — pure `Layer.sync`, no DB, no service deps.
2. **Event sub-pairs** — `OrganizationEvents`, `UserEvents`,
   `StockLocationEvents`.
3. **`stock-location`** — depends (cross-module, via barrel) on auth
   `Organization` + `Access`.
4. **`user`**, **`organization`**, **`api-key`** — DB-backed and
   inter-dependent (`api-key` → `organization`, `organization`/`user` →
   `access`).
5. **Legacy-file deletion** + **`builder.test.ts` / `sdl.test.ts` repair**.
6. **Final** — monorepo `check-types`, full test run, remove `old/`.

---

## 12. Open items for the planning phase

1. **Event barrel naming.** SP1's `export * as AuthEvents from './events/auth'`
   makes the Tag reachable as `AuthEvents.<Tag>`. Confirm the namespace name for
   each collapsed event file and whether `OrganizationEvents` /
   `StockLocationEvents` Tags read acceptably under it.
2. **stock-location `./events` export.** `package.json` has a separate
   `./events` subpath (`./src/events/index.ts`). Confirm during planning whether
   it survives, folds into `./services`, or is dropped — and reconcile it with
   `services/events/`.
3. **`StockLocationModuleLive` home.** Confirmed to move into
   `services/index.ts`; verify no consumer deep-imports it from the old
   `layers/index.ts` path.
4. **Baseline capture.** Record the pre-SP-A `check-types` error counts for
   `@czo/kit`, `@czo/auth`, `@czo/stock-location` as the sweep targets (Task 1
   of the plan).
5. **`actor`/`access` factory rename.** `makeXServiceLive` → `makeLayer`:
   confirm no consumer outside `module.ts` / tests calls the old factory name.
