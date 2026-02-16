import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRegisterResolvers = vi.hoisted(() => vi.fn())
const mockValidateOrgType = vi.hoisted(() => vi.fn((type: string | null | undefined) => type ?? null))

vi.mock('@czo/kit/graphql', () => ({
  registerResolvers: mockRegisterResolvers,
}))

vi.mock('../services/organization-types', () => ({
  validateOrgType: mockValidateOrgType,
}))

// eslint-disable-next-line import/first
import './resolvers'

type ResolverFn = (...args: unknown[]) => Promise<unknown>
interface ResolverMap {
  Query: Record<string, ResolverFn>
  Mutation: Record<string, ResolverFn>
}

const resolvers = mockRegisterResolvers.mock.calls[0]![0] as ResolverMap

describe('organization resolvers', () => {
  const mockHeaders = new Headers({ authorization: 'Bearer test-token' })
  const mockRequest = { headers: mockHeaders } as Request

  const mockAuthInstance = {
    api: {
      listOrganizations: vi.fn(),
      getFullOrganization: vi.fn(),
      createOrganization: vi.fn(),
      setActiveOrganization: vi.fn(),
      createInvitation: vi.fn(),
      removeMember: vi.fn(),
      acceptInvitation: vi.fn(),
      listApiKeys: vi.fn(),
    },
  }

  const mockAuthRestrictions = {
    getEffectiveConfig: vi.fn(),
  }

  const mockContext = {
    auth: {
      session: { id: 's1', userId: 'u1', expiresAt: new Date(), actorType: 'admin', authMethod: 'email', organizationId: null },
      user: { id: 'u1', email: 'test@czo.dev', name: 'Test', twoFactorEnabled: false },
      actorType: 'admin',
      organization: null,
      authSource: 'bearer' as const,
    },
    authInstance: mockAuthInstance,
    authRestrictions: mockAuthRestrictions,
    request: mockRequest,
  }

  beforeEach(() => {
    Object.values(mockAuthInstance.api).forEach(fn => fn.mockReset())
    mockAuthRestrictions.getEffectiveConfig.mockReset()
  })

  it('should register resolvers', () => {
    expect(mockRegisterResolvers).toHaveBeenCalledTimes(1)
    expect(resolvers.Query).toBeDefined()
    expect(resolvers.Mutation).toBeDefined()
  })

  describe('query.myAuthConfig', () => {
    it('should return effective config from authRestrictions', async () => {
      const effectiveConfig = {
        require2FA: true,
        sessionDuration: 28800,
        allowImpersonation: false,
        dominantActorType: 'admin',
        allowedMethods: ['email'],
        actorTypes: ['admin'],
      }
      mockAuthRestrictions.getEffectiveConfig.mockResolvedValue(effectiveConfig)

      const result = await resolvers.Query.myAuthConfig!(null, {}, mockContext)

      expect(mockAuthRestrictions.getEffectiveConfig).toHaveBeenCalledWith('u1')
      expect(result).toEqual(effectiveConfig)
    })
  })

  describe('query.myOrganizations', () => {
    it('should call listOrganizations with request headers', async () => {
      const orgs = [{ id: 'org1', name: 'Org 1', slug: 'org-1' }]
      mockAuthInstance.api.listOrganizations.mockResolvedValue(orgs)

      const result = await resolvers.Query.myOrganizations!(null, {}, mockContext)

      expect(mockAuthInstance.api.listOrganizations).toHaveBeenCalledWith({
        headers: mockHeaders,
      })
      expect(result).toEqual(orgs)
    })

    it('should return empty array when no organizations', async () => {
      mockAuthInstance.api.listOrganizations.mockResolvedValue(null)

      const result = await resolvers.Query.myOrganizations!(null, {}, mockContext)

      expect(result).toEqual([])
    })
  })

  describe('query.organization', () => {
    it('should call getFullOrganization with id', async () => {
      const org = { id: 'org1', name: 'Org 1', slug: 'org-1' }
      mockAuthInstance.api.getFullOrganization.mockResolvedValue(org)

      const result = await resolvers.Query.organization!(null, { id: 'org1' }, mockContext)

      expect(mockAuthInstance.api.getFullOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        query: { organizationId: 'org1' },
      })
      expect(result).toEqual(org)
    })

    it('should return null when organization not found', async () => {
      mockAuthInstance.api.getFullOrganization.mockResolvedValue(null)

      const result = await resolvers.Query.organization!(null, { id: 'nonexistent' }, mockContext)

      expect(result).toBeNull()
    })
  })

  describe('query.myApiKeys', () => {
    it('should call listApiKeys with request headers', async () => {
      const keys = [
        { id: 'ak1', name: 'My Key', prefix: 'czo_', start: 'czo_ab', enabled: true, createdAt: new Date().toISOString() },
      ]
      mockAuthInstance.api.listApiKeys.mockResolvedValue(keys)

      const result = await resolvers.Query.myApiKeys!(null, {}, mockContext)

      expect(mockAuthInstance.api.listApiKeys).toHaveBeenCalledWith({
        headers: mockHeaders,
      })
      expect(result).toEqual(keys)
    })

    it('should return empty array when no API keys', async () => {
      mockAuthInstance.api.listApiKeys.mockResolvedValue(null)

      const result = await resolvers.Query.myApiKeys!(null, {}, mockContext)

      expect(result).toEqual([])
    })
  })

  describe('mutation.createOrganization', () => {
    it('should create organization with name and optional slug', async () => {
      const org = { id: 'org1', name: 'My Store', slug: 'my-store' }
      mockAuthInstance.api.createOrganization.mockResolvedValue(org)

      const result = await resolvers.Mutation.createOrganization!(
        null,
        { input: { name: 'My Store', slug: 'my-store' } },
        mockContext,
      )

      expect(mockAuthInstance.api.createOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { name: 'My Store', slug: 'my-store' },
      })
      expect(result).toEqual(org)
    })

    it('should create organization without slug (auto-generated)', async () => {
      const org = { id: 'org1', name: 'My Store', slug: 'my-store' }
      mockAuthInstance.api.createOrganization.mockResolvedValue(org)

      await resolvers.Mutation.createOrganization!(
        null,
        { input: { name: 'My Store' } },
        mockContext,
      )

      expect(mockAuthInstance.api.createOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { name: 'My Store' },
      })
    })

    it('should validate and pass type when provided', async () => {
      const org = { id: 'org1', name: 'My Store', slug: 'my-store', type: 'merchant' }
      mockAuthInstance.api.createOrganization.mockResolvedValue(org)
      mockValidateOrgType.mockReturnValue('merchant')

      const result = await resolvers.Mutation.createOrganization!(
        null,
        { input: { name: 'My Store', type: 'merchant' } },
        mockContext,
      )

      expect(mockValidateOrgType).toHaveBeenCalledWith('merchant')
      expect(mockAuthInstance.api.createOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { name: 'My Store', type: 'merchant' },
      })
      expect(result).toEqual(org)
    })

    it('should not include type in body when validateOrgType returns null', async () => {
      const org = { id: 'org1', name: 'My Store', slug: 'my-store' }
      mockAuthInstance.api.createOrganization.mockResolvedValue(org)
      mockValidateOrgType.mockReturnValue(null)

      await resolvers.Mutation.createOrganization!(
        null,
        { input: { name: 'My Store' } },
        mockContext,
      )

      expect(mockAuthInstance.api.createOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { name: 'My Store' },
      })
    })

    it('should throw when validateOrgType throws for invalid type', async () => {
      mockValidateOrgType.mockImplementation(() => {
        throw new Error('Invalid organization type: "bad"')
      })

      await expect(
        resolvers.Mutation.createOrganization!(
          null,
          { input: { name: 'My Store', type: 'bad' } },
          mockContext,
        ),
      ).rejects.toThrow('Invalid organization type')
    })
  })

  describe('mutation.setActiveOrganization', () => {
    it('should set active organization by id', async () => {
      const org = { id: 'org1', name: 'Org 1', slug: 'org-1', members: [], invitations: [] }
      mockAuthInstance.api.setActiveOrganization.mockResolvedValue(org)

      const result = await resolvers.Mutation.setActiveOrganization!(
        null,
        { organizationId: 'org1' },
        mockContext,
      )

      expect(mockAuthInstance.api.setActiveOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { organizationId: 'org1' },
      })
      expect(result).toEqual(org)
    })

    it('should clear active organization when organizationId is null', async () => {
      mockAuthInstance.api.setActiveOrganization.mockResolvedValue(null)

      const result = await resolvers.Mutation.setActiveOrganization!(
        null,
        { organizationId: null },
        mockContext,
      )

      expect(mockAuthInstance.api.setActiveOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { organizationId: null },
      })
      expect(result).toBeNull()
    })

    it('should clear active organization when organizationId is undefined', async () => {
      mockAuthInstance.api.setActiveOrganization.mockResolvedValue(null)

      const result = await resolvers.Mutation.setActiveOrganization!(
        null,
        {},
        mockContext,
      )

      expect(mockAuthInstance.api.setActiveOrganization).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { organizationId: null },
      })
      expect(result).toBeNull()
    })
  })

  describe('mutation.inviteMember', () => {
    it('should create invitation with email and role', async () => {
      const invitation = { id: 'inv1', email: 'new@czo.dev', role: 'member', status: 'pending' }
      mockAuthInstance.api.createInvitation.mockResolvedValue(invitation)

      const result = await resolvers.Mutation.inviteMember!(
        null,
        { organizationId: 'org1', email: 'new@czo.dev', role: 'member' },
        mockContext,
      )

      expect(mockAuthInstance.api.createInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { organizationId: 'org1', email: 'new@czo.dev', role: 'member' },
      })
      expect(result).toEqual(invitation)
    })
  })

  describe('mutation.removeMember', () => {
    it('should remove member and return true', async () => {
      mockAuthInstance.api.removeMember.mockResolvedValue({ success: true })

      const result = await resolvers.Mutation.removeMember!(
        null,
        { organizationId: 'org1', memberIdToRemove: 'm1' },
        mockContext,
      )

      expect(mockAuthInstance.api.removeMember).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { organizationId: 'org1', memberIdOrEmail: 'm1' },
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.acceptInvitation', () => {
    it('should accept invitation and return member from result', async () => {
      const member = { id: 'm1', userId: 'u2', role: 'member', createdAt: new Date().toISOString() }
      mockAuthInstance.api.acceptInvitation.mockResolvedValue({ member, invitation: {} })

      const result = await resolvers.Mutation.acceptInvitation!(
        null,
        { invitationId: 'inv1' },
        mockContext,
      )

      expect(mockAuthInstance.api.acceptInvitation).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { invitationId: 'inv1' },
      })
      expect(result).toEqual(member)
    })

    it('should throw when acceptInvitation returns null', async () => {
      mockAuthInstance.api.acceptInvitation.mockResolvedValue(null)

      await expect(
        resolvers.Mutation.acceptInvitation!(
          null,
          { invitationId: 'inv-bad' },
          mockContext,
        ),
      ).rejects.toThrow('Failed to accept invitation')
    })
  })
})
