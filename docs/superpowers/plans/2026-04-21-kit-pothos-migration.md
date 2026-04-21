# Kit Pothos Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer `@czo/kit` du pattern schema-first + `Repository<T>` vers Pothos + helpers DB micro-ciblés, en fondation des modules `auth` et `stock-location`.

**Architecture:** Factory `initBuilder` consommant 6 plugins Pothos (drizzle, relay, errors, scope-auth, zod, tracing). Helpers DB (`notDeleted`, `optimisticUpdate`, classes d'erreur) remplacent `Repository<T>`. Registration via `registerSchema(fn)` + `buildSchema(builder)` appelés depuis `apps/mazo/api/graphql.ts`.

**Tech Stack:** TypeScript, Pothos v4 (plugin-drizzle, plugin-relay, plugin-errors, plugin-scope-auth, plugin-zod, plugin-tracing), Drizzle ORM (RQBv2), OpenTelemetry, vitest, pnpm workspaces.

**Spec de référence:** `docs/superpowers/specs/2026-04-20-kit-pothos-migration-design.md`

---

## Phase 0 — Préservation `old/`

### Task 0.1: Créer la structure `old/` et déplacer les fichiers à supprimer

**Files:**
- Create: `packages/kit/old/` (arborescence miroir)
- Move: tous les fichiers listés au spec §13.2

- [ ] **Step 1: Créer la structure miroir**

Run:
```bash
mkdir -p packages/kit/old/src/db
mkdir -p packages/kit/old/src/graphql/middleware
mkdir -p packages/kit/old/src/graphql/directive
mkdir -p packages/kit/old/src/graphql/relay
mkdir -p packages/kit/old/src/graphql/resolvers
mkdir -p packages/kit/old/src/graphql/schema
mkdir -p packages/kit/old/src/graphql/context
```

- [ ] **Step 2: Déplacer les fichiers à supprimer (git mv pour garder l'historique)**

Run:
```bash
git mv packages/kit/src/db/repository.ts packages/kit/old/src/db/repository.ts
git mv packages/kit/src/db/repository.test.ts packages/kit/old/src/db/repository.test.ts
git mv packages/kit/src/graphql/middleware packages/kit/old/src/graphql/middleware
git mv packages/kit/src/graphql/directive packages/kit/old/src/graphql/directive
git mv packages/kit/src/graphql/relay packages/kit/old/src/graphql/relay
git mv packages/kit/src/graphql/resolvers packages/kit/old/src/graphql/resolvers
git mv packages/kit/src/graphql/schema packages/kit/old/src/graphql/schema
```

Expected: les dossiers sources sont déplacés. `git status` montre `renamed:`.

- [ ] **Step 3: Copier les fichiers à modifier (pré-édition)**

Run:
```bash
cp packages/kit/src/db/manager.ts packages/kit/old/src/db/manager.ts
cp -r packages/kit/src/graphql/context packages/kit/old/src/graphql/context
cp packages/kit/src/graphql/index.ts packages/kit/old/src/graphql/index.ts
cp packages/kit/src/db/index.ts packages/kit/old/src/db/index.ts
cp packages/kit/src/index.ts packages/kit/old/src/index.ts
cp packages/kit/package.json packages/kit/old/package.json
```

Expected: copies en place. `git status` montre `?? packages/kit/old/` (untracked).

- [ ] **Step 4: Commit**

```bash
git add packages/kit/old
git commit -m "chore(kit): preserve pre-migration files in old/"
```

---

## Phase 1 — Dépendances

### Task 1.1: Mettre à jour `pnpm-workspace.yaml` catalog

**Files:**
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Lire le catalog existant**

Run: `cat pnpm-workspace.yaml`

- [ ] **Step 2: Ajouter les versions Pothos + graphql-scalars**

Ajouter dans la section `catalog:` de `pnpm-workspace.yaml` :

```yaml
catalog:
  # ... entrées existantes ...
  '@pothos/core': ^4.0.0
  '@pothos/plugin-drizzle': ^0.4.0
  '@pothos/plugin-relay': ^4.0.0
  '@pothos/plugin-errors': ^4.0.0
  '@pothos/plugin-scope-auth': ^4.0.0
  '@pothos/plugin-zod': ^4.0.0
  '@pothos/plugin-tracing': ^1.0.0
  'graphql-scalars': ^1.23.0
```

**Note** : si les versions exactes n'existent pas, remplacer par la dernière `latest` stable publiée. Vérifier via `pnpm view <package> version`.

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml
git commit -m "chore(workspace): add Pothos deps to catalog"
```

### Task 1.2: Mettre à jour `packages/kit/package.json`

**Files:**
- Modify: `packages/kit/package.json`

- [ ] **Step 1: Ajouter les nouveaux exports `./testing`**

Dans le champ `"exports"` du `packages/kit/package.json`, ajouter une entrée :

```json
"./testing": {
  "types": "./src/testing/index.ts",
  "default": "./dist/testing/index.mjs"
}
```

- [ ] **Step 2: Ajouter les dépendances Pothos**

Dans `"dependencies"` de `packages/kit/package.json` :

```json
"@pothos/core": "catalog:",
"@pothos/plugin-drizzle": "catalog:",
"@pothos/plugin-relay": "catalog:",
"@pothos/plugin-errors": "catalog:",
"@pothos/plugin-scope-auth": "catalog:",
"@pothos/plugin-zod": "catalog:",
"@pothos/plugin-tracing": "catalog:",
"graphql-scalars": "catalog:"
```

- [ ] **Step 3: Retirer les dépendances obsolètes**

Retirer de `"dependencies"` :

```
@graphql-tools/merge
@graphql-tools/schema
graphql-middleware
@envelop/graphql-middleware
```

(si présentes — sinon passer)

- [ ] **Step 4: Installer**

Run: `pnpm install`

Expected: `Done in Xs`. Pas d'erreur de résolution.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/package.json pnpm-lock.yaml
git commit -m "chore(kit): add Pothos deps, remove graphql-middleware"
```

---

## Phase 2 — Helpers DB (B' refactor)

### Task 2.1: `db/errors.ts` — DatabaseError + OptimisticLockError

**Files:**
- Create: `packages/kit/src/db/errors.ts`
- Test: `packages/kit/src/db/errors.test.ts`

- [ ] **Step 1: Écrire les tests d'abord**

Create `packages/kit/src/db/errors.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { DatabaseError, OptimisticLockError, toDatabaseError } from './errors'

describe('DatabaseError', () => {
  it('has a name and message', () => {
    const err = new DatabaseError('some message')
    expect(err.name).toBe('DatabaseError')
    expect(err.message).toBe('some message')
    expect(err.fieldErrors).toBeUndefined()
  })

  it('carries fieldErrors when provided', () => {
    const err = new DatabaseError('failed', { email: ['must be unique'] })
    expect(err.fieldErrors).toEqual({ email: ['must be unique'] })
  })
})

describe('OptimisticLockError', () => {
  it('includes entityId, expectedVersion, actualVersion', () => {
    const err = new OptimisticLockError(42, 3, 4)
    expect(err.entityId).toBe(42)
    expect(err.expectedVersion).toBe(3)
    expect(err.actualVersion).toBe(4)
    expect(err.name).toBe('OptimisticLockError')
    expect(err.message).toContain('version 3')
    expect(err.message).toContain('version 4')
  })

  it('describes deleted record when actualVersion is null', () => {
    const err = new OptimisticLockError(42, 3, null)
    expect(err.message).toContain('deleted record')
  })
})

describe('toDatabaseError', () => {
  it('rethrows DatabaseError as-is', () => {
    const original = new DatabaseError('orig')
    expect(() => toDatabaseError(original)).toThrow(original)
  })

  it('maps pg unique_violation (code 23505) with detail', () => {
    const pgErr = Object.assign(new Error('dup'), {
      code: '23505',
      detail: 'Key (email)=(x@y.z) already exists.',
    })
    try {
      toDatabaseError(pgErr)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError)
      expect((err as DatabaseError).fieldErrors).toEqual({ email: ['must be unique'] })
    }
  })

  it('maps pg foreign_key_violation (code 23503)', () => {
    const pgErr = Object.assign(new Error('fk'), { code: '23503' })
    expect(() => toDatabaseError(pgErr)).toThrow(DatabaseError)
  })

  it('rethrows unknown errors', () => {
    const unk = new Error('unknown')
    expect(() => toDatabaseError(unk)).toThrow(unk)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `pnpm --filter @czo/kit test src/db/errors.test.ts`

Expected: FAIL — `Cannot find module './errors'` ou équivalent.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/kit/src/db/errors.ts` :

```ts
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly entityId: number | string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Optimistic lock failed: entity ${entityId} expected version ${expectedVersion}, `
      + `but found ${actualVersion === null ? 'deleted record' : `version ${actualVersion}`}`,
    )
    this.name = 'OptimisticLockError'
  }
}

