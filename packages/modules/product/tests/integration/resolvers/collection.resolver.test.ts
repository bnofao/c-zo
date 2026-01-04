import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { CollectionService } from '../../../src/services/collection.service'
import { ProductService } from '../../../src/services/product.service'
import { collection } from '../../../src/schema/collection/resolvers/Query/collection'
import { productsByCollection } from '../../../src/schema/collection/resolvers/Query/productsByCollection'
import { createCollection } from '../../../src/schema/collection/resolvers/Mutation/createCollection'
import { updateCollection } from '../../../src/schema/collection/resolvers/Mutation/updateCollection'
import { deleteCollection } from '../../../src/schema/collection/resolvers/Mutation/deleteCollection'

describe('Collection Resolver Integration Tests', () => {
  let context: GraphQLContext

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products').execute()
      await testDb.deleteFrom('p_collections').execute()
    }

    // Setup context
    const collectionService = new CollectionService(testDb)
    const productService = new ProductService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        collection: collectionService,
        product: productService,
      },
    } as any
  })

  describe('collection query', () => {
    it('should fetch collection by ID', async () => {
      const created = await context.services.collection.createCollection(
        'Summer Collection',
        'summer-2025',
      )

      const result = await collection(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.title).toBe('Summer Collection')
      expect(result?.handle).toBe('summer-2025')
    })

    it('should return null for non-existent collection', async () => {
      const result = await collection(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result).toBeNull()
    })
  })

  describe('productsByCollection query', () => {
    it('should fetch products in a collection', async () => {
      const coll = await context.services.collection.createCollection('Test Collection')

      // Create products with this collection
      await testDb
        .insertInto('products')
        .values([
          {
            id: 'prod1',
            title: 'Product 1',
            handle: 'product-1',
            collection_id: coll.id,
            status: 'published',
            is_giftcard: false,
            discountable: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
          {
            id: 'prod2',
            title: 'Product 2',
            handle: 'product-2',
            collection_id: coll.id,
            status: 'published',
            is_giftcard: false,
            discountable: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ])
        .execute()

      const result = await productsByCollection(
        null,
        { collectionId: coll.id, pagination: { limit: 10, offset: 0 } },
        context,
        {} as any,
      )

      expect(result.edges).toHaveLength(2)
      expect(result.totalCount).toBe(2)
    })
  })

  describe('createCollection mutation', () => {
    it('should create a new collection', async () => {
      const result = await createCollection(
        null,
        {
          input: {
            title: 'Winter Collection',
            handle: 'winter-2025',
          },
        },
        context,
        {} as any,
      )

      expect(result.collection).toBeDefined()
      expect(result.collection?.title).toBe('Winter Collection')
      expect(result.collection?.handle).toBe('winter-2025')
    })
  })

  describe('updateCollection mutation', () => {
    it('should update collection', async () => {
      const created = await context.services.collection.createCollection('Old Title')

      const result = await updateCollection(
        null,
        {
          id: created.id,
          input: {
            title: 'New Title',
            expectedUpdatedAt: created.updated_at,
          },
        },
        context,
        {} as any,
      )

      expect(result.collection).toBeDefined()
      expect(result.collection?.title).toBe('New Title')
    })
  })

  describe('deleteCollection mutation', () => {
    it('should soft delete collection', async () => {
      const created = await context.services.collection.createCollection('To Delete')

      const result = await deleteCollection(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.collection.getCollection(created.id)
      expect(retrieved).toBeNull()
    })
  })
})


