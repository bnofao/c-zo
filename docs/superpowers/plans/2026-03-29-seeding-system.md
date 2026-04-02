# Seeding System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a module-level seeding system to `@czo/kit` that lets modules register seeders via `registerSeeder` and execute them in dependency order via `runSeeder`, powered by `drizzle-seed`.

**Architecture:** A global registry (`Map<string, SeederConfig>`) holds seeder configs registered by modules at `czo:init`. `runSeeder` topologically sorts them by `dependsOn`, fuses their `refine` callbacks into a single `seed(db, schema).refine(...)` call. Optionally resets tables first and filters by `only`.

**Tech Stack:** drizzle-seed, drizzle-orm, vitest

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `packages/kit/src/db/seeder.ts` | Registry (`registerSeeder`), topological sort, `runSeeder` orchestration |
| `packages/kit/src/db/seeder.test.ts` | Unit tests for registry, topo sort, fusion, `only` resolution |
| `packages/kit/src/db/index.ts` | Re-export `registerSeeder`, `runSeeder`, `SeederConfig` |
| `packages/kit/package.json` | Add `drizzle-seed` dependency |
| `pnpm-workspace.yaml` | Add `drizzle-seed` to `catalog:common` |
| `packages/modules/auth/src/plugins/index.ts` | Register auth seeders in `czo:init` |
| `packages/modules/auth/src/database/seeders/apps.ts` | Delete (replaced) |
| `packages/modules/auth/package.json` | Remove `seed` script |

---

### Task 1: Add `drizzle-seed` dependency

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/kit/package.json`

- [ ] **Step 1: Add `drizzle-seed` to `catalog:common` in `pnpm-workspace.yaml`**

In the `common:` catalog section, add after the `drizzle-orm` entry:

```yaml
    drizzle-seed: ^0.3.1
```

- [ ] **Step 2: Add `drizzle-seed` to `packages/kit/package.json` dependencies**

In the `"dependencies"` object, add after `"drizzle-orm"`:

```json
    "drizzle-seed": "catalog:common",
```

- [ ] **Step 3: Install**

Run: `pnpm install --no-frozen-lockfile`
Expected: Clean install, `drizzle-seed` resolved in lockfile.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml packages/kit/package.json pnpm-lock.yaml
git commit -m "chore(kit): add drizzle-seed dependency"
```

---

### Task 2: Write failing tests for the seeder registry

**Files:**
- Create: `packages/kit/src/db/seeder.test.ts`

