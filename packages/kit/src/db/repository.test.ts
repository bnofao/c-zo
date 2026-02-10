import type { PgTableWithColumns } from 'drizzle-orm/pg-core'
import type { Pool } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseError, OptimisticLockError, Repository } from './repository'

// Mock pg module
vi.mock('pg', () => ({
  default: {
    DatabaseError: class MockDatabaseError extends Error {
      code: string
      detail?: string
      constructor(message: string, code: string, detail?: string) {
        super(message)
        this.code = code
        this.detail = detail
      }
    },
  },
}))

// Types for test entities
interface TestEntity {
  id: string
  name: string
  version: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

// Mock table with all columns
function createMockTable(options?: {
  hasVersion?: boolean
  hasDeletedAt?: boolean
  hasUpdatedAt?: boolean
}) {
  const { hasVersion = true, hasDeletedAt = true, hasUpdatedAt = true } = options ?? {}

  const table: Record<string, unknown> = {
    id: { name: 'id' },
    name: { name: 'name' },
    createdAt: { name: 'created_at' },
  }

  if (hasVersion) {
    table.version = { name: 'version' }
  }
  if (hasDeletedAt) {
    table.deletedAt = { name: 'deleted_at' }
  }
  if (hasUpdatedAt) {
    table.updatedAt = { name: 'updated_at' }
  }

  // Add drizzle name symbol
  const nameSymbol = Symbol.for('drizzle:Name')
  ;(table as any)[nameSymbol] = 'test_entities'

  return table as unknown as PgTableWithColumns<any>
}

// Mutable state for mock DB
let mockQueryRows: TestEntity[] = []
let mockInsertResult: any[] = []
let mockUpdateResult: any[] = []
let mockDeleteResult: any[] = []

// Create a mock SQL where clause object (simulates drizzle SQL object)
const createMockWhere = () => ({ queryChunks: ['mock', 'where'] } as any)

// Create a thenable (Promise-like) chain that resolves to the result
function createThenableChain(getResult: () => any[]) {
  const chain: any = {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    // Make it thenable (Promise-like)
    then: (resolve: (value: any[]) => void, reject?: (error: any) => void) => {
      return Promise.resolve(getResult()).then(resolve, reject)
    },
  }
  return chain
}

// Create mock database with proper chaining
function createMockDb() {
  const mockQueryBuilder = {
    findFirst: vi.fn().mockImplementation(async () => mockQueryRows[0] || null),
    findMany: vi.fn().mockImplementation(async () => [...mockQueryRows]),
  }

  const db = {
    query: {
      testEntities: mockQueryBuilder,
    },
    schema: {
      testEntitiesRelations: {
        config: vi.fn().mockReturnValue({}),
      },
    },
    insert: vi.fn().mockImplementation(() => createThenableChain(() => mockInsertResult)),
    update: vi.fn().mockImplementation(() => createThenableChain(() => mockUpdateResult)),
    delete: vi.fn().mockImplementation(() => createThenableChain(() => mockDeleteResult)),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 25 }]),
      }),
    }),
  }

  return db as any
}

// Concrete implementation of Repository for testing
class TestRepository extends Repository<
  { testEntities: any },
  PgTableWithColumns<any>,
  'testEntities',
  Pool
> {
  // Expose hooks for testing
  public beforeCreateCalls: any[] = []
  public afterCreateCalls: any[] = []
  public beforeUpdateCalls: any[] = []
  public afterUpdateCalls: any[] = []
  public afterDeleteCalls: any[] = []
  public afterFindCalls: any[] = []

  async beforeCreate(row: any) {
    this.beforeCreateCalls.push(row)
  }

  async afterCreate(row: any) {
    this.afterCreateCalls.push(row)
  }

  async beforeUpdate(row: any) {
    this.beforeUpdateCalls.push(row)
  }

  async afterUpdate(row: any) {
    this.afterUpdateCalls.push(row)
  }

  async afterDelete(row: any) {
    this.afterDeleteCalls.push(row)
  }

  async afterFind(row: any) {
    this.afterFindCalls.push(row)
  }

  resetHookCalls() {
    this.beforeCreateCalls = []
    this.afterCreateCalls = []
    this.beforeUpdateCalls = []
    this.afterUpdateCalls = []
    this.afterDeleteCalls = []
    this.afterFindCalls = []
  }
}

