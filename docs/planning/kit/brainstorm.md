# Brainstorm: Module Kit (@czo/kit)

**Date:** 2026-02-04
**Participants:** Claude (Briana), Utilisateur
**Status:** Prêt pour PRD

---

## Énoncé du Problème

### Le Problème

Le module `@czo/kit` fournit les fondations pour les modules c-zo, mais manque de fonctionnalités essentielles pour une plateforme e-commerce moderne :
- Code CRUD répétitif dans chaque module
- Pas de gestion de cache
- Pas de système d'events pour la communication inter-modules
- Pas de hooks pour intercepter les opérations
- Pas de système d'applications pour les intégrations tierces

### Qui est Affecté

- **Développeurs de modules** : Répètent le même code (CRUD, pagination, soft-delete)
- **Ops/Performance** : Pas de cache = charge DB excessive
- **Intégrateurs** : Pas moyen d'étendre c-zo avec des services tiers
- **Modules de domaine** : Ne peuvent pas réagir aux actions des autres modules

### Solutions Actuelles

- Services avec code CRUD manuel (répétitif)
- Pas de cache
- Hooks Nitro basiques (`czo:register`, `czo:boot`)
- Intégrations codées en dur dans les modules

### Pourquoi Maintenant

- Les modules product et attribute sont en place, les patterns émergent
- Le module auth va nécessiter des events (session created, user registered)
- Les intégrations tierces (paiement, expédition) arrivent bientôt
- Standardiser maintenant évite la dette technique

---

## Revue de l'Existant

### Composants Actuels

| Composant | Fichier | État | Description |
|-----------|---------|------|-------------|
| `defineNitroModule` | `module.ts` | ✅ | Création de modules Nitro |
| `useContainer` | `ioc.ts` | ✅ | IoC container (@adonisjs/fold) |
| `useDatabase` | `db.ts` | ✅ | Drizzle ORM, master/replicas |
| `addHandler/Plugin` | `nitro.ts` | ✅ | Utilitaires Nitro |
| `registerResolvers` | `graphql/resolvers.ts` | ⚠️ | Simple array, pas de validation |
| `createResolver` | `resolve.ts` | ✅ | Résolution de chemins |
| CLI `czo` | `cli.ts` | ⚠️ | Minimal (publish seulement) |

### Patterns Existants dans les Modules

```typescript
// Service pattern actuel (ProductService)
export class ProductService {
  constructor(private db: Kysely<Database>) {}

  async createProduct(input: unknown): Promise<Product> {
    // Validation
    const validatedInput = validateCreateProduct(input)
    // Generate handle
    const handle = await generateUniqueHandle(...)
    // Insert
    const product = await this.db.insertInto('products').values(...).returning()
    return product
  }

  async updateProduct(id: string, input: unknown): Promise<Product> {
    // Validation
    // Optimistic locking via updatedAt
    // Update
  }

  async listProducts(options: {...}): Promise<PaginatedResult<Product>> {
    // Filtering, sorting, pagination - code répétitif
  }

  async deleteProduct(id: string): Promise<{success, deletedAt}> {
    // Soft delete
  }
}
```

### Problèmes Identifiés

1. **Code répétitif** : CRUD, pagination, soft-delete dans chaque service
2. **Pas de cache** : Chaque requête hit la DB
3. **Pas d'events** : Modules isolés, pas de communication
4. **Pas de hooks** : Impossible d'intercepter les opérations
5. **Optimistic locking via timestamp** : Problèmes de précision milliseconde

---

## Fonctionnalités Proposées

### 1. Repository Générique (Approche Fonctionnelle)

**Objectif** : Éliminer le code CRUD répétitif avec un pattern repository fonctionnel basé sur Drizzle.

**Pourquoi fonctionnel ?**
- Pas de `this`, pas de `class`, pas de `new`
- Composition facile (spread, merge)
- Testing plus simple (pas de mocking complexe)
- Tree-shaking possible
- Aligne avec l'écosystème JS moderne

#### Types de Base

```typescript
// @czo/kit/db/repository/types.ts

interface BaseEntity {
  id: string
  version: number       // Pour optimistic locking
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

interface FindManyOptions<T> {
  where?: WhereClause<T>
  orderBy?: OrderByClause<T>
  limit?: number
  offset?: number
  cursor?: string
}

interface PaginatedResult<T> {
  nodes: T[]
  totalCount: number
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor?: string
    endCursor?: string
  }
}

interface RepositoryConfig<T extends BaseEntity, TTable extends PgTable> {
  table: TTable
  softDelete?: boolean
  cache?: {
    manager: CacheManager
    prefix: string
    ttl?: number
  }
}
```

