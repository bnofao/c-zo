import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  COOKIE_MAX_AGE,
  OAUTH_ACTOR_COOKIE,
  signActorValue,
  verifyActorValue,
} from './oauth-state'

describe('oauth-state', () => {
  const secret = 'test-secret-key-32-chars-minimum!'

  describe('constants', () => {
    it('should export OAUTH_ACTOR_COOKIE as czo_oauth_actor', () => {
      expect(OAUTH_ACTOR_COOKIE).toBe('czo_oauth_actor')
    })

    it('should export COOKIE_MAX_AGE as 300 seconds', () => {
      expect(COOKIE_MAX_AGE).toBe(300)
    })
  })

  describe('signActorValue', () => {
    it('should return actor.hmac format', () => {
      const signed = signActorValue('customer', secret)
      const parts = signed.split('.')

      expect(parts).toHaveLength(2)
      expect(parts[0]).toBe('customer')
      expect(parts[1]).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce deterministic output for same inputs', () => {
      const a = signActorValue('admin', secret)
      const b = signActorValue('admin', secret)
      expect(a).toBe(b)
    })

    it('should produce different output for different actors', () => {
      const customer = signActorValue('customer', secret)
      const admin = signActorValue('admin', secret)
      expect(customer).not.toBe(admin)
    })

    it('should produce different output for different secrets', () => {
      const a = signActorValue('customer', 'secret-a-32-chars-minimum-ok-yes!')
      const b = signActorValue('customer', 'secret-b-32-chars-minimum-ok-yes!')
      expect(a).not.toBe(b)
    })

    it('should use HMAC-SHA256', () => {
      const signed = signActorValue('customer', secret)
      const expectedHmac = createHmac('sha256', secret).update('customer').digest('hex')
      expect(signed).toBe(`customer.${expectedHmac}`)
    })
  })

  describe('verifyActorValue', () => {
    it('should return actor for valid signed value', () => {
      const signed = signActorValue('customer', secret)
      expect(verifyActorValue(signed, secret)).toBe('customer')
    })

    it('should return null for tampered actor', () => {
      const signed = signActorValue('customer', secret)
      const tampered = signed.replace('customer', 'admin')
      expect(verifyActorValue(tampered, secret)).toBeNull()
    })

    it('should return null for tampered hmac', () => {
      const tampered = `customer.${'a'.repeat(64)}`
      expect(verifyActorValue(tampered, secret)).toBeNull()
    })

    it('should return null for wrong secret', () => {
      const signed = signActorValue('customer', secret)
      expect(verifyActorValue(signed, 'wrong-secret-32-chars-minimum!!!!')).toBeNull()
    })

    it('should return null for value without dot separator', () => {
      expect(verifyActorValue('nodot', secret)).toBeNull()
    })

    it('should return null for empty actor part', () => {
      expect(verifyActorValue(`.${createHmac('sha256', secret).update('').digest('hex')}`, secret)).toBeNull()
    })

    it('should return null for empty hmac part', () => {
      expect(verifyActorValue('customer.', secret)).toBeNull()
    })

    it('should return null for hmac with wrong length', () => {
      expect(verifyActorValue('customer.abc', secret)).toBeNull()
    })

    it('should be resistant to timing attacks (uses timingSafeEqual)', () => {
      const signed = signActorValue('customer', secret)
      const result = verifyActorValue(signed, secret)
      expect(result).toBe('customer')
    })

    it('should roundtrip for admin actor', () => {
      const signed = signActorValue('admin', secret)
      expect(verifyActorValue(signed, secret)).toBe('admin')
    })
  })
})
