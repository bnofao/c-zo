import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueueInstances: Record<string, { name: string, close: ReturnType<typeof vi.fn> }> = {}
const MockQueue = vi.fn().mockImplementation((name: string) => {
  const instance = { name, add: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
  mockQueueInstances[name] = instance
  return instance
})

const mockRedisInstance = { status: 'ready', duplicate: vi.fn(), disconnect: vi.fn() }
const MockRedis = vi.fn().mockReturnValue(mockRedisInstance)

vi.mock('bullmq', () => ({ Queue: MockQueue }))
vi.mock('ioredis', () => ({ default: MockRedis }))

const mockConfig = {
  databaseUrl: '',
  redisUrl: 'redis://localhost:6379',
  queue: { prefix: 'czo', defaultAttempts: 3 },
}
vi.mock('../config', () => ({
  useCzoConfig: vi.fn(() => ({ ...mockConfig })),
}))

describe('useQueue', () => {
  let useQueue: typeof import('./use-queue').useQueue
  let resetQueues: typeof import('./use-queue').resetQueues
  let closeQueues: typeof import('./use-queue').closeQueues

  beforeEach(async () => {
    mockConfig.redisUrl = 'redis://localhost:6379'
    MockQueue.mockClear()
    MockRedis.mockClear()
    mockRedisInstance.disconnect.mockClear()
    Object.keys(mockQueueInstances).forEach(k => delete mockQueueInstances[k])

    const mod = await import('./use-queue')
    useQueue = mod.useQueue
    resetQueues = mod.resetQueues
    closeQueues = mod.closeQueues
    resetQueues()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should create a Queue with the given name', () => {
    const queue = useQueue('orders')

    expect(MockQueue).toHaveBeenCalledOnce()
    expect(MockQueue).toHaveBeenCalledWith('orders', expect.objectContaining({
      connection: expect.any(Object),
    }))
    expect(queue.name).toBe('orders')
  })

  it('should return cached instance on second call with same name', () => {
    const q1 = useQueue('orders')
    const q2 = useQueue('orders')

    expect(q1).toBe(q2)
    expect(MockQueue).toHaveBeenCalledOnce()
  })

  it('should create separate instances for different names', () => {
    const q1 = useQueue('orders')
    const q2 = useQueue('payments')

    expect(q1).not.toBe(q2)
    expect(MockQueue).toHaveBeenCalledTimes(2)
  })

  it('should share one ioredis connection across queues', () => {
    useQueue('orders')
    useQueue('payments')

    expect(MockRedis).toHaveBeenCalledOnce()
  })

  it('should throw when redisUrl is missing', () => {
    mockConfig.redisUrl = ''
    resetQueues()

    expect(() => useQueue('orders')).toThrow('Redis URL is required')
  })

  it('should pass queue options through to BullMQ', () => {
    useQueue('orders', { defaultJobOptions: { attempts: 3 } })

    expect(MockQueue).toHaveBeenCalledWith('orders', expect.objectContaining({
      defaultJobOptions: { attempts: 3 },
    }))
  })

  describe('closeQueues', () => {
    it('should close all queues and disconnect Redis', async () => {
      useQueue('orders')
      useQueue('payments')

      await closeQueues()

      expect(mockQueueInstances.orders!.close).toHaveBeenCalledOnce()
      expect(mockQueueInstances.payments!.close).toHaveBeenCalledOnce()
      expect(mockRedisInstance.disconnect).toHaveBeenCalledOnce()
    })

    it('should allow creating new queues after close', async () => {
      useQueue('orders')
      await closeQueues()

      const q = useQueue('orders')
      expect(q).toBeDefined()
      expect(MockQueue).toHaveBeenCalledTimes(2)
    })
  })
})