#### Factory Générique

```typescript
// @czo/kit/db/repository/create-repository.ts

export function createRepository<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
  TTable extends PgTable
>(
  db: DrizzleDatabase,
  config: RepositoryConfig<T, TTable>
) {
  const { table, cache, softDelete = true } = config

  // === Queries ===

  const findById = async (id: string): Promise<T | null> => {
    const cacheKey = cache ? `${cache.prefix}:${id}` : null

    const fetch = async () => {
      let query = db.select().from(table).where(eq(table.id, id))
      if (softDelete) query = query.where(isNull(table.deletedAt))
      const result = await query.limit(1)
      return (result[0] as T) ?? null
    }

    if (cacheKey && cache) {
      return cache.manager.getOrSet(cacheKey, fetch, { ttl: cache.ttl })
    }
    return fetch()
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

  // === Mutations ===

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

  const restore = async (id: string): Promise<T> => {
    if (!softDelete) throw new Error('Restore not available without soft delete')

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

  const hardDelete = async (id: string): Promise<boolean> => {
    const result = await db.delete(table).where(eq(table.id, id)).returning()
    if (cache) await cache.manager.delete(`${cache.prefix}:${id}`)
    return result.length > 0
  }

  // === Transactions ===

  const transaction = async <R>(fn: (repo: ReturnType<typeof createRepository>) => Promise<R>): Promise<R> => {
    return db.transaction(async (tx) => {
      const txRepo = createRepository(tx as any, config)
      return fn(txRepo)
    })
  }

  // Retourne l'objet repository
  return {
    // Queries
    findById,
    findByIds,
    findOne,
    findMany,
    count,
    exists,
    // Mutations
    create,
    createMany,
    update,
    delete: remove,
    restore,
    hardDelete,
    // Transactions
    transaction,
    // Expose internals for extension
    _db: db,
    _table: table,
    _config: config,
  }
}

// Type helper
export type Repository<T, CreateInput, UpdateInput> = ReturnType<
  typeof createRepository<T, CreateInput, UpdateInput, any>
>
```

#### Utilisation dans un Module (Composition)

```typescript
// @czo/product/repositories/product.repository.ts

export function createProductRepository(db: DrizzleDatabase, cache?: CacheManager) {
  // Base repository via factory
  const base = createRepository<Product, CreateProductInput, UpdateProductInput, typeof products>(
    db,
    {
      table: products,
      softDelete: true,
      cache: cache ? { manager: cache, prefix: 'product', ttl: 300 } : undefined,
    }
  )

  // === Extensions spécifiques au produit ===

  const findByHandle = async (handle: string): Promise<Product | null> => {
    return base.findOne({ handle })
  }

  const findByCollection = async (collectionId: string): Promise<Product[]> => {
    const result = await base.findMany({
      where: { collectionId },
      limit: 1000,
    })
    return result.nodes
  }

  const publish = async (id: string, expectedVersion: number): Promise<Product> => {
    return base.update(id, { status: 'published', expectedVersion } as any)
  }

  const findPublished = async (options?: Omit<FindManyOptions<Product>, 'where'>): Promise<PaginatedResult<Product>> => {
    return base.findMany({
      ...options,
      where: { status: 'published' },
    })
  }

  // Composition : base + extensions
  return {
    ...base,
    findByHandle,
    findByCollection,
    publish,
    findPublished,
  }
}

// Type exporté
export type ProductRepository = ReturnType<typeof createProductRepository>
```

#### Enregistrement dans le Container

```typescript
// @czo/product/plugins/index.ts

export default defineNitroPlugin(async () => {
  const container = useContainer()

  // Enregistrer comme singleton (lazy instantiation)
  container.singleton('productRepository', () => {
    const db = useDatabase()
    const cache = useCacheManager()
    return createProductRepository(db, cache)
  })
})

// Utilisation dans un resolver ou service
const productRepo = useContainer().make<ProductRepository>('productRepository')
const product = await productRepo.findById('123')
```

#### Optimistic Locking - Stratégie Retenue

**Version Number** (recommandé) :

```typescript
// Schema Drizzle
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),  // ← Ajout
  // ...
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
})

// GraphQL Input
input UpdateProductInput {
  title: String
  description: String
  expectedVersion: Int!  # Obligatoire pour les updates
}

// Erreur typée
class OptimisticLockError extends Error {
  code = 'OPTIMISTIC_LOCK_FAILED'
  constructor(message: string) {
    super(message)
  }
}
```

---

### 2. Gestion de Cache

**Objectif** : Cache multi-backend avec `unstorage`, support au niveau repository et service.

#### API Proposée

