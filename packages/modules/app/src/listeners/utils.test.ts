import { describe, expect, it } from 'vitest'
import { pickFieldsFromQuery } from './utils'

describe('pickFieldsFromQuery', () => {
  // ─── Basic field extraction ─────────────────────────────────────────

  it('should extract only requested fields from payload', () => {
    const query = 'subscription { event { id name } }'
    const payload = { id: '1', name: 'Widget', secret: 'hidden', price: 100 }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', name: 'Widget' })
  })

  it('should handle nested object fields', () => {
    const query = 'subscription { event { id author { name } } }'
    const payload = { id: '1', author: { name: 'Alice', email: 'a@b.com' }, title: 'Post' }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', author: { name: 'Alice' } })
  })

  it('should handle array fields', () => {
    const query = 'subscription { event { id tags { label } } }'
    const payload = { id: '1', tags: [{ label: 'sale', color: 'red' }, { label: 'new', color: 'blue' }] }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', tags: [{ label: 'sale' }, { label: 'new' }] })
  })

  // ─── Wrapper unwrapping ─────────────────────────────────────────────

  it('should unwrap a single root field wrapper', () => {
    const query = 'subscription { productCreated { id name } }'
    const payload = { id: '1', name: 'Widget', extra: 'ignored' }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', name: 'Widget' })
  })

  // ─── Edge cases ─────────────────────────────────────────────────────

  it('should return original payload when no operation found', () => {
    // A fragment definition, not an operation
    const query = 'fragment F on Event { id }'
    const payload = { id: '1', name: 'Widget' }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual(payload)
  })

  it('should return null/undefined/primitives as-is', () => {
    const query = 'subscription { event { id } }'

    expect(pickFieldsFromQuery(query, null)).toBeNull()
    expect(pickFieldsFromQuery(query, undefined)).toBeUndefined()
    expect(pickFieldsFromQuery(query, 'string')).toBe('string')
    expect(pickFieldsFromQuery(query, 42)).toBe(42)
  })

  it('should skip undefined fields gracefully', () => {
    const query = 'subscription { event { id missing } }'
    const payload = { id: '1' }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1' })
  })

  it('should preserve null values for requested fields', () => {
    const query = 'subscription { event { id name } }'
    const payload = { id: '1', name: null }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', name: null })
  })

  it('should handle deeply nested structures', () => {
    const query = 'subscription { event { order { customer { name } } } }'
    const payload = {
      order: {
        id: 'ord-1',
        customer: { name: 'Bob', email: 'bob@test.com', creditCard: '****' },
        total: 100,
      },
    }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ order: { customer: { name: 'Bob' } } })
  })

  it('should handle arrays of primitives in a selected field', () => {
    const query = 'subscription { event { id tags } }'
    const payload = { id: '1', tags: ['a', 'b'], extra: true }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', tags: ['a', 'b'] })
  })

  // ─── Multiple root fields (no unwrap) ──────────────────────────────

  it('should not unwrap when root has multiple fields', () => {
    const query = 'subscription { id name }'
    const payload = { id: '1', name: 'Widget', extra: 'hidden' }

    const result = pickFieldsFromQuery(query, payload)

    expect(result).toEqual({ id: '1', name: 'Widget' })
  })
})
