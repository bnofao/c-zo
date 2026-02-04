import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { BaseEntity, RepositoryConfig } from './types'
import { useCacheManager } from '../../cache/manager'
import { createCachedQueries } from './cached-queries'
import { createMutations } from './mutations'
import { createQueries } from './queries'

/**
 * Create a full repository with queries, mutations, and optional caching
 *
 * This is a convenience function that combines:
 * - createQueries or createCachedQueries (depending on cache config)
 * - createMutations
 * - Transaction support
 *
 * @example
 * ```ts
 * const productRepo = createRepository<Product, CreateProductInput, UpdateProductInput, typeof products>(
 *   db,
 *   {
 *     table: products,
 *     softDelete: true,
 *     cache: { prefix: 'product', ttl: 300 },
 *   }
 * )
 *
 * // Full CRUD operations
 * const product = await productRepo.create({ title: 'New Product' })
 * const found = await productRepo.findById(product.id)
 * await productRepo.update(product.id, { title: 'Updated' }, product.version)
 * await productRepo.delete(product.id)
 *
 * // Transaction support
 * await productRepo.transaction(async (txRepo) => {
 *   const p1 = await txRepo.create({ title: 'Product 1' })
 *   const p2 = await txRepo.create({ title: 'Product 2' })
 *   return [p1, p2]
 * })
 * ```
 */
export function createRepository<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
  TTable extends PgTable,
>(
  db: NodePgDatabase<Record<string, unknown>>,
  config: RepositoryConfig<TTable>,
) {
  const { cache, ...baseConfig } = config

  // Create queries (with or without cache)
  const queries = cache
    ? createCachedQueries<T, TTable>(db, { ...baseConfig, cache })
    : createQueries<T, TTable>(db, baseConfig)

  // Create mutations with cache invalidation if cache is configured
  const mutations = createMutations<T, CreateInput, UpdateInput, TTable>(db, baseConfig)

  // Get cache manager for invalidation
  const cacheManager = cache ? useCacheManager(cache.prefix) : undefined

  // Wrap mutations to invalidate cache
  const wrappedMutations = {
    create: async (input: CreateInput): Promise<T> => {
      const result = await mutations.create(input)
      // No cache to invalidate on create
      return result
    },

    createMany: async (inputs: CreateInput[]): Promise<T[]> => {
      const results = await mutations.createMany(inputs)
      // No cache to invalidate on create
      return results
    },

    update: async (id: string, input: UpdateInput, expectedVersion: number): Promise<T> => {
      const result = await mutations.update(id, input, expectedVersion)
      if (cacheManager) {
        await cacheManager.delete(id)
        await cacheManager.invalidate(`${id}:*`)
        await cacheManager.invalidate(`batch:*${id}*`)
      }
      return result
    },

    delete: async (id: string) => {
      const result = await mutations.delete(id)
      if (cacheManager) {
        await cacheManager.delete(id)
        await cacheManager.invalidate(`${id}:*`)
        await cacheManager.invalidate(`batch:*${id}*`)
      }
      return result
    },

    hardDelete: async (id: string): Promise<boolean> => {
      const result = await mutations.hardDelete(id)
      if (cacheManager) {
        await cacheManager.delete(id)
        await cacheManager.invalidate(`${id}:*`)
        await cacheManager.invalidate(`batch:*${id}*`)
      }
      return result
    },

    ...(mutations.restore && {
      restore: async (id: string): Promise<T> => {
        const result = await mutations.restore!(id)
        if (cacheManager) {
          await cacheManager.delete(id)
        }
        return result
      },
    }),
  }

  /**
   * Execute operations within a database transaction
   */
  const transaction = async <R>(
    fn: (repo: ReturnType<typeof createRepository<T, CreateInput, UpdateInput, TTable>>) => Promise<R>,
  ): Promise<R> => {
    return db.transaction(async (tx) => {
      // Create a new repository instance with the transaction connection
      // Note: Cache is shared across transaction
      const txRepo = createRepository<T, CreateInput, UpdateInput, TTable>(
        tx as unknown as NodePgDatabase<Record<string, unknown>>,
        config,
      )
      return fn(txRepo)
    })
  }

  return {
    ...queries,
    ...wrappedMutations,
    transaction,
    _db: db,
    _table: config.table,
    _config: config,
  }
}

/**
 * Type helper for Repository return type
 */
export type Repository<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
> = ReturnType<typeof createRepository<T, CreateInput, UpdateInput, PgTable>>
