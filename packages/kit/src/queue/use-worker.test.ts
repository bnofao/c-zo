import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockWorkerInstances: Record<string, { name: string, close: ReturnType<typeof vi.fn> }> = {}
const MockWorker = vi.fn().mockImplementation((name: string, processor: unknown) => {
  const instance = { name, processor, close: vi.fn().mockResolvedValue(undefined) }
  mockWorkerInstances[name] = instance
  return instance
})

const mockRedisInstance = { status: 'ready', duplicate: vi.fn(), disconnect: vi.fn() }
const MockRedis = vi.fn().mockReturnValue(mockRedisInstance)

vi.mock('bullmq', () => ({ Worker: MockWorker }))
vi.mock('ioredis', () => ({ default: MockRedis }))

describe('useWorker', () => {
  let useWorker: typeof import('./use-worker').useWorker
  let resetWorkers: typeof import('./use-worker').resetWorkers
  let closeWorkers: typeof import('./use-worker').closeWorkers

  beforeEach(async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    MockWorker.mockClear()
    MockRedis.mockClear()
    mockRedisInstance.disconnect.mockClear()
    Object.keys(mockWorkerInstances).forEach(k => delete mockWorkerInstances[k])

    const mod = await import('./use-worker')
    useWorker = mod.useWorker
    resetWorkers = mod.resetWorkers
    closeWorkers = mod.closeWorkers
    resetWorkers()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should create a Worker with the given name and processor', () => {
    const processor = vi.fn()
    const worker = useWorker('orders', processor)

    expect(MockWorker).toHaveBeenCalledOnce()
    expect(MockWorker).toHaveBeenCalledWith('orders', processor, expect.objectContaining({
      connection: expect.any(Object),
    }))
    expect(worker.name).toBe('orders')
  })

  it('should return cached instance on second call with same name', () => {
    const processor = vi.fn()
    const w1 = useWorker('orders', processor)
    const w2 = useWorker('orders', processor)

    expect(w1).toBe(w2)
    expect(MockWorker).toHaveBeenCalledOnce()
  })

  it('should return cached instance even with a different processor reference', () => {
    const w1 = useWorker('orders', vi.fn())
    const w2 = useWorker('orders', vi.fn())

    expect(w1).toBe(w2)
    expect(MockWorker).toHaveBeenCalledOnce()
  })

  it('should create separate instances for different names', () => {
    const processor = vi.fn()
    const w1 = useWorker('orders', processor)
    const w2 = useWorker('payments', processor)

    expect(w1).not.toBe(w2)
    expect(MockWorker).toHaveBeenCalledTimes(2)
  })

  it('should use maxRetriesPerRequest: null for the connection', () => {
    useWorker('orders', vi.fn())

    expect(MockRedis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ maxRetriesPerRequest: null }),
    )
  })

  it('should share one ioredis connection across workers', () => {
    useWorker('orders', vi.fn())
    useWorker('payments', vi.fn())

    expect(MockRedis).toHaveBeenCalledOnce()
  })

  it('should throw when REDIS_URL is missing', () => {
    vi.stubEnv('REDIS_URL', '')
    resetWorkers()

    expect(() => useWorker('orders', vi.fn())).toThrow('REDIS_URL')
  })

  it('should pass worker options through to BullMQ', () => {
    const processor = vi.fn()
    useWorker('orders', processor, { concurrency: 5 })

    expect(MockWorker).toHaveBeenCalledWith('orders', processor, expect.objectContaining({
      concurrency: 5,
    }))
  })

  describe('closeWorkers', () => {
    it('should close all workers and disconnect Redis', async () => {
      useWorker('orders', vi.fn())
      useWorker('payments', vi.fn())

      await closeWorkers()

      expect(mockWorkerInstances.orders.close).toHaveBeenCalledOnce()
      expect(mockWorkerInstances.payments.close).toHaveBeenCalledOnce()
      expect(mockRedisInstance.disconnect).toHaveBeenCalledOnce()
    })

    it('should allow creating new workers after close', async () => {
      useWorker('orders', vi.fn())
      await closeWorkers()

      const w = useWorker('orders', vi.fn())
      expect(w).toBeDefined()
      expect(MockWorker).toHaveBeenCalledTimes(2)
    })
  })
})
