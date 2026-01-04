import { describe, it, expect, beforeEach } from 'vitest'
import { TypeService } from '../../../src/services/type.service'
import { testDb } from '../../setup'

describe('TypeService', () => {
  let typeService: TypeService

  beforeEach(async () => {
    typeService = new TypeService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_types').execute()
    }
  })

  describe('createType', () => {
    it('should create a product type', async () => {
      const type = await typeService.createType('T-Shirt')

      expect(type.id).toBeDefined()
      expect(type.value).toBe('T-Shirt')
    })
  })

  describe('getTypeByValue', () => {
    it('should get type by value', async () => {
      await typeService.createType('Hoodie')

      const retrieved = await typeService.getTypeByValue('Hoodie')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.value).toBe('Hoodie')
    })
  })

  describe('updateType', () => {
    it('should update type value', async () => {
      const type = await typeService.createType('Shirt')

      const updated = await typeService.updateType(type.id, 'T-Shirt')

      expect(updated.value).toBe('T-Shirt')
    })
  })

  describe('deleteType', () => {
    it('should soft delete type', async () => {
      const type = await typeService.createType('Old Type')

      const result = await typeService.deleteType(type.id)

      expect(result.success).toBe(true)

      const retrieved = await typeService.getType(type.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('listTypes', () => {
    it('should list all types alphabetically', async () => {
      await typeService.createType('Hoodie')
      await typeService.createType('T-Shirt')
      await typeService.createType('Jacket')

      const types = await typeService.listTypes()

      expect(types.length).toBe(3)
      expect(types[0].value).toBe('Hoodie')
      expect(types[1].value).toBe('Jacket')
      expect(types[2].value).toBe('T-Shirt')
    })
  })
})