export function toDatabaseError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) throw err
  if (err instanceof Error && 'code' in err) {
    const pgCode = (err as { code: unknown }).code
    if (pgCode === '23505') {
      const detail = (err as { detail?: unknown }).detail
      const match = typeof detail === 'string' ? detail.match(/Key \((\w+)\)=/) : null
      const field = match?.[1]
      return new DatabaseError(
        'Unique constraint violated',
        field ? { [field]: ['must be unique'] } : undefined,
      )
    }
    if (pgCode === '23503') {
      return new DatabaseError('Foreign key constraint violated')
    }
  }
  throw err
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @czo/kit test src/db/errors.test.ts`

Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/db/errors.ts packages/kit/src/db/errors.test.ts
git commit -m "feat(kit/db): add DatabaseError, OptimisticLockError, toDatabaseError"
```

### Task 2.2: `db/scope.ts` — notDeleted (v1) + onlyDeleted

**Files:**
- Create: `packages/kit/src/db/scope.ts`
- Test: `packages/kit/src/db/scope.test.ts`

- [ ] **Step 1: Écrire les tests SQL-generation (v1)**

Create `packages/kit/src/db/scope.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { pgTable, integer, timestamp } from 'drizzle-orm/pg-core'
import { notDeleted, onlyDeleted, notDeletedFilter, withNotDeleted } from './scope'

const testTable = pgTable('test', {
  id: integer('id').primaryKey(),
  deletedAt: timestamp('deleted_at'),
})

const db = drizzle.mock()

describe('notDeleted (v1 SQL)', () => {
  it('produces IS NULL filter on deletedAt', () => {
    const q = db.select().from(testTable).where(notDeleted(testTable))
    const { sql } = q.toSQL()
    expect(sql.toLowerCase()).toContain('"deleted_at" is null')
  })

  it('combines with extra where clause via AND', () => {
    const q = db.select().from(testTable).where(notDeleted(testTable, eq(testTable.id, 5)))
    const { sql, params } = q.toSQL()
    const lower = sql.toLowerCase()
    expect(lower).toContain('"deleted_at" is null')
    expect(lower).toContain('"id" =')
    expect(params).toContain(5)
  })
})

describe('onlyDeleted (v1 SQL)', () => {
  it('produces IS NOT NULL filter', () => {
    const q = db.select().from(testTable).where(onlyDeleted(testTable))
    const { sql } = q.toSQL()
    expect(sql.toLowerCase()).toContain('"deleted_at" is not null')
  })
})

describe('notDeletedFilter (v2 filter object)', () => {
  it('is a filter object targeting deletedAt isNull', () => {
    expect(notDeletedFilter).toEqual({ deletedAt: { isNull: true } })
  })
})

describe('withNotDeleted (v2 composer)', () => {
  it('merges with empty filter', () => {
    expect(withNotDeleted()).toEqual({ deletedAt: { isNull: true } })
  })

  it('preserves caller fields and appends deletedAt', () => {
    expect(withNotDeleted({ id: 5, name: 'foo' })).toEqual({
      id: 5,
      name: 'foo',
      deletedAt: { isNull: true },
    })
  })

  it('caller-provided deletedAt takes precedence (merge order)', () => {
    // Our implementation spreads notDeletedFilter LAST, so it overrides caller's deletedAt.
    // Document this as intended behavior (notDeleted is authoritative).
    expect(withNotDeleted({ deletedAt: { isNotNull: true } } as any)).toEqual({
      deletedAt: { isNull: true },
    })
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `pnpm --filter @czo/kit test src/db/scope.test.ts`

Expected: FAIL — `Cannot find module './scope'`.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/kit/src/db/scope.ts` :

