import type { OrganizationService } from './organization.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrganizationService } from './organization.service'

function createMockApi() {
  return {
    createOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    setActiveOrganization: vi.fn(),
    getFullOrganization: vi.fn(),
    listOrganizations: vi.fn(),
    createInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    getInvitation: vi.fn(),
    rejectInvitation: vi.fn(),
    listInvitations: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    checkOrganizationSlug: vi.fn(),
    listUserInvitations: vi.fn(),
    listMembers: vi.fn(),
  }
}

function createMockAuth() {
  return { api: createMockApi() } as unknown as Parameters<typeof createOrganizationService>[0]
}

function api(auth: ReturnType<typeof createMockAuth>) {
  return (auth as unknown as { api: ReturnType<typeof createMockApi> }).api
}

const headers = new Headers({ authorization: 'Bearer test-token' })

const mockOrg = {
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  logo: null,
  metadata: null,
  createdAt: new Date('2026-01-01'),
  members: [{ id: 'm1', organizationId: 'org-1', userId: 'u1', role: 'owner', createdAt: new Date() }],
}

const mockFullOrg = {
  ...mockOrg,
  invitations: [],
}

const mockInvitation = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'new@test.com',
  role: 'member',
  status: 'pending',
  inviterId: 'u1',
  expiresAt: new Date('2026-02-01'),
  createdAt: new Date('2026-01-25'),
}

const mockMember = {
  id: 'm1',
  organizationId: 'org-1',
  userId: 'u1',
  role: 'owner',
  createdAt: new Date('2026-01-01'),
  user: { id: 'u1', name: 'Owner', email: 'owner@test.com', image: undefined },
}