```typescript
// @czo/kit/cache

import { createStorage, Storage } from 'unstorage'

interface CacheManager {
  // Opérations de base
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>

  // Patterns avancés
  getOrSet<T>(key: string, factory: () => Promise<T>, options?: CacheOptions): Promise<T>
  invalidate(pattern: string): Promise<number>  // Retourne nombre de clés supprimées

  // Bulk operations
  getMany<T>(keys: string[]): Promise<Map<string, T | null>>
  setMany<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void>
  deleteMany(keys: string[]): Promise<void>

  // Namespace
  namespace(prefix: string): CacheManager
}

interface CacheOptions {
  ttl?: number          // Secondes
  tags?: string[]       // Pour invalidation groupée
  staleWhileRevalidate?: number  // SWR pattern
}
```

#### Configuration Multi-Backend

```typescript
// @czo/kit/cache/manager.ts

import { createStorage } from 'unstorage'
import redisDriver from 'unstorage/drivers/redis'
import memoryDriver from 'unstorage/drivers/memory'
import fsDriver from 'unstorage/drivers/fs'

export function createCacheManager(config: CacheConfig): CacheManager {
  const driver = config.driver === 'redis'
    ? redisDriver({ url: config.redis.url })
    : config.driver === 'fs'
    ? fsDriver({ base: config.fs.path })
    : memoryDriver()

  const storage = createStorage({ driver })

  return new CacheManagerImpl(storage, config)
}

// Configuration par environnement
const cacheConfig: CacheConfig = {
  driver: process.env.NODE_ENV === 'production' ? 'redis' : 'memory',
  redis: {
    url: process.env.REDIS_URL,
  },
  defaultTtl: 300,  // 5 minutes
}
```

#### Cache au Niveau Repository (Transparent)

```typescript
// @czo/kit/repository/cached.repository.ts

export function withCache<T extends BaseRepository<any, any, any, any>>(
  Repository: new (...args: any[]) => T,
  cacheConfig: RepositoryCacheConfig
): new (...args: any[]) => T {
  return class CachedRepository extends Repository {
    private cache: CacheManager

    constructor(...args: any[]) {
      super(...args)
      this.cache = args[args.length - 1] // Cache passed as last arg
    }

    async findById(id: string) {
      const cacheKey = `${cacheConfig.prefix}:${id}`

      return this.cache.getOrSet(
        cacheKey,
        () => super.findById(id),
        { ttl: cacheConfig.ttl }
      )
    }

    async update(id: string, input: any) {
      const result = await super.update(id, input)
      await this.cache.delete(`${cacheConfig.prefix}:${id}`)
      return result
    }

    async delete(id: string) {
      const result = await super.delete(id)
      await this.cache.delete(`${cacheConfig.prefix}:${id}`)
      return result
    }
  }
}

// Utilisation
const CachedProductRepository = withCache(ProductRepository, {
  prefix: 'product',
  ttl: 300,
})
```

#### Cache au Niveau Service (Explicite)

```typescript
// @czo/product/services/product.service.ts

export class ProductService {
  constructor(
    private repo: ProductRepository,
    private cache: CacheManager
  ) {}

  async getProductWithRecommendations(id: string): Promise<ProductWithReco> {
    // Cache explicite pour données enrichies
    return this.cache.getOrSet(
      `product:${id}:with-recommendations`,
      async () => {
        const product = await this.repo.findById(id)
        if (!product) throw new NotFoundError()

        const recommendations = await this.computeRecommendations(product)
        return { ...product, recommendations }
      },
      { ttl: 600, tags: ['product', `product:${id}`] }
    )
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const product = await this.repo.update(id, input)

    // Invalider les caches liés
    await this.cache.invalidate(`product:${id}:*`)

    return product
  }
}
```

---

### 3. Gestion d'Events

**Objectif** : Communication inter-modules via events synchrones et asynchrones.

#### API Proposée

```typescript
// @czo/kit/events

interface EventEmitter {
  // Émission
  emit<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E]
  ): Promise<void>

  emitAsync<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E],
    options?: AsyncEventOptions
  ): Promise<void>

  // Écoute
  on<E extends keyof EventMap>(
    event: E,
    handler: EventHandler<EventMap[E]>
  ): () => void  // Retourne unsubscribe function

  once<E extends keyof EventMap>(
    event: E,
    handler: EventHandler<EventMap[E]>
  ): () => void

  off<E extends keyof EventMap>(
    event: E,
    handler?: EventHandler<EventMap[E]>
  ): void
}

interface AsyncEventOptions {
  delay?: number        // Délai avant exécution
  retries?: number      // Nombre de retries
  priority?: 'high' | 'normal' | 'low'
}

type EventHandler<T> = (payload: T, context: EventContext) => Promise<void>

interface EventContext {
  eventId: string
  timestamp: Date
  actor?: Actor
  correlationId?: string
}
```

