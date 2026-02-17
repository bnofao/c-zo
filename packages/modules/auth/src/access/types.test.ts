import type { AccessStatementProvider, PermissionCheckContext, RolePermissions, Statements } from './types'
import { describe, expect, it } from 'vitest'

describe('access types', () => {
  it('should allow Statements as Record<string, readonly string[]>', () => {
    const statements = {
      product: ['create', 'read', 'update', 'delete'],
      order: ['read', 'cancel'],
    } as const satisfies Statements

    expect(statements.product).toContain('create')
    expect(statements.order).toContain('read')
  })

  it('should allow RolePermissions as subset of Statements', () => {
    const permissions: RolePermissions<Statements> = {
      product: ['read'],
    }

    expect(permissions.product).toEqual(['read'])
    expect(permissions.order).toBeUndefined()
  })

  it('should define AccessStatementProvider with name, statements, and roles', () => {
    const provider: AccessStatementProvider = {
      name: 'product',
      statements: { product: ['create', 'read'] },
      roles: {},
    }

    expect(provider.name).toBe('product')
    expect(provider.statements.product).toEqual(['create', 'read'])
  })

  it('should define PermissionCheckContext with userId and optional organizationId', () => {
    const ctx: PermissionCheckContext = { userId: 'u1' }

    expect(ctx.userId).toBe('u1')
    expect(ctx.organizationId).toBeUndefined()

    const ctxWithOrg: PermissionCheckContext = {
      userId: 'u1',
      organizationId: 'org1',
    }

    expect(ctxWithOrg.organizationId).toBe('org1')
  })
})