- [ ] **Step 1: Write registry tests**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('seeder', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('registerSeeder', () => {
    it('should register a seeder', async () => {
      const { registerSeeder, registeredSeeders } = await import('./seeder')

      registerSeeder('users', {
        refine: (f: any) => ({ count: 5 }),
      })

      expect(registeredSeeders().size).toBe(1)
      expect(registeredSeeders().has('users')).toBe(true)
    })

    it('should throw on duplicate name', async () => {
      const { registerSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      expect(() => {
        registerSeeder('users', { refine: () => ({ count: 10 }) })
      }).toThrow('Seeder "users" is already registered')
    })

    it('should register multiple seeders', async () => {
      const { registerSeeder, registeredSeeders } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })

      expect(registeredSeeders().size).toBe(3)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: FAIL — `./seeder` module not found.

---

### Task 3: Implement the seeder registry

**Files:**
- Create: `packages/kit/src/db/seeder.ts`

- [ ] **Step 1: Implement `registerSeeder` and `registeredSeeders`**

```typescript
export interface SeederConfig {
  dependsOn?: string[]
  refine: (f: any) => Record<string, unknown>
}

const seeders = new Map<string, SeederConfig>()

export function registerSeeder(name: string, config: SeederConfig): void {
  if (seeders.has(name)) {
    throw new Error(`Seeder "${name}" is already registered`)
  }
  seeders.set(name, config)
}

export function registeredSeeders(): ReadonlyMap<string, SeederConfig> {
  return seeders
}
```

- [ ] **Step 2: Run registry tests to verify they pass**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/db/seeder.ts packages/kit/src/db/seeder.test.ts
git commit -m "feat(kit): add seeder registry with registerSeeder"
```

---

### Task 4: Write failing tests for topological sort

**Files:**
- Modify: `packages/kit/src/db/seeder.test.ts`

- [ ] **Step 1: Add topological sort tests**

Append to `seeder.test.ts` inside the outer `describe('seeder')`:

```typescript
  describe('topologicalSort', () => {
    it('should return seeders in dependency order', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })

      const sorted = topologicalSort()

      const appsIndex = sorted.indexOf('apps')
      const usersIndex = sorted.indexOf('users')
      const orgsIndex = sorted.indexOf('organizations')

      expect(usersIndex).toBeLessThan(appsIndex)
      expect(orgsIndex).toBeLessThan(appsIndex)
    })

    it('should return seeders without dependencies in registration order', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })

      const sorted = topologicalSort()

      expect(sorted).toEqual(['users', 'organizations'])
    })

    it('should throw on circular dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('a', { dependsOn: ['b'], refine: () => ({}) })
      registerSeeder('b', { dependsOn: ['a'], refine: () => ({}) })

      expect(() => topologicalSort()).toThrow('Circular dependency')
    })

    it('should throw when dependsOn references unknown seeder', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('apps', { dependsOn: ['nonexistent'], refine: () => ({}) })

      expect(() => topologicalSort()).toThrow('Unknown seeder dependency "nonexistent"')
    })

    it('should filter by only and resolve transitive dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })
      registerSeeder('products', { refine: () => ({ count: 20 }) })

      const sorted = topologicalSort(['apps'])

      expect(sorted).toContain('users')
      expect(sorted).toContain('organizations')
      expect(sorted).toContain('apps')
      expect(sorted).not.toContain('products')
    })

    it('should handle deep transitive dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('a', { refine: () => ({}) })
      registerSeeder('b', { dependsOn: ['a'], refine: () => ({}) })
      registerSeeder('c', { dependsOn: ['b'], refine: () => ({}) })

      const sorted = topologicalSort(['c'])

      expect(sorted).toEqual(['a', 'b', 'c'])
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: FAIL — `topologicalSort` not exported from `./seeder`.

---

### Task 5: Implement topological sort

**Files:**
- Modify: `packages/kit/src/db/seeder.ts`

- [ ] **Step 1: Add `topologicalSort` function**

Append to `seeder.ts`:

```typescript
export function topologicalSort(only?: string[]): string[] {
  let entries = new Map(seeders)

  // Resolve transitive dependencies if only is provided
  if (only) {
    const resolved = new Set<string>()
    const queue = [...only]

    while (queue.length > 0) {
      const name = queue.pop()!
      if (resolved.has(name)) continue
      resolved.add(name)

      const config = entries.get(name)
      if (!config) {
        throw new Error(`Unknown seeder dependency "${name}"`)
      }

      for (const dep of config.dependsOn ?? []) {
        queue.push(dep)
      }
    }

    entries = new Map([...entries].filter(([name]) => resolved.has(name)))
  }

  // Validate all dependsOn references exist
  for (const [name, config] of entries) {
    for (const dep of config.dependsOn ?? []) {
      if (!entries.has(dep)) {
        throw new Error(`Unknown seeder dependency "${dep}" referenced by "${name}"`)
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>()
  for (const name of entries.keys()) {
    inDegree.set(name, 0)
  }

  for (const [, config] of entries) {
    for (const dep of config.dependsOn ?? []) {
      // dep must come before current, so current's in-degree increases
    }
  }

  // Build adjacency list: edge from dep -> dependent
  const adjacency = new Map<string, string[]>()
  for (const name of entries.keys()) {
    adjacency.set(name, [])
  }

  for (const [name, config] of entries) {
    for (const dep of config.dependsOn ?? []) {
      adjacency.get(dep)!.push(name)
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name)
  }

  const sorted: string[] = []

  while (queue.length > 0) {
    const name = queue.shift()!
    sorted.push(name)

    for (const dependent of adjacency.get(name) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) queue.push(dependent)
    }
  }

  if (sorted.length !== entries.size) {
    throw new Error('Circular dependency detected in seeders')
  }

  return sorted
}
```

- [ ] **Step 2: Run topological sort tests to verify they pass**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/db/seeder.ts packages/kit/src/db/seeder.test.ts
git commit -m "feat(kit): add topological sort for seeder dependencies"
```

---

### Task 6: Write failing tests for `runSeeder`

**Files:**
- Modify: `packages/kit/src/db/seeder.test.ts`

- [ ] **Step 1: Add runSeeder tests**

Append to `seeder.test.ts` inside the outer `describe('seeder')`:

```typescript
  describe('runSeeder', () => {
    it('should call seed with merged refine configs in dependency order', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn()

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      const mockDb = {}
      const mockSchema = { users: {}, apps: {} }

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue(mockDb),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue(mockSchema),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      const usersRefine = vi.fn().mockReturnValue({ count: 5 })
      const appsRefine = vi.fn().mockReturnValue({ count: 10 })

      registerSeeder('users', { refine: usersRefine })
      registerSeeder('apps', { dependsOn: ['users'], refine: appsRefine })

      await runSeeder()

      expect(mockSeedFn).toHaveBeenCalledWith(mockDb, mockSchema)
      expect(mockSeedRefine).toHaveBeenCalledTimes(1)

      // Extract the refine callback and invoke it to verify fusion
      const refineCallback = mockSeedRefine.mock.calls[0][0]
      const fakeF = { fullName: () => 'mock' }
      const result = refineCallback(fakeF)

      expect(usersRefine).toHaveBeenCalledWith(fakeF)
      expect(appsRefine).toHaveBeenCalledWith(fakeF)
      expect(result).toEqual({ users: { count: 5 }, apps: { count: 10 } })
    })

    it('should call reset before seed when reset option is true', async () => {
      const callOrder: string[] = []
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn().mockImplementation(() => { callOrder.push('reset') })
      mockSeedRefine.mockImplementation(() => { callOrder.push('seed') })

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      const mockDb = {}
      const mockSchema = { users: {} }

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue(mockDb),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue(mockSchema),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      await runSeeder({ reset: true })

      expect(mockResetFn).toHaveBeenCalledWith(mockDb, mockSchema)
      expect(callOrder).toEqual(['reset', 'seed'])
    })

    it('should not call reset when reset option is false', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn()

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue({}),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue({}),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      await runSeeder()

      expect(mockResetFn).not.toHaveBeenCalled()
    })

    it('should filter seeders when only is provided', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: vi.fn(),
      }))

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue({}),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue({}),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      const usersRefine = vi.fn().mockReturnValue({ count: 5 })
      const appsRefine = vi.fn().mockReturnValue({ count: 10 })
      const productsRefine = vi.fn().mockReturnValue({ count: 20 })

      registerSeeder('users', { refine: usersRefine })
      registerSeeder('apps', { dependsOn: ['users'], refine: appsRefine })
      registerSeeder('products', { refine: productsRefine })

      await runSeeder({ only: ['apps'] })

      const refineCallback = mockSeedRefine.mock.calls[0][0]
      const result = refineCallback({})

      expect(result).toHaveProperty('users')
      expect(result).toHaveProperty('apps')
      expect(result).not.toHaveProperty('products')
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: FAIL — `runSeeder` not exported.

