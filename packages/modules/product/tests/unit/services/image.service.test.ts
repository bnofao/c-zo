import { describe, it, expect, beforeEach } from 'vitest'
import { ImageService } from '../../../src/services/image.service'
import { ProductService } from '../../../src/services/product.service'
import { VariantService } from '../../../src/services/variant.service'
import { testDb } from '../../setup'

describe('ImageService', () => {
  let imageService: ImageService
  let productService: ProductService
  let variantService: VariantService

  beforeEach(async () => {
    imageService = new ImageService(testDb)
    productService = new ProductService(testDb)
    variantService = new VariantService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products_images').execute()
      await testDb.deleteFrom('images').execute()
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('products').execute()
    }
  })

  describe('createImage', () => {
    it('should create an image', async () => {
      const image = await imageService.createImage('https://example.com/image.jpg')

      expect(image.id).toBeDefined()
      expect(image.url).toBe('https://example.com/image.jpg')
    })
  })

  describe('updateImage', () => {
    it('should update image URL', async () => {
      const image = await imageService.createImage('https://example.com/old.jpg')

      const updated = await imageService.updateImage(image.id, 'https://example.com/new.jpg')

      expect(updated.url).toBe('https://example.com/new.jpg')
    })
  })

  describe('deleteImage', () => {
    it('should soft delete image', async () => {
      const image = await imageService.createImage('https://example.com/image.jpg')

      const result = await imageService.deleteImage(image.id)

      expect(result.success).toBe(true)

      const retrieved = await imageService.getImage(image.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('Product Images', () => {
    it('should assign image to product', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const image = await imageService.createImage('https://example.com/product.jpg')

      await imageService.assignImageToProduct(product.id, image.id)

      const productImages = await imageService.getProductImages(product.id)

      expect(productImages.length).toBe(1)
      expect(productImages[0].url).toBe('https://example.com/product.jpg')
    })

    it('should remove image from product', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const image = await imageService.createImage('https://example.com/product.jpg')

      await imageService.assignImageToProduct(product.id, image.id)
      await imageService.removeImageFromProduct(product.id, image.id)

      const productImages = await imageService.getProductImages(product.id)

      expect(productImages.length).toBe(0)
    })
  })

  describe('Variant Images', () => {
    it('should assign image to variant', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const variant = await variantService.createVariant(product.id, {
        title: 'Variant',
      })

      const image = await imageService.createImage('https://example.com/variant.jpg')

      await imageService.assignImageToProduct(product.id, image.id, variant.id)

      const variantImages = await imageService.getVariantImages(variant.id)

      expect(variantImages.length).toBe(1)
      expect(variantImages[0].url).toBe('https://example.com/variant.jpg')
    })
  })

  describe('Thumbnails', () => {
    it('should set product thumbnail', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      await imageService.setProductThumbnail(product.id, 'https://example.com/thumb.jpg')

      const retrieved = await productService.getProduct(product.id)

      expect(retrieved!.thumbnail).toBe('https://example.com/thumb.jpg')
    })

    it('should set variant thumbnail', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const variant = await variantService.createVariant(product.id, {
        title: 'Variant',
      })

      await imageService.setVariantThumbnail(variant.id, 'https://example.com/thumb.jpg')

      const retrieved = await variantService.getVariant(variant.id)

      expect(retrieved!.thumbnail).toBe('https://example.com/thumb.jpg')
    })
  })
})

