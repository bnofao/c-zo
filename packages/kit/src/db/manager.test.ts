import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDrizzle, mockWithReplicas, mockUseCzoConfig } = vi.hoisted(() => ({
  mockDrizzle: vi.fn().mockReturnValue({ _type: 'masterDb' }),
  mockWithReplicas: vi.fn().mockImplementation((master: any, replicas: any) => ({
    _type: 'replicaDb',
    master,
    replicas,
  })),
  mockUseCzoConfig: vi.fn(),
}))

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: mockDrizzle,
}))

vi.mock('drizzle-orm/pg-core', () => ({
  withReplicas: mockWithReplicas,
}))

vi.mock('../config', () => ({
  useCzoConfig: mockUseCzoConfig,
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
    mockUseCzoConfig.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw when databaseUrl is empty', async () => {
    mockUseCzoConfig.mockReturnValue({ databaseUrl: '' })
    const { useDatabase } = await import('./manager')

    expect(() => useDatabase()).toThrow('Database URL is required')
  })

  it('should throw when databaseUrl is undefined', async () => {
    mockUseCzoConfig.mockReturnValue({ databaseUrl: undefined })
    const { useDatabase } = await import('./manager')

    expect(() => useDatabase()).toThrow('Database URL is required')
  })

  it('should create a master-only DB with a single URL', async () => {
    mockUseCzoConfig.mockReturnValue({
      databaseUrl: 'postgresql://localhost/mydb',
    })
    const { useDatabase } = await import('./manager')

    const db = useDatabase()

    expect(mockDrizzle).toHaveBeenCalledWith('postgresql://localhost/mydb', undefined)
    expect(mockWithReplicas).not.toHaveBeenCalled()
    expect(db).toEqual({ _type: 'masterDb' })
  })

  it('should create master + replicas with comma-separated URLs', async () => {
    mockUseCzoConfig.mockReturnValue({
      databaseUrl: 'postgresql://master/db,postgresql://replica1/db,postgresql://replica2/db',
    })
    const replicaDb1 = { _type: 'replica1' }
    const replicaDb2 = { _type: 'replica2' }
    mockDrizzle
      .mockReturnValueOnce({ _type: 'masterDb' })
      .mockReturnValueOnce(replicaDb1)
      .mockReturnValueOnce(replicaDb2)

    const { useDatabase } = await import('./manager')
    const db = useDatabase()

    expect(mockDrizzle).toHaveBeenCalledTimes(3)
    expect(mockWithReplicas).toHaveBeenCalledWith(
      { _type: 'masterDb' },
      [replicaDb1, replicaDb2],
    )
    expect(db).toHaveProperty('_type', 'replicaDb')
  })

  it('should return cached instance on repeated calls (singleton)', async () => {
    mockUseCzoConfig.mockReturnValue({
      databaseUrl: 'postgresql://localhost/mydb',
    })
    const { useDatabase } = await import('./manager')

    const first = useDatabase()
    const second = useDatabase()

    expect(first).toBe(second)
    expect(mockDrizzle).toHaveBeenCalledTimes(1)
  })

  it('should reset instance when called with explicit config', async () => {
    mockUseCzoConfig.mockReturnValue({
      databaseUrl: 'postgresql://localhost/mydb',
    })
    // Return distinct objects so we can verify identity
    mockDrizzle
      .mockReturnValueOnce({ _type: 'masterDb', call: 1 })
      .mockReturnValueOnce({ _type: 'masterDb', call: 2 })

    const { useDatabase } = await import('./manager')

    const first = useDatabase()
    const second = useDatabase({ schema: {} as any })

    expect(first).not.toBe(second)
    expect(mockDrizzle).toHaveBeenCalledTimes(2)
  })
})
