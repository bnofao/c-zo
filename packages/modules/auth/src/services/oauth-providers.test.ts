import { describe, expect, it } from 'vitest'
import {
  getSupportedProvidersForActor,
  isProviderAllowedForActor,
  SUPPORTED_PROVIDERS,
} from './oauth-providers'

describe('oauth-providers', () => {
  describe('sUPPORTED_PROVIDERS', () => {
    it('should include google and github', () => {
      expect(SUPPORTED_PROVIDERS).toEqual(['google', 'github'])
    })
  })

  describe('isProviderAllowedForActor', () => {
    it('should allow google for customer', () => {
      expect(isProviderAllowedForActor('google', 'customer')).toBe(true)
    })

    it('should not allow github for customer', () => {
      expect(isProviderAllowedForActor('github', 'customer')).toBe(false)
    })

    it('should allow github for admin', () => {
      expect(isProviderAllowedForActor('github', 'admin')).toBe(true)
    })

    it('should not allow google for admin', () => {
      expect(isProviderAllowedForActor('google', 'admin')).toBe(false)
    })

    it('should return false for unknown actor', () => {
      expect(isProviderAllowedForActor('google', 'unknown')).toBe(false)
    })

    it('should return false for unknown provider', () => {
      expect(isProviderAllowedForActor('twitter', 'customer')).toBe(false)
    })
  })

  describe('getSupportedProvidersForActor', () => {
    it('should return google for customer', () => {
      expect(getSupportedProvidersForActor('customer')).toEqual(['google'])
    })

    it('should return github for admin', () => {
      expect(getSupportedProvidersForActor('admin')).toEqual(['github'])
    })

    it('should return empty array for unknown actor', () => {
      expect(getSupportedProvidersForActor('unknown')).toEqual([])
    })

    it('should return a new array each time (no mutation risk)', () => {
      const a = getSupportedProvidersForActor('customer')
      const b = getSupportedProvidersForActor('customer')
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })
})
