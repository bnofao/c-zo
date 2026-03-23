import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('encodeCursor', () => {
  it('should encode values as base64 JSON', () => {
    const cursor = encodeCursor({ createdAt: '2026-01-01', id: 'abc' })
    const decoded = JSON.parse(atob(cursor))
    expect(decoded).toEqual({ createdAt: '2026-01-01', id: 'abc' })
  })
})

describe('decodeCursor', () => {
  it('should decode a valid cursor', () => {
    const cursor = btoa(JSON.stringify({ createdAt: '2026-01-01', id: 'abc' }))
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-01-01', id: 'abc' })
  })

  it('should throw on invalid base64', () => {
    expect(() => decodeCursor('not-valid!!!')).toThrow()
  })

  it('should throw on non-JSON content', () => {
    expect(() => decodeCursor(btoa('not json'))).toThrow()
  })

  it('should throw on empty string', () => {
    expect(() => decodeCursor('')).toThrow()
  })

  it('should handle numeric values', () => {
    const cursor = btoa(JSON.stringify({ price: 19.99, id: 'x' }))
    expect(decodeCursor(cursor)).toEqual({ price: 19.99, id: 'x' })
  })
})