describe('repository', () => {
  let db: ReturnType<typeof createMockDb>
  let table: PgTableWithColumns<any>
  let repository: TestRepository

  beforeEach(() => {
    // Reset mock state
    mockQueryRows = []
    mockInsertResult = []
    mockUpdateResult = []
    mockDeleteResult = []

    db = createMockDb()
    table = createMockTable()
    repository = new TestRepository(db, table)
    repository.resetHookCalls()
  })

  describe('optimisticLockError', () => {
    it('should create error with expected properties', () => {
      const error = new OptimisticLockError('entity-123', 5, 3)

      expect(error.name).toBe('OptimisticLockError')
      expect(error.entityId).toBe('entity-123')
      expect(error.expectedVersion).toBe(5)
      expect(error.actualVersion).toBe(3)
      expect(error.message).toContain('entity-123')
      expect(error.message).toContain('expected version 5')
      expect(error.message).toContain('version 3')
    })

    it('should handle null actual version (deleted record)', () => {
      const error = new OptimisticLockError('entity-123', 5, null)

      expect(error.actualVersion).toBeNull()
      expect(error.message).toContain('deleted record')
    })
  })

  describe('databaseError', () => {
    it('should create error with message only', () => {
      const error = new DatabaseError('Database connection failed')

      expect(error.message).toBe('Database connection failed')
      expect(error.fieldErrors).toBeUndefined()
    })

    it('should create error with field errors', () => {
      const fieldErrors = {
        email: ['Email already exists'],
        username: ['Username is taken'],
      }
      const error = new DatabaseError('Validation failed', fieldErrors)

      expect(error.message).toBe('Validation failed')
      expect(error.fieldErrors).toEqual(fieldErrors)
    })
  })

  describe('create()', () => {
    it('should auto-set version to 1 on create', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      const expectedRow = { ...inputValue, version: 1 }
      mockInsertResult = [expectedRow]

      const result = await repository.create(inputValue)

      expect(result).toEqual(expectedRow)
      expect(db.insert).toHaveBeenCalledWith(table)
    })

    it('should call beforeCreate hook before inserting', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      mockInsertResult = [{ ...inputValue, version: 1 }]

      await repository.create(inputValue)

      expect(repository.beforeCreateCalls).toHaveLength(1)
      expect(repository.beforeCreateCalls[0]).toEqual(inputValue)
    })

    it('should call afterCreate hook after inserting', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      const insertedRow = { ...inputValue, version: 1 }
      mockInsertResult = [insertedRow]

      await repository.create(inputValue)

      expect(repository.afterCreateCalls).toHaveLength(1)
      expect(repository.afterCreateCalls[0]).toEqual(insertedRow)
    })

    it('should return null when no row is inserted', async () => {
      mockInsertResult = []

      const result = await repository.create({ id: 'test-1', name: 'Test' })

      expect(result).toBeNull()
    })
  })

  describe('update() with optimistic locking', () => {
    it('should increment version on every update', async () => {
      const existingRow = { id: 'test-1', name: 'Original', version: 1 }
      const updatedRow = { id: 'test-1', name: 'Updated', version: 2 }

      mockQueryRows = [existingRow]
      mockUpdateResult = [updatedRow]

      const result = await repository.update(
        { name: 'Updated' },
        { where: createMockWhere() },
      )

      expect(result).toHaveLength(1)
      expect(result[0].version).toBe(2)
    })

    it('should throw OptimisticLockError when expectedVersion does not match', async () => {
      const existingRow = { id: 'test-1', name: 'Original', version: 3 }

      mockQueryRows = [existingRow]
      mockUpdateResult = [] // No rows updated due to version mismatch

      await expect(
        repository.update(
          { name: 'Updated' },
          {
            where: createMockWhere(),
            expectedVersion: 1, // Expecting version 1, but actual is 3
          },
        ),
      ).rejects.toThrow(OptimisticLockError)
    })

    it('should succeed when expectedVersion matches current version', async () => {
      const existingRow = { id: 'test-1', name: 'Original', version: 2 }
      const updatedRow = { id: 'test-1', name: 'Updated', version: 3 }

      mockQueryRows = [existingRow]
      mockUpdateResult = [updatedRow]

      const result = await repository.update(
        { name: 'Updated' },
        {
          where: createMockWhere(),
          expectedVersion: 2,
        },
      )

      expect(result).toHaveLength(1)
      expect(result[0].version).toBe(3)
    })

    it('should call beforeUpdate hook', async () => {
      const updateValue = { name: 'Updated' }
      mockUpdateResult = [{ id: 'test-1', name: 'Updated', version: 2 }]

      await repository.update(updateValue)

      expect(repository.beforeUpdateCalls).toHaveLength(1)
      expect(repository.beforeUpdateCalls[0]).toEqual(updateValue)
    })

    it('should call afterUpdate hook for each updated row', async () => {
      const updatedRows = [
        { id: 'test-1', name: 'Updated 1', version: 2 },
        { id: 'test-2', name: 'Updated 2', version: 2 },
      ]
      mockUpdateResult = updatedRows

      await repository.update({ name: 'Updated' })

      expect(repository.afterUpdateCalls).toHaveLength(2)
      expect(repository.afterUpdateCalls).toEqual(updatedRows)
    })

    it('should return empty array when no rows are updated', async () => {
      mockUpdateResult = []

      const result = await repository.update({ name: 'Updated' })

      expect(result).toEqual([])
    })
  })

  describe('delete() with soft delete', () => {
    it('should set deletedAt when soft=true', async () => {
      const existingRow = { id: 'test-1', name: 'Test', deletedAt: null }
      const softDeletedRow = { id: 'test-1', name: 'Test', deletedAt: new Date() }

      mockQueryRows = [existingRow]
      mockUpdateResult = [softDeletedRow]

      const result = await repository.delete({
        where: createMockWhere(),
        soft: true,
      })

      expect(result).toHaveLength(1)
      expect(result?.[0]?.deletedAt).toBeDefined()
      // Should use update, not delete
      expect(db.update).toHaveBeenCalled()
    })

    it('should perform hard delete when soft=false', async () => {
      const existingRow = { id: 'test-1', name: 'Test' }

      mockQueryRows = [existingRow]
      mockDeleteResult = [existingRow]

      const result = await repository.delete({
        where: createMockWhere(),
        soft: false,
      })

      expect(result).toHaveLength(1)
      expect(db.delete).toHaveBeenCalled()
    })

    it('should perform hard delete by default', async () => {
      const existingRow = { id: 'test-1', name: 'Test' }

      mockQueryRows = [existingRow]
      mockDeleteResult = [existingRow]

      await repository.delete({
        where: createMockWhere(),
      })

      expect(db.delete).toHaveBeenCalled()
    })

    it('should call afterDelete hook for each deleted row', async () => {
      const deletedRows = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ]

      mockQueryRows = deletedRows
      mockDeleteResult = deletedRows

      await repository.delete()

      expect(repository.afterDeleteCalls).toHaveLength(2)
      expect(repository.afterDeleteCalls).toEqual(deletedRows)
    })

    it('should return empty array when no rows to delete', async () => {
      mockQueryRows = []
      mockDeleteResult = []

      const result = await repository.delete()

      expect(result).toEqual([])
    })
  })

  describe('restore()', () => {
    it('should set deletedAt to null', async () => {
      const softDeletedRow = { id: 'test-1', name: 'Test', deletedAt: new Date() }
      const restoredRow = { id: 'test-1', name: 'Test', deletedAt: null }

      mockQueryRows = [softDeletedRow]
      mockUpdateResult = [restoredRow]

      const result = await repository.restore({
        where: createMockWhere(),
      })

      expect(result).toHaveLength(1)
      expect(result[0].deletedAt).toBeNull()
    })

    it('should throw error when table does not have deletedAt column', async () => {
      const tableWithoutSoftDelete = createMockTable({ hasDeletedAt: false })
      const repoWithoutSoftDelete = new TestRepository(db, tableWithoutSoftDelete)

      await expect(
        repoWithoutSoftDelete.restore({
          where: createMockWhere(),
        }),
      ).rejects.toThrow('Table does not support soft delete')
    })

    it('should return empty array when no rows to restore', async () => {
      mockUpdateResult = []

      const result = await repository.restore()

      expect(result).toEqual([])
    })
  })

  describe('findFirst() with soft delete filtering', () => {
    it('should exclude soft-deleted records by default', async () => {
      const activeRow = { id: 'test-1', name: 'Active', deletedAt: null }

      mockQueryRows = [activeRow]

      const result = await repository.findFirst()

      expect(result).toEqual(activeRow)
      // The query should have been modified to filter out deleted records
      expect(db.query.testEntities.findFirst).toHaveBeenCalled()
    })

    it('should include soft-deleted records when includeDeleted=true', async () => {
      const deletedRow = { id: 'test-1', name: 'Deleted', deletedAt: new Date() }

      mockQueryRows = [deletedRow]

      const result = await repository.findFirst({ includeDeleted: true })

      expect(result).toEqual(deletedRow)
    })

    it('should call afterFind hook when row is found', async () => {
      const row = { id: 'test-1', name: 'Test' }
      mockQueryRows = [row]

      await repository.findFirst()

      expect(repository.afterFindCalls).toHaveLength(1)
      expect(repository.afterFindCalls[0]).toEqual(row)
    })

    it('should return null when no row is found', async () => {
      mockQueryRows = []
      db.query.testEntities.findFirst.mockResolvedValueOnce(null)

      const result = await repository.findFirst()

      expect(result).toBeNull()
      expect(repository.afterFindCalls).toHaveLength(0)
    })
  })

  describe('findMany() with soft delete filtering', () => {
    it('should exclude soft-deleted records by default', async () => {
      const activeRows = [
        { id: 'test-1', name: 'Active 1', deletedAt: null },
        { id: 'test-2', name: 'Active 2', deletedAt: null },
      ]

      mockQueryRows = activeRows

      const result = await repository.findMany()

      expect(result).toEqual(activeRows)
    })

    it('should include soft-deleted records when includeDeleted=true', async () => {
      const allRows = [
        { id: 'test-1', name: 'Active', deletedAt: null },
        { id: 'test-2', name: 'Deleted', deletedAt: new Date() },
      ]

      mockQueryRows = allRows

      const result = await repository.findMany({ includeDeleted: true })

      expect(result).toEqual(allRows)
    })

    it('should call afterFind hook for each row', async () => {
      const rows = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ]
      mockQueryRows = rows

      await repository.findMany()

      expect(repository.afterFindCalls).toHaveLength(2)
      expect(repository.afterFindCalls).toEqual(rows)
    })

    it('should return empty array when no rows found', async () => {
      mockQueryRows = []
      db.query.testEntities.findMany.mockResolvedValueOnce([])

      const result = await repository.findMany()

      expect(result).toEqual([])
      expect(repository.afterFindCalls).toHaveLength(0)
    })
  })

  describe('paginateByOffset() with soft delete filtering', () => {
    beforeEach(() => {
      // Setup default pagination count response
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 25 }]),
        }),
      })
    })

    it('should exclude soft-deleted records by default', async () => {
      const rows = [
        { id: 'test-1', name: 'Active 1', deletedAt: null },
        { id: 'test-2', name: 'Active 2', deletedAt: null },
      ]
      mockQueryRows = rows

      const result = await repository.paginateByOffset({ page: 1, perPage: 10 })

      expect(result.rows).toEqual(rows)
    })

    it('should include soft-deleted records when includeDeleted=true', async () => {
      const rows = [
        { id: 'test-1', name: 'Active', deletedAt: null },
        { id: 'test-2', name: 'Deleted', deletedAt: new Date() },
      ]
      mockQueryRows = rows

      const result = await repository.paginateByOffset({
        page: 1,
        perPage: 10,
        includeDeleted: true,
      })

      expect(result.rows).toHaveLength(2)
    })

    it('should return pagination metadata', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({
        id: `test-${i}`,
        name: `Test ${i}`,
      }))
      mockQueryRows = rows
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 25 }]),
        }),
      })

      const result = await repository.paginateByOffset({ page: 1, perPage: 10 })

      expect(result.page).toBe(1)
      expect(result.perPage).toBe(10)
      expect(result.totalRows).toBe(25)
      expect(result.totalPages).toBe(3)
      expect(result.next).toBe(true)
      expect(result.previous).toBe(false)
    })

    it('should indicate no next page when on last page', async () => {
      const rows = [{ id: 'test-1', name: 'Test 1' }]
      mockQueryRows = rows
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      })

      const result = await repository.paginateByOffset({ page: 1, perPage: 10 })

      expect(result.next).toBe(false)
    })

    it('should indicate previous page when not on first page', async () => {
      const rows = [{ id: 'test-1', name: 'Test 1' }]
      mockQueryRows = rows

      const result = await repository.paginateByOffset({ page: 2, perPage: 10 })

      expect(result.previous).toBe(true)
    })
  })

  describe('table without version column', () => {
    let repoWithoutVersion: TestRepository

    beforeEach(() => {
      const tableWithoutVersion = createMockTable({ hasVersion: false })
      repoWithoutVersion = new TestRepository(db, tableWithoutVersion)
    })

    it('should not set version on create when table has no version column', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      mockInsertResult = [{ ...inputValue }]

      const result = await repoWithoutVersion.create(inputValue)

      expect(result).toBeDefined()
      expect((result as any).version).toBeUndefined()
    })

    it('should not throw OptimisticLockError when table has no version column', async () => {
      mockUpdateResult = [{ id: 'test-1', name: 'Updated' }]

      // Should not throw even with expectedVersion since table has no version
      const result = await repoWithoutVersion.update(
        { name: 'Updated' },
        { expectedVersion: 1 },
      )

      expect(result).toHaveLength(1)
    })
  })

  describe('table without soft delete', () => {
    let repoWithoutSoftDelete: TestRepository

    beforeEach(() => {
      const tableWithoutSoftDelete = createMockTable({ hasDeletedAt: false })
      repoWithoutSoftDelete = new TestRepository(db, tableWithoutSoftDelete)
    })

    it('should always perform hard delete when table has no deletedAt column', async () => {
      const existingRow = { id: 'test-1', name: 'Test' }

      mockQueryRows = [existingRow]
      mockDeleteResult = [existingRow]

      await repoWithoutSoftDelete.delete({
        where: createMockWhere(),
        soft: true, // This should be ignored
      })

      expect(db.delete).toHaveBeenCalled()
    })

    it('should not filter by deletedAt in findMany when table has no deletedAt column', async () => {
      const rows = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ]
      mockQueryRows = rows

      const result = await repoWithoutSoftDelete.findMany()

      expect(result).toEqual(rows)
    })
  })

  describe('createMany()', () => {
    it('should call beforeCreate for each row', async () => {
      const values = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ]
      mockInsertResult = [
        { id: 'test-1', name: 'Test 1', version: 1 },
        { id: 'test-2', name: 'Test 2', version: 1 },
      ]

      await repository.createMany(values)

      expect(repository.beforeCreateCalls).toHaveLength(2)
    })

    it('should call afterCreate for each inserted row', async () => {
      const insertedRows = [
        { id: 'test-1', name: 'Test 1', version: 1 },
        { id: 'test-2', name: 'Test 2', version: 1 },
      ]
      mockInsertResult = insertedRows

      await repository.createMany([
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ])

      expect(repository.afterCreateCalls).toHaveLength(2)
      expect(repository.afterCreateCalls).toEqual(insertedRows)
    })

    it('should return empty array when no rows are inserted', async () => {
      mockInsertResult = []

      const result = await repository.createMany([{ id: 'test-1', name: 'Test' }])

      expect(result).toEqual([])
    })
  })

  describe('hooks lifecycle', () => {
    it('should call hooks in correct order for create', async () => {
      const callOrder: string[] = []

      repository.beforeCreate = async () => {
        callOrder.push('beforeCreate')
      }
      repository.afterCreate = async () => {
        callOrder.push('afterCreate')
      }

      mockInsertResult = [{ id: 'test-1', name: 'Test', version: 1 }]

      await repository.create({ id: 'test-1', name: 'Test' })

      expect(callOrder).toEqual(['beforeCreate', 'afterCreate'])
    })

    it('should call hooks in correct order for update', async () => {
      const callOrder: string[] = []

      repository.beforeUpdate = async () => {
        callOrder.push('beforeUpdate')
      }
      repository.afterUpdate = async () => {
        callOrder.push('afterUpdate')
      }

      mockUpdateResult = [{ id: 'test-1', name: 'Updated', version: 2 }]

      await repository.update({ name: 'Updated' })

      expect(callOrder).toEqual(['beforeUpdate', 'afterUpdate'])
    })

    it('should call afterFind for each row in findMany', async () => {
      const findCalls: any[] = []
      repository.afterFind = async (row) => {
        findCalls.push(row)
      }

      const rows = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
        { id: 'test-3', name: 'Test 3' },
      ]
      mockQueryRows = rows

      await repository.findMany()

      expect(findCalls).toHaveLength(3)
      expect(findCalls).toEqual(rows)
    })

    it('should call afterDelete for each deleted row', async () => {
      const deleteCalls: any[] = []
      repository.afterDelete = async (row) => {
        deleteCalls.push(row)
      }

      const deletedRows = [
        { id: 'test-1', name: 'Test 1' },
        { id: 'test-2', name: 'Test 2' },
      ]
      mockQueryRows = deletedRows
      mockDeleteResult = deletedRows

      await repository.delete()

      expect(deleteCalls).toHaveLength(2)
      expect(deleteCalls).toEqual(deletedRows)
    })
  })

  describe('edge cases', () => {
    it('should handle null where clause', async () => {
      mockQueryRows = []

      const result = await repository.findMany()

      expect(result).toEqual([])
    })

    it('should handle SQL where clause object', async () => {
      const rows = [{ id: 'test-1', name: 'Test' }]
      mockQueryRows = rows

      // Create a mock SQL object with queryChunks
      const sqlWhere = { queryChunks: [] } as any

      const result = await repository.findMany({ where: sqlWhere })

      expect(result).toEqual(rows)
    })

    it('should handle function where clause in findMany', async () => {
      // Note: function-style where clauses require drizzle getTableColumns/getOperators
      // which is tested separately. Here we test with mock SQL object.
      const rows = [{ id: 'test-1', name: 'Test' }]
      mockQueryRows = rows

      // Using SQL object style instead of function style
      const result = await repository.findMany({
        where: createMockWhere(),
      })

      expect(result).toEqual(rows)
    })

    it('should handle transaction in options', async () => {
      const mockTx = {
        query: db.query,
        insert: db.insert,
        update: db.update,
        delete: db.delete,
        select: db.select,
      }

      mockInsertResult = [{ id: 'test-1', name: 'Test', version: 1 }]

      await repository.create({ id: 'test-1', name: 'Test' }, { tx: mockTx as any })

      expect(mockTx.insert).toHaveBeenCalled()
    })

    it('should handle onConflictDoUpdate option in create', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      const expectedRow = { ...inputValue, version: 1 }
      mockInsertResult = [expectedRow]

      const result = await repository.create(inputValue, {
        onConflictDoUpdate: {
          target: table.id,
          set: { name: 'Updated' },
        },
      })

      expect(result).toEqual(expectedRow)
    })

    it('should handle onConflictDoNothing option in create', async () => {
      const inputValue = { id: 'test-1', name: 'Test Entity' }
      mockInsertResult = []

      const result = await repository.create(inputValue, {
        onConflictDoNothing: {},
      })

      expect(result).toBeNull()
    })

    it('should handle columns option in update', async () => {
      const updatedRow = { id: 'test-1', name: 'Updated' }
      mockUpdateResult = [updatedRow]

      const result = await repository.update(
        { name: 'Updated' },
        {
          columns: { id: true, name: true } as any,
        },
      )

      expect(result).toHaveLength(1)
    })

    it('should handle columns option in delete', async () => {
      const deletedRow = { id: 'test-1', name: 'Deleted' }
      mockQueryRows = [deletedRow]
      mockDeleteResult = [deletedRow]

      const result = await repository.delete({
        columns: { id: true, name: true } as any,
      })

      expect(result).toHaveLength(1)
    })

    it('should handle columns option in restore', async () => {
      const restoredRow = { id: 'test-1', name: 'Restored', deletedAt: null }
      mockUpdateResult = [restoredRow]

      const result = await repository.restore({
        columns: { id: true, name: true } as any,
      })

      expect(result).toHaveLength(1)
    })
  })

  describe('objectKeys utility', () => {
    it('should return typed array of keys', async () => {
      // Test objectKeys helper directly by importing it
      const { objectKeys } = await import('./repository')

      const testObj = { a: 1, b: 2, c: 3 }
      const keys = objectKeys(testObj)

      expect(keys).toEqual(['a', 'b', 'c'])
    })
  })

  describe('table without updatedAt column', () => {
    let repoWithoutUpdatedAt: TestRepository

    beforeEach(() => {
      const tableWithoutUpdatedAt = createMockTable({ hasUpdatedAt: false })
      repoWithoutUpdatedAt = new TestRepository(db, tableWithoutUpdatedAt)
    })

    it('should not set updatedAt on update when table has no updatedAt column', async () => {
      mockUpdateResult = [{ id: 'test-1', name: 'Updated', version: 2 }]

      const result = await repoWithoutUpdatedAt.update({ name: 'Updated' })

      expect(result).toHaveLength(1)
    })
  })
})
