import type { DomainEvent, EventBus } from './types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from './domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

// Mock hookable provider — each call returns a fresh mock
function makeMockBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }
}

let lastHookableBus: EventBus
let lastRabbitBus: EventBus

vi.mock('./providers/hookable', () => ({
  createHookableEventBus: vi.fn().mockImplementation(() => {
    lastHookableBus = makeMockBus()
    return Promise.resolve(lastHookableBus)
  }),
}))

vi.mock('./providers/rabbitmq', () => ({
  createRabbitMQEventBus: vi.fn().mockImplementation(() => {
    lastRabbitBus = makeMockBus()
    return Promise.resolve(lastRabbitBus)
  }),
}))

const mockConfig = {
  databaseUrl: '',
  redisUrl: '',
  queue: { prefix: 'czo', defaultAttempts: 3 },
  eventBus: {
    provider: 'hookable' as const,
    source: 'monolith',
    dualWrite: false,
    rabbitmq: undefined as { url: string } | undefined,
  },
}

vi.mock('../config', () => ({
  useCzoConfig: vi.fn(() => ({ ...mockConfig, eventBus: { ...mockConfig.eventBus } })),
}))

function makeEvent(type: string, payload: unknown = {}): DomainEvent {
  return createDomainEvent({ type, payload })
}

describe('useEventBus', () => {
  let useEventBus: typeof import('./use-event-bus').useEventBus
  let resetEventBus: typeof import('./use-event-bus').resetEventBus
  let shutdownEventBus: typeof import('./use-event-bus').shutdownEventBus

  beforeEach(async () => {
    vi.clearAllMocks()
    mockConfig.eventBus = {
      provider: 'hookable',
      source: 'monolith',
      dualWrite: false,
      rabbitmq: undefined,
    }

    vi.resetModules()
    const mod = await import('./use-event-bus')
    useEventBus = mod.useEventBus
    resetEventBus = mod.resetEventBus
    shutdownEventBus = mod.shutdownEventBus
    resetEventBus()
  })

  afterEach(() => {
    resetEventBus()
  })

  describe('singleton behavior', () => {
    it('should return the same instance on subsequent calls', async () => {
      const bus1 = await useEventBus()
      const bus2 = await useEventBus()

      expect(bus1).toBe(bus2)
    })

    it('should create a new instance after reset', async () => {
      const bus1 = await useEventBus()
      resetEventBus()
      const bus2 = await useEventBus()

      expect(bus1).not.toBe(bus2)
    })
  })

  describe('provider selection', () => {
    it('should use hookable provider by default', async () => {
      const bus = await useEventBus()

      const event = makeEvent('test.event')
      await bus.publish(event)

      expect(lastHookableBus.publish).toHaveBeenCalledWith(event)
    })

    it('should use rabbitmq provider when configured', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = false
      mockConfig.eventBus.rabbitmq = { url: 'amqp://localhost' }
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      const bus = await mod.useEventBus()
      const event = makeEvent('test.event')
      await bus.publish(event)

      expect(lastRabbitBus.publish).toHaveBeenCalledWith(event)
    })
  })

  describe('config validation', () => {
    it('should throw when dualWrite is true but rabbitmq config is missing', async () => {
      mockConfig.eventBus.provider = 'hookable'
      ;(mockConfig.eventBus as any).dualWrite = true
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      await expect(mod.useEventBus()).rejects.toThrow('rabbitmq config is required')
    })

    it('should throw when provider is rabbitmq but rabbitmq config is missing', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = false
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      await expect(mod.useEventBus()).rejects.toThrow('rabbitmq config is required')
    })
  })

  describe('dual-write mode', () => {
    it('should publish to both hookable and rabbitmq when dualWrite is true', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = true
      mockConfig.eventBus.rabbitmq = { url: 'amqp://localhost' }
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      const bus = await mod.useEventBus()
      const event = makeEvent('product.created', { id: '1' })
      await bus.publish(event)

      expect(lastHookableBus.publish).toHaveBeenCalledWith(event)
      expect(lastRabbitBus.publish).toHaveBeenCalledWith(event)
    })

    it('should propagate publish errors in dual-write mode', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = true
      mockConfig.eventBus.rabbitmq = { url: 'amqp://localhost' }
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      const bus = await mod.useEventBus()

      // Make rabbitmq publish fail
      vi.mocked(lastRabbitBus.publish).mockRejectedValueOnce(new Error('rabbit down'))

      const event = makeEvent('product.created')
      await expect(bus.publish(event)).rejects.toThrow('rabbit down')
    })

    it('should subscribe to hookable only in dual-write mode', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = true
      mockConfig.eventBus.rabbitmq = { url: 'amqp://localhost' }
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      const bus = await mod.useEventBus()
      const handler = vi.fn()
      bus.subscribe('test.*', handler)

      // Subscribe should delegate to the primary (rabbitmq) bus
      expect(lastRabbitBus.subscribe).toHaveBeenCalledWith('test.*', handler)
    })
  })

  describe('shutdownEventBus', () => {
    it('should shut down the active bus', async () => {
      await useEventBus()
      await shutdownEventBus()

      expect(lastHookableBus.shutdown).toHaveBeenCalledOnce()
    })

    it('should be a no-op when no bus is active', async () => {
      await expect(shutdownEventBus()).resolves.toBeUndefined()
    })

    it('should shut down both buses in dual-write mode', async () => {
      mockConfig.eventBus.provider = 'rabbitmq' as any
      mockConfig.eventBus.dualWrite = true
      mockConfig.eventBus.rabbitmq = { url: 'amqp://localhost' }
      vi.resetModules()

      const mod = await import('./use-event-bus')
      mod.resetEventBus()

      await mod.useEventBus()
      await mod.shutdownEventBus()

      expect(lastHookableBus.shutdown).toHaveBeenCalledOnce()
      expect(lastRabbitBus.shutdown).toHaveBeenCalledOnce()
    })
  })
})
