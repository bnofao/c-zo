# Brainstorm: Should @czo/kit Be Split Into Separate Packages?

**Date:** 2026-02-09
**Participants:** Claude (Briana)
**Status:** Decided — Option B (Sub-exports conservés)

---

## Problem Statement

### The Question

`@czo/kit` currently bundles six distinct concerns under one package using sub-path exports:

| Sub-export | Purpose | External deps |
|---|---|---|
| `@czo/kit` (root) | Module system, IoC, logger, resolver | hookable, @adonisjs/fold, consola, pathe |
| `@czo/kit/db` | Repository, useDatabase, Drizzle ORM | drizzle-orm, pg, change-case |
| `@czo/kit/cache` | Re-export of Nitro storage | nitro (peer) |
| `@czo/kit/events` | EventEmitter (hookable-based) | hookable |
| `@czo/kit/queue` | BullMQ queue/worker wrappers | bullmq (peer), ioredis (peer) |
| `@czo/kit/graphql` | Schema & resolver registry | graphql |
| `@czo/kit/config` | Unified config (databaseUrl, redisUrl, queue) | nitro (peer) |

Should `db`, `events`, `queue`, and `cache` be extracted into standalone packages (`@czo/db`, `@czo/events`, `@czo/queue`, `@czo/cache`), or should they remain as sub-exports of `@czo/kit`?

### Why This Question Matters Now

- Sprint 02 just implemented events and queue, the newest sub-modules
- The module system is stabilizing; now is the cheapest time to restructure
- More consumer modules (auth, attribute) are about to start importing from kit
- A wrong decision now compounds into migration pain later

### What Happens If We Do Nothing

The sub-export approach continues working. There is no immediate breakage. But:
- Consumer modules that only need events still pull in drizzle-orm, pg, bullmq, hookable, etc. as transitive dependencies
- The `package.json` dependency list grows with every new concern
- Optional peer dependencies proliferate (bullmq, ioredis are already optional peers)
- Testing becomes heavier -- mocking one concern requires awareness of others

---

## Current Dependency Graph

This is the actual import analysis of the codebase, not theoretical.

### Internal cross-imports (which sub-module imports from which)

```
config.ts
  <- imports: nitro/runtime-config, node:process
  <- imported by: db/manager.ts, queue/use-queue.ts, queue/use-worker.ts

db/manager.ts
  <- imports: drizzle-orm, config.ts
  <- imported by: db/index.ts

db/repository.ts
  <- imports: drizzle-orm, pg, change-case, db/manager.ts (type only)
  <- imported by: db/index.ts

events/emitter.ts
  <- imports: hookable
  <- imported by: events/index.ts
  (NO import from config, db, queue, or cache)

queue/use-queue.ts
  <- imports: bullmq, ioredis, config.ts
  <- imported by: queue/index.ts

queue/use-worker.ts
  <- imports: bullmq, ioredis, config.ts
  <- imported by: queue/index.ts

cache/index.ts
  <- imports: nitro/storage (re-export only)
  (NO import from config, db, queue, or events)

graphql/resolvers.ts
  <- imports: nothing external
  (NO import from config, db, queue, events, or cache)

graphql/types.ts
  <- imports: graphql (type only)
  (NO import from config, db, queue, events, or cache)
```

### Visualized dependency edges

```
                    +--------+
                    | config |
                    +--------+
                   /     |     \
                  v      v      v
            +----+  +-------+  +--------+
            | db |  | queue |  | (core) |
            +----+  +-------+  +--------+
                                   |
              +--------+     +---------+
              | events |     | graphql |
              +--------+     +---------+

              +-------+
              | cache |  (standalone re-export, no deps)
              +-------+
```

### Key finding: config is the only shared dependency

- `db` depends on `config` (for `databaseUrl`)
- `queue` depends on `config` (for `redisUrl`)
- `events` depends on NOTHING from kit (self-contained with hookable)
- `cache` depends on NOTHING from kit (re-export of nitro/storage)
- `graphql` depends on NOTHING from kit (self-contained registries)

### Consumer module import patterns (actual codebase)

The only active consumer is `@czo/product`:

```typescript
// packages/modules/product/src/index.ts
import { addPlugin, createResolver, defineNitroModule } from '@czo/kit'         // core

// packages/modules/product/src/plugins/index.ts
import { registerResolvers, registerTypeDefs } from '@czo/kit/graphql'          // graphql
```

Product currently uses: **core + graphql** only. It does not import db, events, queue, or cache directly (those are auto-imported by the kit module or planned for future use).

### Planned usage (from brainstorm.md and TRD)

```typescript
// Future module pattern (from planning docs)
import { defineNitroModule, useContainer } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { BaseRepository, type Repository } from '@czo/kit/db/repository'
import { useCacheManager } from '@czo/kit/cache'
import { useEvents } from '@czo/kit/events'
```

A typical module will import from **core + db + graphql** at minimum, and optionally events/queue/cache.

---

## Options Evaluated

### Option A: Full Split (4 new packages)

Create `@czo/db`, `@czo/events`, `@czo/queue`, `@czo/cache` as separate workspace packages alongside `@czo/kit`.

**Structure:**
```
packages/
  kit/          # Core only: module system, IoC, logger, resolver, config, graphql
  db/           # @czo/db: Repository, useDatabase, Drizzle integration
  events/       # @czo/events: EventEmitter
  queue/        # @czo/queue: BullMQ wrappers
  cache/        # @czo/cache: Cache manager
```

**Pros:**
- Clean separation of concerns at the package level
- Consumers only install what they need
- Each package has its own dependency list (no optional peer sprawl)
- Independent versioning and changelogs
- Tree-shaking is guaranteed at the package boundary
- Events package (39+81 = 120 LoC) and cache (2 LoC) are tiny and self-contained

**Cons:**
- 5 packages to maintain instead of 1
- 5 separate `package.json`, `build.config.ts`, `tsconfig.json`, eslint config
- The `config` module is shared by db and queue -- must be duplicated or becomes its own package (6th package)
- Cross-package type augmentation (e.g., `declare module '@czo/kit/events'`) needs to change to `declare module '@czo/events'`
- Every consumer module's `package.json` now lists 3-5 `@czo/*` dependencies instead of 1
- Monorepo-internal dependency graph becomes more complex
- Version coordination across packages (semver hell in a young project)
- Breaking change for existing product module imports

### Option B: Keep Current Sub-exports (Status Quo)

Everything stays in `@czo/kit` with sub-path exports.

**Structure (current):**
```
packages/
  kit/
    src/
      db/
      events/
      queue/
      cache/
      graphql/
      config.ts
      index.ts
```

**Pros:**
- Single dependency for consumers: `@czo/kit`
- Single build, single test suite, single CI job
- Shared config naturally accessible via `../config`
- Declaration merging works cleanly (`declare module '@czo/kit/events'`)
- Sub-path exports already provide tree-shaking at the import level
- Matches Nuxt's pattern: `@nuxt/kit` is one package with many utilities
- Low maintenance overhead for a small team
- No breaking changes needed

**Cons:**
- `package.json` dependency list includes drizzle-orm, pg, hookable, etc. even if consumer only needs events
- Optional peer dependencies for bullmq/ioredis add noise
- One concern's breaking change forces a new version of the whole package
- Test suite runs all tests even when only one sub-module changed

### Option C: Hybrid -- Extract Only Queue (heaviest external dep)

Only extract `@czo/queue` since it has the heaviest external dependencies (bullmq + ioredis) and they are already marked as optional peers. Everything else stays in `@czo/kit`.

**Structure:**
```
packages/
  kit/          # Core + db + events + cache + graphql + config
  queue/        # @czo/queue: BullMQ wrappers (depends on @czo/kit/config)
```

**Pros:**
- Removes the heaviest optional dependencies from kit
- Queue is genuinely optional (not every module needs background jobs)
- Minimal disruption -- only queue imports change
- Config remains shared naturally for db (the most common cross-dep)
- Events and cache are too small to justify their own packages

**Cons:**
- Half-measure: doesn't solve the concern for events independence
- Queue still needs config, so it depends on `@czo/kit` anyway
- Creates precedent but doesn't establish a clean rule