#### Events Typés par Module

```typescript
// @czo/kit/events/types.ts

// Events de base (kit)
interface KitEvents {
  'app.started': { timestamp: Date }
  'app.shutdown': { reason: string }
}

// Les modules étendent avec leurs propres events
declare module '@czo/kit/events' {
  interface EventMap extends KitEvents {}
}

// @czo/product/events.ts
declare module '@czo/kit/events' {
  interface EventMap {
    'product.created': { product: Product; actor: Actor }
    'product.updated': { product: Product; changes: Partial<Product>; actor: Actor }
    'product.deleted': { productId: string; actor: Actor }
    'product.published': { product: Product; actor: Actor }
  }
}

// @czo/auth/events.ts
declare module '@czo/kit/events' {
  interface EventMap {
    'user.registered': { user: User; method: AuthMethod }
    'user.login': { user: User; session: Session }
    'user.logout': { userId: string; sessionId: string }
    'organization.created': { organization: Organization; owner: User }
  }
}
```

#### Implémentation avec Queue (BullMQ)

```typescript
// @czo/kit/events/emitter.ts

import { Hookable } from 'hookable'
import { Queue, Worker } from 'bullmq'

export class EventEmitterImpl implements EventEmitter {
  private hooks: Hookable
  private queue?: Queue
  private worker?: Worker

  constructor(config: EventConfig) {
    this.hooks = new Hookable()

    if (config.async?.enabled) {
      this.queue = new Queue('events', { connection: config.async.redis })
      this.worker = new Worker('events', this.processEvent.bind(this), {
        connection: config.async.redis,
      })
    }
  }

  async emit<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E]
  ): Promise<void> {
    const context: EventContext = {
      eventId: generateId(),
      timestamp: new Date(),
    }

    // Synchrone - attend que tous les handlers terminent
    await this.hooks.callHook(event as string, payload, context)
  }

  async emitAsync<E extends keyof EventMap>(
    event: E,
    payload: EventMap[E],
    options?: AsyncEventOptions
  ): Promise<void> {
    if (!this.queue) {
      // Fallback to sync if no queue configured
      return this.emit(event, payload)
    }

    await this.queue.add(event as string, { event, payload }, {
      delay: options?.delay,
      attempts: options?.retries ?? 3,
      priority: options?.priority === 'high' ? 1 : options?.priority === 'low' ? 10 : 5,
    })
  }

  on<E extends keyof EventMap>(
    event: E,
    handler: EventHandler<EventMap[E]>
  ): () => void {
    this.hooks.hook(event as string, handler)
    return () => this.hooks.removeHook(event as string, handler)
  }

  private async processEvent(job: Job) {
    const { event, payload } = job.data
    await this.hooks.callHook(event, payload, {
      eventId: job.id,
      timestamp: new Date(job.timestamp),
    })
  }
}
```

#### Utilisation dans les Services

```typescript
// @czo/product/services/product.service.ts

export class ProductService {
  constructor(
    private repo: ProductRepository,
    private events: EventEmitter
  ) {}

  async createProduct(input: CreateProductInput, actor: Actor): Promise<Product> {
    const product = await this.repo.create(input)

    // Event synchrone - les handlers s'exécutent immédiatement
    await this.events.emit('product.created', { product, actor })

    return product
  }

  async publishProduct(id: string, actor: Actor): Promise<Product> {
    const product = await this.repo.update(id, { status: 'published' })

    // Event asynchrone - indexation search peut prendre du temps
    await this.events.emitAsync('product.published', { product, actor }, {
      retries: 3,
    })

    return product
  }
}

// @czo/search/plugins/index.ts
events.on('product.published', async ({ product }) => {
  await searchIndex.indexProduct(product)
})

// @czo/notification/plugins/index.ts
events.on('product.published', async ({ product, actor }) => {
  await notifyFollowers(product.id, `New product: ${product.title}`)
})
```

---

### 4. Gestion de Hooks

**Objectif** : Intercepter les opérations pour validation, logging, enrichissement.

#### API Proposée (basée sur hookable)