---

### Task 7: Implement `runSeeder`

**Files:**
- Modify: `packages/kit/src/db/seeder.ts`

- [ ] **Step 1: Add `runSeeder` function**

Add imports at the top of `seeder.ts`:

```typescript
import { reset, seed } from 'drizzle-seed'
import { useDatabase } from './manager'
import { registeredSchemas } from './schema-registry'
```

Add the `RunSeederOptions` interface and `runSeeder` function:

```typescript
export interface RunSeederOptions {
  reset?: boolean
  only?: string[]
}

export async function runSeeder(opts?: RunSeederOptions): Promise<void> {
  const db = await useDatabase()
  const schema = registeredSchemas()

  if (opts?.reset) {
    await reset(db, schema)
  }

  const sorted = topologicalSort(opts?.only)

  await seed(db, schema).refine((f: any) => {
    const merged: Record<string, unknown> = {}
    for (const name of sorted) {
      const config = seeders.get(name)!
      merged[name] = config.refine(f)
    }
    return merged
  })
}
```

- [ ] **Step 2: Run all seeder tests to verify they pass**

Run: `cd /workspace/c-zo && pnpm vitest run packages/kit/src/db/seeder.test.ts`
Expected: All 13 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/db/seeder.ts packages/kit/src/db/seeder.test.ts
git commit -m "feat(kit): add runSeeder with drizzle-seed integration"
```

---

### Task 8: Export from `@czo/kit/db`

**Files:**
- Modify: `packages/kit/src/db/index.ts`

- [ ] **Step 1: Add seeder exports**

Add at the end of `packages/kit/src/db/index.ts`:

```typescript
// Seeder registry for module-level database seeding
export { registerSeeder, registeredSeeders, runSeeder } from './seeder'
export type { RunSeederOptions, SeederConfig } from './seeder'
```

- [ ] **Step 2: Verify types compile**

Run: `cd /workspace/c-zo && pnpm check-types`
Expected: No type errors in `@czo/kit`.

- [ ] **Step 3: Verify lint passes**

Run: `cd /workspace/c-zo && pnpm lint`
Expected: 0 warnings.

- [ ] **Step 4: Verify build passes**

Run: `cd /workspace/c-zo && pnpm build`
Expected: Build succeeds, `registerSeeder` and `runSeeder` appear in `dist/db/index.mjs` exports.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/db/index.ts
git commit -m "feat(kit): export seeder API from @czo/kit/db"
```

