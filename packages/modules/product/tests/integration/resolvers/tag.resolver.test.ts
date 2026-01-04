import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { TagService } from '../../../src/services/tag.service'
import { ProductService } from '../../../src/services/product.service'
import { tag } from '../../../src/schema/tag/resolvers/Query/tag'
import { tags } from '../../../src/schema/tag/resolvers/Query/tags'
import { createTag } from '../../../src/schema/tag/resolvers/Mutation/createTag'
import { assignTagsToProduct } from '../../../src/schema/tag/resolvers/Mutation/assignTagsToProduct'
import { deleteTag } from '../../../src/schema/tag/resolvers/Mutation/deleteTag'

describe('Tag Resolver Integration Tests', () => {
  let context: GraphQLContext

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products_tags').execute()
      await testDb.deleteFrom('p_tags').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Setup context
    const tagService = new TagService(testDb)
    const productService = new ProductService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        tag: tagService,
        product: productService,
      },
    } as any
  })

  describe('tag query', () => {
    it('should fetch tag by ID', async () => {
      const created = await context.services.tag.createTag('organic')

      const result = await tag(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.value).toBe('organic')
    })

    it('should return null for non-existent tag', async () => {
      const result = await tag(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result).toBeNull()
    })
  })

  describe('tags query', () => {
    it('should fetch all tags', async () => {
      await context.services.tag.createTag('organic')
      await context.services.tag.createTag('vegan')
      await context.services.tag.createTag('sustainable')

      const result = await tags(
        null,
        { filter: {} },
        context,
        {} as any,
      )

      expect(result).toHaveLength(3)
      expect(result.map(t => t.value).sort()).toEqual(['organic', 'sustainable', 'vegan'])
    })

    it('should filter tags by value', async () => {
      await context.services.tag.createTag('organic')
      await context.services.tag.createTag('vegan')

      const result = await tags(
        null,
        { filter: { value: 'organic' } },
        context,
        {} as any,
      )

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe('organic')
    })
  })

  describe('createTag mutation', () => {
    it('should create a new tag', async () => {
      const result = await createTag(
        null,
        { value: 'eco-friendly' },
        context,
        {} as any,
      )

      expect(result.tag).toBeDefined()
      expect(result.tag?.value).toBe('eco-friendly')
    })
  })

  describe('assignTagsToProduct mutation', () => {
    it('should assign tags to product', async () => {
      const product = await context.services.product.createProduct({
        title: 'Test Product',
        status: 'draft',
      })
      const tag1 = await context.services.tag.createTag('organic')
      const tag2 = await context.services.tag.createTag('vegan')

      const result = await assignTagsToProduct(
        null,
        {
          productId: product.id,
          tagIds: [tag1.id, tag2.id],
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.id).toBe(product.id)

      // Verify tags were assigned
      const productTags = await context.services.tag.getProductTags(product.id)
      expect(productTags).toHaveLength(2)
    })
  })

  describe('deleteTag mutation', () => {
    it('should soft delete tag', async () => {
      const created = await context.services.tag.createTag('obsolete')

      const result = await deleteTag(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.tag.getTag(created.id)
      expect(retrieved).toBeNull()
    })
  })
})


