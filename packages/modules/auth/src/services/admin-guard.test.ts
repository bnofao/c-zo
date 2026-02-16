import type { GraphQLContext } from '../types'
import { describe, expect, it } from 'vitest'
import { requireAdmin } from './admin-guard'

function makeContext(actorType: string): GraphQLContext {
  return {
    auth: {
      session: {
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(),
        actorType,
        authMethod: 'email',
        organizationId: null,
        impersonatedBy: null,
      },
      user: {
        id: 'u1',
        email: 'test@czo.dev',
        name: 'Test',
        twoFactorEnabled: false,
        role: 'user',
        banned: false,
        banReason: null,
      },
      actorType,
      organization: null,
      authSource: 'bearer',
    },
    authInstance: {} as GraphQLContext['authInstance'],
    authRestrictions: {} as GraphQLContext['authRestrictions'],
    authEvents: {} as GraphQLContext['authEvents'],
    request: new Request('http://localhost'),
  }
}

describe('requireAdmin', () => {
  it('should not throw when actorType is admin', () => {
    const ctx = makeContext('admin')

    expect(() => requireAdmin(ctx)).not.toThrow()
  })

  it('should throw FORBIDDEN when actorType is customer', () => {
    const ctx = makeContext('customer')

    expect(() => requireAdmin(ctx)).toThrow('Forbidden: admin access required')
  })

  it('should throw GraphQLError with FORBIDDEN code and 403 status', () => {
    const ctx = makeContext('customer')

    try {
      requireAdmin(ctx)
      expect.unreachable('Should have thrown')
    }
    catch (err: any) {
      expect(err.extensions.code).toBe('FORBIDDEN')
      expect(err.extensions.http.status).toBe(403)
    }
  })

  it('should throw for unknown actor types', () => {
    const ctx = makeContext('merchant')

    expect(() => requireAdmin(ctx)).toThrow('Forbidden: admin access required')
  })
})
