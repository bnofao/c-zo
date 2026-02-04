import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError, OptimisticLockError } from './errors'
import { createMutations } from './mutations'

// Mock table structure
const mockTable = {
  id: { name: 'id' },
  version: { name: 'version' },
  createdAt: { name: 'created_at' },
  updatedAt: { name: 'updated_at' },
  deletedAt: { name: 'deleted_at' },
  title: { name: 'title' },
  handle: { name: 'handle' },
  status: { name: 'status' },
} as unknown as PgTable

// Mock entity
interface TestEntity {
  id: string
  version: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  title: string
  handle: string
  status: string
}

interface CreateInput {
  title: string
  handle?: string
  status?: string
}

interface UpdateInput {
  title?: string
  handle?: string
  status?: string
}

// Create a chainable mock query builder for inserts
function createMockInsertBuilder(returnValue: unknown = []) {
  const builder: Record<string, unknown> = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(returnValue)),
  }
  return builder
}

// Create a chainable mock query builder for updates
function createMockUpdateBuilder(returnValue: unknown = []) {
  const builder: Record<string, unknown> = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(returnValue)),
  }
  return builder
}

// Create a chainable mock query builder for deletes
function createMockDeleteBuilder(returnValue: unknown = []) {
  const builder: Record<string, unknown> = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(returnValue)),
  }
  return builder
}

// Create mock database
function createMockDb(options: {
  insertReturn?: unknown
  updateReturn?: unknown
  deleteReturn?: unknown
} = {}) {
  return {
    select: vi.fn(),
    insert: vi.fn().mockReturnValue(createMockInsertBuilder(options.insertReturn ?? [])),
    update: vi.fn().mockReturnValue(createMockUpdateBuilder(options.updateReturn ?? [])),
    delete: vi.fn().mockReturnValue(createMockDeleteBuilder(options.deleteReturn ?? [])),
  } as unknown as NodePgDatabase<Record<string, unknown>>
}

