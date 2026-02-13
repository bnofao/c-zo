import { describe, expect, it, vi } from 'vitest'

const mockRegisterTypeDefs = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/graphql', () => ({
  registerTypeDefs: mockRegisterTypeDefs,
}))

describe('organization typedefs', () => {
  it('should register type definitions as a string with the kit registry', async () => {
    await import('./typedefs')

    expect(mockRegisterTypeDefs).toHaveBeenCalledTimes(1)
    const registered = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(typeof registered).toBe('string')
  })

  it('should define Organization type with expected fields', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('type Organization')
    expect(sdl).toContain('id: ID!')
    expect(sdl).toContain('name: String!')
    expect(sdl).toContain('slug: String!')
    expect(sdl).toContain('logo: String')
    expect(sdl).toContain('type: String')
    expect(sdl).toContain('createdAt: DateTime!')
  })

  it('should define OrgMember type', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('type OrgMember')
    expect(sdl).toContain('userId: String!')
    expect(sdl).toContain('role: String!')
  })

  it('should define Invitation type with scalars', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('type Invitation')
    expect(sdl).toContain('email: EmailAddress!')
    expect(sdl).toContain('expiresAt: DateTime')
  })

  it('should extend Query with myOrganizations and organization', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('extend type Query')
    expect(sdl).toContain('myOrganizations: [Organization!]!')
    expect(sdl).toContain('organization(id: ID!): Organization')
  })

  it('should extend Mutation with org operations', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('extend type Mutation')
    expect(sdl).toContain('createOrganization')
    expect(sdl).toContain('setActiveOrganization')
    expect(sdl).toContain('inviteMember')
    expect(sdl).toContain('removeMember')
    expect(sdl).toContain('acceptInvitation')
  })

  it('should define CreateOrganizationInput with type field', () => {
    const sdl = mockRegisterTypeDefs.mock.calls[0]![0] as string
    expect(sdl).toContain('input CreateOrganizationInput')
    expect(sdl).toContain('type: String')
  })
})
