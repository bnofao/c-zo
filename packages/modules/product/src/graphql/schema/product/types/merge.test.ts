import { describe, expect, it } from 'vitest'
import { graftAuthScopes, resolveGraftOrg } from './merge'

const live = (channelId: number, organizationId: number | null) => ({ channelId, organizationId, isPublished: true, reviewState: 'approved', deletedAt: null })

describe('resolveGraftOrg', () => {
  it('channel → the live listing org for that channel', () => {
    expect(resolveGraftOrg({ channel: 7 }, [live(7, 42), live(9, 99)])).toBe(42)
  })
  it('channel with no live listing → null', () => {
    expect(resolveGraftOrg({ channel: 7 }, [live(9, 99)])).toBeNull()
    expect(resolveGraftOrg({ channel: 7 }, [{ ...live(7, 42), reviewState: 'pending' }])).toBeNull()
    expect(resolveGraftOrg({ channel: 7 }, [{ ...live(7, 42), isPublished: false }])).toBeNull()
    expect(resolveGraftOrg({ channel: 7 }, [{ ...live(7, 42), deletedAt: new Date() }])).toBeNull()
  })
  it('no channel → viewerOrg fallback', () => {
    expect(resolveGraftOrg({ viewerOrg: { id: '5' } }, [])).toBe(5)
    expect(resolveGraftOrg({}, [])).toBeNull()
  })
  it('channel wins over viewerOrg', () => {
    expect(resolveGraftOrg({ channel: 7, viewerOrg: { id: '5' } }, [live(7, 42)])).toBe(42)
  })
})

describe('graftAuthScopes', () => {
  it('channel path is public', () => {
    expect(graftAuthScopes({ channel: 7 })).toBe(true)
  })
  it('viewerOrg omitted is public; supplied requires product:read in that org', () => {
    expect(graftAuthScopes({})).toBe(true)
    expect(graftAuthScopes({ viewerOrg: { id: '5' } })).toEqual({ permission: { resource: 'product', actions: ['read'], organization: 5 } })
  })
})
