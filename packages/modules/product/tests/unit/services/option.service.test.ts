import { describe, it, expect, beforeEach } from 'vitest'
import { OptionService } from '../../../src/services/option.service'
import { VariantService } from '../../../src/services/variant.service'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('OptionService', () => {
  let optionService: OptionService
  let variantService: VariantService
  let productService: ProductService
  let testProductId: string

  beforeEach(async () => {
    optionService = new OptionService(testDb)
    variantService = new VariantService(testDb)
    productService = new ProductService(testDb)

    // Clean up test data (order matters for foreign key constraints)
    if (testDb) {
      await testDb.deleteFrom('p_variants_options').execute()
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('p_option_values').execute()
      await testDb.deleteFrom('p_options').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Create a test product
    const product = await productService.createProduct({
      title: 'Test Product',
      status: 'draft',
    })
    testProductId = product.id
  })

  describe('createOption', () => {
    it('should create a product option', async () => {
      const option = await optionService.createOption(testProductId, 'Size')

      expect(option.id).toBeDefined()
      expect(option.title).toBe('Size')
      expect(option.product_id).toBe(testProductId)
      expect(option.created_at).toBeInstanceOf(Date)
    })
  })

  describe('listProductOptions', () => {
    it('should list product options alphabetically', async () => {
      await optionService.createOption(testProductId, 'Color')
      await optionService.createOption(testProductId, 'Size')
      await optionService.createOption(testProductId, 'Material')

      const options = await optionService.listProductOptions(testProductId)

      expect(options.length).toBe(3)
      expect(options[0].title).toBe('Color')
      expect(options[1].title).toBe('Material')
      expect(options[2].title).toBe('Size')
    })
  })

  describe('updateOption', () => {
    it('should update option title', async () => {
      const option = await optionService.createOption(testProductId, 'Sise') // Typo

      const updated = await optionService.updateOption(option.id, 'Size')

      expect(updated.title).toBe('Size')
    })
  })

  describe('deleteOption', () => {
    it('should soft delete option', async () => {
      const option = await optionService.createOption(testProductId, 'Size')

      const result = await optionService.deleteOption(option.id)

      expect(result.success).toBe(true)
      expect(result.deletedAt).toBeInstanceOf(Date)

      const retrieved = await optionService.getOption(option.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('Option Values', () => {
    let sizeOption: any

    beforeEach(async () => {
      sizeOption = await optionService.createOption(testProductId, 'Size')
    })

    it('should create option value', async () => {
      const value = await optionService.createOptionValue(sizeOption.id, 'Medium')

      expect(value.id).toBeDefined()
      expect(value.value).toBe('Medium')
      expect(value.option_id).toBe(sizeOption.id)
    })

    it('should get all values for an option', async () => {
      await optionService.createOptionValue(sizeOption.id, 'Small')
      await optionService.createOptionValue(sizeOption.id, 'Medium')
      await optionService.createOptionValue(sizeOption.id, 'Large')

      const values = await optionService.getOptionValues(sizeOption.id)

      expect(values.length).toBe(3)
      expect(values.map(v => v.value).sort()).toEqual(['Large', 'Medium', 'Small'])
    })

    it('should update option value', async () => {
      const value = await optionService.createOptionValue(sizeOption.id, 'Medum') // Typo

      const updated = await optionService.updateOptionValue(value.id, 'Medium')

      expect(updated.value).toBe('Medium')
    })

    it('should delete option value', async () => {
      const value = await optionService.createOptionValue(sizeOption.id, 'Medium')

      const result = await optionService.deleteOptionValue(value.id)

      expect(result.success).toBe(true)

      const retrieved = await optionService.getOptionValue(value.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('Variant Options', () => {
    it('should assign option values to variant', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Medium Blue',
      })

      const sizeOption = await optionService.createOption(testProductId, 'Size')
      const mediumValue = await optionService.createOptionValue(sizeOption.id, 'Medium')

      const colorOption = await optionService.createOption(testProductId, 'Color')
      const blueValue = await optionService.createOptionValue(colorOption.id, 'Blue')

      await optionService.assignOptionsToVariant(variant.id, [mediumValue.id, blueValue.id])

      const variantOptions = await optionService.getVariantOptions(variant.id)

      expect(variantOptions.length).toBe(2)
      expect(variantOptions.map(o => o.value).sort()).toEqual(['Blue', 'Medium'])
    })

    it('should replace existing option assignments', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Variant',
      })

      const sizeOption = await optionService.createOption(testProductId, 'Size')
      const smallValue = await optionService.createOptionValue(sizeOption.id, 'Small')
      const mediumValue = await optionService.createOptionValue(sizeOption.id, 'Medium')

      await optionService.assignOptionsToVariant(variant.id, [smallValue.id])

      let variantOptions = await optionService.getVariantOptions(variant.id)
      expect(variantOptions.length).toBe(1)

      await optionService.assignOptionsToVariant(variant.id, [mediumValue.id])

      variantOptions = await optionService.getVariantOptions(variant.id)
      expect(variantOptions.length).toBe(1)
      expect(variantOptions[0].value).toBe('Medium')
    })
  })
})

