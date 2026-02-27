import type { DomainEvent, DomainEventHandler, HookableEventBus, PublishHook, Unsubscribe } from './types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from './domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

function makeMockBus(): HookableEventBus & { __handlers: Map<string, DomainEventHandler> } {
  const handlers = new Map<string, DomainEventHandler>()
  let hook: PublishHook = () => undefined
  return {
    __handlers: handlers,
    publish: vi.fn().mockImplementation(async (event: DomainEvent) => {
      for (const [, handler] of handlers) {
        await handler(event)
      }
      return hook(event)
    }),
    subscribe: vi.fn().mockImplementation((pattern: string, handler: DomainEventHandler): Unsubscribe => {
      handlers.set(pattern, handler)
      return () => {
        handlers.delete(pattern)
      }
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    onPublish: vi.fn().mockImplementation((h: PublishHook) => { hook = h }),
  }
}

let lastBus: HookableEventBus & { __handlers: Map<string, DomainEventHandler> }

vi.mock('./providers/hookable', () => ({
  createHookableEventBus: vi.fn().mockImplementation(() => {
    lastBus = makeMockBus()
    return Promise.resolve(lastBus)
  }),
}))

function makeEvent(type: string, payload: unknown = {}): DomainEvent {
  return createDomainEvent({ type, payload })
}

describe('useHookable', () => {
  let useHookable: typeof import('./use-hookable').useHookable
  let resetHookable: typeof import('./use-hookable').resetHookable
  let shutdownHookable: typeof import('./use-hookable').shutdownHookable

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const mod = await import('./use-hookable')
    useHookable = mod.useHookable
    resetHookable = mod.resetHookable
    shutdownHookable = mod.shutdownHookable
    resetHookable()
  })

  afterEach(() => {
    resetHookable()
  })

  describe('singleton behavior', () => {
    it('should return the same instance on subsequent calls', async () => {
      const bus1 = await useHookable()
      const bus2 = await useHookable()

      expect(bus1).toBe(bus2)
    })

    it('should create a new instance after reset', async () => {
      const bus1 = await useHookable()
      resetHookable()
      const bus2 = await useHookable()

      expect(bus1).not.toBe(bus2)
    })
  })

  describe('publish and subscribe', () => {
    it('should publish events through the hookable bus', async () => {
      const bus = await useHookable()
      const event = makeEvent('test.event')
      await bus.publish(event)

      expect(lastBus.publish).toHaveBeenCalledWith(event)
    })

    it('should subscribe to events through the hookable bus', async () => {
      const bus = await useHookable()
      const handler = vi.fn()
      bus.subscribe('test.*', handler)

      expect(lastBus.subscribe).toHaveBeenCalledWith('test.*', handler)
    })
  })

  describe('shutdownHookable', () => {
    it('should shut down the active bus', async () => {
      await useHookable()
      await shutdownHookable()

      expect(lastBus.shutdown).toHaveBeenCalledOnce()
    })

    it('should be a no-op when no bus is active', async () => {
      await expect(shutdownHookable()).resolves.toBeUndefined()
    })

    it('should allow re-creation after shutdown', async () => {
      const bus1 = await useHookable()
      await shutdownHookable()
      const bus2 = await useHookable()

      expect(bus1).not.toBe(bus2)
    })
  })
})
