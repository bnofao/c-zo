import type { OrganizationService } from './organization.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrganizationService } from './organization.service'

// ─── DB mock ─────────────────────────────────────────────────────────

function createMockDb() {
  const mockReturning = vi.fn().mockResolvedValue([])
  const mockWhere = vi.fn(() => ({ returning: mockReturning, limit: vi.fn().mockResolvedValue([]) }))
  const mockValues = vi.fn(() => ({ returning: mockReturning, onConflictDoNothing: vi.fn().mockResolvedValue([]) }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: vi.fn().mockResolvedValue([]) }))

  return {
    select: vi.fn(() => ({ from: mockFrom })),
    insert: vi.fn(() => ({ values: mockValues })),
    update: vi.fn(() => ({ set: mockSet })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    _mocks: { mockReturning, mockWhere, mockValues, mockSet, mockFrom },
  }
}

// ─── Auth/API mock ────────────────────────────────────────────────────

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
    leaveOrganization: vi.fn(),
    getActiveMember: vi.fn(),
    getActiveMemberRole: vi.fn(),
    checkOrganizationSlug: vi.fn(),
    listUserInvitations: vi.fn(),
    listMembers: vi.fn(),
  }
}

function createMockAuth() {
  const mockApi = createMockApi()
  return {
    auth: {
      api: mockApi,
      options: { plugins: [] },
      $context: Promise.resolve({ adapter: { findMany: vi.fn().mockResolvedValue([]) } }),
    } as any,
    mockApi,
  }
}

const headers = new Headers({ authorization: 'Bearer test-token' })