describe('organizationService', () => {
  let auth: ReturnType<typeof createMockAuth>
  let service: OrganizationService

  beforeEach(() => {
    auth = createMockAuth()
    service = createOrganizationService(auth)
  })

  // ─── Organization CRUD ───────────────────────────────────────────

  describe('create', () => {
    it('should call createOrganization with input and headers', async () => {
      api(auth).createOrganization.mockResolvedValue(mockOrg)

      const result = await service.create({ name: 'Acme Corp', slug: 'acme-corp' }, headers)

      expect(api(auth).createOrganization).toHaveBeenCalledWith({
        headers,
        body: { name: 'Acme Corp', slug: 'acme-corp' },
      })
      expect(result.id).toBe('org-1')
    })

    it('should call createOrganization without headers for server-side usage', async () => {
      api(auth).createOrganization.mockResolvedValue(mockOrg)

      await service.create({
        name: 'Acme Corp',
        slug: 'acme-corp',
        userId: 'u1',
      })

      expect(api(auth).createOrganization).toHaveBeenCalledWith({
        headers: undefined,
        body: {
          name: 'Acme Corp',
          slug: 'acme-corp',
          userId: 'u1',
        },
      })
    })

    it('should pass optional fields when provided', async () => {
      api(auth).createOrganization.mockResolvedValue(mockOrg)

      await service.create({
        name: 'Acme Corp',
        slug: 'acme-corp',
        userId: 'u1',
        logo: 'https://logo.png',
        type: 'merchant',
        metadata: { plan: 'pro' },
        keepCurrentActiveOrganization: true,
      }, headers)

      expect(api(auth).createOrganization).toHaveBeenCalledWith({
        headers,
        body: {
          name: 'Acme Corp',
          slug: 'acme-corp',
          userId: 'u1',
          logo: 'https://logo.png',
          type: 'merchant',
          metadata: { plan: 'pro' },
          keepCurrentActiveOrganization: true,
        },
      })
    })

    it('should propagate non-APIError', async () => {
      api(auth).createOrganization.mockRejectedValue(new Error('Network failure'))

      await expect(service.create({ name: 'Test', slug: 'test' }, headers)).rejects.toThrow('Network failure')
    })
  })

  describe('update', () => {
    it('should call updateOrganization with data and organizationId', async () => {
      const updated = { ...mockOrg, name: 'Acme Inc' }
      api(auth).updateOrganization.mockResolvedValue(updated)

      const result = await service.update({
        data: { name: 'Acme Inc' },
        organizationId: 'org-1',
      }, headers)

      expect(api(auth).updateOrganization).toHaveBeenCalledWith({
        headers,
        body: {
          data: { name: 'Acme Inc' },
          organizationId: 'org-1',
        },
      })
      expect(result.name).toBe('Acme Inc')
    })

    it('should allow update without organizationId (uses active org)', async () => {
      api(auth).updateOrganization.mockResolvedValue(mockOrg)

      await service.update({ data: { slug: 'new-slug' } }, headers)

      expect(api(auth).updateOrganization).toHaveBeenCalledWith({
        headers,
        body: { data: { slug: 'new-slug' } },
      })
    })

    it('should propagate error', async () => {
      api(auth).updateOrganization.mockRejectedValue(new Error('Forbidden'))

      await expect(service.update({ data: { name: 'X' } }, headers)).rejects.toThrow('Forbidden')
    })
  })

  describe('remove', () => {
    it('should call deleteOrganization with organizationId', async () => {
      api(auth).deleteOrganization.mockResolvedValue(mockOrg)

      const result = await service.remove('org-1', headers)

      expect(api(auth).deleteOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: 'org-1' },
      })
      expect(result.id).toBe('org-1')
    })

    it('should propagate error', async () => {
      api(auth).deleteOrganization.mockRejectedValue(new Error('Not allowed'))

      await expect(service.remove('org-1', headers)).rejects.toThrow('Not allowed')
    })
  })

  describe('setActive', () => {
    it('should call setActiveOrganization with organizationId', async () => {
      api(auth).setActiveOrganization.mockResolvedValue(mockFullOrg)

      const result = await service.setActive('org-1', headers)

      expect(api(auth).setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: 'org-1', organizationSlug: undefined },
      })
      expect(result.id).toBe('org-1')
    })

    it('should accept organizationSlug instead', async () => {
      api(auth).setActiveOrganization.mockResolvedValue(mockFullOrg)

      await service.setActive(undefined, headers, 'acme-corp')

      expect(api(auth).setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: undefined, organizationSlug: 'acme-corp' },
      })
    })

    it('should accept null to clear active org', async () => {
      api(auth).setActiveOrganization.mockResolvedValue(null)

      await service.setActive(null, headers)

      expect(api(auth).setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: null, organizationSlug: undefined },
      })
    })
  })

  describe('get', () => {
    it('should call getFullOrganization with organizationId', async () => {
      api(auth).getFullOrganization.mockResolvedValue(mockFullOrg)

      const result = await service.get('org-1', headers)

      expect(api(auth).getFullOrganization).toHaveBeenCalledWith({
        headers,
        query: { organizationId: 'org-1', organizationSlug: undefined, membersLimit: undefined },
      })
      expect(result!.name).toBe('Acme Corp')
    })

    it('should accept slug and membersLimit', async () => {
      api(auth).getFullOrganization.mockResolvedValue(mockFullOrg)

      await service.get(undefined, headers, 'acme-corp', 50)

      expect(api(auth).getFullOrganization).toHaveBeenCalledWith({
        headers,
        query: { organizationId: undefined, organizationSlug: 'acme-corp', membersLimit: 50 },
      })
    })

    it('should return null when not found', async () => {
      api(auth).getFullOrganization.mockResolvedValue(null)

      const result = await service.get('unknown', headers)

      expect(result).toBeNull()
    })
  })

  describe('list', () => {
    it('should call listOrganizations and return array', async () => {
      api(auth).listOrganizations.mockResolvedValue([mockOrg])

      const result = await service.list(headers)

      expect(api(auth).listOrganizations).toHaveBeenCalledWith({ headers })
      expect(result).toHaveLength(1)
      expect(result[0].slug).toBe('acme-corp')
    })

    it('should return empty array when no orgs', async () => {
      api(auth).listOrganizations.mockResolvedValue([])

      const result = await service.list(headers)

      expect(result).toEqual([])
    })

    it('should propagate error', async () => {
      api(auth).listOrganizations.mockRejectedValue(new Error('API failure'))

      await expect(service.list(headers)).rejects.toThrow('API failure')
    })
  })

  // ─── Invitations ─────────────────────────────────────────────────

  describe('inviteMember', () => {
    it('should call createInvitation with email and role', async () => {
      api(auth).createInvitation.mockResolvedValue(mockInvitation)

      const result = await service.inviteMember({
        email: 'new@test.com',
        role: 'member',
      }, headers)

      expect(api(auth).createInvitation).toHaveBeenCalledWith({
        headers,
        body: { email: 'new@test.com', role: 'member' },
      })
      expect(result.id).toBe('inv-1')
    })

    it('should pass organizationId and resend when provided', async () => {
      api(auth).createInvitation.mockResolvedValue(mockInvitation)

      await service.inviteMember({
        email: 'new@test.com',
        role: 'admin',
        organizationId: 'org-1',
        resend: true,
      }, headers)

      expect(api(auth).createInvitation).toHaveBeenCalledWith({
        headers,
        body: {
          email: 'new@test.com',
          role: 'admin',
          organizationId: 'org-1',
          resend: true,
        },
      })
    })

    it('should propagate error', async () => {
      api(auth).createInvitation.mockRejectedValue(new Error('Already invited'))

      await expect(service.inviteMember({ email: 'x@t.com', role: 'member' }, headers)).rejects.toThrow('Already invited')
    })
  })

  describe('cancelInvitation', () => {
    it('should call cancelInvitation with invitationId', async () => {
      const cancelled = { ...mockInvitation, status: 'canceled' }
      api(auth).cancelInvitation.mockResolvedValue(cancelled)

      const result = await service.cancelInvitation('inv-1', headers)

      expect(api(auth).cancelInvitation).toHaveBeenCalledWith({
        headers,
        body: { invitationId: 'inv-1' },
      })
      expect(result.status).toBe('canceled')
    })

    it('should propagate error', async () => {
      api(auth).cancelInvitation.mockRejectedValue(new Error('Not found'))

      await expect(service.cancelInvitation('inv-x', headers)).rejects.toThrow('Not found')
    })
  })

  describe('acceptInvitation', () => {
    it('should call acceptInvitation and return invitation + member', async () => {
      const response = { invitation: { ...mockInvitation, status: 'accepted' }, member: mockMember }
      api(auth).acceptInvitation.mockResolvedValue(response)

      const result = await service.acceptInvitation('inv-1', headers)

      expect(api(auth).acceptInvitation).toHaveBeenCalledWith({
        headers,
        body: { invitationId: 'inv-1' },
      })
      expect(result!.invitation.status).toBe('accepted')
      expect(result!.member.userId).toBe('u1')
    })

    it('should return null when invitation expired', async () => {
      api(auth).acceptInvitation.mockResolvedValue(null)

      const result = await service.acceptInvitation('inv-expired', headers)

      expect(result).toBeNull()
    })
  })

  describe('getInvitation', () => {
    it('should call getInvitation with id as query', async () => {
      const enriched = {
        ...mockInvitation,
        organizationName: 'Acme Corp',
        organizationSlug: 'acme-corp',
        inviterEmail: 'owner@test.com',
      }
      api(auth).getInvitation.mockResolvedValue(enriched)

      const result = await service.getInvitation('inv-1', headers)

      expect(api(auth).getInvitation).toHaveBeenCalledWith({
        headers,
        query: { id: 'inv-1' },
      })
      expect(result.organizationName).toBe('Acme Corp')
      expect(result.inviterEmail).toBe('owner@test.com')
    })

    it('should propagate error', async () => {
      api(auth).getInvitation.mockRejectedValue(new Error('not found'))

      await expect(service.getInvitation('inv-x', headers)).rejects.toThrow('not found')
    })
  })

  describe('rejectInvitation', () => {
    it('should call rejectInvitation with invitationId', async () => {
      const response = { invitation: { ...mockInvitation, status: 'rejected' }, member: null }
      api(auth).rejectInvitation.mockResolvedValue(response)

      const result = await service.rejectInvitation('inv-1', headers)

      expect(api(auth).rejectInvitation).toHaveBeenCalledWith({
        headers,
        body: { invitationId: 'inv-1' },
      })
      expect(result.invitation!.status).toBe('rejected')
      expect(result.member).toBeNull()
    })
  })

  describe('listInvitations', () => {
    it('should call listInvitations for active org by default', async () => {
      api(auth).listInvitations.mockResolvedValue([mockInvitation])

      const result = await service.listInvitations(undefined, headers)

      expect(api(auth).listInvitations).toHaveBeenCalledWith({
        headers,
        query: { organizationId: undefined },
      })
      expect(result).toHaveLength(1)
    })

    it('should pass organizationId when provided', async () => {
      api(auth).listInvitations.mockResolvedValue([])

      await service.listInvitations('org-1', headers)

      expect(api(auth).listInvitations).toHaveBeenCalledWith({
        headers,
        query: { organizationId: 'org-1' },
      })
    })
  })

  // ─── Members ─────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('should call removeMember with memberIdOrEmail', async () => {
      api(auth).removeMember.mockResolvedValue({ member: mockMember })

      const result = await service.removeMember('m1', headers)

      expect(api(auth).removeMember).toHaveBeenCalledWith({
        headers,
        body: { memberIdOrEmail: 'm1', organizationId: undefined },
      })
      expect(result!.member.id).toBe('m1')
    })

    it('should accept email as identifier', async () => {
      api(auth).removeMember.mockResolvedValue({ member: mockMember })

      await service.removeMember('user@test.com', headers, 'org-1')

      expect(api(auth).removeMember).toHaveBeenCalledWith({
        headers,
        body: { memberIdOrEmail: 'user@test.com', organizationId: 'org-1' },
      })
    })

    it('should propagate error', async () => {
      api(auth).removeMember.mockRejectedValue(new Error('Cannot remove owner'))

      await expect(service.removeMember('m1', headers)).rejects.toThrow('Cannot remove owner')
    })
  })

  describe('updateMemberRole', () => {
    it('should call updateMemberRole with memberId and role', async () => {
      const updated = { ...mockMember, role: 'admin' }
      api(auth).updateMemberRole.mockResolvedValue(updated)

      const result = await service.updateMemberRole('m1', 'admin', headers)

      expect(api(auth).updateMemberRole).toHaveBeenCalledWith({
        headers,
        body: { memberId: 'm1', role: 'admin', organizationId: undefined },
      })
      expect(result.role).toBe('admin')
    })

    it('should accept array of roles', async () => {
      const updated = { ...mockMember, role: 'admin' }
      api(auth).updateMemberRole.mockResolvedValue(updated)

      await service.updateMemberRole('m1', ['admin', 'editor'], headers, 'org-1')

      expect(api(auth).updateMemberRole).toHaveBeenCalledWith({
        headers,
        body: { memberId: 'm1', role: ['admin', 'editor'], organizationId: 'org-1' },
      })
    })
  })

  describe('checkSlug', () => {
    it('should return status true when slug is available', async () => {
      api(auth).checkOrganizationSlug.mockResolvedValue({ status: true })

      const result = await service.checkSlug('new-slug', headers)

      expect(api(auth).checkOrganizationSlug).toHaveBeenCalledWith({
        headers,
        body: { slug: 'new-slug' },
      })
      expect(result.status).toBe(true)
    })

    it('should return status false when slug is taken', async () => {
      api(auth).checkOrganizationSlug.mockResolvedValue({ status: false })

      const result = await service.checkSlug('acme-corp', headers)

      expect(result.status).toBe(false)
    })

    it('should call checkSlug without headers for server-side usage', async () => {
      api(auth).checkOrganizationSlug.mockResolvedValue({ status: true })

      await service.checkSlug('new-slug')

      expect(api(auth).checkOrganizationSlug).toHaveBeenCalledWith({
        headers: undefined,
        body: { slug: 'new-slug' },
      })
    })
  })

  describe('listUserInvitations', () => {
    it('should call listUserInvitations without email by default', async () => {
      const invWithOrg = { ...mockInvitation, organizationName: 'Acme Corp' }
      api(auth).listUserInvitations.mockResolvedValue([invWithOrg])

      const result = await service.listUserInvitations(undefined, headers)

      expect(api(auth).listUserInvitations).toHaveBeenCalledWith({
        headers,
        query: { email: undefined },
      })
      expect(result).toHaveLength(1)
      expect(result[0].organizationName).toBe('Acme Corp')
    })

    it('should call listUserInvitations without headers for server-side usage', async () => {
      api(auth).listUserInvitations.mockResolvedValue([])

      await service.listUserInvitations('user@test.com')

      expect(api(auth).listUserInvitations).toHaveBeenCalledWith({
        headers: undefined,
        query: { email: 'user@test.com' },
      })
    })

    it('should pass email when provided', async () => {
      api(auth).listUserInvitations.mockResolvedValue([])

      await service.listUserInvitations('user@test.com', headers)

      expect(api(auth).listUserInvitations).toHaveBeenCalledWith({
        headers,
        query: { email: 'user@test.com' },
      })
    })
  })

  describe('listMembers', () => {
    it('should call listMembers and return members with total', async () => {
      api(auth).listMembers.mockResolvedValue({ members: [mockMember], total: 1 })

      const result = await service.listMembers({}, headers)

      expect(api(auth).listMembers).toHaveBeenCalledWith({
        headers,
        query: {},
      })
      expect(result.members).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should pass all query params', async () => {
      api(auth).listMembers.mockResolvedValue({ members: [], total: 0 })

      await service.listMembers({
        organizationId: 'org-1',
        limit: 10,
        offset: 5,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      }, headers)

      expect(api(auth).listMembers).toHaveBeenCalledWith({
        headers,
        query: {
          organizationId: 'org-1',
          limit: 10,
          offset: 5,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
      })
    })

    it('should propagate error', async () => {
      api(auth).listMembers.mockRejectedValue(new Error('Not authorized'))

      await expect(service.listMembers({}, headers)).rejects.toThrow('Not authorized')
    })
  })
})