### Option D: Hybrid -- Internal Packages with Shared Config

Use pnpm workspace internal packages but keep them under `packages/kit/` as a mini-monorepo within the monorepo.

**Structure:**
```
packages/
  kit/
    core/       # @czo/kit: module system, IoC, logger, resolver, config
    db/         # @czo/kit-db: Repository, useDatabase
    events/     # @czo/kit-events: EventEmitter
    queue/      # @czo/kit-queue: BullMQ wrappers
    cache/      # @czo/kit-cache: Cache manager
```

**Pros:**
- Physical separation with logical grouping
- Shared build tooling possible
- Independent dependency lists

**Cons:**
- pnpm workspaces within workspaces is awkward
- Unusual pattern, unfamiliar to contributors
- Build complexity increases significantly
- All the downsides of full split plus the confusion of nested workspaces

---

## Evaluation Matrix

| Criterion | A: Full Split | B: Status Quo | C: Extract Queue | D: Nested |
|---|---|---|---|---|
| **Dependency hygiene** | Excellent | Poor | Good | Excellent |
| **Maintenance burden** | High (5 pkgs) | Low (1 pkg) | Low (2 pkgs) | High (5 pkgs) |
| **Consumer DX** | Mixed (many deps) | Good (1 dep) | Good (1-2 deps) | Mixed (many deps) |
| **Build complexity** | Medium | Low | Low | High |
| **Breaking change cost** | High (now) | None | Low | High |
| **Future-proofing** | Excellent | Adequate | Good | Excellent |
| **Matches ecosystem norms** | NestJS-like | Nuxt-like | Pragmatic | Unusual |
| **Config sharing** | Awkward | Natural | Natural | Awkward |
| **Team size fit (small)** | Poor | Excellent | Excellent | Poor |
| **Versioning complexity** | High | None | Low | High |

### Scoring (1-5, higher is better)

| Criterion | Weight | A | B | C | D |
|---|---|---|---|---|---|
| Maintenance burden | 5 | 1 | 5 | 4 | 1 |
| Consumer DX | 4 | 3 | 5 | 4 | 2 |
| Dependency hygiene | 3 | 5 | 2 | 4 | 5 |
| Build complexity | 3 | 3 | 5 | 5 | 1 |
| Breaking change cost | 3 | 1 | 5 | 4 | 1 |
| Future-proofing | 2 | 5 | 3 | 4 | 5 |
| **Weighted Total** | | **50** | **85** | **82** | **41** |

---

## Risks and Assumptions

### Assumptions Being Made

- [ ] **Assumption: Sub-path exports provide adequate tree-shaking.** Bundlers (unbuild/rollup) using `@czo/kit/events` will not pull in drizzle-orm code. This needs verification with the actual build output.
- [ ] **Assumption: Optional peer deps are sufficient for BullMQ/ioredis.** Consumers that do not use queue will not get runtime errors about missing bullmq. This is true given the lazy `import()` pattern, but worth validating.
- [ ] **Assumption: The project will remain small-team (1-3 developers) for the foreseeable future.** Larger teams benefit more from package isolation.
- [ ] **Assumption: Config will not diverge.** If db and queue ever need fundamentally different config shapes, the shared config becomes a liability.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sub-exports break in edge-case bundlers | Low | Medium | Test with Nitro's actual build, verify in CI |
| Optional peer deps confuse new contributors | Medium | Low | Document clearly in kit README |
| Kit grows to 20+ sub-modules, becomes unwieldy | Low | High | Split at that point (sub-exports make this easy) |
| Premature split creates maintenance drag | Medium | High | This is the primary argument for status quo |
| Config changes break both db and queue | Low | Medium | Config interface is small and stable |

---

## Ecosystem Precedent

### Nuxt / @nuxt/kit -- Single package, sub-path exports

Nuxt's kit is one package (`@nuxt/kit`) that provides module utilities, auto-imports, templates, pages, components, layouts, plugins, and more. Module authors depend on `@nuxt/kit` alone. The pattern is identical to what `@czo/kit` does today.

