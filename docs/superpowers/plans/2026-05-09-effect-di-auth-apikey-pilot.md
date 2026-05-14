# Effect-TS DI Pilot — `auth/apiKey` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `auth/apiKey` service of c-zo to Effect-TS (DI via Layer/Tag, signatures returning `Effect<A, E>`, tagged errors used directly as Pothos GraphQL errors), as a pilot for full Effect adoption across remaining modules.

**Architecture:** Three-PR sequence on branch `feat/kit-pothos-migration`. PR1 lands dormant Effect infra in `@czo/kit` (Runtime singleton, `DrizzleDb` Tag wrapping the existing `useDatabase()`, test helpers). PR2 mechanically moves the `apiKey.service.ts` factory under `services/api-key.ts` (contract) and `layers/api-key.ts` (impl), still in async style. PR3 rewrites `apiKey` in Effect with tagged errors that double as GraphQL union variants, hooks the `ManagedRuntime` into the Nitro `czo:init` boot, attaches it to the GraphQL context, and migrates the apiKey resolvers + tests + docs.

**Tech Stack:** TypeScript strict, pnpm/turborepo, Nitro 2.x, Pothos (incl. plugin-errors / plugin-validation), Drizzle ORM (RQBv2 with `withReplicas`, `node-postgres` driver), better-auth, vitest, Effect 3.x.

**Reference spec:** `docs/superpowers/specs/2026-05-09-effect-di-auth-apikey-pilot-design.md` — all decisions are frozen there. Re-read before starting any task.

---

## Operating Conventions

- **No auto-commits.** The user has explicitly disabled auto-commits for this work. Each task's "Commit" step MUST pause and ask for explicit user confirmation before running `git commit`. Stage with `git add` freely; do not commit until the user says so. The PR-level commit message templates are provided as guidance only.
- **One file = one responsibility.** New `services/<name>.ts` files hold the contract (Tag + interface + tagged errors + input types) only. Implementation lives in the matching `layers/<name>.ts`.
- **TDD for behavior, typecheck for restructuring.** PR1 and PR3 are TDD. PR2 is purely a code move; tests already cover the apiKey behavior indirectly via downstream resolvers — verify by `pnpm typecheck` + `pnpm build`.
- **Branch:** stay on `feat/kit-pothos-migration`. Do not branch off; the user wants all three PRs visible there before merging upstream.
- **Verification gate:** every task ends with at least one shell command whose expected output is documented. If the actual output differs, stop and surface it to the user — do not paper over it.

---

## File Structure

### Created in PR1 (kit Effect infra)

| Path | Responsibility |
|---|---|
| `packages/kit/src/effect/runtime.ts` | `useRuntime()`, `setRuntime()`, `runEffect(rt, eff)` helper that unwraps Cause to the original tagged error. |
| `packages/kit/src/effect/test.ts` | `expectFailure(effect, Tag)`, `expectSuccess(effect)` for vitest. |
| `packages/kit/src/effect/index.ts` | Public re-exports for `@czo/kit/effect`. |
| `packages/kit/src/db/effect.ts` | `DrizzleDb` `Context.Tag` + `DrizzleDbLive` `Layer`. Wraps the existing `useDatabase()`. |
| `packages/kit/src/effect/runtime.test.ts` | Tests for `runEffect` (success, typed failure unwrap, defect path). |
| `packages/kit/src/effect/test.test.ts` | Meta-tests for the helper functions. |
| `packages/kit/src/db/effect.test.ts` | Layer build smoke test against a real DB (or mocked `useDatabase`). |

### Modified in PR1

| Path | Change |
|---|---|
| `packages/kit/package.json` | Add `effect` dependency, add `./effect` and update `./db` exports. |
| `packages/kit/build.config.ts` | Add `src/effect/index` to entries; ensure `effect` is treated as external. |

### Created in PR2 (auth restructure, async style)

| Path | Responsibility |
|---|---|
| `packages/modules/auth/src/services/api-key.ts` | Contract: `interface ApiKeyService` with current async signatures, plus `CreateApiKeyOptions`, `VerifyApiKeyOptions`, etc. types moved here. |
| `packages/modules/auth/src/layers/api-key.ts` | Impl: `createApiKeyService(db, organizationService)` factory (renamed from current). |
| `packages/modules/auth/src/services/index.ts` | Already exists — updated to export api-key from `./api-key` instead of `./apiKey.service`. |
| `packages/modules/auth/src/layers/index.ts` | New file, re-exports `createApiKeyService`. |

### Deleted in PR2

| Path | Reason |
|---|---|
| `packages/modules/auth/src/services/apiKey.service.ts` | Replaced by the `services/api-key.ts` (contract) + `layers/api-key.ts` (impl) split. |

### Modified in PR2

| Path | Change |
|---|---|
| `packages/modules/auth/src/plugins/index.ts` | Update import path of `createApiKeyService` from `@czo/auth/services` (still re-exported correctly). |
| `packages/modules/auth/package.json` | Add `./layers` subpath export. |
| `packages/modules/auth/build.config.ts` | Add `src/layers/index` to entries. |

### Created in PR3 (Effect pilot)

| Path | Responsibility |
|---|---|
| `packages/modules/auth/src/layers/api-key.test.ts` | Vitest suite covering all behaviors of the new Effect impl (12+ cases from spec §5). |

### Modified in PR3

| Path | Change |
|---|---|
| `packages/modules/auth/src/services/api-key.ts` | Replace async interface with `Context.Tag<ApiKeyService>` + Effect signatures. Add 12 `Data.TaggedError` classes. |
| `packages/modules/auth/src/services/organization.ts` | New (or modified if PR2 created it). Defines `OrganizationService` Tag + `checkMembership` signature returning `Effect<boolean, …>`. |
| `packages/modules/auth/src/layers/api-key.ts` | Replace async factory with `Layer.effect(ApiKeyService, Effect.gen(…))`. Wrap each Drizzle call in `Effect.tryPromise`. Convert callback-based failure signaling to `yield* new TaggedError({…})`. |
| `packages/modules/auth/src/layers/organization.ts` | Provides a `Layer.succeed(OrganizationService, { checkMembership: () => Effect.succeed(true) })` stub OR a real Effect-wrapped impl that delegates to existing `createOrganizationService`. Pilot uses the stub-with-real-DB-check approach (delegates the membership query to existing infrastructure but exposes it as Effect). |
| `packages/modules/auth/src/plugins/index.ts` | In `czo:init`, build `ManagedRuntime` from `Layer.mergeAll(ApiKeyServiceLive, OrganizationServiceStub).pipe(Layer.provide(DrizzleDbLive))`, call `setRuntime(rt)`, register `runtime.dispose()` on the `close` hook. |
| `packages/modules/auth/src/graphql/context-factory.ts` | Attach `runtime: useRuntime()` to the auth context. |
| `packages/modules/auth/src/graphql/schema/api-key/errors.ts` | Replace inline `BaseGraphQLError` classes with `registerError(builder, …)` calls pointing at the tagged error classes from `services/api-key.ts`. |
| `packages/modules/auth/src/graphql/schema/api-key/queries.ts` | Switch resolvers to `runEffect(ctx.runtime, Effect.gen(…))`. List tagged error classes in `errors: { types: [...] }`. |
| `packages/modules/auth/src/graphql/schema/api-key/mutations.ts` | Same as queries.ts. |
| `CLAUDE.md` | Add a section explaining the new pattern + layout. |
| `packages/kit/src/graphql/errors/index.ts` | Inline comment above `BaseGraphQLError` flagging it as transitional. |

---

# PR 1 — Effect Infra in `@czo/kit`

**Goal:** Land dormant Effect infra. No module currently consumes it; build + typecheck must stay green.

**Suggested PR title:** `feat(kit): introduce Effect-TS runtime, DrizzleDb tag, and test helpers`

---

### Task 1.1: Add `effect` dependency to `@czo/kit`