---

### Task 9: Register auth seeders in module plugin

**Files:**
- Modify: `packages/modules/auth/src/plugins/index.ts`

- [ ] **Step 1: Add `registerSeeder` import**

Update the import from `@czo/kit/db` on line 21:

```typescript
import { registerRelations, registerSchema, registerSeeder, useDatabase } from '@czo/kit/db'
```

- [ ] **Step 2: Add seeder registrations in `czo:init` hook**

After the existing `registerRelations(authRelations)` call (line 51), add:

```typescript
    registerSeeder('users', {
      refine: f => ({
        count: 5,
        columns: {
          name: f.fullName(),
          email: f.email(),
          role: f.valuesFromArray({ values: ['admin', 'user'] }),
        },
      }),
    })

    registerSeeder('organizations', {
      refine: f => ({
        count: 3,
        columns: {
          name: f.companyName(),
          slug: f.string({ isUnique: true }),
        },
      }),
    })

    registerSeeder('apps', {
      dependsOn: ['users', 'organizations'],
      refine: f => ({
        count: 10,
        columns: {
          appId: f.string({ isUnique: true }),
          status: f.valuesFromArray({ values: ['active', 'disabled'] }),
        },
      }),
    })
```

- [ ] **Step 3: Commit**

```bash
git add packages/modules/auth/src/plugins/index.ts
git commit -m "feat(auth): register app seeders via registerSeeder"
```

---

### Task 10: Clean up old seeder

**Files:**
- Delete: `packages/modules/auth/src/database/seeders/apps.ts`
- Modify: `packages/modules/auth/package.json`

- [ ] **Step 1: Delete the standalone seeder file**

```bash
rm packages/modules/auth/src/database/seeders/apps.ts
rmdir packages/modules/auth/src/database/seeders 2>/dev/null || true
```

- [ ] **Step 2: Remove `seed` script from `package.json`**

Remove this line from `packages/modules/auth/package.json` scripts:

```json
    "seed": "tsx src/database/seeders/apps.ts"
```

- [ ] **Step 3: Verify all tests still pass**

Run: `cd /workspace/c-zo && pnpm test`
Expected: All tests pass (seeder tests included).

- [ ] **Step 4: Verify lint and types**

Run: `cd /workspace/c-zo && pnpm lint && pnpm check-types`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add -A packages/modules/auth/src/database/seeders packages/modules/auth/package.json
git commit -m "chore(auth): remove standalone seeder, replaced by registerSeeder"
```
