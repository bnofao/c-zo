# TRD: Module Kit (@czo/kit)

**Status**: In Progress
**Author**: Claude (Briana)
**Created**: 2026-02-04
**Last Updated**: 2026-02-08
**Related PRD**: [prd.md](./prd.md)

---

## 1. Overview

Le module `@czo/kit` est le toolkit fondamental de c-zo. Cette évolution ajoute les composants suivants :

**Implémentés (Sprint-01) :**
- **Repository** : Classe abstraite `Repository<T,U,V>` pour CRUD avec Drizzle, optimistic locking, soft delete, hooks lifecycle
- **Cache** : Export de `useCache` (alias de `useStorage` de Nitro)

**À implémenter :**
- **Events** : Sync (hookable) + async (BullMQ)
- **Apps** : Système d'applications tierces avec webhooks

> **Note Sprint-01** : L'approche a pivoté de builders fonctionnels vers une classe abstraite. Les hooks sont maintenant intégrés dans la classe Repository plutôt qu'un système séparé.

## 2. Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              c-zo Platform                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│   │ @czo/product│    │ @czo/order  │    │ @czo/auth   │  Domain Modules     │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                     │
│          │                  │                  │                             │
│          └──────────────────┼──────────────────┘                             │
│                             │                                                │
│                             ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         @czo/kit                                     │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │   │
│   │  │Repository│  │  Cache   │  │  Events  │  │  Hooks   │  │  Apps  │ │   │
│   │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │   │
│   └───────┼─────────────┼────────────┼─────────────┼─────────────┼──────┘   │
│           │             │            │             │             │           │
│           ▼             ▼            ▼             ▼             ▼           │
│   ┌───────────┐  ┌───────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐     │
│   │ Drizzle   │  │  Nitro    │  │ hookable│  │ hookable│  │  BullMQ   │     │
│   │   ORM     │  │  Cache    │  │ + BullMQ│  │         │  │  + HTTP   │     │
│   └─────┬─────┘  └─────┬─────┘  └────┬────┘  └─────────┘  └─────┬─────┘     │
│         │              │             │                          │           │
│         ▼              ▼             ▼                          ▼           │
│   ┌───────────┐  ┌───────────┐  ┌─────────┐              ┌───────────┐     │
│   │PostgreSQL │  │   Redis   │  │  Redis  │              │ External  │     │
│   │           │  │           │  │ (Queue) │              │   Apps    │     │
│   └───────────┘  └───────────┘  └─────────┘              └───────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Diagram (Implémentation Actuelle)

```
packages/kit/
├── src/
│   ├── index.ts                      # Main exports (module, ioc, logger)
│   │
│   ├── db/
│   │   ├── index.ts                  # useDatabase + Repository exports
│   │   ├── manager.ts                # useDatabase implementation (master/replicas)
│   │   └── repository.ts             # ✅ Classe abstraite Repository<T,U,V>
│   │                                  #    - CRUD: findFirst, findMany, create, update, delete
│   │                                  #    - Optimistic locking: version + expectedVersion
│   │                                  #    - Soft delete: soft param + restore()
│   │                                  #    - Hooks: beforeCreate, afterUpdate, etc.
│   │                                  #    - Errors: OptimisticLockError, DatabaseError
│   │
│   ├── cache/
│   │   └── index.ts                  # ✅ Export useCache (alias useStorage)
│   │
│   ├── events/                       # 🔲 À implémenter
│   │   ├── index.ts                  # useEvents export
│   │   ├── emitter.ts                # EventEmitter implementation
│   │   └── queue.ts                  # BullMQ integration for async
│   │
│   ├── apps/                         # 🔲 À implémenter
│   │   ├── index.ts                  # useAppRegistry export
│   │   ├── registry.ts               # AppRegistry implementation
│   │   ├── dispatcher.ts             # WebhookDispatcher
│   │   └── permission-checker.ts     # AppPermissionChecker (uses @czo/auth)
│   │
│   ├── graphql/                      # ✅ Existant
│   │   └── ...
│   │
│   └── module/                       # ✅ Existant
│       └── ...
│
├── package.json                      # ✅ peerDependencies: nitro (optional)
└── tests/
    └── ...
```

**Légende:** ✅ Implémenté | 🔲 À faire

### Package Exports (Actuels)

```json
{
  "exports": {
    ".": "./dist/index.mjs",           // Core: module, ioc, logger
    "./db": "./dist/db/index.mjs",     // ✅ useDatabase, Repository, errors
    "./cache": "./dist/cache/index.mjs", // ✅ useCache (alias useStorage)
    "./graphql": "./dist/graphql/index.mjs", // ✅ registerResolvers, etc.
    "./module": "./dist/module/index.mjs"    // ✅ defineNitroModule
  },
  "peerDependencies": {
    "nitro": "^2.0.0 || ^3.0.0"        // ✅ Optional pour cache
  }
}
```

**Note :** Le sous-export `./db/repository` a été supprimé - Repository est exporté depuis `./db`.

### Components

| Component | Technology | Purpose | Status | Dependencies |
|-----------|------------|---------|--------|--------------|
| Repository | Classe abstraite `Repository<T,U,V>` | Generic CRUD with Drizzle | ✅ Done | drizzle-orm |
| Cache | `useCache` (alias useStorage) | Accès au cache Nitro | ✅ Done | nitro (peer) |
| Events | EventEmitter | Inter-module communication | 🔲 TODO | hookable, bullmq |
| Apps | AppRegistry | Third-party integrations | 🔲 TODO | @czo/auth, bullmq |

**Note :** Le composant Hooks est maintenant intégré dans Repository (méthodes lifecycle).

## 3. Detailed Design

### 3.1 Repository

> **⚠️ PIVOT Sprint-01** : L'architecture a changé de "builders séparés" vers une "classe abstraite".
> La documentation ci-dessous reflète l'implémentation actuelle.

#### Architecture Actuelle: Classe Abstraite

Le repository utilise une **classe abstraite** que les modules étendent :

```
┌─────────────────────────────────────────────────────────────────┐
│               Repository<T, U, V, TClient>                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Queries                          Mutations                     │
│   ├── findFirst(opts?)             ├── create(value, opts?)     │
│   ├── findMany(opts?)              ├── createMany(values, opts?)│
│   ├── paginateByOffset(opts?)      ├── update(value, opts?)     │
│   └── [columns getter]             ├── delete(opts?)            │
│                                    └── restore(opts?)           │
│                                                                  │
│   Hooks (à override)               Features                     │
│   ├── beforeCreate(row)            ├── Optimistic locking       │
│   ├── afterCreate(row)             │   (version + expectedVersion│
│   ├── beforeUpdate(row)            ├── Soft delete              │
│   ├── afterUpdate(row)             │   (soft: true + restore)   │
│   ├── afterDelete(row)             └── Transactions (opts.tx)   │
│   └── afterFind(row)                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages de cette approche :**
- **Hooks intégrés** : beforeCreate, afterUpdate, etc. comme méthodes à override
- **API familière** : Pattern OOP classique, facile à comprendre
- **Pragmatisme** : Réutilisation de code existant éprouvé

**Trade-offs acceptés :**
- ❌ Moins de tree-shaking (toute la classe est importée)
- ❌ Testing avec mocking de classes
- ✅ Moins de boilerplate que les builders

#### Types Implémentés

```typescript
// Erreurs
export class DatabaseError extends Error {
  fieldErrors: Record<string, string[] | undefined>
}

