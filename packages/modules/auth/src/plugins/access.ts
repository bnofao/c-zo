import type { HierarchyLevel } from '../services/access'

export const ORGANIZATION_STATEMENTS = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'create', 'update', 'delete'],
  invitation: ['read', 'create', 'cancel'],
} as const

export const ADMIN_STATEMENTS = {
  user: ['create', 'read', 'list', 'update', 'delete', 'ban', 'impersonate', 'set-role', 'impersonate-admins'],
  session: ['read', 'list', 'revoke', 'delete'],
} as const

export const API_KEY_STATEMENTS = {
  'api-key': ['create', 'read', 'update', 'delete'],
} as const

/**
 * Build the organization role hierarchy, parameterized by the owner role name.
 * The value flows from `authConfig.orgOwnerRole` (env `AUTH_ORG_OWNER_ROLE`,
 * default `org:owner`) so the registered hierarchy level — whose `name` must
 * equal the value stored in `members.role`, or `ensureValidRole` rejects it —
 * stays in sync with the grant/guard sites. Only the owner tier is
 * configurable; the lower tiers are structural.
 */
export function makeOrganizationHierarchy(
  ownerRole: string,
): HierarchyLevel<typeof ORGANIZATION_STATEMENTS>[] {
  return [
    {
      name: 'org:member',
      permissions: {},
    },
    {
      name: 'org:viewer',
      permissions: {
        organization: ['read'],
        member: ['read'],
        invitation: ['read'],
      },
    },
    {
      name: 'org:admin',
      permissions: {
        organization: ['update'],
        member: ['create', 'update', 'delete'],
        invitation: ['create', 'cancel'],
      },
    },
    {
      name: ownerRole,
      permissions: {
        organization: ['delete'],
      },
    },
  ]
}

/** Back-compat default-valued hierarchy for tests that don't wire `authConfig`. */
export const ORGANIZATION_HIERARCHY: HierarchyLevel<typeof ORGANIZATION_STATEMENTS>[]
  = makeOrganizationHierarchy('org:owner')

export const ADMIN_HIERARCHY: HierarchyLevel<typeof ADMIN_STATEMENTS>[] = [
  {
    name: 'admin:viewer',
    permissions: {
      user: ['read', 'list'],
      session: ['read', 'list'],
    },
  },
  {
    name: 'admin:manager',
    permissions: {
      user: ['create', 'update', 'set-role'],
      session: ['revoke', 'delete'],
    },
  },
  {
    name: 'admin',
    permissions: {
      user: ['delete', 'ban', 'impersonate', 'impersonate-admins'],
    },
  },
]

export const API_KEY_HIERARCHY: HierarchyLevel<typeof API_KEY_STATEMENTS>[] = [
  {
    name: 'api-key:viewer',
    permissions: {
      'api-key': ['read'],
    },
  },
  {
    name: 'api-key:manager',
    permissions: {
      'api-key': ['create', 'update'],
    },
  },
  {
    name: 'api-key:admin',
    permissions: {
      'api-key': ['delete'],
    },
  },
]

export const APPS_STATEMENTS = {
  apps: ['read', 'write', 'delete'],
} as const

export const APPS_HIERARCHY: HierarchyLevel<typeof APPS_STATEMENTS>[] = [
  {
    name: 'apps:viewer',
    permissions: {
      apps: ['read'],
    },
  },
  {
    name: 'apps:manager',
    permissions: {
      apps: ['write'],
    },
  },
  {
    name: 'apps:admin',
    permissions: {
      apps: ['delete'],
    },
  },
]
