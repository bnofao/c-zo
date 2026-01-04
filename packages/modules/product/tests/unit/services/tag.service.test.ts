import { describe, it, expect, beforeEach } from 'vitest'
import { TagService } from '../../../src/services/tag.service'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('TagService', () => {
  let tagService: TagService
  let productService: ProductService

  beforeEach(async () => {
    tagService = new TagService(testDb)
    productService = new ProductService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products_tags').execute()
      await testDb.deleteFrom('p_tags').execute()
      await testDb.deleteFrom('products').execute()
    }
  })

  describe('createTag', () => {
    it('should create a tag', async () => {
      const tag = await tagService.createTag('sale')

      expect(tag.id).toBeDefined()
      expect(tag.value).toBe('sale')
    })
  })

  describe('getTagByValue', () => {
    it('should get tag by value', async () => {
      await tagService.createTag('featured')

      const retrieved = await tagService.getTagByValue('featured')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.value).toBe('featured')
    })
  })

  describe('updateTag', () => {
    it('should update tag value', async () => {
      const tag = await tagService.createTag('old-tag')

      const updated = await tagService.updateTag(tag.id, 'new-tag')

      expect(updated.value).toBe('new-tag')
    })
  })

  describe('deleteTag', () => {
    it('should soft delete tag', async () => {
      const tag = await tagService.createTag('obsolete')

      const result = await tagService.deleteTag(tag.id)

      expect(result.success).toBe(true)

      const retrieved = await tagService.getTag(tag.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('listTags', () => {
    it('should list all tags alphabetically', async () => {
      await tagService.createTag('winter')
      await tagService.createTag('summer')
      await tagService.createTag('sale')

      const tags = await tagService.listTags()

      expect(tags.length).toBe(3)
      expect(tags[0].value).toBe('sale')
      expect(tags[1].value).toBe('summer')
      expect(tags[2].value).toBe('winter')
    })
  })

  describe('assignTagsToProduct', () => {
    it('should assign tags to product', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const tag1 = await tagService.createTag('featured')
      const tag2 = await tagService.createTag('sale')

      await tagService.assignTagsToProduct(product.id, [tag1.id, tag2.id])

      const productTags = await tagService.getProductTags(product.id)

      expect(productTags.length).toBe(2)
      expect(productTags.map(t => t.value).sort()).toEqual(['featured', 'sale'])
    })

    it('should replace existing tag assignments', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const tag1 = await tagService.createTag('old-tag')
      const tag2 = await tagService.createTag('new-tag')

      await tagService.assignTagsToProduct(product.id, [tag1.id])

      let productTags = await tagService.getProductTags(product.id)
      expect(productTags.length).toBe(1)

      await tagService.assignTagsToProduct(product.id, [tag2.id])

      productTags = await tagService.getProductTags(product.id)
      expect(productTags.length).toBe(1)
      expect(productTags[0].value).toBe('new-tag')
    })
  })
})

