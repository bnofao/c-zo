import type { Role } from 'better-auth/plugins/access'

// ─── Core Types ──────────────────────────────────────────────────────

export type Statements = Record<string, readonly string[]>

export type RolePermissions<S extends Statements> = {
  [K in keyof S]?: S[K][number][]
}

export type AccessRole<S extends Statements = Statements> = Role<S>

// ─── Provider ────────────────────────────────────────────────────────

export interface AccessStatementProvider<
  S extends Statements = Statements,
  R extends string = string,
> {
  name: string
  statements: S
  roles: Record<R, AccessRole<S>>
}

// ─── Permission Check ────────────────────────────────────────────────

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
}
