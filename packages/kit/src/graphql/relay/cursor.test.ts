import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('encodeCursor', () => {
  it('should encode values as base64 JSON', () => {
    const cursor = encodeCursor(['2026-01-01', 'abc'])
    const decoded = JSON.parse(atob(cursor))
    expect(decoded).toEqual(['2026-01-01', 'abc'])
  })
})

describe('decodeCursor', () => {
  it('should decode a valid cursor', () => {
    const cursor = btoa(JSON.stringify(['2026-01-01', 'abc']))
    expect(decodeCursor(cursor)).toEqual(['2026-01-01', 'abc'])
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
    const cursor = btoa(JSON.stringify([19.99, 'x']))
    expect(decodeCursor(cursor)).toEqual([19.99, 'x'])
  })

  it('should throw on non-array input', () => {
    expect(() => decodeCursor(btoa(JSON.stringify({ id: 'x' })))).toThrow()
  })
})