**Files:**
- Modify: `packages/kit/package.json`
- Modify: root `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Add `effect` to dependencies**

```bash
cd /workspace/c-zo/packages/kit && pnpm add effect
```

- [ ] **Step 2: Confirm version pins to 3.x**

```bash
grep '"effect":' /workspace/c-zo/packages/kit/package.json
```
Expected: `"effect": "^3.…"` (whatever current 3.x is at install time).

- [ ] **Step 3: Verify install does not break the workspace**

```bash
cd /workspace/c-zo && pnpm install
```
Expected: success, no peer-dep warnings beyond pre-existing ones.

- [ ] **Step 4: Stage; PAUSE for user confirmation before committing**

```bash
cd /workspace/c-zo && git add packages/kit/package.json pnpm-lock.yaml
```

---

### Task 1.2: Create `runtime.ts` with failing tests first

**Files:**
- Create: `packages/kit/src/effect/runtime.test.ts`

- [ ] **Step 1: Create the test file with the three core scenarios**

```ts
// packages/kit/src/effect/runtime.test.ts
import { Cause, Data, Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runEffect, setRuntime, useRuntime } from './runtime'

class SampleError extends Data.TaggedError('SampleError')<{ readonly reason: string }> {}

describe('runtime singleton', () => {
  beforeEach(() => {
    // reset module-level singleton between tests
    setRuntime(undefined as any)
  })

  it('throws a clear error when accessed before initialization', () => {
    expect(() => useRuntime()).toThrow(/Effect runtime not initialized/)
  })

  it('returns the runtime that was set', () => {
    const rt = ManagedRuntime.make(Layer.empty)
    setRuntime(rt)
    expect(useRuntime()).toBe(rt)
  })
})

describe('runEffect', () => {
  let rt: ManagedRuntime.ManagedRuntime<never, never>

  beforeEach(() => { rt = ManagedRuntime.make(Layer.empty) })
  afterEach(() => rt.dispose())

  it('resolves the success value', async () => {
    await expect(runEffect(rt, Effect.succeed(42))).resolves.toBe(42)
  })

  it('rejects with the original tagged error (not a FiberFailure)', async () => {
    const program = Effect.gen(function* () {
      return yield* new SampleError({ reason: 'nope' })
    })
    await expect(runEffect(rt, program)).rejects.toBeInstanceOf(SampleError)
  })

  it('rejects with the squashed cause for defects', async () => {
    const program = Effect.die('boom')
    await expect(runEffect(rt, program)).rejects.toBeDefined()
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail (the module does not exist yet)**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/effect/runtime.test.ts
```
Expected: FAIL — `Cannot find module './runtime'`.

---

### Task 1.3: Implement `runtime.ts` to make the tests pass

**Files:**
- Create: `packages/kit/src/effect/runtime.ts`

- [ ] **Step 1: Write the implementation**

```ts
// packages/kit/src/effect/runtime.ts
import { Cause, Effect, Exit } from 'effect'
import type { ManagedRuntime } from 'effect'

let _runtime: ManagedRuntime.ManagedRuntime<never, never> | undefined

export function setRuntime(rt: ManagedRuntime.ManagedRuntime<any, never> | undefined): void {
  _runtime = rt as ManagedRuntime.ManagedRuntime<never, never> | undefined
}

export function useRuntime(): ManagedRuntime.ManagedRuntime<never, never> {
  if (!_runtime) {
    throw new Error('Effect runtime not initialized — did the auth module plugin run czo:init?')
  }
  return _runtime
}

/**
 * Run an Effect against a ManagedRuntime, rejecting the returned Promise with
 * the original typed failure (NOT a FiberFailure) so Pothos's `errors: { types }`
 * plugin can match via instanceof. Defects are surfaced as squashed causes.
 */
export async function runEffect<A, E>(
  rt: ManagedRuntime.ManagedRuntime<never, never>,
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await rt.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'Some') throw failure.value as Error
  throw Cause.squash(exit.cause)
}
```

- [ ] **Step 2: Run the test file to confirm passing**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/effect/runtime.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 3: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/src/effect/runtime.ts packages/kit/src/effect/runtime.test.ts
```

---

### Task 1.4: Create `test.ts` helpers with failing tests first

**Files:**
- Create: `packages/kit/src/effect/test.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/kit/src/effect/test.test.ts
import { Data, Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { expectFailure, expectSuccess } from './test'

class FooError extends Data.TaggedError('FooError')<{ readonly x: number }> {}
class BarError extends Data.TaggedError('BarError')<{}> {}

describe('expectFailure', () => {
  it('returns the failure value when tag matches', async () => {
    const err = await expectFailure(
      Effect.gen(function* () { return yield* new FooError({ x: 1 }) }),
      FooError,
    )
    expect(err.x).toBe(1)
  })

  it('throws when the effect succeeds', async () => {
    await expect(
      expectFailure(Effect.succeed(1), FooError),
    ).rejects.toThrow(/Expected failure FooError/)
  })

  it('throws when a different tag is returned', async () => {
    await expect(
      expectFailure(
        Effect.gen(function* () { return yield* new BarError({}) }) as any,
        FooError,
      ),
    ).rejects.toThrow(/Expected FooError, got BarError/)
  })
})

describe('expectSuccess', () => {
  it('returns the success value', async () => {
    await expect(expectSuccess(Effect.succeed('ok'))).resolves.toBe('ok')
  })

  it('throws when the effect fails', async () => {
    await expect(
      expectSuccess(Effect.gen(function* () { return yield* new FooError({ x: 0 }) })),
    ).rejects.toThrow(/Expected success/)
  })
})
```

- [ ] **Step 2: Confirm failure**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/effect/test.test.ts
```
Expected: FAIL — `Cannot find module './test'`.

---

### Task 1.5: Implement `test.ts` helpers

**Files:**
- Create: `packages/kit/src/effect/test.ts`

- [ ] **Step 1: Write implementation**

```ts
// packages/kit/src/effect/test.ts
import { Cause, Effect, Exit } from 'effect'

export async function expectFailure<A, E, T extends E>(
  effect: Effect.Effect<A, E, never>,
  Tag: { new (...args: any[]): T },
): Promise<T> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) {
    throw new Error(`Expected failure ${Tag.name}, got success: ${JSON.stringify(exit.value)}`)
  }
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'None') {
    throw new Error(`Expected failure ${Tag.name}, got defect: ${Cause.pretty(exit.cause)}`)
  }
  if (!(failure.value instanceof Tag)) {
    const tag = (failure.value as { _tag?: string })._tag ?? failure.value
    throw new Error(`Expected ${Tag.name}, got ${tag}`)
  }
  return failure.value
}

export async function expectSuccess<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isFailure(exit)) {
    throw new Error(`Expected success, got: ${Cause.pretty(exit.cause)}`)
  }
  return exit.value
}
```

- [ ] **Step 2: Run tests**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/effect/test.test.ts
```
Expected: all tests pass.

- [ ] **Step 3: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/src/effect/test.ts packages/kit/src/effect/test.test.ts
```

---

### Task 1.6: Create `effect/index.ts` public surface

**Files:**
- Create: `packages/kit/src/effect/index.ts`

- [ ] **Step 1: Write the re-exports**

```ts
// packages/kit/src/effect/index.ts
export { runEffect, setRuntime, useRuntime } from './runtime'
export { expectFailure, expectSuccess } from './test'
```

- [ ] **Step 2: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/src/effect/index.ts
```

---

### Task 1.7: Add `DrizzleDb` Tag + Live Layer with failing test

**Files:**
- Create: `packages/kit/src/db/effect.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/kit/src/db/effect.test.ts
import { Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./manager', () => ({
  useDatabase: vi.fn(async () => ({ __mock: true } as any)),
}))

describe('DrizzleDbLive', () => {
  it('exposes the result of useDatabase() via the DrizzleDb tag', async () => {
    const { DrizzleDb, DrizzleDbLive } = await import('./effect')
    const program = Effect.gen(function* () {
      const db = yield* DrizzleDb
      return (db as any).__mock
    })
    const result = await Effect.runPromise(program.pipe(Effect.provide(DrizzleDbLive)))
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm failure**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/db/effect.test.ts
```
Expected: FAIL — `Cannot find module './effect'`.

---

### Task 1.8: Implement `db/effect.ts`

**Files:**
- Create: `packages/kit/src/db/effect.ts`

