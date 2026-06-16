import { DrizzleDb } from '@czo/kit/db'
import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { categories, productCategories, products, productTypes } from '../database/schema'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'

it.layer(ProductPostgresLayer, { timeout: 120_000 })('RQBv2 product where contract', (it) => {
  it.effect('operator filter inside a relational where resolves', () =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      yield* truncateProduct

      const type = (yield* db.insert(productTypes).values({ name: 'T', slug: 't', organizationId: null }).returning())[0]!
      const cat = (yield* db.insert(categories).values({ name: 'C', slug: 'c', organizationId: null }).returning())[0]!
      const pIn = (yield* db.insert(products).values({ productTypeId: type.id, organizationId: null, handle: 'p-in', name: 'In' }).returning())[0]!
      yield* db.insert(products).values({ productTypeId: type.id, organizationId: null, handle: 'p-out', name: 'Out' }).returning()
      yield* db.insert(productCategories).values({ productId: pIn.id, categoryId: cat.id, organizationId: null })

      const byCategory = yield* db.query.products!.findMany({
        where: { categories: { categoryId: { in: [cat.id] } } } as any,
      })
      expect(byCategory.map(p => p.handle)).toEqual(['p-in'])
    }))
})