export class OptimisticLockError extends Error {
  readonly entityId: string
  readonly expectedVersion: number
  readonly actualVersion: number | null
}

// Config types
export type FindFirstQueryConfig<T, U> = DBQueryConfig<...> & {
  tx?: Transaction<T>
  includeDeleted?: boolean  // Inclure les soft-deleted
}

export type FindManyQueryConfig<T, U> = DBQueryConfig<...> & {
  tx?: Transaction<T>
  includeDeleted?: boolean
}

export type PaginateByOffsetQueryConfig<T, U> = ... & {
  page?: number
  perPage?: number
  sortBy?: keyof columns
  sortDirection?: 'asc' | 'desc'
  tx?: Transaction<T>
  includeDeleted?: boolean
}
```

#### Classe Repository

```typescript
// @czo/kit/db/repository.ts

export abstract class Repository<
  T extends Record<string, unknown>,  // Schema type (pour relations)
  U extends PgTableWithColumns<any>,  // Table type
  V extends keyof ExtractTablesWithRelations<T>,  // Model name
  TClient extends NodePgClient = Pool,
> {
  db: Database<T, TClient>
  table: U

  constructor(db: Database<T, TClient>, table: U)

  // === Queries ===

  async findFirst<QConfig>(opts?: FindFirstOpts<QConfig>)
  // - Utilise db.query[modelName].findFirst()
  // - Supporte relations via opts.with
  // - Filtre auto deletedAt IS NULL si includeDeleted !== true

  async findMany<QConfig>(opts?: FindManyOpts<QConfig>)
  // - Pagination via limit/offset
  // - Filtre auto soft-deleted

  async paginateByOffset<QConfig>(opts?: PaginateByOffsetOpts<QConfig>)
  // - Pagination page/perPage
  // - Retourne { rows, next, previous, page, perPage, totalPages, totalRows }

  // === Mutations ===

  async create(value, opts?)
  // - Auto version: 1 si colonne existe
  // - Appelle beforeCreate/afterCreate

  async createMany(values, opts?)
  // - Batch insert
  // - Appelle beforeCreate/afterCreate pour chaque row

  async update(value, opts?)
  // - expectedVersion?: number pour locking
  // - Auto version = version + 1
  // - Throw OptimisticLockError si version mismatch
  // - Appelle beforeUpdate/afterUpdate

  async delete(opts?)
  // - soft?: boolean → SET deletedAt = NOW() au lieu de DELETE
  // - Appelle afterDelete

  async restore(opts?)
  // - SET deletedAt = NULL
  // - Uniquement si table a deletedAt

  // === Hooks (à override) ===

  async beforeCreate(row: PgInsertValue<U>) {}
  async afterCreate(row: InferSelectModel<U>) {}
  async beforeUpdate(row: PgUpdateSetSource<U>) {}
  async afterUpdate(row: InferSelectModel<U>) {}
  async afterDelete(row: InferSelectModel<U>) {}
  async afterFind(row: InferSelectModel<U>) {}
}
```

#### Exemple d'Utilisation

```typescript
// @czo/product/repositories/product.repository.ts

import { Repository } from '@czo/kit/db'
import type { Database } from '@czo/kit/db'
import { products } from '../database/schema'
import type { Schema } from '../database/schema'

export class ProductRepository extends Repository<
  Schema,
  typeof products,
  'products'
> {
  constructor(db: Database<Schema>) {
    super(db, products)
  }

  // Hook: validation avant création
  async beforeCreate(row: typeof products.$inferInsert) {
    if (row.price && row.price < 0) {
      throw new Error('Price cannot be negative')
    }
  }

  // Hook: logging après création
  async afterCreate(row: typeof products.$inferSelect) {
    console.log(`Product created: ${row.id}`)
  }

  // Méthode custom
  async findByHandle(handle: string) {
    return this.findFirst({
      where: (columns, { eq }) => eq(columns.handle, handle),
    })
  }

  // Méthode custom avec update optimiste
  async publish(id: string, expectedVersion: number) {
    return this.update(
      { status: 'published' },
      {
        where: (columns, { eq }) => eq(columns.id, id),
        expectedVersion,
      }
    )
  }
}

// Enregistrement dans le container
container.singleton('productRepository', () => {
  const db = useDatabase<Schema>()
  return new ProductRepository(db)
})
```

---

#### ~~Architecture Historique: Builders Séparés~~ (Abandonné)

> La section ci-dessous documente l'approche initialement planifiée mais abandonnée lors du Sprint-01.

Le repository utilisait des **builders séparés** pour permettre une composition granulaire et un tree-shaking optimal :

```
┌─────────────────────────────────────────────────────────────────┐
│                    Repository Builders                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   createQueries()          createMutations()                    │
│   ├── findById             ├── create                           │
│   ├── findByIds            ├── createMany                       │
│   ├── findOne              ├── update                           │
│   ├── findMany             ├── delete                           │
│   ├── count                ├── hardDelete                       │
│   └── exists               └── restore (si softDelete)          │
│                                                                  │
│   createCachedQueries()    createRepository()                   │
│   └── Queries + cache      └── All-in-one (queries + mutations) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages :**
- **Tree-shaking** : Importer uniquement ce qu'on utilise
- **Type safety** : Chaque builder a son propre type de retour
- **Read-only repos** : `createQueries()` seul pour les vues
- **Flexibilité** : Composer les méthodes à la carte

#### Types

```typescript
// @czo/kit/db/repository/types.ts

export interface BaseEntity {
  id: string
  version: number          // Optimistic locking
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null   // Soft delete
}

export interface FindManyOptions<T> {
  where?: WhereClause<T>
  orderBy?: OrderByClause<T>
  limit?: number           // Max 100, default 50
  offset?: number
  cursor?: string
}

export interface PaginatedResult<T> {
  nodes: T[]
  totalCount: number
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor?: string
    endCursor?: string
  }
}

export interface BaseConfig<TTable extends PgTable> {
  table: TTable
  softDelete?: boolean     // Default: true
}

export interface CacheConfig {
  manager: CacheManager
  prefix: string
  ttl?: number             // Default: 300 (5 min)
}

export interface RepositoryConfig<TTable extends PgTable> extends BaseConfig<TTable> {
  cache?: CacheConfig
}
```

