import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { TypeService } from '../../../src/services/type.service'
import { productType } from '../../../src/schema/type/resolvers/Query/productType'
import { productTypes } from '../../../src/schema/type/resolvers/Query/productTypes'
import { createProductType } from '../../../src/schema/type/resolvers/Mutation/createProductType'
import { updateProductType } from '../../../src/schema/type/resolvers/Mutation/updateProductType'
import { deleteProductType } from '../../../src/schema/type/resolvers/Mutation/deleteProductType'

describe('Type Resolver Integration Tests', () => {
  let context: GraphQLContext

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products').execute()
      await testDb.deleteFrom('p_types').execute()
    }

    // Setup context
    const typeService = new TypeService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        type: typeService,
      },
    } as any
  })

  describe('productType query', () => {
    it('should fetch product type by ID', async () => {
      const created = await context.services.type.createType('Digital Download')

      const result = await productType(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.value).toBe('Digital Download')
    })

    it('should return null for non-existent type', async () => {
      const result = await productType(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result).toBeNull()
    })
  })

  describe('productTypes query', () => {
    it('should fetch all product types', async () => {
      await context.services.type.createType('Physical')
      await context.services.type.createType('Digital')
      await context.services.type.createType('Service')

      const result = await productTypes(
        null,
        {},
        context,
        {} as any,
      )

      expect(result).toHaveLength(3)
      expect(result.map(t => t.value).sort()).toEqual(['Digital', 'Physical', 'Service'])
    })
  })

  describe('createProductType mutation', () => {
    it('should create a new product type', async () => {
      const result = await createProductType(
        null,
        { value: 'Subscription' },
        context,
        {} as any,
      )

      expect(result.type).toBeDefined()
      expect(result.type?.value).toBe('Subscription')
    })
  })

  describe('updateProductType mutation', () => {
    it('should update product type', async () => {
      const created = await context.services.type.createType('Old Type')

      const result = await updateProductType(
        null,
        {
          id: created.id,
          value: 'New Type',
        },
        context,
        {} as any,
      )

      expect(result.type).toBeDefined()
      expect(result.type?.value).toBe('New Type')
    })
  })

  describe('deleteProductType mutation', () => {
    it('should soft delete product type', async () => {
      const created = await context.services.type.createType('To Delete')

      const result = await deleteProductType(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.type.getType(created.id)
      expect(retrieved).toBeNull()
    })
  })
})


