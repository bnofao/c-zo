# Effect Runtime Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ownership of the single app-wide Effect `ManagedRuntime` from the `@czo/auth` plugin into `@czo/kit`, so every module contributes a `Layer` to one shared runtime instead of any module overwriting the global `setRuntime` slot.

**Architecture:** `@czo/kit/effect` gains a process-level layer registry. Modules call `registerEffectLayer(myLayer)` during their `czo:boot` hook. The kit's own plugin, which already orchestrates `czo:init → czo:register → czo:boot`, builds the `ManagedRuntime` from the accumulated layers (providing shared infra `DrizzleDbLive` exactly once) immediately after `czo:boot` completes, stores it via `setRuntime`, and disposes it on Nitro `close`. Resolvers/context-factory keep calling `useRuntime()` / `runEffect(ctx.auth.runtime, …)` unchanged — those run at request time, strictly after the runtime is built.

**Tech Stack:** TypeScript, Effect-TS (`Layer`, `ManagedRuntime`), Nitro plugins/hooks, Vitest.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/kit/src/effect/runtime.ts` | Global runtime slot + helpers | Modify: add `registerEffectLayer`, `clearEffectLayers`, `buildEffectRuntime` |
| `packages/kit/src/effect/index.ts` | Public surface of `@czo/kit/effect` | Modify: re-export new symbols |
| `packages/kit/src/effect/runtime.test.ts` | Unit tests for the runtime helpers | Modify: add tests for registry + build |
| `packages/kit/src/plugins/index.ts` | Kit Nitro plugin (hook orchestration) | Modify: build the Effect runtime after `czo:boot`, dispose on `close` |
| `packages/modules/auth/src/plugins/index.ts` | Auth Nitro plugin | Modify: stop owning the runtime; `registerEffectLayer(AuthModuleLive)` instead; drop `DrizzleDbLive` provide |
| `CLAUDE.md` | Project docs | Modify: update the Effect-TS section to describe the new lifecycle |

`DrizzleDbLive` (shared infra) stays in `packages/kit/src/db/effect.ts` — unchanged, but now provided once by the kit plugin rather than per-module.

---

### Task 1: Layer registry + `buildEffectRuntime` in `@czo/kit/effect`

**Files:**
- Modify: `packages/kit/src/effect/runtime.ts`
- Modify: `packages/kit/src/effect/index.ts`
- Test: `packages/kit/src/effect/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `packages/kit/src/effect/runtime.test.ts` (keep the existing imports/blocks; extend the import line and add the new block):

```typescript
// at top — extend the existing import:
import { buildEffectRuntime, clearEffectLayers, registerEffectLayer, runEffect, setRuntime, useRuntime } from './runtime'
import { Context } from 'effect' // add alongside existing `effect` imports

// new tag used only by these tests
class Greeter extends Context.Tag('test/Greeter')<Greeter, { readonly hello: () => string }>() {}
const GreeterLive = Layer.succeed(Greeter, Greeter.of({ hello: () => 'hi' }))

describe('effect layer registry', () => {
  beforeEach(() => {
    clearEffectLayers()
    setRuntime(undefined)
  })

  it('does nothing and leaves the runtime uninitialized when no layers are registered', () => {
    buildEffectRuntime(Layer.empty)
    expect(() => useRuntime()).toThrow(/Effect runtime not initialized/)
  })

  it('builds a runtime that can resolve a registered layer', async () => {
    registerEffectLayer(GreeterLive)
    const rt = buildEffectRuntime(Layer.empty)
    expect(rt).toBeDefined()
    expect(useRuntime()).toBe(rt)
    const greeting = await runEffect(useRuntime(), Greeter.pipe(Effect.map(g => g.hello())))
    expect(greeting).toBe('hi')
  })

  it('provides the shared infra layer to registered layers', async () => {
    // a layer that *needs* Greeter in its requirements, satisfied by the infra layer
    const NeedsGreeter = Layer.effect(
      Context.GenericTag<'test/Echo', { readonly echo: () => string }>('test/Echo'),
      Effect.gen(function* () {
        const g = yield* Greeter
        return { echo: () => `echo:${g.hello()}` }
      }),
    )
    registerEffectLayer(NeedsGreeter)
    buildEffectRuntime(GreeterLive) // infra provides Greeter
    const out = await runEffect(
      useRuntime(),
      Context.GenericTag<'test/Echo', { readonly echo: () => string }>('test/Echo').pipe(Effect.map(e => e.echo())),
    )
    expect(out).toBe('echo:hi')
  })

  it('throws if a layer is registered after the runtime is built', () => {
    registerEffectLayer(GreeterLive)
    buildEffectRuntime(Layer.empty)
    expect(() => registerEffectLayer(GreeterLive)).toThrow(/already built/)
  })

  it('clearEffectLayers resets the registry and frozen flag', () => {
    registerEffectLayer(GreeterLive)
    buildEffectRuntime(Layer.empty)
    clearEffectLayers()
    expect(() => registerEffectLayer(GreeterLive)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @czo/kit test -- runtime.test.ts`
