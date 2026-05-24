# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

c-zo is a modular e-commerce platform built with:

- **Nitro** as the backend server framework (`apps/mazo`)
- **Next.js** (React 19) for the frontend (`apps/paiya`)
- **GraphQL** via `graphql-yoga` + **Pothos** schema builder
- **Drizzle ORM** (1.0 RQBv2 with `@effect/sql-pg` / `effect-postgres` for Effect-native runtime)
- **Effect-TS** for DI, error modeling, and runtime in the Effect-native modules
- **pnpm workspaces** with **Turborepo**

The git base branch is `main`. Active feature branch is typically prefixed `feat/`.

## Commands

```bash
# Development
pnpm dev                    # All apps in watch mode
pnpm dev:mazo               # Backend API only
pnpm build                  # Build all packages
pnpm lint                   # Lint all
pnpm lint:fix               # Lint --fix
pnpm test                   # Vitest across packages
pnpm check-types            # Type-check all packages
pnpm typecheck              # Alias for check-types

# Per-module (e.g. packages/modules/auth)
pnpm migrate:latest         # Apply pending migrations
pnpm migrate:create <name>  # Scaffold a migration
pnpm migrate:status         # Show migration status
pnpm generate:types         # Generate Drizzle types from DB
pnpm generate               # Generate GraphQL resolver types
pnpm test                   # Module tests
pnpm test:watch             # Watch mode
```

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports / variables / functions that **your** changes made unused. Don't remove pre-existing dead code unless asked.

For destructive refactors that move large amounts of code, mirror originals into `old/<path>` first, work against the new layout, and `rm -rf old/` at the end of the sprint.

## Goal-Driven Execution

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

State a brief plan for multi-step tasks:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## Workflow

1. Inspect nearby implementation and tests before editing.
2. Prefer existing abstractions and conventions over introducing new ones.
3. For ad-hoc runnable code, use a temp file under `scratchpad/`, run it with `node`, and delete it when done. Local runtime is Node 24 and runs `.ts` directly.
4. Run the validation appropriate to the change type (see below).
5. Report which validation commands were run and any that could not be run.

## Validation

Use the narrowest validation that still covers the change:

| Change type        | Validation |
|--------------------|------------|
| Code changes       | `pnpm lint:fix`, targeted `pnpm test <file>`, `pnpm check-types` |
| Tests-only changes | `pnpm lint:fix`, targeted `pnpm test <file>` |
| Type-level changes | `pnpm check-types` (full type-check) |
| Schema changes     | `pnpm generate:types` (Drizzle) + `pnpm generate` (GraphQL) where touched; migration via `pnpm migrate:create` |
| Docs-only          | `pnpm lint:fix`; no tests unless examples or code changed |

## Architecture

### Monorepo

```
apps/
  mazo/               # Nitro backend API server
  paiya/              # Next.js frontend
packages/
  kit/                # Core toolkit (@czo/kit)
  modules/
    auth/             # @czo/auth — Effect-native
    stock-location/   # Effect-native
  ui/                 # Shared React components (@workspace/ui)
  eslint-config/      # Shared ESLint configs
  typescript-config/  # Shared TS configs
```

### Module System

Modules are defined with `defineModule` from `@czo/kit/module`, which takes a composed Effect `Layer` directly:

```ts
import { defineModule } from '@czo/kit/module'
import { Layer } from 'effect'

const ModuleLive = Layer.mergeAll(
  ServiceALive,
  ServiceBLive,
).pipe(Layer.provideMerge(SharedDepsLive))

export default (config: ModuleConfig) => defineModule({
  name: 'module-name',
  version: '0.1.0',
  layer: ModuleLive,
})
```

The older `defineNitroModule` plugin/hook style is being phased out — do not introduce new usages. Modules are registered in `apps/mazo/nitro.config.ts`.

### Effect-TS pattern (standard in `@czo/auth`, `@czo/stock-location`)

The Effect-native modules use a consistent layout, refined across sprints SP1→SP3:

- **Service + impl colocated** in `packages/modules/<module>/src/services/<name>.ts`. Each file contains: the `Context.Service` Tag, tagged errors (which double as Pothos GraphQL errors via `registerError`), input/output types, the `make` `Effect.gen` factory, and the exported `Layer.effect(Tag, make)`. (Before SP-A these were split into `services/` + `layers/` — that split has been collapsed; do not reintroduce it.)
- **Runtime database** is `@effect/sql-pg` via `effect-postgres` (SP-B). Drizzle RQBv2 query API uses the **object form** (`db.query.table.findFirst({ where: { id } })`), not the callback form.
- **App-wide ManagedRuntime** built from the merged module layers at boot. Resolvers access it via `ctx.runEffect(Effect.gen(function*() { ... }))` provided by the auth GraphQL context. Tagged errors are rejected as the original `Error` instance so Pothos's `errors: { types: [...] }` plugin routes them via `instanceof`.
- **AuthScopes** (`graphql/scopes.ts`) — Pothos `@pothos/plugin-scope-auth` declarative gates: `{ auth: true }`, `{ permission: { resource, actions, organization? } }`, and per-domain scopes (e.g. `apiKeyOwner`). The `BuilderAuthScopes` augmentation in `graphql/index.ts` registers them.
- **No more `@czo/kit/effect` module.** It was removed during in-flight migration; helpers like `expectSuccess` / `expectFailure` / `useRuntime` / `registerEffectLayer` no longer exist. Tests use `@effect/vitest` directly (see Testing below).

