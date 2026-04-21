import { describe, expect, it } from 'vitest'
import { fromGlobalId, toGlobalId } from './global-id'

describe('toGlobalId', () => {
  it('should encode type and id as base64', () => {
    const result = toGlobalId('User', 'abc-123')
    expect(result).toBe(btoa('User:abc-123'))
  })

  it('should handle ids with special characters', () => {
    const result = toGlobalId('App', 'my:weird=id')
    const decoded = atob(result)
    expect(decoded).toBe('App:my:weird=id')
  })
})

describe('fromGlobalId', () => {
  it('should decode a valid global id', () => {
    const encoded = btoa('User:abc-123')
    expect(fromGlobalId(encoded)).toEqual({ type: 'User', id: 'abc-123' })
  })

  it('should throw on invalid base64', () => {
    expect(() => fromGlobalId('not-base64!!!')).toThrow()
  })

  it('should throw when no colon separator', () => {
    expect(() => fromGlobalId(btoa('InvalidNoColon'))).toThrow()
  })

  it('should throw on empty string', () => {
    expect(() => fromGlobalId('')).toThrow()
  })

  it('should handle ids containing colons', () => {
    const encoded = btoa('App:my:weird:id')
    expect(fromGlobalId(encoded)).toEqual({ type: 'App', id: 'my:weird:id' })
  })
})