- [ ] **Step 1: Write implementation**

```ts
// packages/kit/src/db/effect.ts
import { Context, Effect, Layer } from 'effect'
import type { Database } from './manager'
import { useDatabase } from './manager'

export class DrizzleDb extends Context.Tag('@czo/kit/DrizzleDb')<
  DrizzleDb,
  Database
>() {}

export const DrizzleDbLive = Layer.effect(
  DrizzleDb,
  Effect.promise(() => useDatabase()),
)
```

- [ ] **Step 2: Run the test**

```bash
cd /workspace/c-zo/packages/kit && pnpm vitest run src/db/effect.test.ts
```
Expected: PASS.

- [ ] **Step 3: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/src/db/effect.ts packages/kit/src/db/effect.test.ts
```

---

### Task 1.9: Wire up exports + build config

**Files:**
- Modify: `packages/kit/package.json`
- Modify: `packages/kit/build.config.ts`

- [ ] **Step 1: Add the `./effect` subpath export to `packages/kit/package.json`**

Locate the `"exports"` block. Add inside, after `"./testing"` (or alphabetically near `./db`):

```json
"./effect": {
  "types": "./src/effect/index.ts",
  "default": "./dist/effect/index.mjs"
}
```

(Match the formatting of neighbouring entries — same trailing-comma rules.)

- [ ] **Step 2: Add `src/effect/index` to build entries**

In `packages/kit/build.config.ts`, append `'src/effect/index'` to the `entries` array (alphabetical order — between `src/db/index` and `src/event-bus/index` is fine).

- [ ] **Step 3: Build the kit package**

```bash
cd /workspace/c-zo/packages/kit && pnpm build
```
Expected: `dist/effect/index.mjs` and `dist/effect/index.d.mts` produced. Build exits 0.

- [ ] **Step 4: Verify the new subpath resolves from another workspace package**

```bash
cd /workspace/c-zo && pnpm typecheck
```
Expected: 0 new errors (pre-existing errors elsewhere in the repo are tolerated).

- [ ] **Step 5: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/package.json packages/kit/build.config.ts packages/kit/dist
```
(Note: dist artifacts may or may not be tracked — only stage if they currently are.)

---

### Task 1.10: Run full kit test suite and stage final state for PR1

- [ ] **Step 1: Run all kit tests**

```bash
cd /workspace/c-zo/packages/kit && pnpm test
```
Expected: all tests pass, including the 3 new test files.

- [ ] **Step 2: Run typecheck across the workspace**

```bash
cd /workspace/c-zo && pnpm typecheck
```
Expected: 0 new errors introduced by PR1.

- [ ] **Step 3: Confirm staged set is what we expect**

```bash
cd /workspace/c-zo && git status --short
```
Expected staged files (M = modified, A = new):
- M `packages/kit/package.json`
- M `packages/kit/build.config.ts`
- M `pnpm-lock.yaml`
- A `packages/kit/src/effect/runtime.ts`
- A `packages/kit/src/effect/runtime.test.ts`
- A `packages/kit/src/effect/test.ts`
- A `packages/kit/src/effect/test.test.ts`
- A `packages/kit/src/effect/index.ts`
- A `packages/kit/src/db/effect.ts`
- A `packages/kit/src/db/effect.test.ts`

- [ ] **Step 4: PAUSE — ask user before committing**

Suggested commit message (only run with explicit user approval):

```
feat(kit): introduce Effect-TS runtime, DrizzleDb tag, and test helpers

- New @czo/kit/effect entry: useRuntime/setRuntime singletons, runEffect helper that
  unwraps Effect Cause to original tagged failures (so Pothos errors plugin can
  instanceof-route them).
- New DrizzleDb Context.Tag + DrizzleDbLive Layer in @czo/kit/db/effect — wraps
  the existing useDatabase() so Effect services can yield* DrizzleDb to get the
  current node-postgres Drizzle client (RQBv2 + AuthRelations preserved).
- New expectFailure/expectSuccess vitest helpers under @czo/kit/effect.
- Dormant infra: no module consumes these yet.
```

---

# PR 2 — Restructure `auth/apiKey` (still async)

**Goal:** Move the existing `apiKey.service.ts` into `services/api-key.ts` (contract) + `layers/api-key.ts` (impl) WITHOUT changing behavior or signatures. This is purely a rename + reorganization to lock in the layout decided in the spec.

**Suggested PR title:** `refactor(auth): split apiKey service into services/ + layers/ (no behavior change)`

---

### Task 2.1: Create `services/api-key.ts` with the existing public types

**Files:**
- Create: `packages/modules/auth/src/services/api-key.ts`

- [ ] **Step 1: Read the current factory's option/return types**

```bash
sed -n '1,150p' /workspace/c-zo/packages/modules/auth/src/services/apiKey.service.ts
```

This reveals the current `interface CreateApiKeyOptions`, `VerifyApiKeyOptions`, `FindOneOptions`, `FindManyOptions`, `UpdateApiKeyOptions`, `RemoveApiKeyOptions`, plus type aliases like `ApiKeyRow` and `ApiKeyService = ReturnType<typeof createApiKeyService>`.

- [ ] **Step 2: Move ALL of these type/interface declarations into the new file**

Create `packages/modules/auth/src/services/api-key.ts` containing:
- the existing `import type` lines that the types depend on
- the `ApiKeyRow` exported type alias
- every `interface` block: `CreateApiKeyOptions`, `VerifyApiKeyOptions`, `FindOneOptions`, `FindManyOptions`, `UpdateApiKeyOptions`, `RemoveApiKeyOptions`, `ScopedQueryOptions`, plus the helper `KeyGenerator` and `KeyHasher` types
- the type alias `export type ApiKeyService = ReturnType<typeof createApiKeyService>` — but **rewrite** this line to break the dependency:

```ts
// services/api-key.ts (footer)
import type { createApiKeyService } from '../layers/api-key'
export type ApiKeyService = ReturnType<typeof createApiKeyService>
```

This circular-looking import is safe: it's a `import type` that gets erased.

- [ ] **Step 3: Delete the moved declarations from `apiKey.service.ts`**

Edit `packages/modules/auth/src/services/apiKey.service.ts` and remove all the interface blocks + `ApiKeyRow` + the `export type ApiKeyService = …` line. Add an import of those types from the new contract file:

```ts
import type {
  ApiKeyRow, // (if used internally below)
  CreateApiKeyOptions,
  FindManyOptions,
  FindOneOptions,
  RemoveApiKeyOptions,
  UpdateApiKeyOptions,
  VerifyApiKeyOptions,
} from './api-key'
```

- [ ] **Step 4: Typecheck — must still pass**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm exec tsc --noEmit
```
Expected: same set of pre-existing errors, no new ones.

---

### Task 2.2: Move the impl to `layers/api-key.ts`

**Files:**
- Create: `packages/modules/auth/src/layers/api-key.ts`
- Delete: `packages/modules/auth/src/services/apiKey.service.ts`

- [ ] **Step 1: Move the file via `git mv` to preserve history**

```bash
cd /workspace/c-zo && mkdir -p packages/modules/auth/src/layers
git mv packages/modules/auth/src/services/apiKey.service.ts packages/modules/auth/src/layers/api-key.ts
```

- [ ] **Step 2: Update imports inside the moved file**

In `packages/modules/auth/src/layers/api-key.ts`, fix relative imports that broke from the move:
- `from './_internal/map-error'` → `from '../services/_internal/map-error'`
- `from './organization.service'` (type import, if present) → `from '../services/organization.service'`
- The local `import type { … } from './api-key'` (added in Task 2.1) → `from '../services/api-key'`

(Use `grep "from '\.\./\?'" packages/modules/auth/src/layers/api-key.ts` after edits to verify no broken paths.)

- [ ] **Step 3: Add the public re-export pointer in `services/api-key.ts`**

Append at the end of `packages/modules/auth/src/services/api-key.ts`:

```ts
// Re-export the factory from the impl side so existing call sites that import
// `createApiKeyService` from '@czo/auth/services' keep working until PR3
// rewrites the contract.
export { createApiKeyService } from '../layers/api-key'
```

- [ ] **Step 4: Update `services/index.ts`**

In `packages/modules/auth/src/services/index.ts`, replace `export * from './apiKey.service'` with `export * from './api-key'`.

- [ ] **Step 5: Typecheck**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm exec tsc --noEmit
```
Expected: 0 new errors.