#### Builders Implementation

##### createQueries (Read-only operations)

```typescript
// @czo/kit/db/repository/queries.ts

export function createQueries<T extends BaseEntity, TTable extends PgTable>(
  db: DrizzleDatabase,
  config: BaseConfig<TTable>
) {
  const { table, softDelete = true } = config

  const findById = async (id: string): Promise<T | null> => {
    let query = db.select().from(table).where(eq(table.id, id))
    if (softDelete) query = query.where(isNull(table.deletedAt))
    const result = await query.limit(1)
    return (result[0] as T) ?? null
  }

  const findByIds = async (ids: string[]): Promise<T[]> => {
    if (ids.length === 0) return []
    let query = db.select().from(table).where(inArray(table.id, ids))
    if (softDelete) query = query.where(isNull(table.deletedAt))
    return query as Promise<T[]>
  }

  const findOne = async (where: WhereClause<T>): Promise<T | null> => {
    let query = db.select().from(table)
    query = applyWhere(query, where)
    if (softDelete) query = query.where(isNull(table.deletedAt))
    const result = await query.limit(1)
    return (result[0] as T) ?? null
  }

  const findMany = async (options: FindManyOptions<T> = {}): Promise<PaginatedResult<T>> => {
    const { where, orderBy, limit = 50, offset = 0 } = options

    let query = db.select().from(table)
    if (softDelete) query = query.where(isNull(table.deletedAt))
    if (where) query = applyWhere(query, where)
    if (orderBy) query = applyOrderBy(query, orderBy)

    const [nodes, countResult] = await Promise.all([
      query.limit(Math.min(limit, 100)).offset(offset),
      db.select({ count: sql`count(*)` }).from(table)
        .where(softDelete ? isNull(table.deletedAt) : undefined)
    ])

    const totalCount = Number(countResult[0]?.count ?? 0)

    return {
      nodes: nodes as T[],
      totalCount,
      pageInfo: {
        hasNextPage: offset + nodes.length < totalCount,
        hasPreviousPage: offset > 0,
      }
    }
  }

  const count = async (where?: WhereClause<T>): Promise<number> => {
    let query = db.select({ count: sql`count(*)` }).from(table)
    if (softDelete) query = query.where(isNull(table.deletedAt))
    if (where) query = applyWhere(query, where)
    const result = await query
    return Number(result[0]?.count ?? 0)
  }

  const exists = async (where: WhereClause<T>): Promise<boolean> => {
    const result = await findOne(where)
    return result !== null
  }

  return {
    findById,
    findByIds,
    findOne,
    findMany,
    count,
    exists,
    _db: db,
    _table: table,
    _config: config,
  }
}

export type Queries<T> = ReturnType<typeof createQueries<T, any>>
```

##### createCachedQueries (Queries with Nitro cache)

```typescript
// @czo/kit/db/repository/cached-queries.ts

import { defineCachedFunction } from 'nitropack/runtime'

export function createCachedQueries<T extends BaseEntity, TTable extends PgTable>(
  db: DrizzleDatabase,
  config: BaseConfig<TTable> & { cache: { prefix: string; ttl?: number } }
) {
  const { cache, ...baseConfig } = config
  const queries = createQueries<T, TTable>(db, baseConfig)
  const { prefix, ttl = 300 } = cache

  // Wrap findById avec Nitro cache (SWR inclus)
  const findById = defineCachedFunction(
    (id: string) => queries.findById(id),
    {
      maxAge: ttl,
      swr: true,
      staleMaxAge: ttl * 12,
      getKey: (id) => `${prefix}:${id}`,
      name: `${prefix}:findById`,
    }
  )

  // Wrap findByIds avec Nitro cache
  const findByIds = defineCachedFunction(
    (ids: string[]) => queries.findByIds(ids),
    {
      maxAge: ttl,
      swr: true,
      getKey: (ids) => `${prefix}:batch:${ids.sort().join(',')}`,
      name: `${prefix}:findByIds`,
    }
  )

  // Helpers d'invalidation via CacheManager
  const invalidateCache = async (id: string): Promise<void> => {
    const cacheManager = useCacheManager()
    await cacheManager.delete(`${prefix}:${id}`)
    await cacheManager.invalidate(`${prefix}:${id}:*`)
  }

  const invalidateAllCache = async (): Promise<number> => {
    const cacheManager = useCacheManager()
    return cacheManager.invalidate(`${prefix}:*`)
  }

  return {
    ...queries,
    findById,       // Version Nitro cached
    findByIds,      // Version Nitro cached
    invalidateCache,
    invalidateAllCache,
    _cache: { prefix, ttl },
  }
}

export type CachedQueries<T> = ReturnType<typeof createCachedQueries<T, any>>
```

##### createMutations (Write operations)

```typescript
// @czo/kit/db/repository/mutations.ts

export function createMutations<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
  TTable extends PgTable
>(
  db: DrizzleDatabase,
  config: BaseConfig<TTable> & { cache?: CacheConfig }
) {
  const { table, softDelete = true, cache } = config

  const create = async (input: CreateInput): Promise<T> => {
    const result = await db.insert(table).values({
      ...(input as any),
      id: generateId(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning()

    return result[0] as T
  }

  const createMany = async (inputs: CreateInput[]): Promise<T[]> => {
    if (inputs.length === 0) return []
    const now = new Date()
    const result = await db.insert(table).values(
      inputs.map(input => ({
        ...(input as any),
        id: generateId(),
        version: 1,
        createdAt: now,
        updatedAt: now,
      }))
    ).returning()

    return result as T[]
  }

  const update = async (
    id: string,
    input: UpdateInput & { expectedVersion: number }
  ): Promise<T> => {
    const { expectedVersion, ...data } = input

    const result = await db
      .update(table)
      .set({
        ...(data as any),
        version: sql`${table.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(table.id, id),
        eq(table.version, expectedVersion),
        softDelete ? isNull(table.deletedAt) : undefined
      ))
      .returning()

    if (result.length === 0) {
      throw new OptimisticLockError(id, expectedVersion)
    }

    // Invalidate cache
    if (cache) await cache.manager.delete(`${cache.prefix}:${id}`)

    return result[0] as T
  }

  const remove = async (id: string): Promise<{ success: boolean; deletedAt: Date }> => {
    const deletedAt = new Date()

    const result = softDelete
      ? await db.update(table).set({ deletedAt }).where(eq(table.id, id)).returning()
      : await db.delete(table).where(eq(table.id, id)).returning()

    if (result.length === 0) {
      throw new NotFoundError(id)
    }

    if (cache) await cache.manager.delete(`${cache.prefix}:${id}`)

    return { success: true, deletedAt }
  }

  const hardDelete = async (id: string): Promise<boolean> => {
    const result = await db.delete(table).where(eq(table.id, id)).returning()
    if (cache) await cache.manager.delete(`${cache.prefix}:${id}`)
    return result.length > 0
  }

  // Soft-delete specific methods (only if softDelete enabled)
  const restore = softDelete
    ? async (id: string): Promise<T> => {
        const result = await db
          .update(table)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(table.id, id))
          .returning()

        if (result.length === 0) {
          throw new NotFoundError(id)
        }

        return result[0] as T
      }
    : undefined

  // Build mutations object conditionally
  const mutations = {
    create,
    createMany,
    update,
    delete: remove,
    hardDelete,
    ...(restore && { restore }),
    _db: db,
    _table: table,
    _config: config,
  }

  return mutations
}

