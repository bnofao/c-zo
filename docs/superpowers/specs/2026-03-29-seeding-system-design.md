# Seeding System Design

## Overview

A module-level seeding system in `@czo/kit` that lets each module register seeders via `registerSeeder`. A single `runSeeder` function orchestrates execution by fusing all registered seeders into one `drizzle-seed` call, respecting dependency order.

## API

### `registerSeeder(name, config)`

Registers a seeder in the global registry. Called by modules in their plugin's `czo:init` hook.

```typescript
interface SeederConfig {
  dependsOn?: string[]
  refine: (f: RefineFuncs) => Record<string, unknown>
}

function registerSeeder(name: string, config: SeederConfig): void
```

- `name` must match the table name in the Drizzle schema (used as key in the `.refine()` object).
- `dependsOn` lists seeder names that must run before this one. Required when Drizzle relations (RQBv2) define relationships not backed by DB foreign keys.
- `refine` receives the drizzle-seed refinement functions and returns the column/count config for this table. The `RefineFuncs` type is re-exported from `drizzle-seed`.
- Throws if a seeder with the same name is already registered.

### `runSeeder(opts?)`

Executes all (or a subset of) registered seeders in a single `seed()` call.

```typescript
interface RunSeederOptions {
  reset?: boolean   // default false — calls reset(db, schema) before seeding
  only?: string[]   // if set, runs only these seeders + their transitive dependencies
}

async function runSeeder(opts?: RunSeederOptions): Promise<void>
```

## Internal Implementation

### Registry

A module-level `Map<string, SeederConfig>` in `packages/kit/src/db/seeder.ts`. Same singleton pattern as `schema-registry.ts` and `relation-registry.ts`.

### Dependency Resolution

When `only` is provided, `runSeeder` resolves transitive dependencies recursively. For example, `only: ['apps']` with `apps.dependsOn: ['users', 'organizations']` executes all three.

### Topological Sort

Kahn's algorithm (BFS-based) sorts seeders by `dependsOn` into a valid execution order. Throws on circular dependencies.

### Fusion and Execution

```typescript
async function runSeeder(opts?: RunSeederOptions): Promise<void> {
  const db = await useDatabase()
  const schema = registeredSchemas()

  if (opts?.reset) {
    await reset(db, schema)
  }

  const sorted = topologicalSort(seeders, opts?.only)

  await seed(db, schema).refine((f) => {
    const merged: Record<string, unknown> = {}
    for (const name of sorted) {
      const config = seeders.get(name)!
      Object.assign(merged, { [name]: config.refine(f) })
    }
    return merged
  })
}
```

Each seeder's `refine` callback returns the config for its table. The name is used as the key in the merged object passed to `drizzle-seed`'s `.refine()`.

## Module Integration

### Registering Seeders (auth module example)

In `packages/modules/auth/src/plugins/index.ts`, inside the `czo:init` hook alongside `registerSchema`:

```typescript
registerSeeder('users', {
  refine: (f) => ({
    count: 5,
    columns: {
      name: f.fullName(),
      email: f.email(),
      role: f.valuesFromArray({ values: ['admin', 'user'] }),
    },
  }),
})

registerSeeder('organizations', {
  refine: (f) => ({
    count: 3,
    columns: {
      name: f.companyName(),
      slug: f.string({ isUnique: true }),
    },
  }),
})

registerSeeder('apps', {
  dependsOn: ['users', 'organizations'],
  refine: (f) => ({
    count: 10,
    columns: {
      appId: f.string({ isUnique: true }),
      status: f.valuesFromArray({ values: ['active', 'disabled'] }),
    },
  }),
})
```

### Running Seeders (app level)

From anywhere with access to the kit (script, Nitro task, route, test):

```typescript
import { runSeeder } from '@czo/kit/db'

await runSeeder()                          // all seeders
await runSeeder({ reset: true })           // reset + all seeders
await runSeeder({ only: ['apps'] })        // apps + its dependencies
```

## Dependencies

### New package

`drizzle-seed` added to `pnpm-workspace.yaml` under `catalog:common` and to `packages/kit/package.json` dependencies.

### Exports

`registerSeeder` and `runSeeder` exported from `@czo/kit/db` (no new sub-path export).

## Files

| File | Action |
|------|--------|
| `packages/kit/src/db/seeder.ts` | Create — registry, topological sort, runSeeder |
| `packages/kit/src/db/seeder.test.ts` | Create — unit tests |
| `packages/kit/src/db/index.ts` | Modify — add exports |
| `packages/kit/package.json` | Modify — add `drizzle-seed` dependency |
| `pnpm-workspace.yaml` | Modify — add `drizzle-seed` to `catalog:common` |
| `packages/modules/auth/src/plugins/index.ts` | Modify — add `registerSeeder` calls in `czo:init` |
| `packages/modules/auth/src/database/seeders/apps.ts` | Delete — replaced by registerSeeder |
| `packages/modules/auth/package.json` | Modify — remove `seed` script |

## Testing

Unit tests in `packages/kit/src/db/seeder.test.ts`:

- **Registry**: registration, duplicate throws, dependsOn validation
- **Topological sort**: correct order, cycle detection, `only` recursive resolution
- **Fusion**: refine callbacks called in sorted order, merged correctly

The actual `seed(db, schema)` call is mocked — tests verify orchestration, not drizzle-seed internals.
