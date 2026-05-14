import { describe, expect, it } from 'vitest'
import {
  DbFailed,
  InvalidApiKey,
  KeyExpired,
  Misconfigured,
  RateLimited,
} from './api-key'

describe('apiKey tagged errors', () => {
  it('invalidApiKey carries _tag and code, is an Error', () => {
    const e = new InvalidApiKey()
    expect(e._tag).toBe('InvalidApiKey')
    expect(e.code).toBe('INVALID_API_KEY')
    expect(e).toBeInstanceOf(Error)
  })

  it('keyExpired carries keyId', () => {
    const e = new KeyExpired({ keyId: 42 })
    expect(e._tag).toBe('KeyExpired')
    expect(e.keyId).toBe(42)
    expect(e.code).toBe('API_KEY_EXPIRED')
  })

  it('rateLimited carries tryAgainIn', () => {
    const e = new RateLimited({ tryAgainIn: 1500 })
    expect(e._tag).toBe('RateLimited')
    expect(e.tryAgainIn).toBe(1500)
  })

  it('misconfigured carries reason', () => {
    const e = new Misconfigured({ reason: 'window <= 0' })
    expect(e.reason).toBe('window <= 0')
  })

  it('dbFailed carries cause', () => {
    const cause = new Error('connection lost')
    const e = new DbFailed({ cause })
    expect(e.cause).toBe(cause)
  })
})