Other modules still use the legacy `useContainer()` IoC + `BaseGraphQLError` pattern. Migration to Effect lands module-by-module.

### Database

- **Drizzle ORM** for type-safe SQL queries. Effect-native modules use `@effect/sql-pg` + `effect-postgres` for the runtime client.
- Migrations live in `packages/modules/*/migrations/`.
- Connection via `DATABASE_URL`. Schema in `src/database/schema.ts` per module.

### GraphQL

- Schema built with **Pothos** (`@pothos/core`, `@pothos/plugin-relay`, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`, `@pothos/plugin-drizzle`).
- Schema-first `.graphql` files in `src/graphql/schema/*/` are codegen'd by `@eddeee888/gcg-typescript-resolver-files`.
- Run `pnpm generate` from the module directory after editing `.graphql` files.
- Context exposes services per the Effect runtime; resolvers use `ctx.runEffect(...)`.

## Coding Patterns (Effect-native modules)

- **No `async` / `await` or `try` / `catch`** in service code; use `Effect.gen`, `Effect.fn` / `Effect.fnUntraced`, `Effect.sync`, `Effect.tryPromise`.
- **Pick the right wrapper for the body shape**:
  - `Effect.sync(() => A)` / `Effect.try({ try, catch })` / `Effect.tryPromise({ try, catch })` — for **pure expressions** or single sync/async calls. No generator, no yields. Use these for one-liners like `Effect.sync(() => authorizePermissions(...).success)` or `Effect.tryPromise({ try: () => db.query.x.findFirst(...) })`.
  - `Effect.fnUntraced(function*(args) { yield* … })` — for **generators that compose other Effects** via `yield*`. Replaces the verbose `(args) => Effect.gen(function*() { ... })`. Same shape, no boilerplate, no span overhead. Use this whenever you'd otherwise write `(...) => Effect.gen(...)`.
  - `Effect.fn(name)(function*(args) { yield* … })` — same as `fnUntraced` but emits a **named OTel span**. Use for event subscribers, top-level service methods you want to trace, and any handler whose latency you care about.
  - The `fnUntraced` / `fn` rule does NOT replace `Effect.sync` — they're different tools for different shapes (generator vs. thunk).
- **Class syntax for `Context.Service`** with a stable Tag id namespaced under `'@czo/<module>/<Service>'`.
- **Tagged errors** via `Data.TaggedError`. Register them as GraphQL errors via `registerError(builder, ErrorCls, { name: 'ErrorClsError' })` and declare them on mutation `errors.types`.
- **Pure helpers stay pure.** Don't wrap utility functions in `Effect.sync` unless they need to be composed in a generator.
- **No `as any` if inference is correct.** A targeted cast (`as RolePermissions<S>`) beats `as unknown as Foo`.

## Conventions

- **TypeScript strict mode** throughout.
- **Immutability**: create new objects, never mutate (spread, not assignment).
- **File size**: prefer many small files (200–400 lines, 800 max). Organize by feature, not by type.
- **No `console.log`** in committed code (hooks warn). Use `Effect.log*` for Effect code, structured loggers elsewhere.
- **Input validation**: Zod at API boundaries. Inside services, trust internal callers — validate at the edge.
- **No-commit-until-review**: stage with `git add` during execution, never commit autonomously. One commit at the end of a sprint after explicit user review. Never `git stash`.
- **Testcontainers Postgres for tests.** Each `it.layer(AuthPostgresLayer)` scope spins up its own `PostgreSqlContainer('postgres:17')`, applies migrations, and tears down on scope close. No `TEST_DATABASE_URL` env var, no `docker compose` for tests — the container is managed by the layer.

## Testing

- Tests live alongside source: `packages/modules/*/src/**/*.test.ts` (unit) and `*.integration.test.ts` (Postgres-backed).
- Effect tests use **`@effect/vitest`** (`describe`, `it.effect`, `it.layer`). Pure tests use plain `it` from `vitest`.
- Integration tests use the shared `AuthPostgresLayer` + `truncateAuth` helpers from `packages/modules/auth/src/testing/postgres.ts` (or the equivalent per module). `AuthPostgresLayer` is a scoped Effect Layer that wraps a `PostgreSqlContainer` (via `@testcontainers/postgresql`) and applies migrations on acquire. Database state is reset per test via `truncateAuth`.
- **Do not** use `Effect.runSync` in tests.
- **Do not** import from `@czo/kit/effect` — the module no longer exists. Assert Effect failures with `Effect.flip` then check `err._tag`.

## Environment Variables

Create `.env` in the repository root or `packages/.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/czo_dev
NODE_ENV=development
```

Tests do not read `DATABASE_URL` — they use Testcontainers (see Testing).

## Docker Development

```bash
docker compose -f docker-compose.dev.yml up
```

Provides PostgreSQL 17 on port 5432 for **dev**. Tests spin up their own ephemeral container per layer scope via Testcontainers — no docker compose needed for tests.

## Rule: always use qmd before reading files

Before reading files or exploring directories, prefer `qmd` to search across local projects.

Available tools:

- `qmd search "query"` — fast keyword search (BM25)
- `qmd query "query"` — hybrid search with reranking (best quality)
- `qmd vsearch "query"` — semantic vector search
- `qmd get <file>` — retrieve a specific document

Use `qmd search` for quick lookups and `qmd query` for complex questions. Fall back to `Read` / `Glob` / `Grep` when `qmd` doesn't return enough results or when the target file path is already known.