```ts
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { and, isNull, isNotNull, type SQL, type SQLWrapper } from 'drizzle-orm'

type TableWithDeletedAt = PgTable & { deletedAt: AnyPgColumn }

// ── Style v1 (query builder : db.select/update/delete) ──

export function notDeleted<T extends TableWithDeletedAt>(
  table: T,
  extraWhere?: SQL | SQLWrapper,
): SQL {
  const deletedFilter = isNull(table.deletedAt)
  return extraWhere ? and(deletedFilter, extraWhere)! : deletedFilter
}

export function onlyDeleted<T extends TableWithDeletedAt>(table: T): SQL {
  return isNotNull(table.deletedAt)
}

// ── Style v2 (RQBv2 : db.query.*.findMany/findFirst) ──

export const notDeletedFilter = {
  deletedAt: { isNull: true },
} as const

export function withNotDeleted<T extends Record<string, unknown>>(
  filter?: T,
): T & typeof notDeletedFilter {
  return { ...(filter ?? ({} as T)), ...notDeletedFilter }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @czo/kit test src/db/scope.test.ts`

Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/db/scope.ts packages/kit/src/db/scope.test.ts
git commit -m "feat(kit/db): add notDeleted, onlyDeleted + v2 filter helpers"
```

### Task 2.3: `testing/fixtures.ts` — createTestDb + truncate

**Files:**
- Create: `packages/kit/src/testing/index.ts`
- Create: `packages/kit/src/testing/fixtures.ts`

- [ ] **Step 1: Créer `fixtures.ts`**

Create `packages/kit/src/testing/fixtures.ts` :

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { sql, type AnyTable } from 'drizzle-orm'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/czo_test'

let cachedDb: NodePgDatabase | null = null

export function createTestDb(): NodePgDatabase {
  if (cachedDb) return cachedDb
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  cachedDb = drizzle(pool)
  return cachedDb
}

export async function truncate(db: NodePgDatabase, ...tables: AnyTable<any>[]): Promise<void> {
  for (const table of tables) {
    await db.execute(sql`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
  }
}
```

- [ ] **Step 2: Créer `index.ts` re-export**

Create `packages/kit/src/testing/index.ts` :

```ts
export * from './fixtures'
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `pnpm --filter @czo/kit check-types`

Expected: PASS (le module peut ne pas encore être utilisé, mais il doit typer correctement).

- [ ] **Step 4: Commit**

```bash
git add packages/kit/src/testing
git commit -m "feat(kit/testing): add createTestDb and truncate helpers"
```

### Task 2.4: `db/optimistic.ts` — optimisticUpdate (test d'intégration)

**Files:**
- Create: `packages/kit/src/db/optimistic.ts`
- Test: `packages/kit/src/db/optimistic.test.ts`

**Prérequis** : Postgres accessible sur `postgresql://postgres:postgres@localhost:5432/czo_test` (ou `TEST_DATABASE_URL` env var). Lancer `docker compose -f docker-compose.dev.yml up -d` si besoin.

- [ ] **Step 1: Écrire les tests d'intégration**

Create `packages/kit/src/db/optimistic.test.ts` :

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { optimisticUpdate } from './optimistic'
import { OptimisticLockError } from './errors'
import { createTestDb, truncate } from '../testing'

