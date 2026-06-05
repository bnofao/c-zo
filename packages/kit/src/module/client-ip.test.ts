import { describe, expect, it } from 'vitest'
import { resolveClientIp } from './client-ip'

describe('resolveClientIp', () => {
  describe('hops = 0 (trust nothing from X-Forwarded-For)', () => {
    it('uses the socket peer and ignores a forged XFF', () => {
      // Attacker sends a forged header but the socket peer is what counts.
      expect(resolveClientIp('1.2.3.4', 'attacker.real.ip', 0)).toBe('attacker.real.ip')
    })

    it('uses the socket peer when no XFF is present', () => {
      expect(resolveClientIp(undefined, '198.51.100.9', 0)).toBe('198.51.100.9')
      expect(resolveClientIp('', '198.51.100.9', 0)).toBe('198.51.100.9')
    })

    it('falls back to the rightmost XFF hop when there is no socket (test/web-fetch path)', () => {
      expect(resolveClientIp('203.0.113.7', undefined, 0)).toBe('203.0.113.7')
      expect(resolveClientIp('client, proxy', undefined, 0)).toBe('proxy')
    })

    it('returns anon when nothing is known', () => {
      expect(resolveClientIp(undefined, undefined, 0)).toBe('anon')
      expect(resolveClientIp('', null, 0)).toBe('anon')
    })
  })

  describe('hops = N (behind N trusted proxies)', () => {
    it('hops=1: returns the client when one trusted proxy forwarded', () => {
      // client -> LB -> app : XFF="client", socket=LB
      expect(resolveClientIp('client', 'lb.ip', 1)).toBe('client')
    })

    it('hops=2: returns the client behind two trusted proxies', () => {
      // client -> p1 -> p2 -> app : XFF="client, p1", socket=p2
      expect(resolveClientIp('client, p1.ip', 'p2.ip', 2)).toBe('client')
    })

    it('clamps when hops exceeds the chain length', () => {
      expect(resolveClientIp('client', 'lb.ip', 9)).toBe('client')
    })

    it('works on the no-socket test path (hops counts XFF entries)', () => {
      expect(resolveClientIp('client, p1', undefined, 1)).toBe('client')
    })
  })

  describe('hardening of the hops value', () => {
    it('treats negative / NaN hops as 0', () => {
      expect(resolveClientIp('1.2.3.4', 'socket', -3)).toBe('socket')
      expect(resolveClientIp('1.2.3.4', 'socket', Number.NaN)).toBe('socket')
    })

    it('truncates fractional hops', () => {
      expect(resolveClientIp('client', 'lb.ip', 1.9)).toBe('client')
    })
  })
})
