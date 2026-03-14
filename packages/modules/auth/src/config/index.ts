import type { HierarchyLevel } from './access'

export * from './access'
export * from './actor'
export * from './auth'

export const ORGANIZATION_STATEMENTS = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'create', 'update', 'delete'],
  invitation: ['read', 'create', 'cancel'],
} as const

export const ADMIN_STATEMENTS = {
  user: ['create', 'read', 'update', 'delete', 'ban', 'impersonate', 'set-role'],
  session: ['read', 'revoke'],
} as const

export const API_KEY_STATEMENTS = {
  'api-key': ['create', 'read', 'update', 'delete'],
} as const

export const ORGANIZATION_HIERARCHY: HierarchyLevel<typeof ORGANIZATION_STATEMENTS>[] = [
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
    name: 'org:owner',
    permissions: {
      organization: ['delete'],
    },
  },
]

export const ADMIN_HIERARCHY: HierarchyLevel<typeof ADMIN_STATEMENTS>[] = [
  {
    name: 'admin:viewer',
    permissions: {
      user: ['read'],
      session: ['read'],
    },
  },
  {
    name: 'admin:manager',
    permissions: {
      user: ['create', 'update'],
      session: ['revoke'],
    },
  },
  {
    name: 'admin',
    permissions: {
      user: ['delete', 'ban', 'impersonate'],
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
