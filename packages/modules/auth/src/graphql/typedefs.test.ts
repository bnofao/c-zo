import type { DocumentNode } from 'graphql'
import { describe, expect, it, vi } from 'vitest'

const mockRegisterTypeDefs = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/graphql', () => ({
  registerTypeDefs: mockRegisterTypeDefs,
}))

function getDefinitionNames(doc: DocumentNode): string[] {
  return doc.definitions
    .filter((d): d is { kind: string, name: { value: string } } => 'name' in d && d.name != null)
    .map(d => d.name.value)
}

function getFieldNames(doc: DocumentNode, typeName: string): string[] {
  const def = doc.definitions.find(
    (d): d is { kind: string, name: { value: string }, fields: Array<{ name: { value: string } }> } =>
      'name' in d && d.name?.value === typeName && 'fields' in d,
  )
  return def?.fields.map(f => f.name.value) ?? []
}

describe('auth typedefs', () => {
  it('should register a single merged DocumentNode with the kit registry', async () => {
    await import('./typedefs')

    expect(mockRegisterTypeDefs).toHaveBeenCalledTimes(1)
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    expect(typeDefs.kind).toBe('Document')
    expect(typeDefs.definitions.length).toBeGreaterThan(0)
  })

  it('should contain all expected type definitions', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const names = getDefinitionNames(typeDefs)

    expect(names).toContain('Organization')
    expect(names).toContain('OrgMember')
    expect(names).toContain('Invitation')
    expect(names).toContain('ApiKey')
    expect(names).toContain('AuthConfig')
    expect(names).toContain('User')
    expect(names).toContain('UserList')
    expect(names).toContain('UserSession')
    expect(names).toContain('UserWhereInput')
    expect(names).toContain('UserOrderByInput')
    expect(names).toContain('UserOrderField')
    expect(names).toContain('CreateUserInput')
    expect(names).toContain('UpdateUserInput')
    expect(names).toContain('CreateOrganizationInput')
  })

  it('should contain Query with all expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const queryFields = getFieldNames(typeDefs, 'Query')

    expect(queryFields).toContain('organizations')
    expect(queryFields).toContain('organization')
    expect(queryFields).toContain('myApiKeys')
    expect(queryFields).toContain('myAuthConfig')
    expect(queryFields).toContain('users')
    expect(queryFields).toContain('user')
    expect(queryFields).toContain('userSessions')
  })

  it('should contain Mutation with all expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const mutationFields = getFieldNames(typeDefs, 'Mutation')

    expect(mutationFields).toContain('createOrganization')
    expect(mutationFields).toContain('setActiveOrganization')
    expect(mutationFields).toContain('inviteMember')
    expect(mutationFields).toContain('removeMember')
    expect(mutationFields).toContain('acceptInvitation')
    expect(mutationFields).toContain('createUser')
    expect(mutationFields).toContain('updateUser')
    expect(mutationFields).toContain('impersonateUser')
    expect(mutationFields).toContain('stopImpersonation')
    expect(mutationFields).toContain('banUser')
    expect(mutationFields).toContain('unbanUser')
    expect(mutationFields).toContain('setRole')
    expect(mutationFields).toContain('removeUser')
    expect(mutationFields).toContain('revokeSession')
    expect(mutationFields).toContain('revokeSessions')
  })

  it('should define User type with expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const fields = getFieldNames(typeDefs, 'User')

    expect(fields).toContain('id')
    expect(fields).toContain('name')
    expect(fields).toContain('email')
    expect(fields).toContain('role')
    expect(fields).toContain('banned')
    expect(fields).toContain('banReason')
    expect(fields).toContain('banExpires')
    expect(fields).toContain('createdAt')
  })

  it('should define Organization type with expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const fields = getFieldNames(typeDefs, 'Organization')

    expect(fields).toContain('id')
    expect(fields).toContain('name')
    expect(fields).toContain('slug')
    expect(fields).toContain('logo')
    expect(fields).toContain('type')
    expect(fields).toContain('createdAt')
  })

  it('should define ApiKey type with expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const fields = getFieldNames(typeDefs, 'ApiKey')

    expect(fields).toContain('id')
    expect(fields).toContain('name')
    expect(fields).toContain('prefix')
    expect(fields).toContain('start')
    expect(fields).toContain('enabled')
    expect(fields).toContain('expiresAt')
    expect(fields).toContain('lastRequest')
    expect(fields).toContain('createdAt')
  })

  it('should define AuthConfig type with expected fields', () => {
    const typeDefs = mockRegisterTypeDefs.mock.calls[0]![0] as DocumentNode
    const fields = getFieldNames(typeDefs, 'AuthConfig')

    expect(fields).toContain('require2FA')
    expect(fields).toContain('sessionDuration')
    expect(fields).toContain('allowImpersonation')
    expect(fields).toContain('dominantActorType')
    expect(fields).toContain('allowedMethods')
    expect(fields).toContain('actorTypes')
  })
})
