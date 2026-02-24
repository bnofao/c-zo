import { describe, expect, it } from 'vitest'
import { rateLimitConfig } from './others'

describe('rateLimitConfig', () => {
  it('returns enabled: true', () => {
    const config = rateLimitConfig()
    expect(config.enabled).toBe(true)
  })

  it('returns default window=60 and max=30', () => {
    const config = rateLimitConfig()
    expect(config.window).toBe(60)
    expect(config.max).toBe(30)
  })

  it('returns storage: "memory" when no storage provided', () => {
    const config = rateLimitConfig()
    expect(config.storage).toBe('memory')
  })

  it('returns storage: "secondary-storage" when storage provided', () => {
    const fakeStorage = {} as Parameters<typeof rateLimitConfig>[0]
    const config = rateLimitConfig(fakeStorage)
    expect(config.storage).toBe('secondary-storage')
  })

  describe('customRules', () => {
    const config = rateLimitConfig()
    const rules = config.customRules!

    it('limits sign-in to 5 attempts per 15 minutes', () => {
      expect(rules['/sign-in/email']).toEqual({ window: 900, max: 5 })
    })

    it('limits sign-up to 3 attempts per hour', () => {
      expect(rules['/sign-up/email']).toEqual({ window: 3600, max: 3 })
    })

    it('limits forget-password to 3 requests per hour', () => {
      expect(rules['/forget-password']).toEqual({ window: 3600, max: 3 })
    })

    it('limits reset-password to 3 requests per hour', () => {
      expect(rules['/reset-password']).toEqual({ window: 3600, max: 3 })
    })

    it('limits two-factor verify-totp to 5 attempts per 15 minutes', () => {
      expect(rules['/two-factor/verify-totp']).toEqual({ window: 900, max: 5 })
    })

    it('limits two-factor verify-otp to 5 attempts per 15 minutes', () => {
      expect(rules['/two-factor/verify-otp']).toEqual({ window: 900, max: 5 })
    })

    it('limits two-factor verify-backup-code to 5 attempts per 15 minutes', () => {
      expect(rules['/two-factor/verify-backup-code']).toEqual({ window: 900, max: 5 })
    })

    it('allows lenient get-session rate (60 per 10 seconds)', () => {
      expect(rules['/get-session']).toEqual({ window: 10, max: 60 })
    })
  })
})
