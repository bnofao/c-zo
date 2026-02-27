import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDrizzle, mockWithReplicas, mockMake } = vi.hoisted(() => ({
  mockDrizzle: vi.fn().mockReturnValue({ _type: 'masterDb' }),
  mockWithReplicas: vi.fn().mockImplementation((master: any, replicas: any) => ({
    _type: 'replicaDb',
    master,
    replicas,
  })),
  mockMake: vi.fn(),
}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: mockDrizzle,
}))

vi.mock('drizzle-orm/pg-core', () => ({
  withReplicas: mockWithReplicas,
}))

vi.mock('@czo/kit/ioc', () => ({
  useContainer: vi.fn(() => ({ make: mockMake })),
}))

describe('useDatabase', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDrizzle.mockClear().mockReturnValue({ _type: 'masterDb' })
    mockWithReplicas.mockClear().mockImplementation((master: any, replicas: any) => ({
      _type: 'replicaDb',
      master,
      replicas,
    }))
    mockMake.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw when databaseUrl is empty', async () => {
    mockMake.mockResolvedValue({ database: { url: '' } })
    const { useDatabase } = await import('./manager')

    await expect(useDatabase()).rejects.toThrow('Database URL is required')
  })

  it('should throw when databaseUrl is undefined', async () => {
    mockMake.mockResolvedValue({ database: { url: undefined } })
    const { useDatabase } = await import('./manager')

    await expect(useDatabase()).rejects.toThrow('Database URL is required')
  })

  it('should create a master-only DB with a single URL', async () => {
    mockMake.mockResolvedValue({
      database: { url: 'postgresql://localhost/mydb' },
    })
    const { useDatabase } = await import('./manager')

    const db = await useDatabase()

    expect(mockDrizzle).toHaveBeenCalledWith('postgresql://localhost/mydb', undefined)
    expect(mockWithReplicas).not.toHaveBeenCalled()
    expect(db).toEqual({ _type: 'masterDb' })
  })

  it('should create master + replicas with comma-separated URLs', async () => {
    mockMake.mockResolvedValue({
      database: { url: 'postgresql://master/db,postgresql://replica1/db,postgresql://replica2/db' },
    })
    const replicaDb1 = { _type: 'replica1' }
    const replicaDb2 = { _type: 'replica2' }
    mockDrizzle
      .mockReturnValueOnce({ _type: 'masterDb' })
      .mockReturnValueOnce(replicaDb1)
      .mockReturnValueOnce(replicaDb2)

    const { useDatabase } = await import('./manager')
    const db = await useDatabase()

    expect(mockDrizzle).toHaveBeenCalledTimes(3)
    expect(mockWithReplicas).toHaveBeenCalledWith(
      { _type: 'masterDb' },
      [replicaDb1, replicaDb2],
    )
    expect(db).toHaveProperty('_type', 'replicaDb')
  })

  it('should return cached instance on repeated calls (singleton)', async () => {
    mockMake.mockResolvedValue({
      database: { url: 'postgresql://localhost/mydb' },
    })
    const { useDatabase } = await import('./manager')

    const first = await useDatabase()
    const second = await useDatabase()

    expect(first).toBe(second)
    expect(mockDrizzle).toHaveBeenCalledTimes(1)
  })

  it('should reset instance when called with explicit config', async () => {
    mockMake.mockResolvedValue({
      database: { url: 'postgresql://localhost/mydb' },
    })
    mockDrizzle
      .mockReturnValueOnce({ _type: 'masterDb', call: 1 })
      .mockReturnValueOnce({ _type: 'masterDb', call: 2 })

    const { useDatabase } = await import('./manager')

    const first = await useDatabase()
    const second = await useDatabase({ schema: {} as any })

    expect(first).not.toBe(second)
    expect(mockDrizzle).toHaveBeenCalledTimes(2)
  })
})
