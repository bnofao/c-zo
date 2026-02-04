# TRD: Module Kit (@czo/kit)

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-04
**Last Updated**: 2026-02-04
**Related PRD**: [prd.md](./prd.md)

---

## 1. Overview

Le module `@czo/kit` est le toolkit fondamental de c-zo. Cette évolution ajoute cinq composants majeurs :
- **Repository** : Pattern fonctionnel pour CRUD avec Drizzle
- **Cache** : Nitro Cache natif + CacheManager léger
- **Events** : Sync (hookable) + async (BullMQ)
- **Hooks** : Interception before/after/onError
- **Apps** : Système d'applications tierces avec webhooks

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

### Component Diagram

```
packages/kit/
├── src/
│   ├── index.ts                      # Main exports (module, ioc, logger)
│   │
│   ├── db/
│   │   ├── index.ts                  # useDatabase export
│   │   └── repository/
│   │       ├── index.ts              # createRepository export
│   │       ├── create-repository.ts  # Factory implementation
│   │       ├── types.ts              # BaseEntity, FindManyOptions, etc.
│   │       ├── errors.ts             # OptimisticLockError, NotFoundError
│   │       └── utils.ts              # applyWhere, applyOrderBy helpers
│   │
│   ├── cache/
│   │   ├── index.ts                  # useCacheManager export
│   │   ├── manager.ts                # CacheManager implementation
│   │   ├── types.ts                  # CacheOptions, CacheConfig
│   │   └── drivers/
│   │       ├── memory.ts             # Development driver
│   │       └── redis.ts              # Production driver
│   │
│   ├── events/
│   │   ├── index.ts                  # useEvents export
│   │   ├── emitter.ts                # EventEmitter implementation
│   │   ├── types.ts                  # EventMap, EventContext, EventHandler
│   │   └── queue.ts                  # BullMQ integration for async
│   │
│   ├── hooks/
│   │   ├── index.ts                  # useHooks export
│   │   ├── registry.ts               # HookRegistry implementation
│   │   └── types.ts                  # HookMap, HookContext, BeforeHook
│   │
│   ├── apps/
│   │   ├── index.ts                  # useAppRegistry export
│   │   ├── registry.ts               # AppRegistry implementation
│   │   ├── dispatcher.ts             # WebhookDispatcher
│   │   ├── permission-checker.ts     # AppPermissionChecker (uses @czo/auth)
│   │   ├── types.ts                  # AppManifest, InstalledApp, etc.
│   │   └── signature.ts              # HMAC signing utilities
│   │
│   └── graphql/                      # Existing GraphQL utilities
│       └── ...
│
├── package.json
└── tests/
    ├── repository.test.ts
    ├── cache.test.ts
    ├── events.test.ts
    ├── hooks.test.ts
    └── apps.test.ts
```

### Package Exports

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./db": "./dist/db/index.mjs",
    "./db/repository": "./dist/db/repository/index.mjs",
    "./cache": "./dist/cache/index.mjs",
    "./events": "./dist/events/index.mjs",
    "./hooks": "./dist/hooks/index.mjs",
    "./apps": "./dist/apps/index.mjs",
    "./graphql": "./dist/graphql/index.mjs"
  }
}
```

### Components

| Component | Technology | Purpose | Dependencies |
|-----------|------------|---------|--------------|
| Repository | createRepository() | Generic CRUD with Drizzle | drizzle-orm |
| Cache | CacheManager | Invalidation + fallback | nitropack/runtime (useStorage) |
| Events | EventEmitter | Inter-module communication | hookable, bullmq |
| Hooks | HookRegistry | Operation interception | hookable |
| Apps | AppRegistry | Third-party integrations | @czo/auth, bullmq |

## 3. Detailed Design

### 3.1 Repository

#### Architecture: Builders Séparés

Le repository utilise des **builders séparés** pour permettre une composition granulaire et un tree-shaking optimal :

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

### 3.2 Cache (Approche Hybride Nitro)

L'approche cache exploite **Nitro Cache natif** pour les reads déclaratifs et un **CacheManager léger** pour l'invalidation.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cache Strategy                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Reads (déclaratif)              Writes (invalidation)          │
│   ┌─────────────────────┐        ┌─────────────────────┐        │
│   │ defineCachedFunction│        │    CacheManager     │        │
│   │ ├── maxAge (TTL)    │        │ ├── delete(key)     │        │
│   │ ├── swr (default)   │        │ ├── deleteMany()    │        │
│   │ ├── staleMaxAge     │        │ ├── invalidate()    │        │
│   │ └── getKey()        │        │ └── has()           │        │
│   └──────────┬──────────┘        └──────────┬──────────┘        │
│              │                              │                    │
│              └──────────────┬───────────────┘                    │
│                             ▼                                    │
│                    ┌─────────────────┐                           │
│                    │   useStorage()  │  ← Nitro storage API      │
│                    └────────┬────────┘                           │
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

#### Types

```typescript
// @czo/kit/cache/types.ts

/**
 * CacheManager léger pour l'invalidation
 * Les reads utilisent directement defineCachedFunction de Nitro
 */
export interface CacheManager {
  // Invalidation operations
  delete(key: string): Promise<void>
  deleteMany(keys: string[]): Promise<void>
  invalidate(pattern: string): Promise<number>
  has(key: string): Promise<boolean>

  // Fallback pour cas hors defineCachedFunction
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>
}

/**
 * Options pour defineCachedFunction (Nitro natif)
 * Référence: https://v3.nitro.build/docs/cache
 */