Expected: FAIL — `buildEffectRuntime`, `registerEffectLayer`, `clearEffectLayers` are not exported.

- [ ] **Step 3: Implement the registry + builder in `runtime.ts`**

Replace the contents of `packages/kit/src/effect/runtime.ts` with:

```typescript
import type { Effect } from 'effect'
import { Cause, Exit, Layer, ManagedRuntime } from 'effect'

let _runtime: ManagedRuntime.ManagedRuntime<never, never> | undefined

/** Module layers contributed via `registerEffectLayer`, drained by `buildEffectRuntime`. */
const _layers: Layer.Layer<never, unknown, unknown>[] = []
let _built = false

/**
 * Set the global Effect runtime. The type parameter `R` is intentionally erased
 * on storage: callers (e.g. GraphQL resolvers) treat the runtime as opaque and
 * rely on the Layer composed at boot to provide the services their Effects need.
 */
export function setRuntime<R>(rt: ManagedRuntime.ManagedRuntime<R, never> | undefined): void {
  _runtime = rt as ManagedRuntime.ManagedRuntime<never, never> | undefined
}

export function useRuntime(): ManagedRuntime.ManagedRuntime<never, never> {
  if (!_runtime) {
    throw new Error('Effect runtime not initialized — did the @czo/kit plugin build it after czo:boot?')
  }
  return _runtime
}

/**
 * Register a module's Layer to be merged into the single app-wide runtime.
 * Call this from a module's `czo:boot` hook. The Layer's requirements (`R`) may
 * be non-`never` as long as they are satisfied by the infra Layer passed to
 * `buildEffectRuntime` (currently `DrizzleDbLive`). Throws if called after the
 * runtime has already been built.
 */
export function registerEffectLayer<E, R>(layer: Layer.Layer<never, E, R>): void {
  if (_built) {
    throw new Error('Cannot register an Effect layer — the runtime has already been built')
  }
  _layers.push(layer as Layer.Layer<never, unknown, unknown>)
}

/** Test helper: drop all registered layers and reset the built flag. */
export function clearEffectLayers(): void {
  _layers.length = 0
  _built = false
}

/**
 * Build the single app-wide `ManagedRuntime` from every layer registered via
 * `registerEffectLayer`, providing `infra` (shared infrastructure layers, e.g.
 * `DrizzleDbLive`) exactly once. Stores the runtime via `setRuntime` and returns
 * it. If no layers were registered, does nothing and returns `undefined`
 * (`useRuntime()` then throws its "not initialized" error). Idempotent guard:
 * marks the registry as built so late `registerEffectLayer` calls fail loudly.
 */
export function buildEffectRuntime<RIn>(
  infra: Layer.Layer<RIn, unknown, never>,
): ManagedRuntime.ManagedRuntime<never, never> | undefined {
  _built = true
  if (_layers.length === 0) {
    return undefined
  }
  const merged = (_layers.length === 1 ? _layers[0]! : Layer.mergeAll(_layers[0]!, ...(_layers.slice(1)) as [Layer.Layer<never, unknown, unknown>, ...Layer.Layer<never, unknown, unknown>[]]))
    .pipe(Layer.provide(infra as Layer.Layer<RIn, unknown, never>))
  const rt = ManagedRuntime.make(merged as Layer.Layer<never, never, never>)
  setRuntime(rt)
  return rt
}

/**
 * Run an Effect against a ManagedRuntime, rejecting the returned Promise with
 * the original typed failure (not a FiberFailure) so Pothos's `errors: { types }`
 * plugin can match via instanceof. Defects are wrapped in an Error preserving
 * the original cause, so consumers always receive an Error instance.
 *
 * The Effect's `R` (requirements) is allowed to be non-`never`: the runtime is
 * intentionally typed as opaque (`<never, never>`) and we trust the Layer
 * composed at boot to provide the services the Effect needs. Internal cast.
 */
export async function runEffect<A, E, R = never>(
  rt: ManagedRuntime.ManagedRuntime<never, never>,
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  const exit = await rt.runPromiseExit(effect as Effect.Effect<A, E>)
  if (Exit.isSuccess(exit))
    return exit.value
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'Some')
    throw failure.value as Error
  throw new Error(`Effect defect: ${Cause.pretty(exit.cause)}`, { cause: Cause.squash(exit.cause) })
}
```