export type Mutations<T, CreateInput, UpdateInput> = ReturnType<
  typeof createMutations<T, CreateInput, UpdateInput, any>
>
```

##### createRepository (All-in-one convenience)

```typescript
// @czo/kit/db/repository/create-repository.ts

export function createRepository<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
  TTable extends PgTable
>(
  db: DrizzleDatabase,
  config: RepositoryConfig<TTable>
) {
  const { cache, ...baseConfig } = config

  // Create queries (with or without cache)
  const queries = cache
    ? createCachedQueries<T, TTable>(db, { ...baseConfig, cache })
    : createQueries<T, TTable>(db, baseConfig)

  // Create mutations
  const mutations = createMutations<T, CreateInput, UpdateInput, TTable>(db, config)

  // Transaction helper
  const transaction = async <R>(
    fn: (repo: Repository<T, CreateInput, UpdateInput>) => Promise<R>
  ): Promise<R> => {
    return db.transaction(async (tx) => {
      const txRepo = createRepository<T, CreateInput, UpdateInput, TTable>(tx as any, config)
      return fn(txRepo)
    })
  }

  return {
    ...queries,
    ...mutations,
    transaction,
  }
}

export type Repository<T, CreateInput, UpdateInput> = ReturnType<
  typeof createRepository<T, CreateInput, UpdateInput, any>
>
```

#### Usage Examples

##### Example 1: Full Repository (All-in-one)

```typescript
// @czo/product/repositories/product.repository.ts

export function createProductRepository(db: DrizzleDatabase, cache?: CacheManager) {
  const base = createRepository<Product, CreateProductInput, UpdateProductInput, typeof products>(
    db,
    {
      table: products,
      softDelete: true,
      cache: cache ? { manager: cache, prefix: 'product', ttl: 300 } : undefined,
    }
  )

  // Domain-specific extensions via composition
  const findByHandle = async (handle: string): Promise<Product | null> => {
    return base.findOne({ handle })
  }

  const publish = async (id: string, expectedVersion: number): Promise<Product> => {
    return base.update(id, { status: 'published', expectedVersion } as any)
  }

  return {
    ...base,
    findByHandle,
    publish,
  }
}

export type ProductRepository = ReturnType<typeof createProductRepository>
```

##### Example 2: Read-Only Repository (Queries only)

```typescript
// @czo/analytics/repositories/product-stats.repository.ts
import { createQueries } from '@czo/kit/db/repository'

// Read-only view - no mutations needed
export function createProductStatsRepository(db: DrizzleDatabase) {
  const queries = createQueries<ProductStats, typeof productStats>(db, {
    table: productStats,
    softDelete: false,  // Stats don't have soft-delete
  })

  const findTopSelling = async (limit = 10): Promise<ProductStats[]> => {
    const result = await queries.findMany({
      orderBy: { totalSales: 'desc' },
      limit,
    })
    return result.nodes
  }

  return {
    ...queries,
    findTopSelling,
  }
}
```

##### Example 3: Cached Queries + Custom Mutations

```typescript
// @czo/catalog/repositories/category.repository.ts
import { createCachedQueries, createMutations } from '@czo/kit/db/repository'

export function createCategoryRepository(db: DrizzleDatabase, cache: CacheManager) {
  // Cached queries for frequent reads
  const queries = createCachedQueries<Category, typeof categories>(db, {
    table: categories,
    softDelete: true,
    cache: { manager: cache, prefix: 'category', ttl: 600 },  // 10 min cache
  })

  // Only create and update mutations (no delete allowed)
  const { create, update } = createMutations<Category, CreateCategoryInput, UpdateCategoryInput, typeof categories>(
    db,
    { table: categories, softDelete: true, cache: { manager: cache, prefix: 'category' } }
  )

  return {
    ...queries,
    create,
    update,
    // No delete, restore, hardDelete exposed
  }
}
```

##### Example 4: Minimal Repository (Cherry-pick methods)

```typescript
// @czo/inventory/repositories/stock.repository.ts
import { createQueries, createMutations } from '@czo/kit/db/repository'

export function createStockRepository(db: DrizzleDatabase) {
  const { findById, findMany } = createQueries<Stock, typeof stocks>(db, {
    table: stocks,
    softDelete: false,
  })

  const { update } = createMutations<Stock, CreateStockInput, UpdateStockInput, typeof stocks>(
    db,
    { table: stocks, softDelete: false }
  )

  // Only expose what's needed
  return {
    findById,
    findMany,
    update,  // Stock is updated, never created/deleted directly
  }
}
```

##### Example 5: GraphQL DataLoader Integration

```typescript
// @czo/product/loaders/product.loader.ts
import { createCachedQueries } from '@czo/kit/db/repository'
import DataLoader from 'dataloader'

export function createProductLoader(db: DrizzleDatabase) {
  // createCachedQueries utilise Nitro cache en interne
  const { findByIds } = createCachedQueries<Product, typeof products>(db, {
    table: products,
    softDelete: true,
    cache: { prefix: 'product', ttl: 60 },
  })

  return new DataLoader<string, Product | null>(async (ids) => {
    const products = await findByIds([...ids])
    const productMap = new Map(products.map(p => [p.id, p]))
    return ids.map(id => productMap.get(id) ?? null)
  })
}
```

### 3.2 Cache (Approche Simplifiée)

> **⚠️ PIVOT Sprint-01** : L'approche CacheManager complexe a été abandonnée. Kit exporte simplement `useCache` (alias de `useStorage` de Nitro). Les modules gèrent leur cache directement avec les APIs Nitro.

#### Architecture Actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cache (Simplifié)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   @czo/kit/cache                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  export { useStorage as useCache } from 'nitro/runtime'  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│   Modules utilisent directement les APIs Nitro :                 │
│   ┌─────────────────────┐  ┌─────────────────────────────┐      │
│   │ useCache()          │  │ defineCachedFunction()      │      │
│   │ ├── getItem()       │  │ ├── Wrap function avec SWR  │      │
│   │ ├── setItem()       │  │ ├── maxAge, staleMaxAge     │      │
│   │ ├── removeItem()    │  │ └── getKey()                │      │
│   │ └── getKeys()       │  │                             │      │
│   └─────────────────────┘  └─────────────────────────────┘      │
│                             │                                    │
│                             ▼                                    │
│              ┌──────────────────────────────┐                    │
│              │      nitro.config.ts         │                    │
│              │  storage: { cache: {...} }   │                    │
│              └──────────────────────────────┘                    │
│                             │                                    │
│              ┌──────────────┼──────────────┐                     │
│              ▼              ▼              ▼                     │
│         ┌────────┐    ┌─────────┐    ┌─────────┐                │
│         │ memory │    │  redis  │    │   fs    │                │
│         │ (dev)  │    │ (prod)  │    │ (debug) │                │
│         └────────┘    └─────────┘    └─────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Implementation (Implémentée)

```typescript
// @czo/kit/cache/index.ts