---

### Task 2.3: Create `layers/index.ts` and update auth package exports

**Files:**
- Create: `packages/modules/auth/src/layers/index.ts`
- Modify: `packages/modules/auth/package.json`
- Modify: `packages/modules/auth/build.config.ts`

- [ ] **Step 1: Write the layers index**

```ts
// packages/modules/auth/src/layers/index.ts
export { createApiKeyService } from './api-key'
```

- [ ] **Step 2: Add `./layers` subpath export in `packages/modules/auth/package.json`**

Mirror the existing `"./services"` export, pointing at `./src/layers/index.ts` and `./dist/layers/index.mjs`.

- [ ] **Step 3: Add `src/layers/index` to `packages/modules/auth/build.config.ts` entries**

Add it next to `src/services/index` in the `entries` array.

- [ ] **Step 4: Build the auth package**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm build
```
Expected: build succeeds; `dist/layers/index.mjs` exists.

---

### Task 2.4: Smoke-test the runtime path

- [ ] **Step 1: Run the auth tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test
```
Expected: all tests pass (no new failures vs main branch).

- [ ] **Step 2: Run the mazo app build to make sure imports still resolve**

```bash
cd /workspace/c-zo && pnpm --filter mazo build
```
Expected: build succeeds.

- [ ] **Step 3: Workspace typecheck**

```bash
cd /workspace/c-zo && pnpm typecheck
```
Expected: 0 new errors.

- [ ] **Step 4: PAUSE — ask user before committing PR2**

Suggested message:
```
refactor(auth): split apiKey service into services/ + layers/ (no behavior change)

Mechanical move only: the existing apiKey.service.ts is split into a contract
file (services/api-key.ts — interfaces, types) and an impl file (layers/api-key.ts
— the createApiKeyService factory, currently still async). Adds the new
@czo/auth/layers subpath export. No signature change, no behavior change. Sets
up the layout that PR3 will fill with Effect.
```

---

# PR 3 — `apiKey` migrated to Effect (the pilot)

**Goal:** Rewrite `apiKey` in Effect (Tag + Layer + tagged errors), wire the `ManagedRuntime` into the Nitro plugin, attach it to the GraphQL context, migrate the apiKey resolvers + tests + docs. Behavior must remain functionally identical to PR2.

**Suggested PR title:** `refactor(auth/apiKey): migrate service to Effect-TS (DI, tagged errors, resolvers)`

> ⚠ This PR is a single coherent unit because partial states (Effect service + non-Effect resolver, or vice versa) won't typecheck.

---

### Task 3.1: Define tagged errors in `services/api-key.ts`

**Files:**
- Modify: `packages/modules/auth/src/services/api-key.ts`

- [ ] **Step 1: Add the 12 tagged error classes at the top of the file**

Below the existing imports, before the existing interfaces, insert:

```ts
import { Data } from 'effect'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class InvalidApiKey extends Data.TaggedError('InvalidApiKey')<{}> {
  readonly code = 'INVALID_API_KEY'
}

export class KeyDisabled extends Data.TaggedError('KeyDisabled')<{}> {
  readonly code = 'API_KEY_DISABLED'
}

export class KeyExpired extends Data.TaggedError('KeyExpired')<{
  readonly keyId: number
}> {
  readonly code = 'API_KEY_EXPIRED'
}

export class Unauthorized extends Data.TaggedError('Unauthorized')<{}> {
  readonly code = 'UNAUTHORIZED'
}

export class RateLimited extends Data.TaggedError('RateLimited')<{
  readonly tryAgainIn: number
}> {
  readonly code = 'RATE_LIMITED'
}

export class Misconfigured extends Data.TaggedError('Misconfigured')<{
  readonly reason: string
}> {
  readonly code = 'MISCONFIGURED'
}

export class UsageExceeded extends Data.TaggedError('UsageExceeded')<{}> {
  readonly code = 'USAGE_EXCEEDED'
}

export class Intrusion extends Data.TaggedError('Intrusion')<{}> {
  readonly code = 'INTRUSION'
}

export class NotFound extends Data.TaggedError('NotFound')<{}> {
  readonly code = 'API_KEY_NOT_FOUND'
}

export class NoChanges extends Data.TaggedError('NoChanges')<{}> {
  readonly code = 'NO_CHANGES'
}

export class RefillPairRequired extends Data.TaggedError('RefillPairRequired')<{}> {
  readonly code = 'REFILL_PAIR_REQUIRED'
}

export class DbFailed extends Data.TaggedError('DbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'DB_FAILED'
}

export type ApiKeyError =
  | InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
  | RateLimited | Misconfigured | UsageExceeded
  | Intrusion | NotFound | NoChanges | RefillPairRequired | DbFailed
```

- [ ] **Step 2: Add a single sanity test asserting the `_tag` and `code` are set**

Create `packages/modules/auth/src/services/api-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { InvalidApiKey, KeyExpired, RateLimited } from './api-key'

describe('apiKey tagged errors', () => {
  it('InvalidApiKey has _tag and code', () => {
    const e = new InvalidApiKey()
    expect(e._tag).toBe('InvalidApiKey')
    expect(e.code).toBe('INVALID_API_KEY')
    expect(e).toBeInstanceOf(Error)
  })

  it('KeyExpired carries keyId', () => {
    const e = new KeyExpired({ keyId: 42 })
    expect(e._tag).toBe('KeyExpired')
    expect(e.keyId).toBe(42)
  })

  it('RateLimited carries tryAgainIn', () => {
    const e = new RateLimited({ tryAgainIn: 1500 })
    expect(e._tag).toBe('RateLimited')
    expect(e.tryAgainIn).toBe(1500)
  })
})
```

- [ ] **Step 3: Run that test**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/api-key.test.ts
```
Expected: PASS.

---

### Task 3.2: Replace `ApiKeyService` async interface with Effect Tag + Effect signatures

**Files:**
- Modify: `packages/modules/auth/src/services/api-key.ts`

- [ ] **Step 1: Remove the trailing `export type ApiKeyService = ReturnType<typeof createApiKeyService>` and the `export { createApiKeyService } from '../layers/api-key'` lines from PR2**

Those lines won't survive — `createApiKeyService` is being deleted in Task 3.4.

- [ ] **Step 2: Add the Effect-style interface and Tag**

Append:

```ts
import { Context, type Effect } from 'effect'
import type { ApiKey, CreateApiKeyInput, UpdateApiKeyInput } from '@czo/auth/types'

// Slim down VerifyApiKeyOptions: drop all on*/callback fields. Keep only the
// real options that change behavior, not error signaling.
export interface VerifyOptions {
  permissions?: Record<string, string[]>
  keyHasher?: KeyHasher
}

// Same trim for CreateApiKeyOptions, UpdateApiKeyOptions, FindOneOptions,
// FindManyOptions, RemoveApiKeyOptions: remove every onXxx callback field.
// (Edit each interface block in place — they currently live in this file.)

export interface ApiKeyService {
  readonly findFirst: (
    opts: FindOneOptions,
    config?: Parameters<Database<AuthRelations>['query']['apikeys']['findFirst']>[0],
  ) => Effect.Effect<ApiKey, NotFound | Intrusion | DbFailed>

  readonly findMany: (
    opts: FindManyOptions,
    config?: Parameters<Database<AuthRelations>['query']['apikeys']['findMany']>[0],
  ) => Effect.Effect<readonly ApiKey[], Intrusion | DbFailed>

  readonly create: (
    input: CreateApiKeyInput,
    opts: CreateApiKeyOptions,
  ) => Effect.Effect<ApiKey, RefillPairRequired | Intrusion | DbFailed>

  readonly update: (
    id: number,
    input: UpdateApiKeyInput,
    opts: UpdateApiKeyOptions,
  ) => Effect.Effect<ApiKey, NotFound | NoChanges | RefillPairRequired | Intrusion | DbFailed>