```typescript
// @czo/kit/hooks

import { Hookable, createHooks } from 'hookable'

interface HookRegistry {
  // Lifecycle hooks
  before<T extends keyof HookMap>(
    hook: T,
    handler: BeforeHook<HookMap[T]>
  ): () => void

  after<T extends keyof HookMap>(
    hook: T,
    handler: AfterHook<HookMap[T]>
  ): () => void

  // Error hooks
  onError<T extends keyof HookMap>(
    hook: T,
    handler: ErrorHook<HookMap[T]>
  ): () => void

  // Execution
  run<T extends keyof HookMap>(
    hook: T,
    context: HookContext<HookMap[T]>,
    fn: () => Promise<HookMap[T]['result']>
  ): Promise<HookMap[T]['result']>
}

type BeforeHook<T extends HookDefinition> = (
  context: HookContext<T>
) => Promise<HookContext<T> | void>

type AfterHook<T extends HookDefinition> = (
  context: HookContext<T>,
  result: T['result']
) => Promise<T['result'] | void>

type ErrorHook<T extends HookDefinition> = (
  context: HookContext<T>,
  error: Error
) => Promise<void>

interface HookContext<T extends HookDefinition> {
  input: T['input']
  actor?: Actor
  metadata: Record<string, unknown>
}
```

#### Hooks Typés par Opération

```typescript
// @czo/kit/hooks/types.ts

interface HookDefinition {
  input: unknown
  result: unknown
}

interface HookMap {
  // Repository hooks
  'repository.create': { input: { entity: string; data: unknown }; result: unknown }
  'repository.update': { input: { entity: string; id: string; data: unknown }; result: unknown }
  'repository.delete': { input: { entity: string; id: string }; result: unknown }

  // Les modules étendent avec leurs propres hooks
}

// @czo/product/hooks.ts
declare module '@czo/kit/hooks' {
  interface HookMap {
    'product.create': { input: CreateProductInput; result: Product }
    'product.update': { input: { id: string; data: UpdateProductInput }; result: Product }
    'product.delete': { input: { id: string }; result: { success: boolean } }
    'product.publish': { input: { id: string }; result: Product }
  }
}
```

#### Implémentation

```typescript
// @czo/kit/hooks/registry.ts

import { createHooks } from 'hookable'

export class HookRegistryImpl implements HookRegistry {
  private beforeHooks = createHooks<Record<string, BeforeHook<any>>>()
  private afterHooks = createHooks<Record<string, AfterHook<any>>>()
  private errorHooks = createHooks<Record<string, ErrorHook<any>>>()

  before<T extends keyof HookMap>(
    hook: T,
    handler: BeforeHook<HookMap[T]>
  ): () => void {
    this.beforeHooks.hook(`before:${String(hook)}`, handler)
    return () => this.beforeHooks.removeHook(`before:${String(hook)}`, handler)
  }

  after<T extends keyof HookMap>(
    hook: T,
    handler: AfterHook<HookMap[T]>
  ): () => void {
    this.afterHooks.hook(`after:${String(hook)}`, handler)
    return () => this.afterHooks.removeHook(`after:${String(hook)}`, handler)
  }

  async run<T extends keyof HookMap>(
    hook: T,
    context: HookContext<HookMap[T]>,
    fn: () => Promise<HookMap[T]['result']>
  ): Promise<HookMap[T]['result']> {
    try {
      // Run before hooks (can modify context)
      const modifiedContext = await this.beforeHooks.callHook(
        `before:${String(hook)}`,
        context
      ) ?? context

      // Execute the operation
      let result = await fn()

      // Run after hooks (can modify result)
      const modifiedResult = await this.afterHooks.callHook(
        `after:${String(hook)}`,
        modifiedContext,
        result
      )

      return modifiedResult ?? result
    } catch (error) {
      await this.errorHooks.callHook(`error:${String(hook)}`, context, error)
      throw error
    }
  }
}
```

#### Utilisation dans les Services

```typescript
// @czo/product/services/product.service.ts

export class ProductService {
  constructor(
    private repo: ProductRepository,
    private hooks: HookRegistry
  ) {}

  async createProduct(input: CreateProductInput, actor: Actor): Promise<Product> {
    return this.hooks.run(
      'product.create',
      { input, actor, metadata: {} },
      async () => {
        return this.repo.create(input)
      }
    )
  }
}

// @czo/audit/plugins/index.ts
// Hook pour audit logging
hooks.after('product.create', async (ctx, product) => {
  await auditLog.record({
    action: 'product.create',
    actor: ctx.actor,
    entityId: product.id,
    entityType: 'product',
    changes: ctx.input,
  })
  return product
})

// @czo/validation/plugins/index.ts
// Hook pour validation custom
hooks.before('product.create', async (ctx) => {
  if (ctx.input.price < 0) {
    throw new ValidationError('Price cannot be negative')
  }
  return ctx
})
```

#### Intégration Hooks + Events

