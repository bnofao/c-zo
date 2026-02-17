import type { AccessStatementRegistry } from './registry'
import { createRoleBuilder } from './role-builder'

export const AUTH_STATEMENTS = {
  'user': ['create', 'read', 'update', 'delete', 'ban', 'impersonate'],
  'session': ['read', 'revoke'],
  'api-key': ['create', 'read', 'update', 'delete'],
} as const

const builder = createRoleBuilder(AUTH_STATEMENTS)

export const AUTH_ROLES = builder.createHierarchy([
  {
    name: 'auth:viewer',
    permissions: {
      'user': ['read'],
      'session': ['read'],
      'api-key': ['read'],
    },
  },
  {
    name: 'auth:manager',
    permissions: {
      'user': ['create', 'update'],
      'session': ['revoke'],
      'api-key': ['create', 'update'],
    },
  },
  {
    name: 'auth:admin',
    permissions: {
      'user': ['delete', 'ban', 'impersonate'],
      'api-key': ['delete'],
    },
  },
])

// AUTH_ROLES['auth:viewer']

export function registerAuthStatements(registry: AccessStatementRegistry): void {
  registry.registerStatements({
    name: 'auth',
    statements: AUTH_STATEMENTS,
    roles: AUTH_ROLES,
  })
}