const mockOrg = {
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  logo: null,
  metadata: null,
  type: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const mockMember = {
  id: 'm1',
  organizationId: 'org-1',
  userId: 'u1',
  role: 'owner',
  createdAt: new Date('2026-01-01'),
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

describe('organizationService', () => {
  let db: ReturnType<typeof createMockDb>
  let mockApi: ReturnType<typeof createMockApi>
  let auth: any
  let service: OrganizationService

  beforeEach(() => {
    db = createMockDb()
    const mock = createMockAuth()
    auth = mock.auth
    mockApi = mock.mockApi
    service = createOrganizationService(db as any, auth)
    vi.clearAllMocks()
  })

  // ─── Organization CRUD ───────────────────────────────────────────

  describe('create', () => {
    it('should insert org into database and return row', async () => {
      db._mocks.mockReturning.mockResolvedValue([mockOrg])

      const result = await service.create({ name: 'Acme Corp', slug: 'acme-corp' })

      expect(db.insert).toHaveBeenCalled()
      expect(result.id).toBe('org-1')
    })

    it('should pass optional fields when provided', async () => {
      db._mocks.mockReturning.mockResolvedValue([{ ...mockOrg, type: 'merchant', logo: 'https://logo.png' }])

      const result = await service.create({
        name: 'Acme Corp',
        slug: 'acme-corp',
        userId: 'u1',
        logo: 'https://logo.png',
        type: 'merchant',
        metadata: { plan: 'pro' },
      })

      expect(db.insert).toHaveBeenCalled()
      expect(result.type).toBe('merchant')
    })

    it('should throw when insert returns no row', async () => {
      db._mocks.mockReturning.mockResolvedValue([])

      await expect(service.create({ name: 'Test', slug: 'test' })).rejects.toThrow('Failed to create organization')
    })
  })

  describe('update', () => {
    it('should update org in database and return row', async () => {
      const updated = { ...mockOrg, name: 'Acme Inc' }
      db._mocks.mockReturning.mockResolvedValue([updated])

      const result = await service.update({ data: { name: 'Acme Inc' }, organizationId: 'org-1' })

      expect(db.update).toHaveBeenCalled()
      expect(result.name).toBe('Acme Inc')
    })

    it('should throw if organizationId is missing', async () => {
      await expect(service.update({ data: { name: 'X' } })).rejects.toThrow('organizationId required')
    })

    it('should throw when org not found', async () => {
      db._mocks.mockReturning.mockResolvedValue([])

      await expect(service.update({ data: { name: 'X' }, organizationId: 'missing' })).rejects.toThrow('Organization not found')
    })
  })

  describe('remove', () => {
    it('should delete org and return success', async () => {
      const result = await service.remove('org-1')

      expect(db.delete).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })

  describe('find', () => {
    it('should return org when found', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([mockOrg]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.find('org-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('org-1')
    })

    it('should return null when not found', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.find('unknown')

      expect(result).toBeNull()
    })
  })

  describe('findBySlug', () => {
    it('should return org when found by slug', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([mockOrg]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.findBySlug('acme-corp')

      expect(result!.slug).toBe('acme-corp')
    })

    it('should return null when not found', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.findBySlug('missing')

      expect(result).toBeNull()
    })
  })

  describe('setActive', () => {
    it('should call setActiveOrganization with organizationId', async () => {
      mockApi.setActiveOrganization.mockResolvedValue({ id: 'org-1' })

      const result = await service.setActive({ organizationId: 'org-1' }, headers)

      expect(mockApi.setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: 'org-1', organizationSlug: undefined },
      })
      expect(result.id).toBe('org-1')
    })

    it('should accept organizationSlug', async () => {
      mockApi.setActiveOrganization.mockResolvedValue({})

      await service.setActive({ organizationSlug: 'acme-corp' }, headers)

      expect(mockApi.setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: undefined, organizationSlug: 'acme-corp' },
      })
    })

    it('should accept null to clear active org', async () => {
      mockApi.setActiveOrganization.mockResolvedValue(null)

      await service.setActive({ organizationId: null }, headers)

      expect(mockApi.setActiveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: null, organizationSlug: undefined },
      })
    })
  })

  describe('get', () => {
    it('should call getFullOrganization via better-auth', async () => {
      mockApi.getFullOrganization.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', members: [] })

      const result = await service.get({ organizationId: 'org-1' }, headers)

      expect(mockApi.getFullOrganization).toHaveBeenCalledWith({
        headers,
        query: { organizationId: 'org-1', organizationSlug: undefined, membersLimit: undefined },
      })
      expect(result.name).toBe('Acme Corp')
    })
  })

  describe('list', () => {
    it('should return orgs from database', async () => {
      const selectFromMock = vi.fn().mockResolvedValue([mockOrg])
      db.select.mockReturnValue({ from: selectFromMock })

      await service.list()

      expect(db.select).toHaveBeenCalled()
    })
  })

  describe('checkSlug', () => {
    it('should return status false when slug is taken', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([mockOrg]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.checkSlug('acme-corp')

      expect(result.status).toBe(false)
    })

    it('should return status true when slug is available', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.checkSlug('new-slug')

      expect(result.status).toBe(true)
    })
  })

  // ─── Invitations ─────────────────────────────────────────────────

  describe('inviteMember', () => {
    it('should call createInvitation via better-auth and publish event', async () => {
      mockApi.createInvitation.mockResolvedValue(mockInvitation)

      const result = await service.inviteMember({
        email: 'new@test.com',
        role: 'member',
        organizationId: 'org-1',
      }, headers)

      expect(mockApi.createInvitation).toHaveBeenCalled()
      expect(result.id).toBe('inv-1')
    })

    it('should propagate error', async () => {
      mockApi.createInvitation.mockRejectedValue(new Error('Already invited'))

      await expect(service.inviteMember({ email: 'x@t.com', role: 'member' }, headers)).rejects.toThrow('Already invited')
    })
  })

  describe('cancelInvitation', () => {
    it('should update invitation status to cancelled', async () => {
      const cancelled = { ...mockInvitation, status: 'cancelled' }
      db._mocks.mockReturning.mockResolvedValue([cancelled])

      const result = await service.cancelInvitation('inv-1')

      expect(db.update).toHaveBeenCalled()
      expect(result.status).toBe('cancelled')
    })

    it('should throw when invitation not found', async () => {
      db._mocks.mockReturning.mockResolvedValue([])

      await expect(service.cancelInvitation('inv-x')).rejects.toThrow('Invitation not found')
    })
  })

  describe('acceptInvitation', () => {
    it('should delegate to better-auth for transactional accept', async () => {
      const response = { invitation: { ...mockInvitation, status: 'accepted' }, member: mockMember }
      mockApi.acceptInvitation.mockResolvedValue(response)

      const result = await service.acceptInvitation('inv-1', headers)

      expect(mockApi.acceptInvitation).toHaveBeenCalledWith({
        headers,
        body: { invitationId: 'inv-1' },
      })
      expect(result.invitation.status).toBe('accepted')
    })
  })

  describe('getInvitation', () => {
    it('should return invitation from database', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([mockInvitation]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      const result = await service.getInvitation('inv-1')

      expect(result.id).toBe('inv-1')
    })

    it('should throw when invitation not found', async () => {
      const fromMock = { where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      await expect(service.getInvitation('inv-x')).rejects.toThrow('Invitation not found')
    })
  })

  describe('rejectInvitation', () => {
    it('should update invitation status to rejected', async () => {
      const rejected = { ...mockInvitation, status: 'rejected' }
      db._mocks.mockReturning.mockResolvedValue([rejected])

      const result = await service.rejectInvitation('inv-1')

      expect(db.update).toHaveBeenCalled()
      expect(result.status).toBe('rejected')
    })
  })

  describe('listInvitations', () => {
    it('should query invitations from database', async () => {
      const fromMock = { where: vi.fn().mockResolvedValue([mockInvitation]) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      await service.listInvitations('org-1')

      expect(db.select).toHaveBeenCalled()
    })

    it('should return all invitations when no organizationId', async () => {
      const fromMock = vi.fn().mockResolvedValue([mockInvitation])
      db.select.mockReturnValue({ from: fromMock })

      await service.listInvitations(undefined)

      expect(db.select).toHaveBeenCalled()
    })
  })

  // ─── Members ─────────────────────────────────────────────────────

  describe('addMember', () => {
    it('should insert member and return row', async () => {
      db._mocks.mockReturning.mockResolvedValue([mockMember])

      const result = await service.addMember({ organizationId: 'org-1', userId: 'u1', role: 'owner' })

      expect(db.insert).toHaveBeenCalled()
      expect(result.userId).toBe('u1')
    })

    it('should throw when insert fails', async () => {
      db._mocks.mockReturning.mockResolvedValue([])

      await expect(service.addMember({ organizationId: 'org-1', userId: 'u1' })).rejects.toThrow('Failed to add member')
    })
  })

  describe('removeMember', () => {
    it('should delete member from database', async () => {
      const result = await service.removeMember({ memberIdOrEmail: 'u1', organizationId: 'org-1' })

      expect(db.delete).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })

    it('should throw if organizationId is missing', async () => {
      await expect(service.removeMember({ memberIdOrEmail: 'm1' })).rejects.toThrow('organizationId required')
    })
  })

  describe('updateMemberRole', () => {
    it('should update member role in database', async () => {
      const updated = { ...mockMember, role: 'admin' }
      db._mocks.mockReturning.mockResolvedValue([updated])

      const result = await service.updateMemberRole({ memberId: 'm1', role: 'admin' })

      expect(db.update).toHaveBeenCalled()
      expect(result.role).toBe('admin')
    })

    it('should throw when member not found', async () => {
      db._mocks.mockReturning.mockResolvedValue([])

      await expect(service.updateMemberRole({ memberId: 'missing', role: 'admin' })).rejects.toThrow('Member not found')
    })
  })

  describe('leave', () => {
    it('should call leaveOrganization via better-auth', async () => {
      mockApi.leaveOrganization.mockResolvedValue(mockMember)

      await service.leave('org-1', headers)

      expect(mockApi.leaveOrganization).toHaveBeenCalledWith({
        headers,
        body: { organizationId: 'org-1' },
      })
    })
  })

  describe('getActiveMember', () => {
    it('should call getActiveMember via better-auth', async () => {
      mockApi.getActiveMember.mockResolvedValue(mockMember)

      const result = await service.getActiveMember(headers)

      expect(mockApi.getActiveMember).toHaveBeenCalledWith({ headers })
      expect(result.id).toBe('m1')
    })
  })

  describe('getActiveMemberRole', () => {
    it('should call getActiveMemberRole via better-auth', async () => {
      mockApi.getActiveMemberRole.mockResolvedValue({ role: 'admin' })

      const result = await service.getActiveMemberRole({ userId: 'u1', organizationId: 'org-1' }, headers)

      expect(mockApi.getActiveMemberRole).toHaveBeenCalledWith({
        headers,
        query: { userId: 'u1', organizationId: 'org-1', organizationSlug: undefined },
      })
      expect(result.role).toBe('admin')
    })
  })

  describe('listMembers', () => {
    it('should query members from database with organizationId', async () => {
      const fromMock = { where: vi.fn().mockResolvedValue([mockMember]) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      await service.listMembers({ organizationId: 'org-1' })

      expect(db.select).toHaveBeenCalled()
    })

    it('should throw if organizationId missing', async () => {
      await expect(service.listMembers({})).rejects.toThrow('organizationId required')
    })
  })

  describe('listUserInvitations', () => {
    it('should query invitations by email from database', async () => {
      const fromMock = { where: vi.fn().mockResolvedValue([mockInvitation]) }
      db.select.mockReturnValue({ from: vi.fn().mockReturnValue(fromMock) })

      await service.listUserInvitations('user@test.com')

      expect(db.select).toHaveBeenCalled()
    })
  })
})
