import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueueInstances: Record<string, { name: string, close: ReturnType<typeof vi.fn> }> = {}
const MockQueue = vi.fn().mockImplementation((name: string) => {
  const instance = { name, add: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
  mockQueueInstances[name] = instance
  return instance
})

const mockRedisInstance = { status: 'ready' }

vi.mock('bullmq', () => ({ Queue: MockQueue }))
vi.mock('./connection', () => ({
  getQueueConnection: vi.fn(async () => mockRedisInstance),
}))

describe('useQueue', () => {
  let useQueue: typeof import('./use-queue').useQueue
  let resetQueues: typeof import('./use-queue').resetQueues
  let closeQueues: typeof import('./use-queue').closeQueues

  beforeEach(async () => {
    MockQueue.mockClear()
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

  it('should create a Queue with the given name', async () => {
    const queue = await useQueue('orders')

    expect(MockQueue).toHaveBeenCalledOnce()
    expect(MockQueue).toHaveBeenCalledWith('orders', expect.objectContaining({
      connection: mockRedisInstance,
    }))
    expect(queue.name).toBe('orders')
  })

  it('should return cached instance on second call with same name', async () => {
    const q1 = await useQueue('orders')
    const q2 = await useQueue('orders')

    expect(q1).toBe(q2)
    expect(MockQueue).toHaveBeenCalledOnce()
  })

  it('should create separate instances for different names', async () => {
    const q1 = await useQueue('orders')
    const q2 = await useQueue('payments')

    expect(q1).not.toBe(q2)
    expect(MockQueue).toHaveBeenCalledTimes(2)
  })

  it('should pass queue options through to BullMQ', async () => {
    await useQueue('orders', { defaultJobOptions: { attempts: 3 } })

    expect(MockQueue).toHaveBeenCalledWith('orders', expect.objectContaining({
      defaultJobOptions: { attempts: 3 },
    }))
  })

  describe('closeQueues', () => {
    it('should close all queues', async () => {
      await useQueue('orders')
      await useQueue('payments')

      await closeQueues()

      expect(mockQueueInstances.orders!.close).toHaveBeenCalledOnce()
      expect(mockQueueInstances.payments!.close).toHaveBeenCalledOnce()
    })

    it('should allow creating new queues after close', async () => {
      await useQueue('orders')
      await closeQueues()

      const q = await useQueue('orders')
      expect(q).toBeDefined()
      expect(MockQueue).toHaveBeenCalledTimes(2)
    })
  })
})