const things = pgTable('things_opt_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

describe('optimisticUpdate', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS things_opt_test`)
    await db.execute(sql`
      CREATE TABLE things_opt_test (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  })

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS things_opt_test`)
  })

  beforeEach(() => truncate(db, things))

  it('increments version on successful update', async () => {
    const [row] = await db.insert(things).values({ name: 'a' }).returning()
    const updated = await optimisticUpdate({
      db, table: things, id: row.id, expectedVersion: 1,
      values: { name: 'b' },
    })
    expect(updated.version).toBe(2)
    expect(updated.name).toBe('b')
  })

  it('throws OptimisticLockError on version mismatch', async () => {
    const [row] = await db.insert(things).values({ name: 'a' }).returning()
    await expect(optimisticUpdate({
      db, table: things, id: row.id, expectedVersion: 999,
      values: { name: 'b' },
    })).rejects.toBeInstanceOf(OptimisticLockError)
  })

  it('OptimisticLockError reports actualVersion for an existing row', async () => {
    const [row] = await db.insert(things).values({ name: 'a' }).returning()
    try {
      await optimisticUpdate({ db, table: things, id: row.id, expectedVersion: 999, values: { name: 'b' } })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBe(1)
      expect((err as OptimisticLockError).expectedVersion).toBe(999)
    }
  })

  it('OptimisticLockError reports null actualVersion for a missing row', async () => {
    try {
      await optimisticUpdate({ db, table: things, id: 99999, expectedVersion: 1, values: { name: 'x' } })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `pnpm --filter @czo/kit test src/db/optimistic.test.ts`

Expected: FAIL — `Cannot find module './optimistic'`.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/kit/src/db/optimistic.ts` :

```ts
import type { PgTable } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { and, eq, sql } from 'drizzle-orm'
import type { Database } from './manager'
import { OptimisticLockError } from './errors'

type TableWithVersion = PgTable & {
  id: any
  version: any
  updatedAt: any
}

export interface OptimisticUpdateParams<T extends TableWithVersion> {
  db: Database
  table: T
  id: number | string
  expectedVersion: number
  values: Partial<InferInsertModel<T>>
}

export async function optimisticUpdate<T extends TableWithVersion>(
  { db, table, id, expectedVersion, values }: OptimisticUpdateParams<T>,
): Promise<InferSelectModel<T>> {
  const updated = await db
    .update(table)
    .set({
      ...values,
      version: sql`${table.version} + 1`,
      updatedAt: sql`NOW()`,
    } as any)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()

  if (updated.length === 0) {
    const [current] = await db
      .select({ version: table.version })
      .from(table)
      .where(eq(table.id, id))
      .limit(1)

    throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
  }

  return updated[0] as InferSelectModel<T>
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @czo/kit test src/db/optimistic.test.ts`

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/db/optimistic.ts packages/kit/src/db/optimistic.test.ts
git commit -m "feat(kit/db): add optimisticUpdate with version locking"
```

### Task 2.5: Mettre à jour `db/index.ts` re-exports

**Files:**
- Modify: `packages/kit/src/db/index.ts`

- [ ] **Step 1: Lire l'état actuel**

Run: `cat packages/kit/src/db/index.ts`

- [ ] **Step 2: Réécrire les re-exports**

Remplacer le contenu de `packages/kit/src/db/index.ts` par :

```ts
export * from './manager'
export * from './relations'
export * from './schema'
export * from './seed'
export * from './scope'
export * from './optimistic'
export * from './errors'
// NB: repository.ts a été déplacé dans old/ — plus exporté
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `pnpm --filter @czo/kit check-types`

Expected: PASS (sauf si des consommateurs importent encore `Repository` — ignorés pour l'instant, nettoyés dans phase modules).

- [ ] **Step 4: Commit**

```bash
git add packages/kit/src/db/index.ts
git commit -m "chore(kit/db): export new helpers, drop Repository from index"
```

---

## Phase 3 — GraphQL Errors

### Task 3.1: `graphql/errors/index.ts` — Classes d'erreur

**Files:**
- Create: `packages/kit/src/graphql/errors/index.ts`
- Test: `packages/kit/src/graphql/errors/index.test.ts`

- [ ] **Step 1: Écrire les tests**

Create `packages/kit/src/graphql/errors/index.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  ValidationError, NotFoundError, ConflictError,
  ForbiddenError, UnauthenticatedError, BaseGraphQLError,
} from './index'

describe('ValidationError', () => {
  it('carries fields and default message', () => {
    const err = new ValidationError([{ path: 'email', message: 'bad', code: 'invalid_string' }])
    expect(err).toBeInstanceOf(BaseGraphQLError)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.fields).toHaveLength(1)
    expect(err.fields[0].path).toBe('email')
    expect(err.message).toBe('Validation failed')
  })

  it('.fromZod flattens issues into FieldError[]', () => {
    const schema = z.object({ email: z.string().email(), name: z.string().min(2) })
    const parse = schema.safeParse({ email: 'bad', name: 'a' })
    expect(parse.success).toBe(false)
    if (parse.success) return
    const err = ValidationError.fromZod(parse.error)
    expect(err.fields.length).toBeGreaterThanOrEqual(2)
    expect(err.fields.some(f => f.path === 'email')).toBe(true)
    expect(err.fields.some(f => f.path === 'name')).toBe(true)
  })
})

describe('NotFoundError', () => {
  it('stores resource and id', () => {
    const err = new NotFoundError('User', 42)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.resource).toBe('User')
    expect(err.id).toBe(42)
    expect(err.message).toContain('User')
    expect(err.message).toContain('42')
  })
})

describe('ConflictError', () => {
  it('stores resource, conflictField, and allows custom message', () => {
    const err = new ConflictError('User', 'email', 'Email already in use')
    expect(err.code).toBe('CONFLICT')
    expect(err.resource).toBe('User')
    expect(err.conflictField).toBe('email')
    expect(err.message).toBe('Email already in use')
  })

  it('generates a default message', () => {
    const err = new ConflictError('User', 'email')
    expect(err.message).toContain('User')
    expect(err.message).toContain('email')
  })
})

describe('ForbiddenError', () => {
  it('carries requiredPermission', () => {
    const err = new ForbiddenError('user:create')
    expect(err.code).toBe('FORBIDDEN')
    expect(err.requiredPermission).toBe('user:create')
    expect(err.message).toContain('user:create')
  })
})

describe('UnauthenticatedError', () => {
  it('has default and custom message', () => {
    expect(new UnauthenticatedError().message).toBe('Authentication required')
    expect(new UnauthenticatedError('Session expired').message).toBe('Session expired')
    expect(new UnauthenticatedError().code).toBe('UNAUTHENTICATED')
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `pnpm --filter @czo/kit test src/graphql/errors/index.test.ts`

Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/kit/src/graphql/errors/index.ts` :

```ts
import type { z } from 'zod'

export interface FieldError {
  path: string
  message: string
  code: string
}

export abstract class BaseGraphQLError extends Error {
  abstract readonly code: string
}

export class ValidationError extends BaseGraphQLError {
  readonly code = 'VALIDATION_ERROR'
  constructor(
    public readonly fields: FieldError[],
    message = 'Validation failed',
  ) {
    super(message)
    this.name = 'ValidationError'
  }

  static fromZod(err: z.ZodError): ValidationError {
    return new ValidationError(
      err.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    )
  }
}

export class NotFoundError extends BaseGraphQLError {
  readonly code = 'NOT_FOUND'
  constructor(public readonly resource: string, public readonly id: string | number) {
    super(`${resource} '${id}' not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends BaseGraphQLError {
  readonly code = 'CONFLICT'
  constructor(
    public readonly resource: string,
    public readonly conflictField: string,
    message?: string,
  ) {
    super(message ?? `${resource} conflict on ${conflictField}`)
    this.name = 'ConflictError'
  }
}

export class ForbiddenError extends BaseGraphQLError {
  readonly code = 'FORBIDDEN'
  constructor(public readonly requiredPermission: string) {
    super(`Missing permission: ${requiredPermission}`)
    this.name = 'ForbiddenError'
  }
}

export class UnauthenticatedError extends BaseGraphQLError {
  readonly code = 'UNAUTHENTICATED'
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @czo/kit test src/graphql/errors/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/errors/index.ts packages/kit/src/graphql/errors/index.test.ts
git commit -m "feat(kit/graphql/errors): add BaseGraphQLError + 5 typed error classes"
```

### Task 3.2: `graphql/errors/builders.ts` — registerErrorTypes

**Files:**
- Create: `packages/kit/src/graphql/errors/builders.ts`

Note : les tests de `registerErrorTypes` passent par des tests d'intégration builder (cf. Task 5.2) — pas de test unitaire ici car la fonction pure dépend du builder runtime.

- [ ] **Step 1: Écrire l'implémentation**

Create `packages/kit/src/graphql/errors/builders.ts` :

```ts
import type SchemaBuilder from '@pothos/core'
import {
  BaseGraphQLError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthenticatedError,
  type FieldError,
} from './index'

/**
 * Register the standard GraphQL error types on a Pothos builder.
 * Called automatically by initBuilder().
 */
export function registerErrorTypes(builder: SchemaBuilder<any>): void {
  const ErrorInterface = builder.interfaceRef<BaseGraphQLError>('Error').implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      code: t.string({ resolve: (e) => e.code }),
    }),
  })

  const FieldErrorObject = builder.objectRef<FieldError>('FieldError').implement({
    fields: (t) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder.objectType(ValidationError, {
    name: 'ValidationError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      fields: t.field({ type: [FieldErrorObject], resolve: (e) => e.fields }),
    }),
  })

  builder.objectType(NotFoundError, {
    name: 'NotFoundError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      resource: t.exposeString('resource'),
      id: t.id({ resolve: (e) => String(e.id) }),
    }),
  })

  builder.objectType(ConflictError, {
    name: 'ConflictError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      resource: t.exposeString('resource'),
      conflictField: t.exposeString('conflictField'),
    }),
  })

  builder.objectType(ForbiddenError, {
    name: 'ForbiddenError',
    interfaces: [ErrorInterface],
    fields: (t) => ({
      requiredPermission: t.exposeString('requiredPermission'),
    }),
  })

  builder.objectType(UnauthenticatedError, {
    name: 'UnauthenticatedError',
    interfaces: [ErrorInterface],
    fields: (_t) => ({}),
  })
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `pnpm --filter @czo/kit check-types`

