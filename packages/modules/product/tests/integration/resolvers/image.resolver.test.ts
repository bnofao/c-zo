import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { ImageService } from '../../../src/services/image.service'
import { ProductService } from '../../../src/services/product.service'
import { VariantService } from '../../../src/services/variant.service'
import { uploadProductImage } from '../../../src/schema/image/resolvers/Mutation/uploadProductImage'
import { associateImageWithVariant } from '../../../src/schema/image/resolvers/Mutation/associateImageWithVariant'
import { deleteProductImage } from '../../../src/schema/image/resolvers/Mutation/deleteProductImage'

describe('Image Resolver Integration Tests', () => {
  let context: GraphQLContext
  let testProductId: string
  let testVariantId: string

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products_images').execute()
      await testDb.deleteFrom('images').execute()
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Setup context
    const imageService = new ImageService(testDb)
    const productService = new ProductService(testDb)
    const variantService = new VariantService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        image: imageService,
        product: productService,
        variant: variantService,
      },
    } as any

    // Create test product and variant
    const product = await productService.createProduct({
      title: 'Test Product',
      status: 'draft',
    })
    testProductId = product.id

    const variant = await variantService.createVariant(testProductId, {
      title: 'Default Variant',
      sku: 'TEST-SKU',
    })
    testVariantId = variant.id
  })

  describe('uploadProductImage mutation', () => {
    it('should upload a new image', async () => {
      const result = await uploadProductImage(
        null,
        {
          productId: testProductId,
          url: 'https://example.com/image1.jpg',
          rank: 1,
        },
        context,
        {} as any,
      )

      expect(result.image).toBeDefined()
      expect(result.image?.url).toBe('https://example.com/image1.jpg')
      expect(result.image?.rank).toBe(1)
    })
  })

  describe('associateImageWithVariant mutation', () => {
    it('should associate image with variant', async () => {
      const image = await context.services.image.createImage('https://example.com/variant-image.jpg')

      const result = await associateImageWithVariant(
        null,
        {
          imageId: image.id,
          variantId: testVariantId,
        },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify association
      const associations = await testDb
        .selectFrom('products_images')
        .selectAll()
        .where('image_id', '=', image.id)
        .where('variant_id', '=', testVariantId)
        .execute()

      expect(associations).toHaveLength(1)
    })
  })

  describe('deleteProductImage mutation', () => {
    it('should soft delete product image', async () => {
      const image = await context.services.image.createImage('https://example.com/delete-me.jpg')

      const result = await deleteProductImage(
        null,
        { id: image.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.image.getImage(image.id)
      expect(retrieved).toBeNull()
    })
  })
})