  readonly validate: (
    hashedKey: string,
    opts?: VerifyOptions,
  ) => Effect.Effect<
    ApiKey,
    InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
    | RateLimited | Misconfigured | UsageExceeded | DbFailed
  >

  readonly verify: (
    plainKey: string,
    opts?: VerifyOptions,
  ) => Effect.Effect<
    ApiKey,
    InvalidApiKey | KeyDisabled | KeyExpired | Unauthorized
    | RateLimited | Misconfigured | UsageExceeded | DbFailed
  >

  readonly remove: (
    id: number,
    opts: RemoveApiKeyOptions,
  ) => Effect.Effect<boolean, NotFound | Intrusion | DbFailed>
}

export const ApiKeyService = Context.GenericTag<ApiKeyService>('@czo/auth/ApiKeyService')
```

- [ ] **Step 3: Typecheck — expect failures in `layers/api-key.ts` (intentional, will fix in 3.3)**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm exec tsc --noEmit 2>&1 | grep -E "src/(services|layers)/api-key" | head
```
Expected: errors in `layers/api-key.ts` (the old factory now mismatches the new contract). Do not commit yet.

---

### Task 3.3: Define `OrganizationService` Tag + stub Layer

**Files:**
- Create: `packages/modules/auth/src/services/organization.ts`
- Create: `packages/modules/auth/src/layers/organization.ts`

- [ ] **Step 1: Write the contract file**

```ts
// packages/modules/auth/src/services/organization.ts
import { Context, type Effect } from 'effect'

export interface OrganizationService {
  readonly checkMembership: (
    organizationId: number,
    userId: number,
  ) => Effect.Effect<boolean, never>
}

export const OrganizationService = Context.GenericTag<OrganizationService>(
  '@czo/auth/OrganizationService',
)
```

- [ ] **Step 2: Write the live layer that delegates to the existing `createOrganizationService`**

```ts
// packages/modules/auth/src/layers/organization.ts
import { Effect, Layer } from 'effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { createOrganizationService } from '../services/organization.service'
import { OrganizationService } from '../services/organization'

export const OrganizationServiceLive = Layer.effect(
  OrganizationService,
  Effect.gen(function* () {
    const db = yield* DrizzleDb
    const inner = createOrganizationService(db, /* … other deps as the existing factory expects */)
    return {
      checkMembership: (orgId, userId) =>
        Effect.promise(() => inner.checkMembership(orgId, userId)),
    }
  }),
)
```

> **Note on the constructor signature**: read the current `createOrganizationService` signature in `packages/modules/auth/src/services/organization.service.ts` and pass the same dependencies the auth plugin currently provides. If the existing factory needs `auth` (better-auth instance) or other services, capture them in the Effect by adding more `yield*` lines in this Layer.

- [ ] **Step 3: Add `services/organization.ts` and `layers/organization.ts` re-exports**

Update `packages/modules/auth/src/services/index.ts` to add:
```ts
export { OrganizationService } from './organization'
```

Update `packages/modules/auth/src/layers/index.ts` to add:
```ts
export { OrganizationServiceLive } from './organization'
```

(Leave the existing `./organization.service` re-export alone — other modules still consume the old factory.)

- [ ] **Step 4: Typecheck (errors in `layers/api-key.ts` still expected)**

---

### Task 3.4: Rewrite `layers/api-key.ts` as `Layer.effect(ApiKeyService, …)` — write tests first

**Files:**
- Create: `packages/modules/auth/src/layers/api-key.test.ts`

- [ ] **Step 1: Set up the test fixture using a Layer composition**

Read the existing `organization.service.test.ts` to see how the project bootstraps a real DB connection in tests — reuse that pattern.

```ts
// packages/modules/auth/src/layers/api-key.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Effect, Layer } from 'effect'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { DrizzleDb, DrizzleDbLive } from '@czo/kit/db/effect'
import { ApiKeyService, InvalidApiKey, KeyDisabled, KeyExpired, RateLimited, Misconfigured, UsageExceeded, Unauthorized } from '../services/api-key'
import { OrganizationService } from '../services/organization'
import { ApiKeyServiceLive } from './api-key'
import { defaultKeyHasher } from '@better-auth/api-key'
import { apikeys } from '../database/schema'
import { eq } from 'drizzle-orm'

const OrganizationStub = Layer.succeed(OrganizationService, {
  checkMembership: () => Effect.succeed(true),
})

const TestLayer = ApiKeyServiceLive.pipe(
  Layer.provide(Layer.mergeAll(DrizzleDbLive, OrganizationStub)),
)

const provide = <A, E>(eff: Effect.Effect<A, E, ApiKeyService>) =>
  eff.pipe(Effect.provide(TestLayer))

// Helper: insert a row directly via Drizzle for a focused test.
async function seedKey(overrides: Partial<typeof apikeys.$inferInsert> = {}) {
  // … use Effect.runPromise(Effect.gen(function*() { const db = yield* DrizzleDb; … }).pipe(Effect.provide(DrizzleDbLive)))
  // Returns { row, plainKey }
}

describe('ApiKeyService.verify', () => {
  it('rejects empty plain key with InvalidApiKey', async () => {
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.verify('')
    })
    const err = await expectFailure(provide(program), InvalidApiKey)
    expect(err._tag).toBe('InvalidApiKey')
  })

  // … additional cases below
})
```

- [ ] **Step 2: Add ALL behavioral tests required by spec section 5**

Each in its own `it(…)` block, asserting via `expectFailure(…, ExpectedTag)` or `expectSuccess(…)`:

1. `verify('')` → `InvalidApiKey`
2. `verify(unknownHash)` → `InvalidApiKey`
3. disabled key → `KeyDisabled`
4. expired key → `KeyExpired` (assert `keyId`)
5. permissions insufficient → `Unauthorized`
6. rate limit hit (`requestCount >= max`, in window) → `RateLimited` (assert `tryAgainIn` is roughly window-elapsed, ceil)
7. misconfig (`rateLimitEnabled = true` + `rateLimitTimeWindow <= 0`) → `Misconfigured` (assert `reason` field)
8. quota exhausted (`remaining = 0`, no refill) → `UsageExceeded`
9. successful verify → `remaining` decremented by 1 in DB (re-read row)
10. successful verify with refill due → `remaining = refillAmount - 1`, `lastRefillAt` updated
11. concurrency: launch two `verify` in parallel against a key with `remaining = 1` → exactly one success, one `UsageExceeded`. Use `Effect.all([…], { concurrency: 'unbounded' })`.
12. `null` rate-limit window/max → success (rate limit "disabled" branch)

- [ ] **Step 3: Confirm tests fail because impl is still the old async factory**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/layers/api-key.test.ts
```
Expected: FAIL — likely `ApiKeyServiceLive` is not exported from `layers/api-key.ts` yet, or signatures don't match.

---

### Task 3.5: Rewrite `layers/api-key.ts` to satisfy the new tests

**Files:**
- Modify (rewrite): `packages/modules/auth/src/layers/api-key.ts`

- [ ] **Step 1: Replace the entire file content**

```ts
// packages/modules/auth/src/layers/api-key.ts
import type { ApiKey, AuthRelations, CreateApiKeyInput, UpdateApiKeyInput } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import { defaultKeyHasher } from '@better-auth/api-key'
import { apikeys } from '../database/schema'
import { generateRandomString } from 'better-auth/crypto'
import { Effect, Layer } from 'effect'
import { role } from 'better-auth/plugins'
import { and, eq, sql } from 'drizzle-orm'
import { DrizzleDb } from '@czo/kit/db/effect'
import {
  ApiKeyService,
  DbFailed,
  Intrusion,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NotFound,
  NoChanges,
  RateLimited,
  RefillPairRequired,
  Unauthorized,
  UsageExceeded,
  type CreateApiKeyOptions,
  type FindManyOptions,
  type FindOneOptions,
  type RemoveApiKeyOptions,
  type UpdateApiKeyOptions,
  type VerifyOptions,
} from '../services/api-key'
import { OrganizationService } from '../services/organization'

