import type { DomainEvent, HookableEventBus } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from '../domain-event'
import { createHookableEventBus } from './hookable'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

function makeEvent(type: string, payload: unknown = {}): DomainEvent {
  return createDomainEvent({ type, payload })
}

describe('createHookableEventBus', () => {
  let bus: HookableEventBus

  beforeEach(async () => {
    bus = await createHookableEventBus()
  })

  afterEach(async () => {
    await bus.shutdown()
  })

  it('should create a HookableEventBus instance', () => {
    expect(bus).toBeDefined()
    expect(bus.publish).toBeInstanceOf(Function)
    expect(bus.subscribe).toBeInstanceOf(Function)
    expect(bus.shutdown).toBeInstanceOf(Function)
    expect(bus.onPublish).toBeInstanceOf(Function)
  })

  describe('publish / subscribe', () => {
    it('should deliver event to exact-match subscriber', async () => {
      const handler = vi.fn()
      bus.subscribe('product.created', handler)

      const event = makeEvent('product.created', { id: '1' })
      await bus.publish(event)

      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(event)
    })

    it('should not deliver event to non-matching subscriber', async () => {
      const handler = vi.fn()
      bus.subscribe('product.updated', handler)

      await bus.publish(makeEvent('product.created'))

      expect(handler).not.toHaveBeenCalled()
    })

    it('should deliver to multiple subscribers for the same pattern', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      bus.subscribe('order.placed', handler1)
      bus.subscribe('order.placed', handler2)

      await bus.publish(makeEvent('order.placed'))

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).toHaveBeenCalledOnce()
    })

    it('should execute handlers in parallel (Promise.allSettled)', async () => {
      const order: string[] = []

      bus.subscribe('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        order.push('slow')
      })
      bus.subscribe('test.event', () => {
        order.push('fast')
      })

      await bus.publish(makeEvent('test.event'))

      // Both should be called; fast finishes before slow since they're parallel
      expect(order).toContain('fast')
      expect(order).toContain('slow')
    })

    it('should not throw when a handler throws', async () => {
      const goodHandler = vi.fn()

      bus.subscribe('test.event', () => {
        throw new Error('handler error')
      })
      bus.subscribe('test.event', goodHandler)

      await expect(bus.publish(makeEvent('test.event'))).resolves.toBeUndefined()
      expect(goodHandler).toHaveBeenCalledOnce()
    })
  })

  describe('pattern matching', () => {
    it('should match single-word wildcard (*)', async () => {
      const handler = vi.fn()
      bus.subscribe('product.*', handler)

      await bus.publish(makeEvent('product.created'))
      await bus.publish(makeEvent('product.updated'))
      await bus.publish(makeEvent('order.placed'))

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should not match deeper paths with single-word wildcard (*)', async () => {
      const handler = vi.fn()
      bus.subscribe('product.*', handler)

      await bus.publish(makeEvent('product.variant.added'))

      expect(handler).not.toHaveBeenCalled()
    })

    it('should match multi-word wildcard (#)', async () => {
      const handler = vi.fn()
      bus.subscribe('product.#', handler)

      await bus.publish(makeEvent('product.created'))
      await bus.publish(makeEvent('product.variant.added'))
      await bus.publish(makeEvent('product.variant.stock.updated'))

      expect(handler).toHaveBeenCalledTimes(3)
    })

    it('should match everything with standalone #', async () => {
      const handler = vi.fn()
      bus.subscribe('#', handler)

      await bus.publish(makeEvent('product.created'))
      await bus.publish(makeEvent('order.placed'))

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should match with wildcard in the middle', async () => {
      const handler = vi.fn()
      bus.subscribe('product.*.completed', handler)

      await bus.publish(makeEvent('product.import.completed'))
      await bus.publish(makeEvent('product.export.completed'))
      await bus.publish(makeEvent('product.created'))

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should handle mixed wildcards', async () => {
      const handler = vi.fn()
      bus.subscribe('*.created', handler)

      await bus.publish(makeEvent('product.created'))
      await bus.publish(makeEvent('order.created'))
      await bus.publish(makeEvent('product.updated'))

      expect(handler).toHaveBeenCalledTimes(2)
    })
  })

  describe('unsubscribe', () => {
    it('should stop delivering events after unsubscribe', async () => {
      const handler = vi.fn()
      const unsub = bus.subscribe('test.event', handler)

      await bus.publish(makeEvent('test.event'))
      expect(handler).toHaveBeenCalledOnce()

      unsub()

      await bus.publish(makeEvent('test.event'))
      expect(handler).toHaveBeenCalledOnce() // still 1
    })

    it('should only remove the unsubscribed handler', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      const unsub1 = bus.subscribe('test.event', handler1)
      bus.subscribe('test.event', handler2)

      unsub1()

      await bus.publish(makeEvent('test.event'))

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledOnce()
    })
  })

  describe('shutdown', () => {
    it('should clear all subscriptions on shutdown', async () => {
      const handler = vi.fn()
      bus.subscribe('test.event', handler)

      await bus.shutdown()

      await bus.publish(makeEvent('test.event'))
      expect(handler).not.toHaveBeenCalled()
    })

    it('should be safe to call shutdown multiple times', async () => {
      await bus.shutdown()
      await expect(bus.shutdown()).resolves.toBeUndefined()
    })
  })

  describe('publish with no subscribers', () => {
    it('should return undefined when no hook is registered', async () => {
      await expect(bus.publish(makeEvent('orphan.event'))).resolves.toBeUndefined()
    })
  })

  describe('onPublish hook', () => {
    it('should return the hook value from publish', async () => {
      bus.onPublish(() => 'hook-result')

      const result = await bus.publish(makeEvent('test.event'))

      expect(result).toBe('hook-result')
    })

    it('should pass the event to the hook', async () => {
      const hook = vi.fn(() => 'ok')
      bus.onPublish(hook)

      const event = makeEvent('test.event', { id: '1' })
      await bus.publish(event)

      expect(hook).toHaveBeenCalledWith(event)
    })

    it('should return the async hook value from publish', async () => {
      bus.onPublish(async () => [{ appId: 'a', ok: true }])

      const result = await bus.publish(makeEvent('test.event'))

      expect(result).toEqual([{ appId: 'a', ok: true }])
    })

    it('should call hook after subscribers', async () => {
      const order: string[] = []

      bus.subscribe('test.event', () => {
        order.push('subscriber')
      })
      bus.onPublish(() => {
        order.push('hook')
        return 'done'
      })

      await bus.publish(makeEvent('test.event'))

      expect(order).toEqual(['subscriber', 'hook'])
    })

    it('should use last-registered hook (single slot)', async () => {
      bus.onPublish(() => 'first')
      bus.onPublish(() => 'second')

      const result = await bus.publish(makeEvent('test.event'))

      expect(result).toBe('second')
    })

    it('should reset hook to noop on shutdown', async () => {
      bus.onPublish(() => 'active')
      await bus.shutdown()

      // Recreate bus after shutdown to test reset
      bus = await createHookableEventBus()

      const result = await bus.publish(makeEvent('test.event'))

      expect(result).toBeUndefined()
    })

    it('should reset hook on the same bus instance after shutdown', async () => {
      bus.onPublish(() => 'active')

      const beforeShutdown = await bus.publish(makeEvent('test.event'))
      expect(beforeShutdown).toBe('active')

      await bus.shutdown()

      const afterShutdown = await bus.publish(makeEvent('test.event'))
      expect(afterShutdown).toBeUndefined()
    })
  })
})