export interface NitroCacheOptions {
  maxAge: number              // TTL en secondes
  swr?: boolean               // Stale-while-revalidate (default: true)
  staleMaxAge?: number        // Durée max du stale (-1 = illimité)
  name?: string               // Nom du cache entry
  getKey?: (...args: any[]) => string  // Custom cache key
  varies?: string[]           // Headers qui varient le cache
}
```

#### Configuration Storage (nitro.config.ts)

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

#### Nitro Cache pour Reads (defineCachedFunction)

```typescript
// @czo/product/queries/product.queries.ts

import { defineCachedFunction } from 'nitropack/runtime'

/**
 * Query cachée avec SWR - pattern recommandé pour les reads
 */
export const getProductById = defineCachedFunction(
  async (id: string): Promise<Product | null> => {
    const db = useDatabase()
    const result = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1)
    return result[0] ?? null
  },
  {
    maxAge: 300,           // 5 min
    swr: true,             // Serve stale pendant refresh
    staleMaxAge: 3600,     // Stale acceptable 1h
    getKey: (id) => `product:${id}`,
    name: 'getProductById',
  }
)

/**
 * Query avec données enrichies
 */
export const getProductWithVariants = defineCachedFunction(
  async (id: string): Promise<ProductWithVariants | null> => {
    const product = await getProductById(id)
    if (!product) return null

    const variants = await getVariantsByProductId(product.id)
    return { ...product, variants }
  },
  {
    maxAge: 300,
    swr: true,
    getKey: (id) => `product:${id}:with-variants`,
  }
)
```

#### CacheManager Implementation

```typescript
// @czo/kit/cache/manager.ts

import { useStorage } from 'nitropack/runtime'

/**
 * CacheManager léger - wrapper autour de Nitro storage
 * Utilisé principalement pour l'invalidation après mutations
 */
export function useCacheManager(namespace?: string): CacheManager {
  const storage = useStorage('cache')
  const prefix = namespace ? `${namespace}:` : ''

  const prefixKey = (key: string) => `${prefix}${key}`

  return {
    async delete(key: string): Promise<void> {
      await storage.removeItem(prefixKey(key))
    },

    async deleteMany(keys: string[]): Promise<void> {
      await Promise.all(keys.map(k => storage.removeItem(prefixKey(k))))
    },

    async invalidate(pattern: string): Promise<number> {
      const allKeys = await storage.getKeys(prefixKey(pattern))
      await Promise.all(allKeys.map(k => storage.removeItem(k)))
      return allKeys.length
    },

    async has(key: string): Promise<boolean> {
      return storage.hasItem(prefixKey(key))
    },

    async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
      const fullKey = prefixKey(key)
      const cached = await storage.getItem<T>(fullKey)
      if (cached !== null) return cached

      const value = await factory()
      await storage.setItem(fullKey, value, ttl ? { ttl } : undefined)
      return value
    },
  }
}
```

#### Usage dans les Services (Invalidation)

```typescript
// @czo/product/services/product.service.ts

export class ProductService {
  private cache = useCacheManager('product')

  constructor(private repo: ProductRepository) {}

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const product = await this.repo.update(id, input)

    // Invalider tous les caches liés à ce produit
    await this.cache.invalidate(`${id}:*`)

    return product
  }

  async deleteProduct(id: string): Promise<void> {
    await this.repo.delete(id)
    await this.cache.invalidate(`${id}:*`)
  }

  async bulkUpdateProducts(updates: Array<{ id: string; input: UpdateProductInput }>): Promise<void> {
    await Promise.all(updates.map(u => this.repo.update(u.id, u.input)))
    await this.cache.deleteMany(updates.map(u => u.id))
  }
}
```

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

#### Types

```typescript
// @czo/kit/hooks/types.ts

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

1. **Phase 1: Repository** (Week 1)
   - createRepository factory
   - Integration with existing modules

2. **Phase 2: Cache** (Week 2)
   - CacheManager implementation
   - Repository cache integration

3. **Phase 3: Events** (Week 3)
   - EventEmitter with hookable
   - BullMQ async queue

4. **Phase 4: Hooks** (Week 4)
   - HookRegistry implementation
   - Integration with repository

5. **Phase 5: Apps** (Week 5-6)
   - AppRegistry and WebhookDispatcher
   - Permission integration with @czo/auth
   - Stripe app demo

6. **Launch** (Week 7)
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

- [x] Repository pattern? → **Functional with createRepository()**
- [x] Optimistic locking? → **Version number**
- [x] Cache backend? → **Nitro Cache natif** (defineCachedFunction + useStorage)
- [x] Events library? → **hookable + BullMQ**
- [x] App permissions? → **Via @czo/auth PermissionService**

### ADRs

- **ADR-001**: Functional repository → Composition over inheritance
- **ADR-002**: Nitro Cache natif → SWR built-in, configuration centralisée, moins de code
- **ADR-003**: hookable for events/hooks → Lightweight, TypeScript-first
- **ADR-004**: BullMQ for async → Redis-based, battle-tested
- **ADR-005**: App permissions via @czo/auth → Centralized permission system

### References

- [Brainstorm Kit](./brainstorm.md)
- [PRD Kit](./prd.md)
- [Nitro Cache Documentation](https://v3.nitro.build/docs/cache)
- [hookable Documentation](https://github.com/unjs/hookable)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Brainstorm Auth](../auth/brainstorm.md) - Permission system