const defaultKeyGenerator = ({ length, prefix }: { length: number, prefix: string | undefined }) => {
  const hex = generateRandomString(length, 'a-z', 'A-Z')
  return prefix ? `${prefix}_${hex}` : hex
}

export const ApiKeyServiceLive = Layer.effect(
  ApiKeyService,
  Effect.gen(function* () {
    const db = yield* DrizzleDb
    const org = yield* OrganizationService

    const tryDb = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: cause => new DbFailed({ cause }) })

    const assertScopeAllowed = (scope: { reference: string, referenceId?: number, userId: number }) =>
      Effect.gen(function* () {
        if (scope.reference === 'organization') {
          if (scope.referenceId === undefined) return yield* new Intrusion()
          const ok = yield* org.checkMembership(scope.referenceId, scope.userId)
          if (!ok) return yield* new Intrusion()
          return
        }
        if (scope.reference === 'user') {
          const refId = scope.referenceId ?? scope.userId
          if (scope.userId !== refId) return yield* new Intrusion()
          return
        }
        return yield* new Intrusion()
      })

    // findFirst — port the existing logic line-for-line, replacing each
    // `await opts.onXxx?.()` + `return null` with `return yield* new TagXxx()`.
    const findFirst: ApiKeyService['findFirst'] = (opts, config) => Effect.gen(function* () {
      const where = config?.where ?? {}
      const reference = (where as any).reference ?? 'user'
      const referenceId = (where as any).referenceId ?? opts.session.userId
      yield* assertScopeAllowed({ reference, referenceId, userId: opts.session.userId })
      const data = yield* tryDb(() => db.query.apikeys.findFirst({
        ...config,
        where: { ...where, reference, referenceId },
      }))
      if (!data) return yield* new NotFound()
      return data
    })

    // findMany — same shape as findFirst.
    const findMany: ApiKeyService['findMany'] = (opts, config) => Effect.gen(function* () {
      const where = config?.where ?? {}
      const reference = (where as any).reference ?? 'user'
      const referenceId = (where as any).referenceId ?? opts.session.userId
      yield* assertScopeAllowed({ reference, referenceId, userId: opts.session.userId })
      const rows = yield* tryDb(() => db.query.apikeys.findMany({
        ...config,
        where: { ...where, reference, referenceId },
      }))
      return rows
    })

    // create — port from current impl. The refill-pair check stays in Effect:
    //   if ((input.refillAmount && !input.refillInterval) || (input.refillInterval && !input.refillAmount))
    //     return yield* new RefillPairRequired()
    // Then build hashedKey/start/expiresAt as before, INSERT via tryDb, return row + plain `key`.
    const create: ApiKeyService['create'] = (input, opts) => Effect.gen(function* () {
      const reference = opts.reference ?? 'user'
      yield* assertScopeAllowed({ reference, referenceId: input.referenceId, userId: opts.session.userId })
      if ((input.refillAmount && !input.refillInterval) || (input.refillInterval && !input.refillAmount)) {
        return yield* new RefillPairRequired()
      }
      const generator = opts.keyGenerator ?? defaultKeyGenerator
      const hasher = opts.keyHasher ?? defaultKeyHasher
      const key = yield* Effect.promise(() => Promise.resolve(generator({ length: opts.keyLength ?? 64, prefix: input.prefix })))
      const hashedKey = yield* Effect.promise(() => Promise.resolve(hasher(key)))
      const start = key.substring(0, opts.startCharsLength ?? 6)
      const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null
      const remaining = input.remaining ?? input.refillAmount ?? null
      const now = new Date()
      const rateLimit = opts.rateLimit ?? { maxRequests: 10, timeWindow: 1000 * 60 * 60 * 24 }
      const [row] = yield* tryDb(() => db.insert(apikeys).values({
        configId: input.group,
        name: input.name,
        prefix: input.prefix,
        start,
        key: hashedKey,
        referenceId: input.referenceId,
        reference,
        rateLimitEnabled: input.rateLimitEnabled ?? true,
        rateLimitTimeWindow: input.rateLimitTimeWindow ?? rateLimit.timeWindow,
        rateLimitMax: input.rateLimitMax ?? rateLimit.maxRequests,
        remaining,
        refillAmount: input.refillAmount,
        refillInterval: input.refillInterval,
        expiresAt,
        permissions: input.permissions,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      }).returning())
      return { ...row, key } as unknown as ApiKey
    })

    // update — port the current logic; replace each callback signal with a yield* of the matching tagged error.
    const update: ApiKeyService['update'] = (id, input, opts) => Effect.gen(function* () {
      const reference = opts.reference ?? 'user'
      const referenceId = opts.referenceId ?? (reference === 'user' ? opts.session.userId : undefined)
      yield* assertScopeAllowed({ reference, referenceId, userId: opts.session.userId })
      if ((input.refillAmount !== undefined && input.refillInterval === undefined)
        || (input.refillInterval !== undefined && input.refillAmount === undefined)) {
        return yield* new RefillPairRequired()
      }
      const { expiresIn, ...rest } = input
      const patch: Record<string, unknown> = { ...rest }
      if (expiresIn !== undefined) {
        patch.expiresAt = expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000)
      }
      const hasChanges = Object.values(patch).some(v => v !== undefined)
      if (!hasChanges) return yield* new NoChanges()
      patch.updatedAt = new Date()
      const [updated] = yield* tryDb(() => db.update(apikeys)
        .set(patch as any)
        .where(and(eq(apikeys.id, id), eq(apikeys.reference, reference), eq(apikeys.referenceId, referenceId!)))
        .returning())
      if (!updated) return yield* new NotFound()
      return updated
    })

    // validate — most complex. Port the EXACT logic from the current impl
    // (commit 614b631a). The atomic UPDATE with CASE / refillDue / WHERE
    // precondition is preserved verbatim. Each early `return null + onXxx?.()`
    // becomes `return yield* new TagXxx({...})`.
    const validate: ApiKeyService['validate'] = (hashedKey, opts) => Effect.gen(function* () {
      const apiKey = yield* tryDb(() => db.query.apikeys.findFirst({ where: { key: hashedKey } }))
      if (!apiKey) return yield* new InvalidApiKey()
      if (!apiKey.enabled) return yield* new KeyDisabled()
      const nowDate = new Date()
      const nowMs = nowDate.getTime()
      if (apiKey.expiresAt && apiKey.expiresAt.getTime() < nowMs) return yield* new KeyExpired({ keyId: apiKey.id })
      if (opts?.permissions) {
        const granted = apiKey.permissions ?? {}
        const allowed = role(granted).authorize(opts.permissions)
        if (!allowed.success) return yield* new Unauthorized()
      }
      if (apiKey.rateLimitEnabled) {
        const windowMs = apiKey.rateLimitTimeWindow
        const max = apiKey.rateLimitMax
        if (windowMs !== null && max !== null) {
          if (windowMs <= 0 || max <= 0) {
            return yield* new Misconfigured({ reason: 'rateLimitTimeWindow and rateLimitMax must be > 0 when rateLimitEnabled is true' })
          }
          const elapsed = nowMs - (apiKey.lastRequest?.getTime() ?? 0)
          const inWindow = apiKey.lastRequest !== null && elapsed < windowMs
          const currentCount = apiKey.requestCount ?? 0
          if (inWindow && currentCount >= max) {
            return yield* new RateLimited({ tryAgainIn: Math.ceil(windowMs - elapsed) })
          }
        }
      }
      // ── atomic UPDATE — copy verbatim from current impl (validate body lines 261–296) ──
      const refillDue = sql`(
        ${apikeys.refillInterval} IS NOT NULL
        AND ${apikeys.refillAmount} IS NOT NULL
        AND EXTRACT(EPOCH FROM (${nowDate}::timestamptz - COALESCE(${apikeys.lastRefillAt}, ${apikeys.createdAt}))) * 1000 > ${apikeys.refillInterval}
      )`
      const [updated] = yield* tryDb(() => db.update(apikeys)
        .set({
          remaining: sql`CASE
            WHEN ${apikeys.remaining} IS NULL THEN NULL
            WHEN ${refillDue} THEN ${apikeys.refillAmount} - 1
            ELSE ${apikeys.remaining} - 1
          END`,
          lastRefillAt: sql`CASE
            WHEN ${refillDue} THEN ${nowDate}::timestamptz
            ELSE ${apikeys.lastRefillAt}
          END`,
          lastRequest: nowDate,
          requestCount: sql`CASE
            WHEN ${apikeys.rateLimitEnabled} IS NOT TRUE
              OR ${apikeys.rateLimitTimeWindow} IS NULL
              OR ${apikeys.rateLimitMax} IS NULL
              THEN COALESCE(${apikeys.requestCount}, 0)
            WHEN ${apikeys.lastRequest} IS NULL
              OR EXTRACT(EPOCH FROM (${nowDate}::timestamptz - ${apikeys.lastRequest})) * 1000 > ${apikeys.rateLimitTimeWindow}
              THEN 1
            ELSE COALESCE(${apikeys.requestCount}, 0) + 1
          END`,
          updatedAt: nowDate,
        })
        .where(and(
          eq(apikeys.id, apiKey.id),
          sql`(
            ${apikeys.remaining} IS NULL
            OR ${apikeys.remaining} > 0
            OR (${refillDue} AND ${apikeys.refillAmount} > 0)
          )`,
        ))
        .returning())
      if (!updated) return yield* new UsageExceeded()
      return updated
    })

    // verify — empty-key guard then delegate to validate.
    const verify: ApiKeyService['verify'] = (plainKey, opts) => Effect.gen(function* () {
      if (!plainKey) return yield* new InvalidApiKey()
      const hasher = opts?.keyHasher ?? defaultKeyHasher
      const hashed = yield* Effect.promise(() => Promise.resolve(hasher(plainKey)))
      return yield* validate(hashed, opts)
    })

    // remove — port the existing impl; 0 rows → NotFound.
    const remove: ApiKeyService['remove'] = (id, opts) => Effect.gen(function* () {
      const reference = opts.reference ?? 'user'
      const referenceId = opts.referenceId ?? (reference === 'user' ? opts.session.userId : undefined)
      yield* assertScopeAllowed({ reference, referenceId, userId: opts.session.userId })
      const [deleted] = yield* tryDb(() => db.delete(apikeys)
        .where(and(eq(apikeys.id, id), eq(apikeys.reference, reference), eq(apikeys.referenceId, referenceId!)))
        .returning({ id: apikeys.id }))
      if (!deleted) return yield* new NotFound()
      return true
    })

    return { findFirst, findMany, create, update, validate, verify, remove }
  }),
)
```

- [ ] **Step 2: Run the new test file**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/layers/api-key.test.ts
```
Expected: all 12+ test cases pass.

