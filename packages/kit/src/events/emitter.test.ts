import type { EventEmitter } from './types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventEmitter } from './emitter'

// Mock crypto.randomUUID for deterministic tests
const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

describe('createEventEmitter', () => {
  let emitter: EventEmitter

  beforeEach(() => {
    emitter = createEventEmitter()
  })

  describe('factory', () => {
    it('should create an emitter', () => {
      const em = createEventEmitter()
      expect(em).toBeDefined()
      expect(em.emit).toBeInstanceOf(Function)
      expect(em.on).toBeInstanceOf(Function)
      expect(em.once).toBeInstanceOf(Function)
      expect(em.off).toBeInstanceOf(Function)
    })

    it('should create independent instances', () => {
      const em1 = createEventEmitter()
      const em2 = createEventEmitter()

      const handler = vi.fn()
      em1.on('test', handler)

      // em2 should not have em1's handler
      em2.emit('test', { data: 'hello' })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('emit()', () => {
    it('should call handler with payload and context', async () => {
      const handler = vi.fn()
      emitter.on('user:created', handler)

      const payload = { id: '123', name: 'John' }
      await emitter.emit('user:created', payload)

      expect(handler).toHaveBeenCalledOnce()
      const [receivedPayload, context] = handler.mock.calls[0]
      expect(receivedPayload).toEqual(payload)
      expect(context.eventId).toBe(MOCK_UUID)
      expect(context.timestamp).toBeInstanceOf(Date)
    })

    it('should execute handlers serially', async () => {
      const order: number[] = []

      emitter.on('serial', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        order.push(1)
      })
      emitter.on('serial', async () => {
        order.push(2)
      })

      await emitter.emit('serial', {})

      expect(order).toEqual([1, 2])
    })

    it('should be a no-op when no handlers registered', async () => {
      await expect(emitter.emit('unknown:event', {})).resolves.toBeUndefined()
    })
  })

  describe('on()', () => {
    it('should return an unsubscribe function', async () => {
      const handler = vi.fn()
      const unsubscribe = emitter.on('test:event', handler)

      await emitter.emit('test:event', {})
      expect(handler).toHaveBeenCalledOnce()

      unsubscribe()

      await emitter.emit('test:event', {})
      expect(handler).toHaveBeenCalledOnce() // Still 1, not 2
    })

    it('should support multiple handlers for the same event', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      emitter.on('multi', handler1)
      emitter.on('multi', handler2)

      await emitter.emit('multi', { x: 1 })

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).toHaveBeenCalledOnce()
    })

    it('should not affect other events when unsubscribing', async () => {
      const handler = vi.fn()
      const unsubscribe = emitter.on('event-a', handler)
      emitter.on('event-b', handler)

      unsubscribe()

      await emitter.emit('event-a', {})
      expect(handler).not.toHaveBeenCalled()

      await emitter.emit('event-b', {})
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe('once()', () => {
    it('should fire handler only once', async () => {
      const handler = vi.fn()
      emitter.once('one-time', handler)

      await emitter.emit('one-time', { first: true })
      await emitter.emit('one-time', { second: true })

      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0]).toEqual({ first: true })
    })

    it('should return an unsubscribe function that works before firing', async () => {
      const handler = vi.fn()
      const unsubscribe = emitter.once('one-time', handler)

      unsubscribe()

      await emitter.emit('one-time', {})
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('off()', () => {
    it('should remove a specific handler', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      emitter.on('removable', handler1)
      emitter.on('removable', handler2)

      emitter.off('removable', handler1)

      await emitter.emit('removable', {})

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledOnce()
    })

    it('should remove all handlers for an event when no handler given', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      emitter.on('clear-all', handler1)
      emitter.on('clear-all', handler2)

      emitter.off('clear-all')

      await emitter.emit('clear-all', {})

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
    })

    it('should not throw when removing a handler from event with no handlers', () => {
      expect(() => emitter.off('nonexistent')).not.toThrow()
    })
  })
})

describe('useEvents()', () => {
  let useEvents: typeof import('./index').useEvents

  beforeEach(async () => {
    const mod = await import('./index')
    useEvents = mod.useEvents
    ;(useEvents as any).__instance__ = undefined
  })

  afterEach(() => {
    ;(useEvents as any).__instance__ = undefined
  })

  it('should return a singleton instance', () => {
    const em1 = useEvents()
    const em2 = useEvents()

    expect(em1).toBe(em2)
  })
})