```typescript
// Les hooks peuvent émettre des events
hooks.after('product.create', async (ctx, product) => {
  await events.emit('product.created', { product, actor: ctx.actor })
  return product
})

// Ou les events peuvent déclencher des hooks
events.on('user.registered', async ({ user }) => {
  await hooks.run('user.welcome', { input: { user }, metadata: {} }, async () => {
    await sendWelcomeEmail(user)
  })
})
```

---

### 5. Système d'Applications

**Objectif** : Permettre l'extension de c-zo avec des intégrations tierces (comme Saleor Apps).

#### Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              c-zo Platform                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         App Registry                                │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│   │  │ Stripe App  │  │ Shippo App  │  │ Custom App  │                  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                     │                     │                       │
│         │ Webhooks            │ Webhooks            │ Webhooks              │
│         ▼                     ▼                     ▼                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Webhook Dispatcher                             │   │
│   │  - Route events to subscribed apps                                  │   │
│   │  - Handle retries and failures                                      │   │
│   │  - Validate app responses                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │ Events                                                            │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Event System                                 │   │
│   │  product.created, order.placed, checkout.completed, ...             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

External Apps (self-hosted):
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Stripe Server  │  │  Shippo Server  │  │  Custom Server  │
│  (merchant's)   │  │  (merchant's)   │  │  (merchant's)   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

#### App Manifest

```typescript
// @czo/kit/apps/types.ts

interface AppManifest {
  // Identification
  id: string              // Unique identifier (e.g., 'stripe-payments')
  name: string            // Display name
  version: string         // Semantic version
  author?: string
  homepage?: string

  // URLs
  appUrl: string          // App's base URL
  manifestUrl?: string    // URL to fetch this manifest

  // Permissions
  permissions: Permission[]

  // Webhooks
  webhooks: WebhookSubscription[]

  // Extensions (UI)
  extensions?: {
    // Dashboard extensions
    dashboard?: DashboardExtension[]
    // Checkout extensions
    checkout?: CheckoutExtension[]
    // Storefront extensions
    storefront?: StorefrontExtension[]
  }

  // Configuration schema (for app settings)
  configSchema?: JSONSchema
}

type Permission =
  | 'MANAGE_PRODUCTS'
  | 'MANAGE_ORDERS'
  | 'MANAGE_CUSTOMERS'
  | 'MANAGE_PAYMENTS'
  | 'MANAGE_SHIPPING'
  | 'MANAGE_SETTINGS'

interface WebhookSubscription {
  event: string           // Event to subscribe to
  targetUrl: string       // Relative URL on the app
  asyncEvents?: boolean   // Sync or async delivery
}

interface DashboardExtension {
  id: string
  label: string
  mount: 'PRODUCT_DETAILS' | 'ORDER_DETAILS' | 'NAVIGATION' | 'SETTINGS'
  url: string             // URL to load in iframe
  permissions: Permission[]
}
```

#### App Registry

```typescript
// @czo/kit/apps/registry.ts

interface AppRegistry {
  // Installation
  install(manifestUrl: string): Promise<InstalledApp>
  uninstall(appId: string): Promise<void>

  // Management
  getApp(appId: string): Promise<InstalledApp | null>
  listApps(): Promise<InstalledApp[]>
  updateApp(appId: string): Promise<InstalledApp>

  // Configuration
  setAppConfig(appId: string, config: Record<string, unknown>): Promise<void>
  getAppConfig(appId: string): Promise<Record<string, unknown>>

  // Permissions
  hasPermission(appId: string, permission: Permission): Promise<boolean>
}

interface InstalledApp {
  id: string
  manifest: AppManifest
  installedAt: Date
  status: 'active' | 'disabled' | 'error'
  authToken: string       // Token for app to call c-zo API
  config: Record<string, unknown>
}
```

#### Webhook Dispatcher

```typescript
// @czo/kit/apps/webhook-dispatcher.ts

interface WebhookDispatcher {
  // Dispatch event to all subscribed apps
  dispatch(event: string, payload: unknown): Promise<WebhookResult[]>

  // Dispatch to specific app
  dispatchToApp(appId: string, event: string, payload: unknown): Promise<WebhookResult>
}

interface WebhookResult {
  appId: string
  success: boolean
  statusCode?: number
  responseTime: number
  error?: string
  retryCount: number
}

// Implementation
export class WebhookDispatcherImpl implements WebhookDispatcher {
  constructor(
    private registry: AppRegistry,
    private httpClient: HttpClient,
    private queue: Queue
  ) {}

  async dispatch(event: string, payload: unknown): Promise<WebhookResult[]> {
    const apps = await this.registry.listApps()
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
        error: r.reason.message,
        responseTime: 0,
        retryCount: 0,
      }
    )
  }

  async dispatchToApp(appId: string, event: string, payload: unknown): Promise<WebhookResult> {
    const app = await this.registry.getApp(appId)
    if (!app) throw new Error(`App ${appId} not found`)

    const webhook = app.manifest.webhooks.find(w => w.event === event)
    if (!webhook) throw new Error(`App ${appId} not subscribed to ${event}`)

    const targetUrl = new URL(webhook.targetUrl, app.manifest.appUrl).toString()
    const signature = this.signPayload(payload, app.authToken)

    const start = Date.now()
    try {
      const response = await this.httpClient.post(targetUrl, {
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
        await this.queue.add('webhook-retry', { appId, event, payload }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        })
      }

      return {
        appId,
        success: false,
        error: error.message,
        responseTime: Date.now() - start,
        retryCount: 0,
      }
    }
  }
}
```

#### Intégration avec le Système d'Events

```typescript
// @czo/kit/apps/integration.ts

export function setupAppIntegration(
  events: EventEmitter,
  dispatcher: WebhookDispatcher
) {
  // Dispatch events to apps
  events.on('product.created', async (payload) => {
    await dispatcher.dispatch('product.created', payload)
  })

  events.on('order.placed', async (payload) => {
    await dispatcher.dispatch('order.placed', payload)
  })

  // ... autres events
}
```

#### Exemple d'App Stripe

```typescript
// stripe-app/manifest.json
{
  "id": "stripe-payments",
  "name": "Stripe Payments",
  "version": "1.0.0",
  "author": "c-zo",
  "appUrl": "https://stripe-app.example.com",
  "permissions": ["MANAGE_PAYMENTS", "MANAGE_ORDERS"],
  "webhooks": [
    { "event": "checkout.completed", "targetUrl": "/webhooks/checkout" },
    { "event": "order.refund_requested", "targetUrl": "/webhooks/refund" }
  ],
  "extensions": {
    "dashboard": [
      {
        "id": "stripe-order-details",
        "label": "Payment Details",
        "mount": "ORDER_DETAILS",
        "url": "/extensions/order-details",
        "permissions": ["MANAGE_PAYMENTS"]
      }
    ]
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "secretKey": { "type": "string", "title": "Stripe Secret Key" },
      "webhookSecret": { "type": "string", "title": "Webhook Signing Secret" }
    },
    "required": ["secretKey"]
  }
}

// stripe-app/server.ts
import express from 'express'
import Stripe from 'stripe'

const app = express()

app.post('/webhooks/checkout', async (req, res) => {
  const { order, customer } = req.body

  // Verify signature
  const signature = req.headers['x-czo-signature']
  if (!verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Create Stripe payment intent
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: order.total,
    currency: order.currency,
    metadata: { orderId: order.id },
  })

  // Return response to c-zo
  res.json({
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
  })
})
```

---

## Définition du Scope

### Dans le Scope (MVP)

**Phase 1 : Repository**
- [ ] Interface `Repository<T, CreateInput, UpdateInput>`
- [ ] `BaseRepository` avec Drizzle
- [ ] Optimistic locking avec version number
- [ ] Pagination (offset + cursor)
- [ ] Soft delete / restore
- [ ] Transactions
- [ ] Tests unitaires

**Phase 2 : Cache**
- [ ] `CacheManager` avec unstorage
- [ ] Drivers: memory, Redis
- [ ] `getOrSet` pattern
- [ ] `withCache` HOC pour repositories
- [ ] Invalidation par pattern
- [ ] Tests unitaires

**Phase 3 : Events**
- [ ] `EventEmitter` avec hookable
- [ ] Events synchrones (`emit`)
- [ ] Events asynchrones avec BullMQ (`emitAsync`)
- [ ] Type safety avec module augmentation
- [ ] Tests unitaires

**Phase 4 : Hooks**
- [ ] `HookRegistry` avec hookable
- [ ] `before` / `after` / `onError` hooks
- [ ] `run` pour exécution avec hooks
- [ ] Intégration avec events
- [ ] Tests unitaires

**Phase 5 : Apps**
- [ ] `AppManifest` schema
- [ ] `AppRegistry` pour installation/gestion
- [ ] `WebhookDispatcher` pour envoi d'events
- [ ] Signature des webhooks
- [ ] Retries avec queue
- [ ] Permissions basiques
- [ ] Tests unitaires

### Hors Scope (Futur)

| Fonctionnalité | Version | Notes |
|----------------|---------|-------|
| Dashboard extensions UI | v1.1 | Nécessite paiya (frontend) |
| App Marketplace | v2.0 | Plateforme complète |
| Sync webhooks (request/response) | v1.1 | Pour checkout extensions |
| GraphQL subscriptions | v1.2 | Pour real-time |
| Distributed cache | v1.1 | Redis cluster |

### Non-Objectifs

- ORM-agnostic (on utilise Drizzle)
- Multi-database (PostgreSQL uniquement)
- Cache distribué complexe (simple Redis suffit)
- App sandboxing (trust model pour MVP)

### Critères de Succès

1. **Repository** : Réduction de 70% du code CRUD dans les modules
2. **Cache** : Latence < 50ms pour les reads cachés
3. **Events** : Tous les modules peuvent communiquer via events
4. **Hooks** : Audit logging fonctionnel via hooks
5. **Apps** : Une app Stripe fonctionnelle en démo

---

## Risques & Hypothèses

### Hypothèses à Valider

- [ ] `unstorage` supporte bien notre use-case multi-backend
- [ ] `hookable` peut gérer before/after avec modification de contexte
- [ ] BullMQ est le bon choix pour les queues (vs autres solutions)
- [ ] Le modèle de permissions des apps est suffisant

### Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Performance du cache | Faible | Moyen | Benchmark avant déploiement |
| Complexité hookable | Moyen | Faible | Wrapper simple si nécessaire |
| Webhook reliability | Moyen | Élevé | Queue avec retries, dead letter |
| Migration des modules existants | Moyen | Moyen | Migration progressive |

### Dépendances

- `unstorage` pour le cache
- `hookable` (déjà installé)
- `bullmq` pour les queues
- `drizzle-orm` (déjà installé)
- Redis pour cache et queues

---

## Questions Ouvertes

- [x] Optimistic locking strategy? → **Version number**
- [x] Cache backend? → **unstorage (multi-backend)**
- [x] Events sync/async? → **Les deux, avec BullMQ pour async**
- [x] Hooks library? → **hookable**
- [x] Apps model? → **Self-hosted avec webhooks, extensions UI**
- [x] Naming? → **`@czo/kit/db/repository`** (sous le namespace db)
- [x] Export? → **Sous-packages séparés**

---

## Structure des Exports

```typescript
// package.json exports
{
  "exports": {
    ".": "./dist/index.mjs",                    // Core (module, ioc, logger)
    "./db": "./dist/db/index.mjs",              // useDatabase
    "./db/repository": "./dist/db/repository/index.mjs",  // BaseRepository
    "./cache": "./dist/cache/index.mjs",        // CacheManager
    "./events": "./dist/events/index.mjs",      // EventEmitter
    "./hooks": "./dist/hooks/index.mjs",        // HookRegistry
    "./apps": "./dist/apps/index.mjs",          // AppRegistry, WebhookDispatcher
    "./graphql": "./dist/graphql/index.mjs"     // existant
  }
}

// Usage dans les modules
import { defineNitroModule, useContainer } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { BaseRepository, type Repository } from '@czo/kit/db/repository'
import { useCacheManager } from '@czo/kit/cache'
import { useEvents } from '@czo/kit/events'
import { useHooks } from '@czo/kit/hooks'
import { useAppRegistry } from '@czo/kit/apps'
```

---

## Recherche & Références

- [unstorage Documentation](https://unstorage.unjs.io/)
- [hookable Documentation](https://github.com/unjs/hookable)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Saleor Apps Architecture](https://docs.saleor.io/developer/extending/apps/architecture/overview)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)

---

## Notes de Session

**Décisions clés prises:**

1. **Priorité** : Repository → Cache → Events → Hooks → Apps
2. **Repository** : Approche fonctionnelle avec `createRepository()` factory
3. **Optimistic Locking** : Version number (entier incrémenté)
4. **Cache** : unstorage pour multi-backend, cache à 2 niveaux (repo + service)
5. **Events** : Sync + async (BullMQ), intégration avec hooks
6. **Hooks** : Basé sur hookable, before/after/onError
7. **Apps** : Self-hosted, webhooks + extensions UI
8. **Naming** : `@czo/kit/db/repository` (repository sous le namespace db)
9. **Exports** : Sous-packages séparés pour tree-shaking et clarté
10. **Pattern** : Fonctionnel (composition) plutôt que OOP (héritage)

---

## Prochaines Étapes

- [ ] Créer PRD: `/manager:prd create kit`
- [ ] Créer TRD: `/manager:trd create kit`
- [ ] Spike: prototype BaseRepository avec Drizzle
- [ ] Spike: prototype CacheManager avec unstorage
- [ ] Migrer ProductService vers le nouveau pattern