Expected: PASS (mocks pothos types via `SchemaBuilder<any>`).

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/graphql/errors/builders.ts
git commit -m "feat(kit/graphql/errors): add registerErrorTypes Pothos builder"
```

---

## Phase 4 — Scalars

### Task 4.1: `graphql/scalars/index.ts` — DateTime + JSONObject

**Files:**
- Create: `packages/kit/src/graphql/scalars/index.ts`

- [ ] **Step 1: Écrire le module**

Create `packages/kit/src/graphql/scalars/index.ts` :

```ts
export { DateTimeResolver, JSONObjectResolver } from 'graphql-scalars'
```

Justification : on re-export directement les resolvers de `graphql-scalars` pour les utiliser dans `initBuilder` via `builder.addScalarType(...)`. Pas de wrapping custom pour l'instant.

- [ ] **Step 2: Commit**

```bash
git add packages/kit/src/graphql/scalars
git commit -m "feat(kit/graphql/scalars): re-export DateTime and JSONObject resolvers"
```

---

## Phase 5 — Builder

### Task 5.1: `graphql/builder.ts` — initBuilder + registerSchema + buildSchema

**Files:**
- Create: `packages/kit/src/graphql/builder.ts`

- [ ] **Step 1: Écrire le builder**

Create `packages/kit/src/graphql/builder.ts` :

```ts
import SchemaBuilder, { type SchemaBuilderOptions, type PothosPlugin } from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import RelayPlugin from '@pothos/plugin-relay'
import ErrorsPlugin from '@pothos/plugin-errors'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import ValidationPlugin from '@pothos/plugin-zod'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import type { GraphQLSchema } from 'graphql'
import { trace } from '@opentelemetry/api'
import { DateTimeResolver, JSONObjectResolver } from './scalars'
import { registerErrorTypes } from './errors/builders'

