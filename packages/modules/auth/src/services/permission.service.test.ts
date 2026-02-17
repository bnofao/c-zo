import type { PermissionCheckContext } from '../access/types'
import { describe, expect, it, vi } from 'vitest'
import { AccessStatementRegistry } from '../access/registry'
import { createRoleBuilder } from '../access/role-builder'
import { createPermissionService } from './permission.service'

const PRODUCT_STATEMENTS = {
  product: ['create', 'read', 'update', 'delete', 'publish'],
} as const

function buildRegistry() {
  const registry = new AccessStatementRegistry()
  const builder = createRoleBuilder(PRODUCT_STATEMENTS)
  const roles = builder.createHierarchy([
    { name: 'product:viewer', permissions: { product: ['read'] } },
    { name: 'product:editor', permissions: { product: ['create', 'update'] } },
    { name: 'product:manager', permissions: { product: ['delete', 'publish'] } },
  ])

  registry.registerStatements({
    name: 'product',
    statements: PRODUCT_STATEMENTS,
    roles,
  })
  registry.freeze()

  return registry
}

function makeMockAuth(adminOptions?: Record<string, unknown>, orgOptions?: Record<string, unknown>) {
  return {
    options: {
      plugins: [
        { id: 'admin', options: { adminRoles: ['admin'], defaultRole: 'user', ...adminOptions } },
        { id: 'organization', options: { creatorRole: 'owner', ...orgOptions } },
      ],
    },
    $context: Promise.resolve({ adapter: { findMany: vi.fn().mockResolvedValue([]) } }),
  } as any
}

describe('permissionService', () => {
  describe('hasPermission (admin path)', () => {
    it('should allow admin via adminUserIds bypass', async () => {
      const auth = makeMockAuth({ adminUserIds: ['u1'] })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1' }

      const result = await service.hasPermission(ctx, { product: ['delete'] })

      expect(result).toBe(true)
    })

    it('should deny when no permissions match admin roles', async () => {
      const auth = makeMockAuth()
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1' }

      const result = await service.hasPermission(ctx, { product: ['delete'] }, 'user')

      expect(result).toBe(false)
    })
  })

  describe('hasPermission (org path)', () => {
    it('should deny when no organizationId is set', async () => {
      const auth = makeMockAuth()
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1' }

      const result = await service.hasPermission(ctx, { product: ['read'] })

      expect(result).toBe(false)
    })

    it('should allow when role has read permission', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['read'] },
        'member,product:viewer',
      )

      expect(result).toBe(true)
    })

    it('should deny when viewer tries to create', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['create'] },
        'member,product:viewer',
      )

      expect(result).toBe(false)
    })

    it('should allow editor to read (inherited from viewer)', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['read'] },
        'member,product:editor',
      )

      expect(result).toBe(true)
    })

    it('should allow editor to create', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['create'] },
        'member,product:editor',
      )

      expect(result).toBe(true)
    })

    it('should deny editor from deleting', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['delete'] },
        'member,product:editor',
      )

      expect(result).toBe(false)
    })

    it('should allow manager all product actions', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }
      const role = 'member,product:manager'

      expect(await service.hasPermission(ctx, { product: ['read'] }, role)).toBe(true)
      expect(await service.hasPermission(ctx, { product: ['create'] }, role)).toBe(true)
      expect(await service.hasPermission(ctx, { product: ['delete'] }, role)).toBe(true)
      expect(await service.hasPermission(ctx, { product: ['publish'] }, role)).toBe(true)
    })

    it('should handle unknown role names gracefully', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['read'] },
        'nonexistent:role',
      )

      expect(result).toBe(false)
    })

    it('should allow owner when allowCreatorAllPermissions is set', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap(), creatorRole: 'owner' })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['delete'] },
        'owner',
        { allowCreatorAllPermissions: true },
      )

      expect(result).toBe(true)
    })

    it('should require ALL permissions with AND connector (default)', async () => {
      const registry = buildRegistry()
      const auth = makeMockAuth({}, { roles: registry.getRoleMap() })
      const service = createPermissionService(auth)
      const ctx: PermissionCheckContext = { userId: 'u1', organizationId: 'org1' }

      const result = await service.hasPermission(
        ctx,
        { product: ['read', 'create'] },
        'member,product:viewer',
      )

      expect(result).toBe(false)
    })
  })
})