> Note: the `Layer.mergeAll(first, ...rest)` shape avoids `Layer.mergeAll()`-with-zero-args (invalid) and keeps types honest. The casts are intentional and mirror the existing `setRuntime` erasure rationale.

- [ ] **Step 4: Export the new symbols from `index.ts`**

Replace `packages/kit/src/effect/index.ts` with:

```typescript
export { buildEffectRuntime, clearEffectLayers, registerEffectLayer, runEffect, setRuntime, useRuntime } from './runtime'
export { expectFailure, expectSuccess } from './test'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @czo/kit test -- runtime.test.ts`
Expected: PASS — all blocks (`runtime singleton`, `runEffect`, `effect layer registry`) green.

- [ ] **Step 6: Type-check the kit package**

Run: `pnpm --filter @czo/kit check-types`
Expected: no new errors in `src/effect/`.

- [ ] **Step 7: Commit**

```bash
git add packages/kit/src/effect/runtime.ts packages/kit/src/effect/index.ts packages/kit/src/effect/runtime.test.ts
git commit -m "feat(kit): app-wide Effect runtime built from a module layer registry"
```

---

### Task 2: Build the runtime from the kit plugin

**Files:**
- Modify: `packages/kit/src/plugins/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kit/src/plugins/index.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'

// Minimal fake NitroApp with a hooks emitter.
function makeFakeNitro() {
  const listeners = new Map<string, Array<(...a: any[]) => unknown>>()
  return {
    container: undefined as unknown,
    hooks: {
      hook(name: string, fn: (...a: any[]) => unknown) {
        const arr = listeners.get(name) ?? []
        arr.push(fn)
        listeners.set(name, arr)
      },
      async callHook(name: string, ...args: any[]) {
        for (const fn of listeners.get(name) ?? []) await fn(...args)
      },
    },
  }
}

describe('@czo/kit plugin', () => {
  it('builds the Effect runtime after czo:boot and disposes it on close', async () => {
    vi.resetModules()
    const { registerEffectLayer, clearEffectLayers, useRuntime } = await import('../effect')
    const { Layer, Context } = await import('effect')
    clearEffectLayers()

    const Tag = Context.GenericTag<'test/Plugin', { readonly v: number }>('test/Plugin')
    // a module registers its layer during czo:boot
    const nitro = makeFakeNitro()
    nitro.hooks.hook('czo:boot', () => registerEffectLayer(Layer.succeed(Tag, { v: 7 })))

    const plugin = (await import('./index')).default
    plugin(nitro as any)

    // let the kit's async hook chain (init → register → boot → build) settle
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    const rt = useRuntime()
    expect(rt).toBeDefined()

    // close hook must dispose without throwing
    await nitro.hooks.callHook('close')
    clearEffectLayers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @czo/kit test -- plugins/index.test.ts`
Expected: FAIL — `useRuntime()` throws "not initialized" because the plugin does not build the runtime yet.

- [ ] **Step 3: Wire `buildEffectRuntime` into the plugin**

Replace `packages/kit/src/plugins/index.ts` with:

```typescript
import { definePlugin } from 'nitro'
// import { useRuntimeConfig } from 'nitro/runtime-config'
import { DrizzleDbLive } from '../db/effect'
import { buildEffectRuntime } from '../effect'
import { useContainer } from '../ioc'
import { useLogger } from '../logger'

const logger = useLogger('kit:plugin')

export default definePlugin((nitroApp) => {
  const container = useContainer()
  // container.bindValue('config', useRuntimeConfig())
  Promise.resolve(nitroApp.hooks.callHook('czo:init'))
    .then(() => nitroApp.hooks.callHook('czo:register'))
    .then(() => nitroApp.hooks.callHook('czo:boot'))
    .then(() => {
      // Every module has registered its Effect layer by now (during czo:boot).
      // Build the single app-wide ManagedRuntime, providing shared infra once.
      const runtime = buildEffectRuntime(DrizzleDbLive)
      if (runtime) {
        nitroApp.hooks.hook('close', () => runtime.dispose())
        logger.debug('Effect runtime built from registered module layers')
      }
    })
    .catch((err: unknown) => logger.error('czo lifecycle failed', err))
  logger.debug('IoC container initialized')
  nitroApp.container = container
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @czo/kit test -- plugins/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full kit test suite + type-check**

Run: `pnpm --filter @czo/kit test && pnpm --filter @czo/kit check-types`
Expected: PASS / no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/kit/src/plugins/index.ts packages/kit/src/plugins/index.test.ts
git commit -m "feat(kit): build the Effect runtime in the kit plugin after czo:boot"
```

---

### Task 3: Auth module registers its layer instead of owning the runtime

**Files:**
- Modify: `packages/modules/auth/src/plugins/index.ts`

- [ ] **Step 1: Replace the runtime-construction block with a layer registration**

In `packages/modules/auth/src/plugins/index.ts`, change the imports:

Replace:
```typescript
import { DrizzleDbLive } from '@czo/kit/db/effect'
import { setRuntime } from '@czo/kit/effect'
```
with:
```typescript
import { registerEffectLayer } from '@czo/kit/effect'
```

Replace:
```typescript
import { Layer, ManagedRuntime } from 'effect'
```
with:
```typescript
import { Layer } from 'effect'
```

Then replace this block (currently around lines 184–209):

```typescript
    // Build the Effect ManagedRuntime once at boot. Composes the auth-module
    // Layers with the kit's DrizzleDbLive infra. `provideMerge` wires the
    // OrganizationService into ApiKeyService's deps AND keeps it visible at
    // the runtime surface so resolvers can yield* it. `mergeAll` adds the
    // sibling UserService, AuthService and AuthActorService. Exposed via
    // setRuntime() so resolvers (and the better-auth `actor-type` plugin /
    // session hooks) can call useRuntime() at request time. Disposed on Nitro
    // close.
    const BetterAuthLive = Layer.succeed(BetterAuth, auth)
    const UserServiceLive = makeUserServiceLive(roles)
    const OrganizationServiceLive = makeOrganizationServiceLive(roles)
    // Actor-type registry is seeded from DEFAULT_ACTOR_RESTRICTIONS at layer
    // construction and frozen immediately — there is no post-boot hook for other
    // modules to extend it, so freezing eagerly keeps the invariant honest.
    const AuthActorServiceLive = makeAuthActorServiceLive(DEFAULT_ACTOR_RESTRICTIONS, true)
    const AuthModuleLive = Layer.mergeAll(
      ApiKeyServiceLive.pipe(Layer.provideMerge(OrganizationServiceLive)),
      UserServiceLive,
      AuthServiceLive,
      AuthActorServiceLive,
    ).pipe(
      Layer.provide(BetterAuthLive),
      Layer.provide(DrizzleDbLive),
    )
    const runtime = ManagedRuntime.make(AuthModuleLive)
    setRuntime(runtime)
    nitroApp.hooks.hook('close', () => runtime.dispose())
    logger.info('Effect runtime built (ApiKeyService, OrganizationService, UserService, AuthService, AuthActorService, BetterAuth)')
```

with:

```typescript
    // Compose the auth-module Layers and hand them to the kit, which builds the
    // single app-wide ManagedRuntime after czo:boot (providing shared infra such
    // as DrizzleDbLive once). `provideMerge` wires OrganizationService into
    // ApiKeyService's deps AND keeps it visible at the runtime surface so
    // resolvers can yield* it. `mergeAll` adds the sibling UserService,
    // AuthService and AuthActorService. `BetterAuth` is auth-specific, so it is
    // provided here; `DrizzleDb` is shared infra and is left in the layer's
    // requirements for the kit to satisfy.
    const BetterAuthLive = Layer.succeed(BetterAuth, auth)
    const UserServiceLive = makeUserServiceLive(roles)
    const OrganizationServiceLive = makeOrganizationServiceLive(roles)
    // Actor-type registry is seeded from DEFAULT_ACTOR_RESTRICTIONS at layer
    // construction and frozen immediately — there is no post-boot hook for other
    // modules to extend it, so freezing eagerly keeps the invariant honest.
    const AuthActorServiceLive = makeAuthActorServiceLive(DEFAULT_ACTOR_RESTRICTIONS, true)
    const AuthModuleLive = Layer.mergeAll(
      ApiKeyServiceLive.pipe(Layer.provideMerge(OrganizationServiceLive)),
      UserServiceLive,
      AuthServiceLive,
      AuthActorServiceLive,
    ).pipe(Layer.provide(BetterAuthLive))
    registerEffectLayer(AuthModuleLive)
    logger.info('Auth Effect layer registered (ApiKeyService, OrganizationService, UserService, AuthService, AuthActorService, BetterAuth)')
```