Nuxt's ecosystem split is at a higher level: `@nuxt/kit` vs `@nuxt/schema` vs `@nuxt/bridge`. These are genuinely different concerns (kit = utilities, schema = types, bridge = compatibility layer). The utilities themselves (pages, components, imports) are all within `@nuxt/kit`.

### Medusa v2 -- Sub-path exports within @medusajs/medusa

Medusa uses sub-path exports for infrastructure concerns:
- `@medusajs/medusa/caching`
- `@medusajs/medusa/event-bus-redis`
- `@medusajs/medusa/workflow-engine-redis`

These are registered as modules in `medusa-config.ts` but shipped within the same `@medusajs/medusa` package. The *providers* (Redis adapter for caching, Redis adapter for events) are separate packages, but the *module interfaces* are in core.

### NestJS -- Fully split packages

NestJS takes the opposite approach: `@nestjs/core`, `@nestjs/common`, `@nestjs/bull`, `@nestjs/cache-manager`, `@nestjs/event-emitter` are all separate packages. This works because NestJS has a large team, a mature ecosystem, and each package is substantial enough to justify independent maintenance.

### Verdict on ecosystem norms

For a small team with a young codebase, the Nuxt/Medusa pattern (unified package, sub-path exports) is the dominant approach. NestJS-style splitting is for mature projects with dedicated maintainers per package.

---

## Recommendation

**Option B: Keep current sub-exports (status quo), with two guardrails.**

### Why

1. **The dependency graph is shallow.** The only internal cross-dependency is `config` being used by `db` and `queue`. Events, cache, and graphql are completely independent. This means the sub-exports are already well-isolated internally -- the package boundary would not buy meaningful decoupling beyond what already exists.

2. **The sub-modules are small.** Events is 120 lines. Cache is 2 lines. Queue is 145 lines. GraphQL is 35 lines. These do not justify the overhead of separate packages (package.json, build config, CI, versioning, changelogs).

3. **Consumer DX matters most right now.** Modules under active development should depend on `@czo/kit` and nothing else. Adding 3-5 `@czo/*` dependencies to every module's package.json is friction that slows development.

4. **The split can be done later at low cost.** Because the sub-exports are already cleanly separated internally (no circular dependencies, clean boundaries), extracting any one of them into its own package is a mechanical refactor. The internal architecture already supports splitting -- the question is whether the package boundary should match the source directory boundary, and right now the answer is no.

5. **Config sharing would be awkward in a split.** Both `db` and `queue` import from `../config`. In a split, they would need to either depend on `@czo/kit` (circular-ish) or a new `@czo/config` package (6th package for 48 lines of code).

### Guardrails to add now

1. **Enforce sub-module isolation.** Add an eslint rule or build-time check that prevents sub-modules from importing across boundaries (e.g., `events/` must never import from `db/`). The only allowed shared import is `config.ts`. This preserves the ability to split later.

2. **Keep optional peers clearly documented.** The `package.json` should clearly communicate that `bullmq` and `ioredis` are only needed if you use `@czo/kit/queue`. Add a `peerDependenciesMeta` section (already present) and a README note.

### When to revisit this decision

Trigger a re-evaluation if any of these occur:
- The kit package exceeds 5000 lines of source code (currently ~1400 excl. tests)
- More than 2 sub-modules develop cross-dependencies
- External contributors need to work on one sub-module in isolation
- A sub-module needs its own release cadence (e.g., queue breaking change that should not force a kit version bump)

---

## Open Questions

- [ ] Does Nitro's bundler properly tree-shake unused sub-path exports at build time? (Verify with production build)
- [ ] Should `@czo/kit/config` be an explicit public API, or remain internal to kit?
- [ ] As the events system grows (adding persistent events via queue), will events and queue merge into one concern?
- [ ] Should graphql stay in kit, or move to a `@czo/graphql` package since it is conceptually different from infrastructure?

---

## Next Steps

- [ ] Verify tree-shaking with a production Nitro build to confirm sub-path exports do not bundle unused code
- [ ] Add eslint boundary rule to enforce sub-module isolation within kit
- [ ] Document the decision in an ADR (Architecture Decision Record) for future reference
- [ ] Continue with Sprint 02 work using the current structure
