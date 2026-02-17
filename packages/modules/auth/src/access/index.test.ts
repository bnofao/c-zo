import { describe, expect, it } from 'vitest'
import * as access from './index'

describe('access barrel exports', () => {
  it('should export mergePermissions', () => {
    expect(access.mergePermissions).toBeTypeOf('function')
  })

  it('should export AccessStatementRegistry', () => {
    expect(access.AccessStatementRegistry).toBeTypeOf('function')
  })

  it('should export useAccessStatementRegistry', () => {
    expect(access.useAccessStatementRegistry).toBeTypeOf('function')
  })

  it('should export createRoleBuilder', () => {
    expect(access.createRoleBuilder).toBeTypeOf('function')
  })

  it('should export AUTH_STATEMENTS', () => {
    expect(access.AUTH_STATEMENTS).toBeDefined()
    expect(access.AUTH_STATEMENTS).toHaveProperty('user')
  })

  it('should export AUTH_ROLES', () => {
    expect(access.AUTH_ROLES).toBeDefined()
    expect(access.AUTH_ROLES).toHaveProperty('auth:viewer')
  })

  it('should export registerAuthStatements', () => {
    expect(access.registerAuthStatements).toBeTypeOf('function')
  })
})