/**
 * Export direct de useStorage de Nitro comme useCache
 * Les modules gèrent leur cache directement avec les APIs Nitro
 */
export { useStorage as useCache } from 'nitro/runtime'
```

**Avantages de cette approche :**
- ✅ Zéro abstraction supplémentaire
- ✅ Accès direct aux APIs Nitro puissantes
- ✅ Configuration centralisée dans `nitro.config.ts`
- ✅ SWR intégré via `defineCachedFunction`
- ✅ Moins de code à maintenir

**Trade-offs acceptés :**
- ❌ Moins d'uniformité entre modules (chacun gère son cache)
- ❌ Pas d'invalidation par tags built-in (à faire si besoin)

#### Configuration Storage (À faire - Issue #38)

```typescript
// apps/mazo/nitro.config.ts

export default defineNitroConfig({
  storage: {
    cache: {
      driver: process.env.NODE_ENV === 'production' ? 'redis' : 'memory',
      // Redis config (prod)
      ...(process.env.REDIS_URL && {
        url: process.env.REDIS_URL,
        ttl: 300,  // Default TTL 5 min
      }),
    },
  },

  // Route-level caching (optional)
  routeRules: {
    '/api/products/**': {
      cache: { maxAge: 60, swr: true },
    },
  },
})
```

#### Usage dans les Modules

##### Exemple 1: Cache manuel avec useCache

```typescript
// @czo/product/services/product.service.ts

import { useCache } from '@czo/kit/cache'

export class ProductService {
  async getProductById(id: string): Promise<Product | null> {
    const cache = useCache()
    const cacheKey = `product:${id}`

    // Check cache first
    const cached = await cache.getItem<Product>(cacheKey)
    if (cached) return cached

    // Fetch from DB
    const product = await this.repo.findFirst({
      where: (columns, { eq }) => eq(columns.id, id),
    })

    // Cache result
    if (product) {
      await cache.setItem(cacheKey, product, { ttl: 300 })
    }

    return product
  }

  async invalidateProduct(id: string): Promise<void> {
    const cache = useCache()
    await cache.removeItem(`product:${id}`)
  }
}
```

##### Exemple 2: SWR avec defineCachedFunction

```typescript
// @czo/product/queries/product.queries.ts

import { defineCachedFunction } from 'nitropack/runtime'

/**
 * Query cachée avec SWR - pattern recommandé pour les reads fréquents
 */
export const getProductById = defineCachedFunction(
  async (id: string): Promise<Product | null> => {
    const db = useDatabase()
    const result = await db.query.products.findFirst({
      where: (columns, { eq }) => eq(columns.id, id),
    })
    return result ?? null
  },
  {
    maxAge: 300,           // 5 min
    swr: true,             // Serve stale pendant refresh
    staleMaxAge: 3600,     // Stale acceptable 1h
    getKey: (id) => `product:${id}`,
    name: 'getProductById',
  }
)
```

#### ~~CacheManager~~ (Abandonné)

> L'approche CacheManager avec wrapper autour de Nitro storage a été abandonnée.
> Les modules utilisent directement `useCache()` ou `defineCachedFunction()`.

~~```typescript
// @czo/kit/cache/manager.ts - ABANDONNÉ
export function useCacheManager(namespace?: string): CacheManager { ... }
```~~

### 3.3 Events

#### Types

```typescript
// @czo/kit/events/types.ts

export interface EventEmitter {
  // Emission
  emit<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E]
  ): Promise<void>

  emitAsync<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E],
    options?: AsyncEventOptions
  ): Promise<void>

  // Subscription
  on<E extends keyof EventMap>(
    event: E,
    handler: EventHandler<EventMap[E]>
  ): () => void  // Returns unsubscribe function

  once<E extends keyof EventMap>(
    event: E,
    handler: EventHandler<EventMap[E]>
  ): () => void

  off<E extends keyof EventMap>(
    event: E,
    handler?: EventHandler<EventMap[E]>
  ): void
}

export interface AsyncEventOptions {
  delay?: number        // Delay before execution (ms)
  retries?: number      // Number of retries (default: 3)
  priority?: 'high' | 'normal' | 'low'
}

export type EventHandler<T> = (payload: T, context: EventContext) => Promise<void>

export interface EventContext {
  eventId: string
  timestamp: Date
  actor?: Actor
  correlationId?: string
}

// Base event map - modules extend via declaration merging
export interface EventMap {
  'app.started': { timestamp: Date }
  'app.shutdown': { reason: string }
}
```

#### Module Augmentation Example

```typescript
// @czo/product/events.ts
declare module '@czo/kit/events' {
  interface EventMap {
    'product.created': { product: Product; actor: Actor }
    'product.updated': { product: Product; changes: Partial<Product>; actor: Actor }
    'product.deleted': { productId: string; actor: Actor }
    'product.published': { product: Product; actor: Actor }
  }
}
```

#### Implementation

```typescript
// @czo/kit/events/emitter.ts

import { Hookable } from 'hookable'
import { Queue, Worker } from 'bullmq'

