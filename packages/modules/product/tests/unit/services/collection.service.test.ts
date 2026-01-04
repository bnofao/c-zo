import { describe, it, expect, beforeEach } from 'vitest'
import { CollectionService } from '../../../src/services/collection.service'
import { testDb } from '../../setup'

describe('CollectionService', () => {
  let collectionService: CollectionService

  beforeEach(async () => {
    collectionService = new CollectionService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_collections').execute()
    }
  })

  describe('createCollection', () => {
    it('should create collection with auto-generated handle', async () => {
      const collection = await collectionService.createCollection('Summer Sale')

      expect(collection.id).toBeDefined()
      expect(collection.title).toBe('Summer Sale')
      expect(collection.handle).toBe('summer-sale')
    })

    it('should create collection with custom handle', async () => {
      const collection = await collectionService.createCollection('Summer Sale', 'summer-2024')

      expect(collection.handle).toBe('summer-2024')
    })
  })

  describe('getCollection', () => {
    it('should get collection by ID', async () => {
      const created = await collectionService.createCollection('Winter Collection')

      const retrieved = await collectionService.getCollection(created.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.title).toBe('Winter Collection')
    })

    it('should return null for non-existent collection', async () => {
      const retrieved = await collectionService.getCollection('non-existent')

      expect(retrieved).toBeNull()
    })
  })

  describe('getCollectionByHandle', () => {
    it('should get collection by handle', async () => {
      await collectionService.createCollection('Winter Collection', 'winter-2024')

      const retrieved = await collectionService.getCollectionByHandle('winter-2024')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.title).toBe('Winter Collection')
    })
  })

  describe('updateCollection', () => {
    it('should update collection title', async () => {
      const collection = await collectionService.createCollection('Summer Collection')

      const updated = await collectionService.updateCollection(
        collection.id,
        'Summer Sale 2024'
      )

      expect(updated.title).toBe('Summer Sale 2024')
    })

    it('should update collection handle', async () => {
      const collection = await collectionService.createCollection('Collection')

      const updated = await collectionService.updateCollection(
        collection.id,
        undefined,
        'new-handle'
      )

      expect(updated.handle).toBe('new-handle')
    })
  })

  describe('deleteCollection', () => {
    it('should soft delete collection', async () => {
      const collection = await collectionService.createCollection('Old Collection')

      const result = await collectionService.deleteCollection(collection.id)

      expect(result.success).toBe(true)

      const retrieved = await collectionService.getCollection(collection.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('listCollections', () => {
    it('should list all collections alphabetically', async () => {
      await collectionService.createCollection('Winter')
      await collectionService.createCollection('Summer')
      await collectionService.createCollection('Spring')

      const collections = await collectionService.listCollections()

      expect(collections.length).toBe(3)
      expect(collections[0].title).toBe('Spring')
      expect(collections[1].title).toBe('Summer')
      expect(collections[2].title).toBe('Winter')
    })
  })
})