- [ ] **Step 3: Run the full module test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test
```
Expected: all tests pass (including organization.service.test.ts, etc.).

- [ ] **Step 4: Workspace typecheck**

```bash
cd /workspace/c-zo && pnpm typecheck
```
Expected: 0 new errors. Pre-existing errors are tolerated, but no new ones introduced by this PR.

> ⚠ If `tsc` complains about the `Database<AuthRelations>` import at the top of `services/api-key.ts`, ensure it is `import type` (the contract file must not pull runtime). Same for `@czo/auth/types`.

---

### Task 3.6: Build the `ManagedRuntime` in the Nitro plugin and expose via context

**Files:**
- Modify: `packages/modules/auth/src/plugins/index.ts`
- Modify: `packages/modules/auth/src/graphql/context-factory.ts`

- [ ] **Step 1: Update the plugin to build and dispose the runtime**

In `packages/modules/auth/src/plugins/index.ts`, inside the `czo:init` hook (after the existing config + actor/access registration), add:

```ts
import { Layer, ManagedRuntime } from 'effect'
import { setRuntime } from '@czo/kit/effect'
import { DrizzleDbLive } from '@czo/kit/db/effect'
import { ApiKeyServiceLive, OrganizationServiceLive } from '@czo/auth/layers'

// … inside czo:init, after the existing setup:
const AuthModuleLive = Layer.mergeAll(
  ApiKeyServiceLive,
  OrganizationServiceLive,
).pipe(
  Layer.provide(DrizzleDbLive),
)

const runtime = ManagedRuntime.make(AuthModuleLive)
setRuntime(runtime)

nitroApp.hooks.hook('close', () => runtime.dispose())
```

- [ ] **Step 2: Attach the runtime to the GraphQL auth context**

In `packages/modules/auth/src/graphql/context-factory.ts`, locate the function that builds the auth context and add `runtime: useRuntime()` (import `useRuntime` from `@czo/kit/effect`). The auth context type definition (likely in `packages/modules/auth/src/types.ts`) must also gain a `runtime: ReturnType<typeof useRuntime>` field.

- [ ] **Step 3: Workspace typecheck**

```bash
cd /workspace/c-zo && pnpm typecheck
```
Expected: 0 new errors.

- [ ] **Step 4: Build mazo**

```bash
cd /workspace/c-zo && pnpm --filter mazo build
```
Expected: success.

---

### Task 3.7: Migrate apiKey GraphQL errors to point at the tagged error classes

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/api-key/errors.ts`

- [ ] **Step 1: Replace the file content**

```ts
// packages/modules/auth/src/graphql/schema/api-key/errors.ts
import { registerError } from '@czo/kit/graphql'
import {
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NoChanges,
  NotFound as ApiKeyNotFound,
  RateLimited,
  RefillPairRequired,
  Unauthorized,
  UsageExceeded,
} from '@czo/auth/services'

export {
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NoChanges,
  ApiKeyNotFound,
  RateLimited,
  RefillPairRequired,
  Unauthorized,
  UsageExceeded,
}

export function registerApiKeyErrors(builder: any): void {
  registerError(builder, InvalidApiKey, { name: 'InvalidApiKeyError' })
  registerError(builder, KeyDisabled, { name: 'ApiKeyDisabledError' })
  registerError(builder, KeyExpired, {
    name: 'ApiKeyExpiredError',
    fields: t => ({ keyId: t.exposeID('keyId') }),
  })
  registerError(builder, Unauthorized, { name: 'ApiKeyUnauthorizedError' })
  registerError(builder, RateLimited, {
    name: 'ApiKeyRateLimitedError',
    fields: t => ({ tryAgainIn: t.exposeInt('tryAgainIn') }),
  })
  registerError(builder, Misconfigured, {
    name: 'ApiKeyMisconfiguredError',
    fields: t => ({ reason: t.exposeString('reason') }),
  })
  registerError(builder, UsageExceeded, { name: 'ApiKeyUsageExceededError' })
  registerError(builder, ApiKeyNotFound, { name: 'ApiKeyNotFoundError' })
  registerError(builder, NoChanges, { name: 'ApiKeyNoChangesError' })
  registerError(builder, RefillPairRequired, { name: 'ApiKeyRefillPairRequiredError' })
}
```

> The existing file (PR2 state) defines `ApiKeyExpiredError` and `ApiKeyRevokedError` extending `BaseGraphQLError`. The new tagged classes replace both: `KeyExpired` plays the role of the old `ApiKeyExpiredError`. There is no `ApiKeyRevokedError` equivalent in the new design — verify nothing in the resolver code calls `throw new ApiKeyRevokedError(...)`. If it does, that throw site corresponds to a missing tagged error; add a `Revoked` tagged class to `services/api-key.ts` and register it here.

- [ ] **Step 2: Search for stray uses of the deleted classes**

```bash
grep -rn "ApiKeyRevokedError\|ApiKeyExpiredError" /workspace/c-zo/packages/modules/auth /workspace/c-zo/apps/mazo --include="*.ts" 2>/dev/null
```
Expected: zero matches after edits, OR matches are inside this errors file's mapping/comments only.

---