export function createEventEmitter(config: EventConfig): EventEmitter {
  const hooks = new Hookable()
  let queue: Queue | undefined
  let worker: Worker | undefined

  if (config.async?.enabled) {
    queue = new Queue('events', { connection: config.async.redis })
    worker = new Worker('events', async (job) => {
      const { event, payload } = job.data
      await hooks.callHook(event, payload, {
        eventId: job.id!,
        timestamp: new Date(job.timestamp),
      })
    }, { connection: config.async.redis })
  }

  return {
    async emit<E extends keyof EventMap>(event: E, payload: EventMap[E]): Promise<void> {
      const context: EventContext = {
        eventId: generateId(),
        timestamp: new Date(),
      }
      await hooks.callHook(event as string, payload, context)
    },

    async emitAsync<E extends keyof EventMap>(
      event: E,
      payload: EventMap[E],
      options?: AsyncEventOptions
    ): Promise<void> {
      if (!queue) {
        // Fallback to sync if no queue
        return this.emit(event, payload)
      }

      await queue.add(event as string, { event, payload }, {
        delay: options?.delay,
        attempts: options?.retries ?? 3,
        priority: options?.priority === 'high' ? 1 : options?.priority === 'low' ? 10 : 5,
        backoff: { type: 'exponential', delay: 1000 },
      })
    },

    on<E extends keyof EventMap>(event: E, handler: EventHandler<EventMap[E]>): () => void {
      hooks.hook(event as string, handler)
      return () => hooks.removeHook(event as string, handler)
    },

    once<E extends keyof EventMap>(event: E, handler: EventHandler<EventMap[E]>): () => void {
      const wrappedHandler = async (payload: EventMap[E], context: EventContext) => {
        hooks.removeHook(event as string, wrappedHandler)
        await handler(payload, context)
      }
      hooks.hook(event as string, wrappedHandler)
      return () => hooks.removeHook(event as string, wrappedHandler)
    },

    off<E extends keyof EventMap>(event: E, handler?: EventHandler<EventMap[E]>): void {
      if (handler) {
        hooks.removeHook(event as string, handler)
      } else {
        hooks.removeAllHooks()
      }
    },
  }
}
```

### 3.4 Hooks

> **⚠️ PIVOT Sprint-01** : L'approche HookRegistry séparée a été abandonnée.
> Les hooks lifecycle sont maintenant **intégrés dans la classe Repository** comme méthodes à override :
> `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `afterDelete`, `afterFind`.
>
> Voir **Section 3.1 Repository** pour l'implémentation actuelle des hooks.

#### ~~Types~~ (Architecture Historique - Abandonné)

```typescript
// @czo/kit/hooks/types.ts - ABANDONNÉ

export interface HookRegistry {
  before<T extends keyof HookMap>(
    hook: T,
    handler: BeforeHook<HookMap[T]>
  ): () => void

  after<T extends keyof HookMap>(
    hook: T,
    handler: AfterHook<HookMap[T]>
  ): () => void

  onError<T extends keyof HookMap>(
    hook: T,
    handler: ErrorHook<HookMap[T]>
  ): () => void

  run<T extends keyof HookMap>(
    hook: T,
    context: HookContext<HookMap[T]>,
    fn: () => Promise<HookMap[T]['result']>
  ): Promise<HookMap[T]['result']>
}

export interface HookDefinition {
  input: unknown
  result: unknown
}

export type BeforeHook<T extends HookDefinition> = (
  context: HookContext<T>
) => Promise<HookContext<T> | void>

export type AfterHook<T extends HookDefinition> = (
  context: HookContext<T>,
  result: T['result']
) => Promise<T['result'] | void>

export type ErrorHook<T extends HookDefinition> = (
  context: HookContext<T>,
  error: Error
) => Promise<void>

export interface HookContext<T extends HookDefinition> {
  input: T['input']
  actor?: Actor
  metadata: Record<string, unknown>
}

// Base hook map - modules extend via declaration merging
export interface HookMap {
  'repository.create': { input: { entity: string; data: unknown }; result: unknown }
  'repository.update': { input: { entity: string; id: string; data: unknown }; result: unknown }
  'repository.delete': { input: { entity: string; id: string }; result: unknown }
}
```

#### Implementation

```typescript
// @czo/kit/hooks/registry.ts

import { createHooks } from 'hookable'

export function createHookRegistry(): HookRegistry {
  const beforeHooks = createHooks<Record<string, BeforeHook<any>>>()
  const afterHooks = createHooks<Record<string, AfterHook<any>>>()
  const errorHooks = createHooks<Record<string, ErrorHook<any>>>()

  return {
    before<T extends keyof HookMap>(hook: T, handler: BeforeHook<HookMap[T]>): () => void {
      beforeHooks.hook(`before:${String(hook)}`, handler)
      return () => beforeHooks.removeHook(`before:${String(hook)}`, handler)
    },

    after<T extends keyof HookMap>(hook: T, handler: AfterHook<HookMap[T]>): () => void {
      afterHooks.hook(`after:${String(hook)}`, handler)
      return () => afterHooks.removeHook(`after:${String(hook)}`, handler)
    },

    onError<T extends keyof HookMap>(hook: T, handler: ErrorHook<HookMap[T]>): () => void {
      errorHooks.hook(`error:${String(hook)}`, handler)
      return () => errorHooks.removeHook(`error:${String(hook)}`, handler)
    },

    async run<T extends keyof HookMap>(
      hook: T,
      context: HookContext<HookMap[T]>,
      fn: () => Promise<HookMap[T]['result']>
    ): Promise<HookMap[T]['result']> {
      try {
        // Run before hooks (can modify context)
        const modifiedContext = await beforeHooks.callHook(
          `before:${String(hook)}`,
          context
        ) ?? context

        // Execute the operation
        let result = await fn()

        // Run after hooks (can modify result)
        const modifiedResult = await afterHooks.callHook(
          `after:${String(hook)}`,
          modifiedContext,
          result
        )

        return modifiedResult ?? result
      } catch (error) {
        await errorHooks.callHook(`error:${String(hook)}`, context, error as Error)
        throw error
      }
    },
  }
}
```

### 3.5 Apps

#### Types

```typescript
// @czo/kit/apps/types.ts

export interface AppManifest {
  id: string                // Unique identifier (e.g., 'stripe-payments')
  name: string              // Display name
  version: string           // Semantic version
  author?: string
  homepage?: string
  appUrl: string            // App's base URL
  manifestUrl?: string      // URL to fetch this manifest

  permissions: AppPermission[]
  webhooks: WebhookSubscription[]

  extensions?: {
    dashboard?: DashboardExtension[]
    checkout?: CheckoutExtension[]
  }

  configSchema?: JSONSchema  // For app settings
}

export interface AppPermission {
  resource: string          // e.g., 'product', 'order', 'shop'
  actions: string[]         // e.g., ['read', 'update', 'delete']
  scope?: 'global' | 'shop' // global = cross-shop, shop = scoped
}

export interface WebhookSubscription {
  event: string             // Event to subscribe to
  targetUrl: string         // Relative URL on the app
  asyncEvents?: boolean     // Sync or async delivery
}

export interface DashboardExtension {
  id: string
  label: string
  mount: 'PRODUCT_DETAILS' | 'ORDER_DETAILS' | 'NAVIGATION' | 'SETTINGS'
  url: string               // URL to load in iframe
  permissions: AppPermission[]
}

export interface InstalledApp {
  id: string
  manifest: AppManifest
  shopId: string            // App installed for specific shop
  installedAt: Date
  installedBy: string       // userId who installed
  status: 'active' | 'disabled' | 'error'
  authToken: string         // Token for app to call c-zo API
  grantedPermissions: AppPermission[]
  config: Record<string, unknown>
}
```

