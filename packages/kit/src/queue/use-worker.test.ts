import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockWorkerInstances: Record<string, { name: string, close: ReturnType<typeof vi.fn> }> = {}
const MockWorker = vi.fn().mockImplementation((name: string, processor: unknown) => {
  const instance = { name, processor, close: vi.fn().mockResolvedValue(undefined) }
  mockWorkerInstances[name] = instance
  return instance
})

const mockRedisInstance = { status: 'ready' }

vi.mock('bullmq', () => ({ Worker: MockWorker }))
vi.mock('./connection', () => ({
  getQueueConnection: vi.fn(async () => mockRedisInstance),
}))

describe('useWorker', () => {
  let useWorker: typeof import('./use-worker').useWorker
  let resetWorkers: typeof import('./use-worker').resetWorkers
  let closeWorkers: typeof import('./use-worker').closeWorkers

  beforeEach(async () => {
    MockWorker.mockClear()
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

  it('should create a Worker with the given name and processor', async () => {
    const processor = vi.fn()
    const worker = await useWorker('orders', processor)

    expect(MockWorker).toHaveBeenCalledOnce()
    expect(MockWorker).toHaveBeenCalledWith('orders', processor, expect.objectContaining({
      connection: mockRedisInstance,
    }))
    expect(worker.name).toBe('orders')
  })

  it('should return cached instance on second call with same name', async () => {
    const processor = vi.fn()
    const w1 = await useWorker('orders', processor)
    const w2 = await useWorker('orders', processor)

    expect(w1).toBe(w2)
    expect(MockWorker).toHaveBeenCalledOnce()
  })

  it('should return cached instance even with a different processor reference', async () => {
    const w1 = await useWorker('orders', vi.fn())
    const w2 = await useWorker('orders', vi.fn())

    expect(w1).toBe(w2)
    expect(MockWorker).toHaveBeenCalledOnce()
  })

  it('should create separate instances for different names', async () => {
    const processor = vi.fn()
    const w1 = await useWorker('orders', processor)
    const w2 = await useWorker('payments', processor)

    expect(w1).not.toBe(w2)
    expect(MockWorker).toHaveBeenCalledTimes(2)
  })

  it('should pass worker options through to BullMQ', async () => {
    const processor = vi.fn()
    await useWorker('orders', processor, { concurrency: 5 })

    expect(MockWorker).toHaveBeenCalledWith('orders', processor, expect.objectContaining({
      concurrency: 5,
    }))
  })

  describe('closeWorkers', () => {
    it('should close all workers', async () => {
      await useWorker('orders', vi.fn())
      await useWorker('payments', vi.fn())

      await closeWorkers()

      expect(mockWorkerInstances.orders!.close).toHaveBeenCalledOnce()
      expect(mockWorkerInstances.payments!.close).toHaveBeenCalledOnce()
    })

    it('should allow creating new workers after close', async () => {
      await useWorker('orders', vi.fn())
      await closeWorkers()

      const w = await useWorker('orders', vi.fn())
      expect(w).toBeDefined()
      expect(MockWorker).toHaveBeenCalledTimes(2)
    })
  })
})