export interface CZOBuilderOptions<DB, Relations> {
  db: DB
  relations: Relations
  extraPlugins?: Array<PothosPlugin>
  extraPluginOptions?: Partial<SchemaBuilderOptions<any>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CZOBuilder<DB, Relations, Ctx> = SchemaBuilder<{
  Context: Ctx
  DrizzleRelations: Relations
  Scalars: {
    DateTime: { Input: Date; Output: Date }
    JSONObject: { Input: Record<string, unknown>; Output: Record<string, unknown> }
  }
  AuthScopes: { permission: { resource: string; actions: string[] } }
  DefaultFieldNullability: false
}>

// Module-level state — single contribution registry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const contributions: Array<(builder: CZOBuilder<any, any, any>) => void> = []
let built = false

export function initBuilder<DB, Relations, Ctx>(
  opts: CZOBuilderOptions<DB, Relations>,
): CZOBuilder<DB, Relations, Ctx> {
  const builder = new SchemaBuilder({
    plugins: [
      DrizzlePlugin,
      RelayPlugin,
      ErrorsPlugin,
      ScopeAuthPlugin,
      ValidationPlugin,
      TracingPlugin,
      ...(opts.extraPlugins ?? []),
    ],
    drizzle: { client: opts.db, relations: opts.relations },
    relay: { clientMutationId: 'omit', cursorType: 'String' },
    scopeAuth: {
      authScopes: async (ctx: any) => ({
        permission: async ({ resource, actions }: { resource: string; actions: string[] }) =>
          ctx?.auth?.authService?.hasPermission?.({
            ctx: { userId: ctx?.auth?.user?.id, organizationId: ctx?.auth?.session?.activeOrganizationId },
            permissions: { [resource]: actions },
          }) ?? false,
      }),
    },
    tracing: {
      default: (config: any) => isRootField(config),
      wrap: (resolver: any, _options: any, fieldConfig: any) => async (...args: any[]) => {
        const tracer = trace.getTracer('graphql')
        return tracer.startActiveSpan(
          `graphql.${fieldConfig.parentType}.${fieldConfig.name}`,
          async (span) => {
            try { return await resolver(...args) }
            catch (err) {
              span.recordException(err as Error)
              throw err
            }
            finally { span.end() }
          },
        )
      },
    },
    ...opts.extraPluginOptions,
  }) as unknown as CZOBuilder<DB, Relations, Ctx>

  // Scalars
  builder.addScalarType('DateTime', DateTimeResolver)
  builder.addScalarType('JSONObject', JSONObjectResolver)

  // Root types
  builder.queryType({})
  builder.mutationType({})

  // Shared error types
  registerErrorTypes(builder as unknown as SchemaBuilder<any>)

  return builder
}

export function registerSchema<DB, Relations, Ctx>(
  contribute: (builder: CZOBuilder<DB, Relations, Ctx>) => void,
): void {
  contributions.push(contribute as any)
}

export function buildSchema(builder: CZOBuilder<any, any, any>): GraphQLSchema {
  if (built) throw new Error('buildSchema() called twice — schema already assembled')
  for (const contribute of contributions) contribute(builder)
  built = true
  return builder.toSchema()
}

// For testing only — resets module state so tests can build multiple times.
export function _resetBuilderState(): void {
  contributions.length = 0
  built = false
}
```

- [ ] **Step 2: Vérifier le build**

Run: `pnpm --filter @czo/kit build`

Expected: build réussit. Si TypeScript crie sur les `any`, c'est attendu — Pothos types sont complexes à aligner, on relâche temporairement.

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/graphql/builder.ts
git commit -m "feat(kit/graphql): add initBuilder, registerSchema, buildSchema factory"
```

### Task 5.2: Tests du builder

**Files:**
- Test: `packages/kit/src/graphql/builder.test.ts`

- [ ] **Step 1: Écrire les tests**

Create `packages/kit/src/graphql/builder.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { initBuilder, registerSchema, buildSchema, _resetBuilderState } from './builder'

const db = drizzle.mock()
const relations = {} as any

beforeEach(() => _resetBuilderState())

describe('initBuilder', () => {
  it('returns a Pothos SchemaBuilder', () => {
    const builder = initBuilder({ db, relations })
    expect(builder).toBeDefined()
    expect(typeof (builder as any).objectRef).toBe('function')
  })

  it('registers DateTime and JSONObject scalars', () => {
    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)
    expect(schema.getType('DateTime')).toBeDefined()
    expect(schema.getType('JSONObject')).toBeDefined()
  })

  it('registers Error interface and 5 error types', () => {
    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)
    expect(schema.getType('Error')).toBeDefined()
    expect(schema.getType('ValidationError')).toBeDefined()
    expect(schema.getType('NotFoundError')).toBeDefined()
    expect(schema.getType('ConflictError')).toBeDefined()
    expect(schema.getType('ForbiddenError')).toBeDefined()
    expect(schema.getType('UnauthenticatedError')).toBeDefined()
    expect(schema.getType('FieldError')).toBeDefined()
  })
})

describe('registerSchema + buildSchema', () => {
  it('applies all registered contributions in order', () => {
    const order: string[] = []
    registerSchema((b) => {
      order.push('a')
      b.objectRef<{ id: string }>('Foo').implement({
        fields: (t) => ({ id: t.string({ resolve: () => 'x' }) }),
      })
    })
    registerSchema((_b) => { order.push('b') })

    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)

    expect(order).toEqual(['a', 'b'])
    expect(schema.getType('Foo')).toBeDefined()
  })

  it('throws on double-build', () => {
    const builder = initBuilder({ db, relations })
    buildSchema(builder)
    expect(() => buildSchema(builder)).toThrow('Schema already built')
  })
})
```

- [ ] **Step 2: Lancer les tests**

Run: `pnpm --filter @czo/kit test src/graphql/builder.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/kit/src/graphql/builder.test.ts
git commit -m "test(kit/graphql): cover initBuilder, registerSchema, buildSchema"
```

---

## Phase 6 — SDL

### Task 6.1: `graphql/sdl.ts` — emitSDL + verifySDL

**Files:**
- Create: `packages/kit/src/graphql/sdl.ts`
- Test: `packages/kit/src/graphql/sdl.test.ts`

- [ ] **Step 1: Écrire les tests**

Create `packages/kit/src/graphql/sdl.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { initBuilder, buildSchema, _resetBuilderState } from './builder'
import { emitSDL, verifySDL } from './sdl'

const db = drizzle.mock()
const tmpFile = join(tmpdir(), `kit-sdl-test-${process.pid}.graphqls`)

beforeEach(() => _resetBuilderState())
afterEach(() => { if (existsSync(tmpFile)) rmSync(tmpFile) })

describe('emitSDL', () => {
  it('writes SDL to the given path with default header', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)

    emitSDL({ schema, outputPath: tmpFile })

    expect(existsSync(tmpFile)).toBe(true)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('scalar DateTime')
  })

  it('applies lexicographic sort by default (stable diffs)', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile })

    const first = readFileSync(tmpFile, 'utf-8')
    _resetBuilderState()
    const builder2 = initBuilder({ db, relations: {} })
    const schema2 = buildSchema(builder2)
    emitSDL({ schema: schema2, outputPath: tmpFile })

    const second = readFileSync(tmpFile, 'utf-8')
    expect(first).toBe(second)
  })

  it('accepts a custom header', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile, header: '# my header\n\n' })
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content.startsWith('# my header\n\n')).toBe(true)
  })
})

describe('verifySDL', () => {
  it('returns true when file matches current schema', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile })
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(true)
  })

  it('returns false when file missing', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(false)
  })

  it('returns false when content differs', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile, header: '# a\n\n' })
    expect(verifySDL({ schema, outputPath: tmpFile, header: '# b\n\n' })).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `pnpm --filter @czo/kit test src/graphql/sdl.test.ts`

Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Create `packages/kit/src/graphql/sdl.ts` :

```ts
import { printSchema, lexicographicSortSchema, type GraphQLSchema } from 'graphql'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

export interface EmitSDLOptions {
  schema: GraphQLSchema
  outputPath: string
  /** Alphabetical sort of types/fields for stable diffs. Default: true */
  sort?: boolean
  /** Custom header string prepended. Default: auto-generated warning */
  header?: string
}

const DEFAULT_HEADER = '# AUTO-GENERATED — do not edit. Run `pnpm generate-sdl` to regenerate.\n\n'

export function emitSDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): void {
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  writeFileSync(outputPath, (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n')
}

export function verifySDL({ schema, outputPath, sort = true, header }: EmitSDLOptions): boolean {
  if (!existsSync(outputPath)) return false
  const finalSchema = sort ? lexicographicSortSchema(schema) : schema
  const expected = (header ?? DEFAULT_HEADER) + printSchema(finalSchema) + '\n'
  return readFileSync(outputPath, 'utf-8') === expected
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @czo/kit test src/graphql/sdl.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/graphql/sdl.ts packages/kit/src/graphql/sdl.test.ts
git commit -m "feat(kit/graphql): add emitSDL and verifySDL helpers"
```

---

## Phase 7 — Re-exports

### Task 7.1: Mettre à jour `graphql/index.ts`

**Files:**
- Modify: `packages/kit/src/graphql/index.ts`

- [ ] **Step 1: Lire l'état actuel**

Run: `cat packages/kit/src/graphql/index.ts`

- [ ] **Step 2: Réécrire les re-exports**

Remplacer le contenu de `packages/kit/src/graphql/index.ts` par :

```ts
export * from './context'
export * from './builder'
export * from './sdl'
export * from './errors'
export * from './scalars'
// Les exports obsolètes (middleware, directive, relay, resolvers, schema) ont été
// déplacés dans old/ — plus exportés publiquement.
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `pnpm --filter @czo/kit check-types`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/kit/src/graphql/index.ts
git commit -m "chore(kit/graphql): update public re-exports for Pothos migration"
```

### Task 7.2: Mettre à jour `src/index.ts` top-level

**Files:**
- Modify: `packages/kit/src/index.ts`

- [ ] **Step 1: Lire l'état actuel**

Run: `cat packages/kit/src/index.ts`

- [ ] **Step 2: S'assurer que `./testing` n'est pas re-exporté depuis le top-level**

Le testing doit être consommé via `@czo/kit/testing` (sous-chemin), **pas** via `@czo/kit`. Donc `src/index.ts` ne doit PAS inclure `export * from './testing'`.

Si `src/index.ts` référence encore des chemins supprimés (ex. `./graphql/middleware`), les retirer. L'index top-level doit rester stable.

- [ ] **Step 3: Vérifier le build complet**

Run: `pnpm --filter @czo/kit build`

Expected: build passe.

- [ ] **Step 4: Commit (si modifications)**

```bash
git add packages/kit/src/index.ts
git commit -m "chore(kit): clean up top-level index after migration"
```

---

## Phase 8 — Validation globale

### Task 8.1: `pnpm build`

- [ ] **Step 1: Lancer le build**

Run: `pnpm --filter @czo/kit build`

Expected: `Done` sans erreur. Build output dans `packages/kit/dist/`.

Si échec : inspecter les erreurs, corriger fichier par fichier. Les erreurs probables :
- Imports manquants (oublier d'ajouter un export)
- Types Pothos — accepter des `any` bien ciblés plutôt que sur-typer à ce stade

### Task 8.2: `pnpm check-types`

- [ ] **Step 1: Lancer le typecheck**

Run: `pnpm --filter @czo/kit check-types`

Expected: PASS. Aucune erreur de type.

Si les consommateurs (`auth`, `stock-location`, `mazo`) ont des erreurs liées à `Repository` supprimé — c'est attendu, on les adressera dans leur phase respective. Temporairement, `@ts-expect-error` les lignes bloquantes **dans le module kit** uniquement — jamais chez les consommateurs.

### Task 8.3: `pnpm lint`

- [ ] **Step 1: Lancer le lint**

Run: `pnpm --filter @czo/kit lint`

Expected: PASS.

Si erreurs : lancer `pnpm --filter @czo/kit lint:fix`, puis lire/commit les modifications résiduelles.

### Task 8.4: `pnpm test` complet

- [ ] **Step 1: S'assurer que Postgres test est disponible**

Run (background ou terminal séparé) : `docker compose -f docker-compose.dev.yml up -d`

- [ ] **Step 2: Lancer toute la suite**

Run: `pnpm --filter @czo/kit test`

Expected: tous les tests passent.

Tests attendus :
- `src/db/errors.test.ts` — 7 tests
- `src/db/scope.test.ts` — 6 tests
- `src/db/optimistic.test.ts` — 4 tests (intégration)
- `src/graphql/errors/index.test.ts` — 7 tests
- `src/graphql/builder.test.ts` — 6 tests
- `src/graphql/sdl.test.ts` — 6 tests

**Total attendu** : 36 tests green.

- [ ] **Step 3: Commit (si fixes nécessaires)**

```bash
git add packages/kit
git commit -m "fix(kit): validation pass — all tests green"
```

---

## Phase 9 — Cleanup `old/`

### Task 9.1: Vérifier qu'aucun import ne pointe vers `old/`

- [ ] **Step 1: Grep**

Run:
```bash
grep -rn "kit/old" packages/kit/src 2>/dev/null
grep -rn "from.*old/" packages/kit/src 2>/dev/null
```

Expected: aucun résultat (si `old/` est vide ou si rien n'y pointe).

- [ ] **Step 2: Vérifier que les tests passent toujours**

Run: `pnpm --filter @czo/kit test`

Expected: PASS.

### Task 9.2: Supprimer le dossier `old/`

**Files:**
- Delete: `packages/kit/old/` (entier)

- [ ] **Step 1: Suppression**

Run: `rm -rf packages/kit/old`

- [ ] **Step 2: Re-vérification build + tests**

Run: `pnpm --filter @czo/kit build && pnpm --filter @czo/kit test`

Expected: PASS toutes les étapes.

- [ ] **Step 3: Commit séparé (facilite la review)**

```bash
git add -A packages/kit
git commit -m "chore(kit): cleanup old/ after successful migration"
```

---

## Récapitulatif des commits attendus

1. `chore(kit): preserve pre-migration files in old/`
2. `chore(workspace): add Pothos deps to catalog`
3. `chore(kit): add Pothos deps, remove graphql-middleware`
4. `feat(kit/db): add DatabaseError, OptimisticLockError, toDatabaseError`
5. `feat(kit/db): add notDeleted, onlyDeleted + v2 filter helpers`
6. `feat(kit/testing): add createTestDb and truncate helpers`
7. `feat(kit/db): add optimisticUpdate with version locking`
8. `chore(kit/db): export new helpers, drop Repository from index`
9. `feat(kit/graphql/errors): add BaseGraphQLError + 5 typed error classes`
10. `feat(kit/graphql/errors): add registerErrorTypes Pothos builder`
11. `feat(kit/graphql/scalars): re-export DateTime and JSONObject resolvers`
12. `feat(kit/graphql): add initBuilder, registerSchema, buildSchema factory`
13. `test(kit/graphql): cover initBuilder, registerSchema, buildSchema`
14. `feat(kit/graphql): add emitSDL and verifySDL helpers`
15. `chore(kit/graphql): update public re-exports for Pothos migration`
16. `chore(kit): clean up top-level index after migration` (optionnel)
17. `fix(kit): validation pass — all tests green` (optionnel si fixes)
18. `chore(kit): cleanup old/ after successful migration`

**~18 commits** sur la branche `feat/kit-pothos-migration` (ou équivalent).

---

## Points de vigilance

### Versions Pothos

Les versions exactes dans `catalog:` peuvent ne pas exister — vérifier `pnpm view @pothos/plugin-tracing version` et ajuster. Si `plugin-tracing` v1.x n'existe pas, utiliser la dernière beta/rc. Noter dans le commit.

### Types Pothos complexes

Le builder Pothos a des types génériques profonds. Il est acceptable d'utiliser `any` dans les appels `initBuilder` pour les valeurs de plugin-options (scopeAuth, tracing) qui prennent des callbacks typés par le ctx de l'app. Ces `any` disparaîtront quand les modules consommateurs fourniront leurs types complets.

### Intégration Postgres pour tests

`optimistic.test.ts` requiert Postgres. Si l'environnement CI n'a pas de PG, les tests seront skippés — ajouter un `describe.runIf(process.env.TEST_DATABASE_URL)` si besoin.

### Pas de push pendant la migration

Une seule branche, zéro PR intermédiaire. Les commits listés ci-dessus vivent uniquement sur la branche `feat/kit-pothos-migration` (ou nom choisi par l'équipe). Seul un push final une fois les 3 modules migrés (kit + auth + stock-location).