#### AppRegistry

```typescript
// @czo/kit/apps/registry.ts

export interface AppRegistry {
  install(manifestUrl: string, shopId: string, userId: string): Promise<InstalledApp>
  uninstall(appId: string, shopId: string): Promise<void>
  getApp(appId: string): Promise<InstalledApp | null>
  listApps(shopId?: string): Promise<InstalledApp[]>
  updateApp(appId: string): Promise<InstalledApp>
  setAppConfig(appId: string, config: Record<string, unknown>): Promise<void>
  getAppConfig(appId: string): Promise<Record<string, unknown>>
}
```

#### WebhookDispatcher

```typescript
// @czo/kit/apps/dispatcher.ts

export interface WebhookDispatcher {
  dispatch(event: string, payload: unknown, shopId: string): Promise<WebhookResult[]>
  dispatchToApp(appId: string, event: string, payload: unknown): Promise<WebhookResult>
}

export interface WebhookResult {
  appId: string
  success: boolean
  statusCode?: number
  responseTime: number
  error?: string
  retryCount: number
}

export function createWebhookDispatcher(
  registry: AppRegistry,
  queue: Queue,
  httpClient: HttpClient
): WebhookDispatcher {
  return {
    async dispatch(event: string, payload: unknown, shopId: string): Promise<WebhookResult[]> {
      const apps = await registry.listApps(shopId)
      const subscribedApps = apps.filter(app =>
        app.manifest.webhooks.some(w => w.event === event)
      )

      const results = await Promise.allSettled(
        subscribedApps.map(app => this.dispatchToApp(app.id, event, payload))
      )

      return results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : {
          appId: subscribedApps[i].id,
          success: false,
          error: (r.reason as Error).message,
          responseTime: 0,
          retryCount: 0,
        }
      )
    },

    async dispatchToApp(appId: string, event: string, payload: unknown): Promise<WebhookResult> {
      const app = await registry.getApp(appId)
      if (!app) throw new Error(`App ${appId} not found`)

      const webhook = app.manifest.webhooks.find(w => w.event === event)
      if (!webhook) throw new Error(`App ${appId} not subscribed to ${event}`)

      const targetUrl = new URL(webhook.targetUrl, app.manifest.appUrl).toString()
      const signature = signPayload(payload, app.authToken)

      const start = Date.now()
      try {
        const response = await httpClient.post(targetUrl, {
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
            'X-CZO-Signature': signature,
            'X-CZO-Event': event,
            'X-CZO-App-Id': appId,
          },
          timeout: 30000,
        })

        return {
          appId,
          success: response.ok,
          statusCode: response.status,
          responseTime: Date.now() - start,
          retryCount: 0,
        }
      } catch (error) {
        // Queue for retry if async
        if (webhook.asyncEvents) {
          await queue.add('webhook-retry', { appId, event, payload }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          })
        }

        return {
          appId,
          success: false,
          error: (error as Error).message,
          responseTime: Date.now() - start,
          retryCount: 0,
        }
      }
    },
  }
}
```

#### Permission Checker (integration with @czo/auth)

```typescript
// @czo/kit/apps/permission-checker.ts

import type { PermissionService } from '@czo/auth'

export class AppPermissionChecker {
  constructor(private permissionService: PermissionService) {}

  async checkAppPermission(app: InstalledApp, permission: AppPermission): Promise<boolean> {
    const context = {
      userId: app.installedBy,
      shopId: app.shopId,
    }

    for (const action of permission.actions) {
      const hasPermission = await this.permissionService.hasPermission(
        context,
        permission.resource,
        action
      )
      if (!hasPermission) return false
    }

    return true
  }

  async validateInstallation(
    manifest: AppManifest,
    userId: string,
    shopId: string
  ): Promise<{ valid: boolean; missing: AppPermission[] }> {
    const missing: AppPermission[] = []

    for (const permission of manifest.permissions) {
      const context = { userId, shopId }

      for (const action of permission.actions) {
        const hasPermission = await this.permissionService.hasPermission(
          context,
          permission.resource,
          action
        )

        if (!hasPermission) {
          missing.push(permission)
          break
        }
      }
    }

    return { valid: missing.length === 0, missing }
  }
}
```

## 4. Database Design

### Tables

#### `installed_apps`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | App installation ID |
| app_id | text | NOT NULL | App identifier from manifest |
| shop_id | text | FK → shop.id | Shop where installed |
| installed_by | text | FK → user.id | User who installed |
| manifest | jsonb | NOT NULL | Cached manifest |
| auth_token | text | NOT NULL | Token for API calls |
| config | jsonb | DEFAULT '{}' | App configuration |
| status | text | DEFAULT 'active' | active, disabled, error |
| installed_at | timestamp | NOT NULL | Installation time |
| updated_at | timestamp | NOT NULL | Last update time |

**Index**: `UNIQUE(app_id, shop_id)`, `INDEX(shop_id)`

#### `webhook_deliveries`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Delivery ID |
| app_id | text | FK → installed_apps.id | Target app |
| event | text | NOT NULL | Event name |
| payload | jsonb | NOT NULL | Event payload |
| status | text | NOT NULL | pending, success, failed |
| attempts | integer | DEFAULT 0 | Retry count |
| response_code | integer | NULL | HTTP response code |
| response_time | integer | NULL | Response time (ms) |
| error | text | NULL | Error message |
| created_at | timestamp | NOT NULL | Creation time |
| delivered_at | timestamp | NULL | Delivery time |

**Index**: `INDEX(app_id, status)`, `INDEX(created_at)`

### Migrations

```typescript
// migrations/0001_create_apps_tables.ts
import { sql } from 'drizzle-orm'

export async function up(db: Database) {
  await db.execute(sql`
    CREATE TABLE installed_apps (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      shop_id TEXT NOT NULL REFERENCES shop(id) ON DELETE CASCADE,
      installed_by TEXT NOT NULL REFERENCES "user"(id),
      manifest JSONB NOT NULL,
      auth_token TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(app_id, shop_id)
    )
  `)

  await db.execute(sql`
    CREATE INDEX idx_installed_apps_shop_id ON installed_apps(shop_id)
  `)

  await db.execute(sql`
    CREATE TABLE webhook_deliveries (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES installed_apps(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      response_code INTEGER,
      response_time INTEGER,
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP
    )
  `)

  await db.execute(sql`
    CREATE INDEX idx_webhook_deliveries_app_status ON webhook_deliveries(app_id, status)
  `)

  await db.execute(sql`
    CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at)
  `)
}

export async function down(db: Database) {
  await db.execute(sql`DROP TABLE webhook_deliveries`)
  await db.execute(sql`DROP TABLE installed_apps`)
}
```

