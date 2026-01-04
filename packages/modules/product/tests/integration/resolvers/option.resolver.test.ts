import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { ProductService } from '../../../src/services/product.service'
import { OptionService } from '../../../src/services/option.service'
import { productOptions } from '../../../src/schema/option/resolvers/Query/productOptions'
import { createProductOption } from '../../../src/schema/option/resolvers/Mutation/createProductOption'
import { addOptionValue } from '../../../src/schema/option/resolvers/Mutation/addOptionValue'
import { deleteOptionValue } from '../../../src/schema/option/resolvers/Mutation/deleteOptionValue'

describe('Option Resolver Integration Tests', () => {
  let context: GraphQLContext
  let testProductId: string

  beforeEach(async () => {
    // Clean up test data (order matters for foreign key constraints)
    if (testDb) {
      await testDb.deleteFrom('p_variants_options').execute()
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('p_option_values').execute()
      await testDb.deleteFrom('p_options').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Setup context
    const productService = new ProductService(testDb)
    const optionService = new OptionService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        product: productService,
        option: optionService,
      },
    } as any

    // Create a test product
    const product = await productService.createProduct({
      title: 'Test Product',
      status: 'draft',
    })
    testProductId = product.id
  })

  describe('productOptions query', () => {
    it('should fetch all options for a product', async () => {
      // Create options
      await context.services.option.createOption(testProductId, 'Size')
      await context.services.option.createOption(testProductId, 'Color')

      const result = await productOptions(
        null,
        { productId: testProductId },
        context,
        {} as any,
      )

      expect(result).toHaveLength(2)
      expect(result.map(o => o.title).sort()).toEqual(['Color', 'Size'])
    })

    it('should return empty array for product with no options', async () => {
      const result = await productOptions(
        null,
        { productId: testProductId },
        context,
        {} as any,
      )

      expect(result).toHaveLength(0)
    })
  })

  describe('createProductOption mutation', () => {
    it('should create option with values', async () => {
      const result = await createProductOption(
        null,
        {
          productId: testProductId,
          title: 'Size',
          values: ['Small', 'Medium', 'Large'],
        },
        context,
        {} as any,
      )

      expect(result.option).toBeDefined()
      expect(result.option?.title).toBe('Size')
      expect(result.values).toHaveLength(3)
      expect(result.values?.map(v => v.value).sort()).toEqual(['Large', 'Medium', 'Small'])
    })

    it('should handle errors gracefully', async () => {
      const result = await createProductOption(
        null,
        {
          productId: 'non-existent',
          title: 'Size',
          values: ['Small'],
        },
        context,
        {} as any,
      )

      expect(result.errors).toBeDefined()
      expect(result.errors?.[0].code).toBe('INTERNAL_ERROR')
    })
  })

  describe('addOptionValue mutation', () => {
    it('should add value to existing option', async () => {
      const option = await context.services.option.createOption(testProductId, 'Size')

      const result = await addOptionValue(
        null,
        {
          optionId: option.id,
          value: 'Extra Large',
        },
        context,
        {} as any,
      )

      expect(result.optionValue).toBeDefined()
      expect(result.optionValue?.value).toBe('Extra Large')
    })
  })

  describe('deleteOptionValue mutation', () => {
    it('should soft delete option value', async () => {
      const option = await context.services.option.createOption(testProductId, 'Size')
      const value = await context.services.option.createOptionValue(option.id, 'Small')

      const result = await deleteOptionValue(
        null,
        { id: value.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify it's deleted
      const retrieved = await context.services.option.getOptionValue(value.id)
      expect(retrieved).toBeNull()
    })
  })
})