### Task 3.8: Migrate apiKey resolvers to `runEffect`

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/api-key/queries.ts`
- Modify: `packages/modules/auth/src/graphql/schema/api-key/mutations.ts`

- [ ] **Step 1: Update each resolver to use `runEffect(ctx.runtime, …)` and list the tagged errors in `errors: { types }`**

Example transformation for the `verifyApiKey` mutation (find the equivalent in `mutations.ts`):

Before (PR2 state):
```ts
builder.mutationField('verifyApiKey', t => t.field({
  type: ApiKeyType,
  args: { key: t.arg.string({ required: true }) },
  resolve: async (_, { key }, ctx) => {
    return ctx.auth.apiKeyService.verify(key, {
      onInvalidKey: async () => { /* … */ },
      // …
    })
  },
}))
```

After:
```ts
import { Effect } from 'effect'
import { runEffect } from '@czo/kit/effect'
import {
  ApiKeyService,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Unauthorized,
  RateLimited,
  Misconfigured,
  UsageExceeded,
  DbFailed,
} from '@czo/auth/services'

builder.mutationField('verifyApiKey', t => t.field({
  type: ApiKeyType,
  errors: {
    types: [InvalidApiKey, KeyDisabled, KeyExpired, Unauthorized, RateLimited, Misconfigured, UsageExceeded],
    // DbFailed deliberately NOT listed — it surfaces as 500 (defect-style) via runEffect.
  },
  args: { key: t.arg.string({ required: true }) },
  resolve: (_, { key }, ctx) =>
    runEffect(
      ctx.auth.runtime,
      Effect.gen(function* () {
        const svc = yield* ApiKeyService
        return yield* svc.verify(key)
      }),
    ),
}))
```

Apply analogous transforms to:
- `apiKey` query (findFirst) — `errors: { types: [ApiKeyNotFound, ForbiddenError /* if scope violation */] }`. Note: `Intrusion` should be registered as `ForbiddenError` if you want it to share the existing GraphQL `ForbiddenError` type — alternative is to register a separate `ApiKeyForbiddenError`. Pick one and stay consistent.
- `apiKeys` query (findMany)
- `createApiKey` mutation
- `updateApiKey` mutation
- `deleteApiKey` mutation
- `verifyApiKey` mutation

- [ ] **Step 2: Verify the schema generates without Pothos errors**

```bash
cd /workspace/c-zo && pnpm --filter mazo dev &
sleep 5
curl -s http://localhost:3000/api/graphql -H 'content-type: application/json' -d '{"query":"{ __schema { types { name } } }"}' | head -20
kill %1 2>/dev/null
```
Expected: response includes the new `*Error` GraphQL type names (e.g. `ApiKeyExpiredError`, `ApiKeyRateLimitedError`).

> If you cannot run a dev server in this environment, fall back to `pnpm --filter mazo build` and check for build-time Pothos errors instead.

- [ ] **Step 3: Run module tests + typecheck**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test
cd /workspace/c-zo && pnpm typecheck
```
Expected: pass; 0 new errors.

---

### Task 3.9: Documentation — `CLAUDE.md` and transitional note

**Files:**
- Modify: `/workspace/c-zo/CLAUDE.md`
- Modify: `packages/kit/src/graphql/errors/index.ts`

- [ ] **Step 1: Add a section to root `CLAUDE.md`**

After the "Module System" section, insert:

```markdown
## Effect-TS pattern (pilot: `auth/apiKey`)

`auth/apiKey` uses Effect-TS for DI and error modeling, as a pilot for full migration:

- **Contracts** live in `packages/modules/<module>/src/services/<name>.ts` — `Context.Tag`, interface, tagged errors (which double as Pothos GraphQL errors), and input types.
- **Implementations** live in `packages/modules/<module>/src/layers/<name>.ts` — `Layer.effect(Tag, …)`.
- **Runtime** is built once at boot in the auth Nitro plugin (`czo:init`), exposed via `useRuntime()` from `@czo/kit/effect`, attached to the GraphQL context as `ctx.auth.runtime`.
- **Resolvers** use `runEffect(ctx.auth.runtime, Effect.gen(function*() { … }))`. Tagged errors thrown by `runEffect` are routed to GraphQL union variants by Pothos's `errors: { types: [...] }` plugin via `instanceof`.
- **Tests** use `expectFailure(effect, Tag)` / `expectSuccess(effect)` from `@czo/kit/effect`.

Other modules still use the legacy `useContainer()` IoC + `BaseGraphQLError` pattern. Migration to Effect will land module-by-module in subsequent PRs.
```

- [ ] **Step 2: Add a transitional comment in `packages/kit/src/graphql/errors/index.ts`**

Above the `BaseGraphQLError` declaration:

```ts
/**
 * Base class for legacy GraphQL errors. New code in modules migrated to Effect
 * (see `auth/apiKey` pilot) uses `Data.TaggedError` directly — those classes
 * are registered with `registerError(...)` exactly the same way and don't need
 * to extend this class. Once all modules are migrated, this base class will
 * be deprecated.
 */
```

- [ ] **Step 3: PAUSE — ask user before committing PR3**

Suggested message:
```
refactor(auth/apiKey): migrate service to Effect-TS (DI, tagged errors, resolvers)

Pilot for full Effect adoption across c-zo modules.

- services/api-key.ts: Context.Tag<ApiKeyService> + 12 Data.TaggedError classes
  (which also serve as Pothos GraphQL union variants via registerError).
- layers/api-key.ts: Layer.effect(ApiKeyService, …) implementation. Atomic
  UPDATE for remaining/refill/requestCount preserved verbatim from prior fix.
- New OrganizationService Tag + Layer (delegating to existing async impl —
  full migration deferred).
- Plugin builds ManagedRuntime at czo:init, attaches to ctx.auth.runtime,
  disposes on Nitro close.
- apiKey resolvers use runEffect helper that unwraps Cause to the original
  tagged error so Pothos errors plugin routes via instanceof.
- 12+ new tests covering all tagged-error cases incl. concurrency on remaining=1.
- BaseGraphQLError kept for non-migrated modules; transitional comment added.
```

---

# Plan Self-Review

**Spec coverage check** — every spec section maps to plan tasks:
- §2.1 Full Effect (no schema): all PR3 tasks; Zod usage untouched
- §2.2 Drizzle Layer custom: Task 1.7–1.8
- §2.3 Tagged errors: Task 3.1
- §2.4 Layout `services/` + `layers/`: Tasks 2.1–2.3
- §2.5 Tag + Layer.effect (not Effect.Service): Tasks 3.2, 3.4–3.5
- §2.6 Runtime singleton: Tasks 1.2–1.3 (helpers), 3.6 (boot)
- §2.7 Tagged errors as GraphQL errors: Tasks 3.7–3.8
- §2.8 BaseGraphQLError duck-typing: Task 3.9 (transitional comment)
- §3 Tagged errors list: Task 3.1 covers all 12
- §4 Signature changes: Task 3.2
- §5 Phase 5 test cases: Task 3.4 enumerates all 12
- §5 Phase 6 docs: Task 3.9
- §6 Risks: each mitigated by a verification step in the relevant task
- §7 Out of scope: respected (no @effect/sql, @effect/vitest, etc. introduced)
- §8 Success criteria: covered by Tasks 3.4 (behavioral parity), 3.5 (no callbacks), 3.5–3.6 (typecheck), 3.5 (test pass), 3.8 (resolver e2e)

**Placeholder scan** — no "TBD", "TODO", or "implement later" outside of clearly delegated explicit-handoff steps. The two places I leaned on the engineer reading the existing impl (Tasks 3.3 — `OrganizationServiceLive` constructor signature, and 3.5 — `validate` body verbatim) are guarded with explicit "read this file at this commit" instructions.

**Type consistency** — `ApiKeyService` Tag is consistently `Context.GenericTag<ApiKeyService>('@czo/auth/ApiKeyService')` everywhere referenced (Tasks 3.2, 3.4, 3.5, 3.8). `OrganizationService` Tag uses `'@czo/auth/OrganizationService'` (Task 3.3). `DrizzleDb` Tag uses `'@czo/kit/DrizzleDb'` (Tasks 1.8 and 3.5). `ApiKeyServiceLive`, `OrganizationServiceLive`, `DrizzleDbLive` naming consistent. `runEffect` signature `(rt, effect) => Promise<A>` matches between Task 1.3 and 3.8.

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-effect-di-auth-apikey-pilot.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (or per PR), review between tasks, fast iteration. Good for the long restructuring of PR3.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
