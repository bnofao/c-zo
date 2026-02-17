import { describe, expect, it } from 'vitest'
import { createRoleBuilder } from './role-builder'

const STATEMENTS = {
  product: ['create', 'read', 'update', 'delete', 'publish'],
  order: ['read', 'cancel'],
} as const

describe('createRoleBuilder', () => {
  it('should return an object with statements, ac, and createHierarchy', () => {
    const builder = createRoleBuilder(STATEMENTS)

    expect(builder.statements).toBe(STATEMENTS)
    expect(builder.ac).toBeDefined()
    expect(builder.ac.newRole).toBeTypeOf('function')
    expect(builder.createHierarchy).toBeTypeOf('function')
  })

  describe('createHierarchy', () => {
    it('should create roles with accumulated permissions', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([
        {
          name: 'viewer',
          permissions: { product: ['read'], order: ['read'] },
        },
        {
          name: 'editor',
          permissions: { product: ['create', 'update'] },
        },
        {
          name: 'manager',
          permissions: { product: ['delete', 'publish'], order: ['cancel'] },
        },
      ])

      expect(Object.keys(roles)).toEqual(['viewer', 'editor', 'manager'])
    })

    it('viewer should authorize read but not create', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([
        {
          name: 'viewer',
          permissions: { product: ['read'], order: ['read'] },
        },
        {
          name: 'editor',
          permissions: { product: ['create', 'update'] },
        },
      ])

      expect(roles.viewer!.authorize({ product: ['read'] })).toEqual({ success: true })
      expect(roles.viewer!.authorize({ product: ['create'] }).success).toBe(false)
    })

    it('editor should inherit viewer permissions and add its own', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([
        {
          name: 'viewer',
          permissions: { product: ['read'], order: ['read'] },
        },
        {
          name: 'editor',
          permissions: { product: ['create', 'update'] },
        },
      ])

      // Editor inherits viewer's read
      expect(roles.editor!.authorize({ product: ['read'] })).toEqual({ success: true })
      // Editor has its own create and update
      expect(roles.editor!.authorize({ product: ['create'] })).toEqual({ success: true })
      expect(roles.editor!.authorize({ product: ['update'] })).toEqual({ success: true })
      // Editor inherits viewer's order:read
      expect(roles.editor!.authorize({ order: ['read'] })).toEqual({ success: true })
    })

    it('manager should inherit all previous permissions', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([
        {
          name: 'viewer',
          permissions: { product: ['read'] },
        },
        {
          name: 'editor',
          permissions: { product: ['create', 'update'] },
        },
        {
          name: 'manager',
          permissions: { product: ['delete', 'publish'], order: ['read', 'cancel'] },
        },
      ])

      // Manager has everything
      expect(roles.manager!.authorize({ product: ['read'] })).toEqual({ success: true })
      expect(roles.manager!.authorize({ product: ['create'] })).toEqual({ success: true })
      expect(roles.manager!.authorize({ product: ['delete'] })).toEqual({ success: true })
      expect(roles.manager!.authorize({ product: ['publish'] })).toEqual({ success: true })
      expect(roles.manager!.authorize({ order: ['cancel'] })).toEqual({ success: true })
    })

    it('should return empty roles for empty hierarchy', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([])

      expect(roles).toEqual({})
    })

    it('should deny access to resources not in the role', () => {
      const builder = createRoleBuilder(STATEMENTS)

      const roles = builder.createHierarchy([
        {
          name: 'viewer',
          permissions: { product: ['read'] },
        },
      ])

      // order is not in viewer's permissions
      expect(roles.viewer!.authorize({ order: ['read'] }).success).toBe(false)
    })
  })
})
