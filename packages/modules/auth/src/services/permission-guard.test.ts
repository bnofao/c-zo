import type { GraphQLContext } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { canDo, hasPermission, requirePermission } from './permission-guard'

function makeContext(overrides: {
  role?: string
  organization?: string | null
  hasPermission?: boolean
} = {}): GraphQLContext {
  const { role = 'user', organization = 'org1', hasPermission = false } = overrides

  return {
    auth: {
      session: {
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(),
        actorType: role === 'admin' ? 'admin' : 'customer',
        authMethod: 'email',
        organizationId: organization,
        impersonatedBy: null,
      },
      user: {
        id: 'u1',
        email: 'test@czo.dev',
        name: 'Test',
        twoFactorEnabled: false,
        role,
        banned: false,
        banReason: null,
      },
      actorType: role === 'admin' ? 'admin' : 'customer',
      organization,
      authSource: 'bearer',
    },
    authInstance: {} as GraphQLContext['authInstance'],
    authRestrictions: {} as GraphQLContext['authRestrictions'],
    authEvents: {} as GraphQLContext['authEvents'],
    permissionService: {
      hasPermission: vi.fn().mockResolvedValue(hasPermission),
    },
    request: new Request('http://localhost'),
  }
}

describe('requirePermission', () => {
  it('should not throw when permission is granted', async () => {
    const ctx = makeContext({ hasPermission: true })

    await expect(requirePermission(ctx, 'product', 'read')).resolves.toBeUndefined()
  })

  it('should throw FORBIDDEN when permission is denied', async () => {
    const ctx = makeContext({ hasPermission: false })

    await expect(requirePermission(ctx, 'product', 'delete')).rejects.toThrow(
      'Forbidden: missing permission product:delete',
    )
  })

  it('should throw GraphQLError with FORBIDDEN code and 403 status', async () => {
    const ctx = makeContext({ hasPermission: false })

    try {
      await requirePermission(ctx, 'product', 'delete')
      expect.unreachable('Should have thrown')
    }
    catch (err: any) {
      expect(err.extensions.code).toBe('FORBIDDEN')
      expect(err.extensions.http.status).toBe(403)
    }
  })

  it('should pass permissions map and role to hasPermission', async () => {
    const ctx = makeContext({ hasPermission: true, organization: 'org42' })

    await requirePermission(ctx, 'product', 'read')

    expect(ctx.permissionService.hasPermission).toHaveBeenCalledWith(
      { userId: 'u1', organizationId: 'org42' },
      { product: ['read'] },
      'user',
    )
  })

  it('should use explicit organizationId when provided', async () => {
    const ctx = makeContext({ hasPermission: true, organization: 'org1' })

    await requirePermission(ctx, 'product', 'read', 'org-explicit')

    expect(ctx.permissionService.hasPermission).toHaveBeenCalledWith(
      { userId: 'u1', organizationId: 'org-explicit' },
      { product: ['read'] },
      'user',
    )
  })

  it('should pass undefined organizationId when auth.organization is null', async () => {
    const ctx = makeContext({ hasPermission: false, organization: null })

    await expect(requirePermission(ctx, 'product', 'read')).rejects.toThrow()

    expect(ctx.permissionService.hasPermission).toHaveBeenCalledWith(
      { userId: 'u1', organizationId: undefined },
      { product: ['read'] },
      'user',
    )
  })
})

describe('canDo', () => {
  it('should return true when permission is granted', async () => {
    const ctx = makeContext({ hasPermission: true })

    const result = await canDo(ctx, 'product', 'read')

    expect(result).toBe(true)
  })

  it('should return false when permission is denied', async () => {
    const ctx = makeContext({ hasPermission: false })

    const result = await canDo(ctx, 'product', 'delete')

    expect(result).toBe(false)
  })

  it('should not throw on denied permission', async () => {
    const ctx = makeContext({ hasPermission: false })

    await expect(canDo(ctx, 'product', 'delete')).resolves.toBe(false)
  })

  it('should use explicit organizationId when provided', async () => {
    const ctx = makeContext({ hasPermission: true })

    await canDo(ctx, 'product', 'read', 'org-explicit')

    expect(ctx.permissionService.hasPermission).toHaveBeenCalledWith(
      { userId: 'u1', organizationId: 'org-explicit' },
      { product: ['read'] },
      'user',
    )
  })
})

describe('hasPermission', () => {
  it('should call next when permission is granted', async () => {
    const ctx = makeContext({ hasPermission: true })
    const next = vi.fn().mockReturnValue('result')

    const middleware = hasPermission('product', 'read')
    const wrapped = middleware(next)
    const result = await wrapped(null, {}, ctx, {})

    expect(next).toHaveBeenCalledWith(null, {}, ctx, {})
    expect(result).toBe('result')
  })

  it('should throw FORBIDDEN before calling next when permission is denied', async () => {
    const ctx = makeContext({ hasPermission: false })
    const next = vi.fn()

    const middleware = hasPermission('product', 'delete')
    const wrapped = middleware(next)

    await expect(wrapped(null, {}, ctx, {})).rejects.toThrow(
      'Forbidden: missing permission product:delete',
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should pass through root, args, ctx, and info to next', async () => {
    const ctx = makeContext({ hasPermission: true })
    const next = vi.fn().mockReturnValue('ok')
    const root = { id: '1' }
    const args = { productId: 'p1' }
    const info = { fieldName: 'test' }

    const middleware = hasPermission('product', 'read')
    const wrapped = middleware(next)
    await wrapped(root, args, ctx, info)

    expect(next).toHaveBeenCalledWith(root, args, ctx, info)
  })
})