- [ ] **Step 2: Type-check the auth package**

Run: `pnpm --filter @czo/auth check-types`
Expected: no *new* errors. (Pre-existing baseline errors in `src/graphql/schema/two-factor/*` are unrelated and expected.) In particular `src/plugins/index.ts` must be error-free, and `registerEffectLayer(AuthModuleLive)` must type-check — `AuthModuleLive`'s requirements should be exactly `DrizzleDb` (or a subset), which `registerEffectLayer`'s `R` parameter accepts.

- [ ] **Step 3: Run the auth test suite**

Run: `pnpm --filter @czo/auth test`
Expected: PASS — same pass count as before this plan (in particular `src/layers/actor.test.ts` 18/18, `src/layers/auth.test.ts`, `src/layers/api-key.test.ts`, etc.). No test imports `setRuntime`/`ManagedRuntime` from the auth plugin, so nothing breaks.

- [ ] **Step 4: Sanity-check there are no dangling references**

Run: `grep -rn "ManagedRuntime\|setRuntime\|DrizzleDbLive" packages/modules/auth/src`
Expected: no matches (the auth module no longer references any of these).

- [ ] **Step 5: Commit**

```bash
git add packages/modules/auth/src/plugins/index.ts
git commit -m "refactor(auth): register Effect layer with the kit instead of owning the runtime"
```

---

### Task 4: Update project docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Effect-TS section**

In `CLAUDE.md`, under `### Effect-TS pattern (pilot: \`auth/apiKey\`)`, replace the bullet:

```markdown
- **Runtime** is built once at boot in the auth Nitro plugin (`czo:boot`),
  exposed via `useRuntime()` from `@czo/kit/effect`, attached to the GraphQL
  context as `ctx.auth.runtime`.
```

with:

```markdown
- **Runtime** is a single app-wide `ManagedRuntime`. Each module composes its
  own `Layer` (providing module-specific deps such as `BetterAuth`, leaving
  shared infra like `DrizzleDb` in the requirements) and calls
  `registerEffectLayer(myLayer)` from its `czo:boot` hook. The `@czo/kit` plugin
  builds the runtime from all registered layers right after `czo:boot`
  (providing `DrizzleDbLive` once), stores it via `setRuntime`, and disposes it
  on Nitro `close`. Resolvers reach it via `useRuntime()` from `@czo/kit/effect`,
  attached to the GraphQL context as `ctx.auth.runtime`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the centralized Effect runtime lifecycle"
```

---

## Self-Review Notes

- **Spec coverage:** registry (`registerEffectLayer`/`clearEffectLayers`) → Task 1; centralized build with infra-provide-once → Task 1 (`buildEffectRuntime`) + Task 2 (kit plugin wiring); auth stops owning the runtime → Task 3; docs → Task 4. The "what if no module registered a layer" edge → Task 1 Step 1 first test + `buildEffectRuntime` early-return.
- **Naming consistency:** `registerEffectLayer`, `clearEffectLayers`, `buildEffectRuntime`, `useRuntime`, `setRuntime` used identically across all tasks and the `index.ts` re-export.
- **Out of scope (follow-ups, not in this plan):** an eslint `no-restricted-imports` rule to stop modules importing nominal types via the `@czo/*` barrel (causes dist-vs-src `instanceof` mismatches); a `czo:effect:ready` hook if a future module needs `runEffect` *during* boot; deduplicating `DrizzleDbLive` is already handled (provided once by the kit), but if other shared infra layers appear they should be added to the `infra` argument in `packages/kit/src/plugins/index.ts`, not re-provided per module.
