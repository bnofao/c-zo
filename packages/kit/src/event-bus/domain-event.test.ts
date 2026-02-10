import { describe, expect, it, vi } from 'vitest'
import { createDomainEvent, validateDomainEvent } from './domain-event'

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000'
vi.stubGlobal('crypto', { randomUUID: () => MOCK_UUID })

describe('createDomainEvent', () => {
  it('should create a domain event with auto-generated id and timestamp', () => {
    const event = createDomainEvent({
      type: 'product.created',
      payload: { id: '123', title: 'Widget' },
    })

    expect(event.id).toBe(MOCK_UUID)
    expect(event.type).toBe('product.created')
    expect(event.payload).toEqual({ id: '123', title: 'Widget' })
    expect(event.timestamp).toBeDefined()
    expect(() => new Date(event.timestamp)).not.toThrow()
    expect(event.metadata.version).toBe(1)
  })

  it('should use default source "unknown" when not provided', () => {
    const event = createDomainEvent({
      type: 'order.placed',
      payload: {},
    })

    expect(event.metadata.source).toBe('unknown')
  })

  it('should accept custom metadata', () => {
    const event = createDomainEvent({
      type: 'product.updated',
      payload: { id: '456' },
      metadata: {
        source: 'product-service',
        correlationId: 'corr-123',
        causationId: 'cause-456',
        version: 2,
      },
    })

    expect(event.metadata.source).toBe('product-service')
    expect(event.metadata.correlationId).toBe('corr-123')
    expect(event.metadata.causationId).toBe('cause-456')
    expect(event.metadata.version).toBe(2)
  })

  it('should accept a custom id', () => {
    const event = createDomainEvent({
      type: 'test.event',
      payload: {},
      id: 'custom-id-789',
    })

    expect(event.id).toBe('custom-id-789')
  })

  it('should produce an immutable event object', () => {
    const event = createDomainEvent({
      type: 'test.event',
      payload: { value: 1 },
    })

    expect(Object.isFrozen(event)).toBe(true)
  })
})

describe('validateDomainEvent', () => {
  it('should validate a well-formed domain event', () => {
    const input = {
      id: MOCK_UUID,
      type: 'product.created',
      timestamp: new Date().toISOString(),
      payload: { id: '123' },
      metadata: {
        source: 'test',
        version: 1,
      },
    }

    const result = validateDomainEvent(input)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('product.created')
    }
  })

  it('should reject event with missing type', () => {
    const input = {
      id: MOCK_UUID,
      timestamp: new Date().toISOString(),
      payload: {},
      metadata: { source: 'test', version: 1 },
    }

    const result = validateDomainEvent(input)
    expect(result.success).toBe(false)
  })

  it('should reject event with empty type string', () => {
    const input = {
      id: MOCK_UUID,
      type: '',
      timestamp: new Date().toISOString(),
      payload: {},
      metadata: { source: 'test', version: 1 },
    }

    const result = validateDomainEvent(input)
    expect(result.success).toBe(false)
  })

  it('should reject event with missing metadata', () => {
    const input = {
      id: MOCK_UUID,
      type: 'product.created',
      timestamp: new Date().toISOString(),
      payload: {},
    }

    const result = validateDomainEvent(input)
    expect(result.success).toBe(false)
  })

  it('should reject event with version less than 1', () => {
    const input = {
      id: MOCK_UUID,
      type: 'product.created',
      timestamp: new Date().toISOString(),
      payload: {},
      metadata: { source: 'test', version: 0 },
    }

    const result = validateDomainEvent(input)
    expect(result.success).toBe(false)
  })

  it('should accept event with optional metadata fields', () => {
    const input = {
      id: MOCK_UUID,
      type: 'order.placed',
      timestamp: new Date().toISOString(),
      payload: { orderId: 'abc' },
      metadata: {
        source: 'order-service',
        correlationId: 'corr-1',
        causationId: 'cause-1',
        version: 3,
      },
    }

    const result = validateDomainEvent(input)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.metadata.correlationId).toBe('corr-1')
      expect(result.data.metadata.causationId).toBe('cause-1')
    }
  })

  it('should reject completely invalid input', () => {
    const result = validateDomainEvent('not an object')
    expect(result.success).toBe(false)
  })

  it('should reject null input', () => {
    const result = validateDomainEvent(null)
    expect(result.success).toBe(false)
  })
})
