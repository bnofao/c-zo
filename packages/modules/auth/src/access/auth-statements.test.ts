import { beforeEach, describe, expect, it } from 'vitest'
import { AUTH_ROLES, AUTH_STATEMENTS, registerAuthStatements } from './auth-statements'
import { AccessStatementRegistry } from './registry'

describe('auth-statements', () => {
  describe('auth statements constants', () => {
    it('should define user, session, and api-key resources', () => {
      expect(AUTH_STATEMENTS).toHaveProperty('user')
      expect(AUTH_STATEMENTS).toHaveProperty('session')
      expect(AUTH_STATEMENTS).toHaveProperty('api-key')
    })

    it('should include expected user actions', () => {
      expect(AUTH_STATEMENTS.user).toContain('create')
      expect(AUTH_STATEMENTS.user).toContain('read')
      expect(AUTH_STATEMENTS.user).toContain('update')
      expect(AUTH_STATEMENTS.user).toContain('delete')
      expect(AUTH_STATEMENTS.user).toContain('ban')
      expect(AUTH_STATEMENTS.user).toContain('impersonate')
    })
  })

  describe('auth roles hierarchy', () => {
    it('should define viewer, manager, and admin roles', () => {
      expect(AUTH_ROLES).toHaveProperty('auth:viewer')
      expect(AUTH_ROLES).toHaveProperty('auth:manager')
      expect(AUTH_ROLES).toHaveProperty('auth:admin')
    })

    it('auth:viewer should read but not create users', () => {
      const viewer = AUTH_ROLES['auth:viewer']!

      expect(viewer.authorize({ user: ['read'] })).toEqual({ success: true })
      expect(viewer.authorize({ user: ['create'] }).success).toBe(false)
    })

    it('auth:manager should inherit viewer + create/update users', () => {
      const manager = AUTH_ROLES['auth:manager']!

      expect(manager.authorize({ user: ['read'] })).toEqual({ success: true })
      expect(manager.authorize({ user: ['create'] })).toEqual({ success: true })
      expect(manager.authorize({ user: ['update'] })).toEqual({ success: true })
      expect(manager.authorize({ user: ['delete'] }).success).toBe(false)
    })

    it('auth:admin should have all permissions including delete, ban, impersonate', () => {
      const admin = AUTH_ROLES['auth:admin']!

      expect(admin.authorize({ user: ['read'] })).toEqual({ success: true })
      expect(admin.authorize({ user: ['create'] })).toEqual({ success: true })
      expect(admin.authorize({ user: ['delete'] })).toEqual({ success: true })
      expect(admin.authorize({ user: ['ban'] })).toEqual({ success: true })
      expect(admin.authorize({ user: ['impersonate'] })).toEqual({ success: true })
    })

    it('auth:manager should manage sessions (read + revoke)', () => {
      const manager = AUTH_ROLES['auth:manager']!

      expect(manager.authorize({ session: ['read'] })).toEqual({ success: true })
      expect(manager.authorize({ session: ['revoke'] })).toEqual({ success: true })
    })

    it('auth:admin should manage api-keys (all actions)', () => {
      const admin = AUTH_ROLES['auth:admin']!

      expect(admin.authorize({ 'api-key': ['create'] })).toEqual({ success: true })
      expect(admin.authorize({ 'api-key': ['read'] })).toEqual({ success: true })
      expect(admin.authorize({ 'api-key': ['update'] })).toEqual({ success: true })
      expect(admin.authorize({ 'api-key': ['delete'] })).toEqual({ success: true })
    })
  })

  describe('registerAuthStatements', () => {
    let registry: AccessStatementRegistry

    beforeEach(() => {
      registry = new AccessStatementRegistry()
    })

    it('should register auth statements with the registry', () => {
      registerAuthStatements(registry)

      const providers = registry.getProviders()

      expect(providers).toHaveLength(1)
      expect(providers[0]!.name).toBe('auth')
    })

    it('should make auth roles available via getRoleMap', () => {
      registerAuthStatements(registry)

      const roleMap = registry.getRoleMap()

      expect(roleMap).toHaveProperty('auth:viewer')
      expect(roleMap).toHaveProperty('auth:manager')
      expect(roleMap).toHaveProperty('auth:admin')
    })

    it('should throw if registered twice', () => {
      registerAuthStatements(registry)

      expect(() => registerAuthStatements(registry)).toThrow(
        'Statement provider "auth" is already registered',
      )
    })
  })
})
