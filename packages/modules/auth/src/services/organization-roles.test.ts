import { describe, expect, it } from 'vitest'
import { ac, ORG_ROLES, statements, viewerRole } from './organization-roles'

describe('organization-roles', () => {
  describe('statements', () => {
    it('should define organization actions', () => {
      expect(statements.organization).toEqual(['read', 'update', 'delete'])
    })

    it('should define member actions', () => {
      expect(statements.member).toEqual(['read', 'create', 'update', 'delete'])
    })

    it('should define invitation actions', () => {
      expect(statements.invitation).toEqual(['read', 'create', 'cancel'])
    })
  })

  describe('viewerRole', () => {
    it('should wrap permissions under statements key', () => {
      expect(viewerRole.statements).toBeDefined()
    })

    it('should have read-only permissions for organization', () => {
      expect(viewerRole.statements.organization).toEqual(['read'])
    })

    it('should have read-only permissions for member', () => {
      expect(viewerRole.statements.member).toEqual(['read'])
    })

    it('should have read-only permissions for invitation', () => {
      expect(viewerRole.statements.invitation).toEqual(['read'])
    })
  })

  describe('ac', () => {
    it('should be a valid access control instance', () => {
      expect(ac).toBeDefined()
      expect(ac.statements).toBeDefined()
    })

    it('should expose a newRole factory', () => {
      expect(typeof ac.newRole).toBe('function')
    })
  })

  describe('oRG_ROLES', () => {
    it('should define all four roles', () => {
      expect(ORG_ROLES).toEqual({
        OWNER: 'owner',
        ADMIN: 'admin',
        MEMBER: 'member',
        VIEWER: 'viewer',
      })
    })
  })
})