## 5. Security

### Webhook Signing

```typescript
// @czo/kit/apps/signature.ts
import { createHmac } from 'crypto'

export function signPayload(payload: unknown, secret: string): string {
  const body = JSON.stringify(payload)
  const timestamp = Date.now()
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  return `t=${timestamp},v1=${signature}`
}

export function verifySignature(
  body: string,
  signature: string,
  secret: string,
  tolerance = 300000 // 5 minutes
): boolean {
  const [timestampPart, signaturePart] = signature.split(',')
  const timestamp = parseInt(timestampPart.replace('t=', ''), 10)
  const expectedSignature = signaturePart.replace('v1=', '')

  // Check timestamp freshness
  if (Date.now() - timestamp > tolerance) return false

  // Verify signature
  const computed = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  return computed === expectedSignature
}
```

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Webhook replay attack | Timestamp in signature, 5-minute tolerance |
| Webhook spoofing | HMAC signature verification |
| App token leakage | Tokens scoped to shop, rotatable |
| Excessive permissions | Validation against user's permissions at install |
| DoS via webhooks | Rate limiting, timeout, async queue |

## 6. Performance

### Requirements

| Metric | Target | Method |
|--------|--------|--------|
| Repository findById | < 5ms (cached), < 50ms (uncached) | APM |
| Cache get/set | < 10ms | APM |
| Event emit (sync) | < 10ms | APM |
| Webhook dispatch | < 100ms p95 | APM |

### Caching Strategy

| Data | Cache | TTL | Invalidation |
|------|-------|-----|--------------|
| Entity by ID | Redis | 5 min | On update/delete |
| Installed apps | Redis | 1 min | On install/uninstall |
| App manifests | Redis | 1 hour | On app update |

## 7. Testing Strategy

### Unit Tests

```typescript
describe('createRepository', () => {
  it('creates entity with id and version')
  it('finds entity by id')
  it('throws OptimisticLockError on version mismatch')
  it('soft deletes entity')
  it('restores soft-deleted entity')
  it('invalidates cache on update')
})

describe('CacheManager', () => {
  it('gets and sets values')
  it('returns null for missing keys')
  it('invalidates by pattern')
  it('respects TTL')
  it('namespaces keys correctly')
})

describe('EventEmitter', () => {
  it('emits sync events to handlers')
  it('queues async events')
  it('provides event context')
  it('allows unsubscribe')
})

describe('HookRegistry', () => {
  it('runs before hooks')
  it('runs after hooks')
  it('runs error hooks on failure')
  it('allows context modification in before')
  it('allows result modification in after')
})

describe('WebhookDispatcher', () => {
  it('dispatches to subscribed apps')
  it('signs payload with HMAC')
  it('queues retries on failure')
  it('respects timeout')
})
```

### Integration Tests

```typescript
describe('Repository + Cache', () => {
  it('caches findById results')
  it('invalidates cache on update')
})

describe('Events + Hooks', () => {
  it('hooks can emit events')
  it('events can trigger hooks')
})

describe('Apps + Auth', () => {
  it('validates permissions at install')
  it('rejects install if missing permissions')
})
```

## 8. Dependencies

### Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| drizzle-orm | ^0.30.x | Database ORM |
| nitropack | ^3.x | Cache (defineCachedFunction, useStorage) |
| hookable | ^5.x | Hooks and events |
| bullmq | ^5.x | Async job queue |
| ioredis | ^5.x | Redis client |

### Infrastructure

- PostgreSQL 17+ (database)
- Redis 7+ (cache, queues)

### Module Dependencies

- @czo/auth (PermissionService for app permissions)

## 9. Rollout Plan

### Deployment Stages

1. **Phase 1: Repository** (Sprint-01) ✅ **DONE**
   - ~~createRepository factory~~
   - Classe abstraite `Repository<T,U,V>`
   - Optimistic locking (version)
   - Soft delete (soft param + restore)
   - Hooks lifecycle intégrés

2. **Phase 2: Cache** (Sprint-01) ✅ **DONE**
   - ~~CacheManager implementation~~
   - Export `useCache` (alias useStorage)
   - Configuration Redis → Issue #38 (open)

3. **Phase 3: Events** (TBD)
   - EventEmitter with hookable
   - BullMQ async queue

4. **~~Phase 4: Hooks~~** ✅ **MERGED INTO PHASE 1**
   - ~~HookRegistry implementation~~
   - Hooks intégrés dans Repository

5. **Phase 4: Apps** (TBD)
   - AppRegistry and WebhookDispatcher
   - Permission integration with @czo/auth
   - Stripe app demo

6. **Launch** (TBD)
   - Production deployment
   - Documentation

### Rollback Plan

| Issue | Rollback Action |
|-------|-----------------|
| Cache issues | Disable cache config, fallback to DB |
| Queue issues | Fallback to sync events |
| Webhook failures | Pause dispatcher, queue backlog |

---

## Appendix

### Open Questions

- [x] Repository pattern? → **~~Functional with createRepository()~~** **PIVOT: Classe abstraite `Repository<T,U,V>`**
- [x] Optimistic locking? → **Version number** (champ `version`, `expectedVersion` sur update)
- [x] Soft delete? → **Paramètre `soft?: boolean`** sur delete, `restore()` pour annuler
- [x] Cache backend? → **Nitro Cache natif** (export `useCache` = `useStorage`)
- [x] Cache approach? → **~~CacheManager complexe~~** **PIVOT: Export simple, modules gèrent leur cache**
- [x] Hooks? → **~~HookRegistry séparé~~** **PIVOT: Intégrés dans Repository** (beforeCreate, afterUpdate, etc.)
- [x] Events library? → **hookable + BullMQ** (à implémenter)
- [x] App permissions? → **Via @czo/auth PermissionService** (à implémenter)

### ADRs

- **ADR-001**: ~~Functional repository~~ → **PIVOT: Classe abstraite Repository** → API familière, hooks intégrés, pragmatisme
- **ADR-002**: Nitro Cache simplifié → Export direct de `useStorage`, pas de wrapper custom
- **ADR-003**: hookable for events/hooks → Lightweight, TypeScript-first (events à implémenter)
- **ADR-004**: BullMQ for async → Redis-based, battle-tested (à implémenter)
- **ADR-005**: App permissions via @czo/auth → Centralized permission system (à implémenter)
- **ADR-006**: Hooks lifecycle dans Repository → Méthodes à override plutôt que registry séparé

### References

- [Brainstorm Kit](./brainstorm.md)
- [PRD Kit](./prd.md)
- [Nitro Cache Documentation](https://v3.nitro.build/docs/cache)
- [hookable Documentation](https://github.com/unjs/hookable)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Brainstorm Auth](../auth/brainstorm.md) - Permission system
