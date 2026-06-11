import { describe, expect, it } from 'vitest'
import { authNodeGuards } from './node-guards'

const ctx = (user?: { id: string, email: string }) => ({ auth: { user } }) as any

describe('authNodeGuards', () => {
  it('maps User to the global user:read permission', () => {
    expect(authNodeGuards.User({ id: 1 }, ctx())).toEqual({ permission: { resource: 'user', actions: ['read'] } })
  })
  it('maps Organization to organization:read on the row\'s own id', () => {
    expect(authNodeGuards.Organization({ id: 7 }, ctx())).toEqual({ permission: { resource: 'organization', actions: ['read'], organization: 7 } })
  })
  it('maps Member to member:read on the row\'s organizationId', () => {
    expect(authNodeGuards.Member({ id: 3, organizationId: 7 }, ctx())).toEqual({ permission: { resource: 'member', actions: ['read'], organization: 7 } })
  })
  it('allows the invitee (self-email) via auth:true', () => {
    expect(authNodeGuards.Invitation({ email: 'me@x.com', organizationId: 7 }, ctx({ id: '1', email: 'me@x.com' }))).toEqual({ auth: true })
  })
  it('maps a non-self Invitation to org invitation:read', () => {
    expect(authNodeGuards.Invitation({ email: 'other@x.com', organizationId: 7 }, ctx({ id: '1', email: 'me@x.com' }))).toEqual({ permission: { resource: 'invitation', actions: ['read'], organization: 7 } })
  })
  it('maps ApiKey to apiKeyOwner read on the row id', () => {
    expect(authNodeGuards.ApiKey({ id: 9 }, ctx())).toEqual({ apiKeyOwner: { keyId: 9, action: 'read' } })
  })
})
