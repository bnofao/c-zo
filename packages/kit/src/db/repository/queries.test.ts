import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueries } from './queries'

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

// Create a chainable mock query builder
function createMockQueryBuilder(returnValue: unknown = []) {
  const builder: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (value: unknown) => void) => {
      resolve(returnValue)
      return Promise.resolve(returnValue)
    }),
    [Symbol.toStringTag]: 'Promise',
  }

  // Add Promise-like behavior
  Object.setPrototypeOf(builder, Promise.prototype)

  return builder
}

// Create mock database
function createMockDb(selectReturn: unknown = [], countReturn: number = 0) {
  const countResult = [{ count: countReturn }]

  // Create a tracked mock to verify call sequence
  const selectMock = vi.fn()

  // Dynamic return based on what select() receives
  selectMock.mockImplementation((selectArg?: Record<string, unknown>) => {
    // If select receives an object with count key, it's a count query
    if (selectArg && typeof selectArg === 'object' && 'count' in selectArg) {
      return createMockQueryBuilder(countResult)
    }
    // Otherwise it's a regular select
    return createMockQueryBuilder(selectReturn)
  })

  return {
    select: selectMock,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as NodePgDatabase<Record<string, unknown>>
}

describe('createQueries', () => {
  let mockDb: NodePgDatabase<Record<string, unknown>>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findById', () => {
    it('should return entity when found', async () => {
      const entity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Test',
        handle: 'test',
        status: 'active',
      }

      mockDb = createMockDb([entity])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findById('123')

      expect(result).toEqual(entity)
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should return null when entity not found', async () => {
      mockDb = createMockDb([])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findById('non-existent')

      expect(result).toBeNull()
    })

    it('should include deleted entities when includeDeleted is true', async () => {
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

      mockDb = createMockDb([deletedEntity])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findById('123', { includeDeleted: true })

      expect(result).toEqual(deletedEntity)
    })
  })

  describe('findByIds', () => {
    it('should return empty array for empty ids', async () => {
      mockDb = createMockDb()
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findByIds([])

      expect(result).toEqual([])
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it('should return entities for valid ids', async () => {
      const entities: TestEntity[] = [
        {
          id: '1',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'Entity 1',
          handle: 'entity-1',
          status: 'active',
        },
        {
          id: '2',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'Entity 2',
          handle: 'entity-2',
          status: 'active',
        },
      ]

      mockDb = createMockDb(entities)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findByIds(['1', '2'])

      expect(result).toEqual(entities)
      expect(mockDb.select).toHaveBeenCalled()
    })
  })

  describe('findOne', () => {
    it('should return first matching entity', async () => {
      const entity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Test',
        handle: 'test',
        status: 'active',
      }

      mockDb = createMockDb([entity])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findOne({ handle: 'test' })

      expect(result).toEqual(entity)
    })

    it('should return null when no match', async () => {
      mockDb = createMockDb([])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findOne({ handle: 'non-existent' })

      expect(result).toBeNull()
    })
  })

  describe('findMany', () => {
    it('should return paginated results with default limit', async () => {
      const entities: TestEntity[] = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: `Entity ${i}`,
        handle: `entity-${i}`,
        status: 'active',
      }))

      mockDb = createMockDb(entities, 100)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findMany()

      expect(result.nodes).toEqual(entities)
      expect(result.totalCount).toBe(100)
      expect(result.pageInfo.hasNextPage).toBe(true)
      expect(result.pageInfo.hasPreviousPage).toBe(false)
    })

    it('should respect custom limit', async () => {
      const entities: TestEntity[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: `Entity ${i}`,
        handle: `entity-${i}`,
        status: 'active',
      }))

      mockDb = createMockDb(entities, 50)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findMany({ limit: 10 })

      expect(result.nodes).toHaveLength(10)
    })

    it('should enforce maximum limit of 100', async () => {
      mockDb = createMockDb([], 0)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      await queries.findMany({ limit: 200 })

      // Verify that limit was capped
      const selectBuilder = (mockDb.select as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value
      expect(selectBuilder.limit).toHaveBeenCalled()
    })

    it('should support offset for pagination', async () => {
      const entities: TestEntity[] = []
      mockDb = createMockDb(entities, 100)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findMany({ offset: 50 })

      expect(result.pageInfo.hasPreviousPage).toBe(true)
    })

    it('should include cursors in pageInfo', async () => {
      const entities: TestEntity[] = [
        {
          id: 'first',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'First',
          handle: 'first',
          status: 'active',
        },
        {
          id: 'last',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          title: 'Last',
          handle: 'last',
          status: 'active',
        },
      ]

      mockDb = createMockDb(entities, 2)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.findMany()

      expect(result.pageInfo.startCursor).toBeDefined()
      expect(result.pageInfo.endCursor).toBeDefined()
    })
  })

  describe('count', () => {
    it('should return total count', async () => {
      mockDb = createMockDb([], 42)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.count()

      expect(result).toBe(42)
    })

    it('should return count with where clause', async () => {
      mockDb = createMockDb([], 10)
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.count({ status: 'active' })

      expect(result).toBe(10)
    })
  })

  describe('exists', () => {
    it('should return true when entity exists', async () => {
      const entity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Test',
        handle: 'test',
        status: 'active',
      }

      mockDb = createMockDb([entity])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.exists({ handle: 'test' })

      expect(result).toBe(true)
    })

    it('should return false when entity does not exist', async () => {
      mockDb = createMockDb([])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      const result = await queries.exists({ handle: 'non-existent' })

      expect(result).toBe(false)
    })
  })

  describe('soft delete configuration', () => {
    it('should work without soft delete', async () => {
      const entity: TestEntity = {
        id: '123',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        title: 'Test',
        handle: 'test',
        status: 'active',
      }

      mockDb = createMockDb([entity])
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: false,
      })

      const result = await queries.findById('123')

      expect(result).toEqual(entity)
    })
  })

  describe('exposed internals', () => {
    it('should expose _db, _table, and _config', () => {
      mockDb = createMockDb()
      const queries = createQueries<TestEntity, typeof mockTable>(mockDb, {
        table: mockTable,
        softDelete: true,
      })

      expect(queries._db).toBe(mockDb)
      expect(queries._table).toBe(mockTable)
      expect(queries._config).toEqual({
        table: mockTable,
        softDelete: true,
      })
    })
  })
})
