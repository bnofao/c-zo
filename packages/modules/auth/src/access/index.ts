export { AUTH_ROLES, AUTH_STATEMENTS, registerAuthStatements } from './auth-statements'
export { mergePermissions } from './merge-permissions'
export { AccessStatementRegistry, useAccessStatementRegistry } from './registry'
export { createRoleBuilder } from './role-builder'
export type { RoleBuilder } from './role-builder'
export type {
  AccessRole,
  AccessStatementProvider,
  PermissionCheckContext,
  RolePermissions,
  Statements,
} from './types'
