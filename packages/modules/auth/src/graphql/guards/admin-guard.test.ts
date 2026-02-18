import type { GraphQLContext } from '../../types'
import { describe, expect, it, vi } from 'vitest'
import { isAdmin, requireAdmin } from './admin-guard'

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
    permissionService: {
      hasPermission: vi.fn().mockResolvedValue(false),
    } as GraphQLContext['permissionService'],
    userService: {} as GraphQLContext['userService'],
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

describe('isAdmin', () => {
  it('should call next when actorType is admin', () => {
    const ctx = makeContext('admin')
    const next = vi.fn().mockReturnValue('result')

    const middleware = isAdmin()
    const wrapped = middleware(next)
    const result = wrapped(null, {}, ctx, {})

    expect(next).toHaveBeenCalledWith(null, {}, ctx, {})
    expect(result).toBe('result')
  })

  it('should throw FORBIDDEN before calling next when actorType is not admin', () => {
    const ctx = makeContext('customer')
    const next = vi.fn()

    const middleware = isAdmin()
    const wrapped = middleware(next)

    expect(() => wrapped(null, {}, ctx, {})).toThrow('Forbidden: admin access required')
    expect(next).not.toHaveBeenCalled()
  })

  it('should pass through root, args, ctx, and info to next', () => {
    const ctx = makeContext('admin')
    const next = vi.fn().mockReturnValue('ok')
    const root = { id: '1' }
    const args = { userId: 'u2' }
    const info = { fieldName: 'test' }

    const middleware = isAdmin()
    const wrapped = middleware(next)
    wrapped(root, args, ctx, info)

    expect(next).toHaveBeenCalledWith(root, args, ctx, info)
  })
})
