import type { DomainEvent, EventMap, EventPayload, EventType } from './types'
import { describe, expect, it, vi } from 'vitest'
import { createDomainEvent } from './domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

/**
 * Augment EventMap for these tests — demonstrates the declaration merging
 * pattern that module packages would use.
 */
declare module './types' {
  interface EventMap {
    'product.created': { id: string, title: string }
    'product.deleted': { id: string }
  }
}

describe('eventMap type safety', () => {
  it('should create a typed event with correct payload inference', () => {
    const event = createDomainEvent({
      type: 'product.created' as const,
      payload: { id: '123', title: 'Widget' },
    })

    expect(event.type).toBe('product.created')
    expect(event.payload.id).toBe('123')
    expect(event.payload.title).toBe('Widget')
  })

  it('should create an untyped event when type is not in EventMap', () => {
    const event = createDomainEvent({
      type: 'custom.unknown.event',
      payload: { anything: true },
    })

    expect(event.type).toBe('custom.unknown.event')
    expect(event.payload).toEqual({ anything: true })
  })

  it('should preserve metadata with typed events', () => {
    const event = createDomainEvent({
      type: 'product.deleted' as const,
      payload: { id: 'del-1' },
      metadata: {
        source: 'product-service',
        shopId: 'shop-xyz',
        actorId: 'admin-1',
        actorType: 'user',
      },
    })

    expect(event.metadata.source).toBe('product-service')
    expect(event.metadata.shopId).toBe('shop-xyz')
    expect(event.metadata.actorId).toBe('admin-1')
    expect(event.metadata.actorType).toBe('user')
  })

  it('should support module augmentation pattern', () => {
    // This test verifies the augmented EventMap keys exist at the type level.
    // The compile-time check is the real assertion — if EventMap augmentation
    // didn't work, these lines would not compile.
    const event: DomainEvent<EventMap['product.created']> = createDomainEvent({
      type: 'product.created' as const,
      payload: { id: 'p1', title: 'Test' },
    })

    expect(event.payload.id).toBe('p1')
    expect(event.payload.title).toBe('Test')
  })

  it('should have EventType and EventPayload utility types', () => {
    // These are compile-time checks — if the types were wrong, TS would error.
    const eventType: EventType = 'product.created'
    const payload: EventPayload<'product.created'> = { id: '1', title: 'T' }

    expect(eventType).toBe('product.created')
    expect(payload).toEqual({ id: '1', title: 'T' })
  })
})