describe('createMutations', () => {
  let mockDb: NodePgDatabase<Record<string, unknown>>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create entity with generated id and version', async () => {
      const now = new Date()
      const createdEntity: TestEntity = {
        id: 'generated-id',
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        title: 'New Entity',
        handle: 'new-entity',
        status: 'draft',
      }

      mockDb = createMockDb({ insertReturn: [createdEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.create({ title: 'New Entity' })

      expect(result).toEqual(createdEntity)
      expect(mockDb.insert).toHaveBeenCalledWith(mockTable)
    })

    it('should set version to 1 for new entities', async () => {
      const createdEntity: TestEntity = {
        id: 'id',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Test',
        handle: 'test',
        status: 'draft',
      }

      mockDb = createMockDb({ insertReturn: [createdEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.create({ title: 'Test' })

      expect(result.version).toBe(1)
    })
  })

  describe('createMany', () => {
    it('should return empty array for empty inputs', async () => {
      mockDb = createMockDb()
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.createMany([])

      expect(result).toEqual([])
      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('should create multiple entities', async () => {
      const entities: TestEntity[] = [
        {
          id: '1',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'Entity 1',
          handle: 'entity-1',
          status: 'draft',
        },
        {
          id: '2',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'Entity 2',
          handle: 'entity-2',
          status: 'draft',
        },
      ]

      mockDb = createMockDb({ insertReturn: entities })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.createMany([
        { title: 'Entity 1' },
        { title: 'Entity 2' },
      ])

      expect(result).toHaveLength(2)
      expect(mockDb.insert).toHaveBeenCalledWith(mockTable)
    })
  })

  describe('update', () => {
    it('should update entity with optimistic locking', async () => {
      const updatedEntity: TestEntity = {
        id: '123',
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Updated',
        handle: 'updated',
        status: 'published',
      }

      mockDb = createMockDb({ updateReturn: [updatedEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.update('123', { title: 'Updated' }, 1)

      expect(result).toEqual(updatedEntity)
      expect(mockDb.update).toHaveBeenCalledWith(mockTable)
    })

    it('should throw OptimisticLockError on version mismatch', async () => {
      mockDb = createMockDb({ updateReturn: [] }) // No rows returned = version mismatch
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      await expect(
        mutations.update('123', { title: 'Updated' }, 1),
      ).rejects.toThrow(OptimisticLockError)
    })

    it('should throw OptimisticLockError with correct properties', async () => {
      mockDb = createMockDb({ updateReturn: [] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      try {
        await mutations.update('123', { title: 'Updated' }, 5)
        expect.fail('Should have thrown')
      }
      catch (error) {
        expect(error).toBeInstanceOf(OptimisticLockError)
        expect((error as OptimisticLockError).entityId).toBe('123')
        expect((error as OptimisticLockError).expectedVersion).toBe(5)
      }
    })
  })

  describe('delete (soft delete)', () => {
    it('should soft delete entity', async () => {
      const deletedEntity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        title: 'Deleted',
        handle: 'deleted',
        status: 'inactive',
      }

      mockDb = createMockDb({ updateReturn: [deletedEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.delete('123')

      expect(result.success).toBe(true)
      expect(result.deletedAt).toBeInstanceOf(Date)
      expect(mockDb.update).toHaveBeenCalledWith(mockTable)
    })

    it('should throw NotFoundError for non-existent entity', async () => {
      mockDb = createMockDb({ updateReturn: [] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      await expect(mutations.delete('non-existent')).rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError with correct entityId', async () => {
      mockDb = createMockDb({ updateReturn: [] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      try {
        await mutations.delete('my-entity-id')
        expect.fail('Should have thrown')
      }
      catch (error) {
        expect(error).toBeInstanceOf(NotFoundError)
        expect((error as NotFoundError).entityId).toBe('my-entity-id')
      }
    })
  })

  describe('delete (hard delete when softDelete disabled)', () => {
    it('should hard delete entity when softDelete is false', async () => {
      const deletedEntity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Deleted',
        handle: 'deleted',
        status: 'inactive',
      }

      mockDb = createMockDb({ deleteReturn: [deletedEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: false },
      )

      const result = await mutations.delete('123')

      expect(result.success).toBe(true)
      expect(mockDb.delete).toHaveBeenCalledWith(mockTable)
    })
  })

  describe('hardDelete', () => {
    it('should permanently delete entity', async () => {
      const deletedEntity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Deleted',
        handle: 'deleted',
        status: 'inactive',
      }

      mockDb = createMockDb({ deleteReturn: [deletedEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.hardDelete('123')

      expect(result).toBe(true)
      expect(mockDb.delete).toHaveBeenCalledWith(mockTable)
    })

    it('should return false when entity not found', async () => {
      mockDb = createMockDb({ deleteReturn: [] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      const result = await mutations.hardDelete('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('restore', () => {
    it('should restore soft-deleted entity', async () => {
      const restoredEntity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Restored',
        handle: 'restored',
        status: 'active',
      }

      mockDb = createMockDb({ updateReturn: [restoredEntity] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      expect(mutations.restore).toBeDefined()
      const result = await mutations.restore!('123')

      expect(result).toEqual(restoredEntity)
      expect(mockDb.update).toHaveBeenCalledWith(mockTable)
    })

    it('should throw NotFoundError when restoring non-existent entity', async () => {
      mockDb = createMockDb({ updateReturn: [] })
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      await expect(mutations.restore!('non-existent')).rejects.toThrow(NotFoundError)
    })

    it('should not have restore when softDelete is false', () => {
      mockDb = createMockDb()
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: false },
      )

      expect(mutations.restore).toBeUndefined()
    })
  })

  describe('exposed internals', () => {
    it('should expose _db, _table, and _config', () => {
      mockDb = createMockDb()
      const mutations = createMutations<TestEntity, CreateInput, UpdateInput, typeof mockTable>(
        mockDb,
        { table: mockTable, softDelete: true },
      )

      expect(mutations._db).toBe(mockDb)
      expect(mutations._table).toBe(mockTable)
      expect(mutations._config).toEqual({
        table: mockTable,
        softDelete: true,
      })
    })
  })
})
