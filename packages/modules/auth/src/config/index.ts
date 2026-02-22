export const ORGANIZATION_STATEMENTS = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'create', 'update', 'delete'],
  invitation: ['read', 'create', 'cancel'],
} as const

export const ADMIN_STATEMENTS = {
  'user': ['create', 'read', 'update', 'delete', 'ban', 'impersonate', 'set-role'],
  'session': ['read', 'revoke'],
  'api-key': ['create', 'read', 'update', 'delete'],
} as const

export const API_KEY_STATEMENTS = {
  'api-key': ['create', 'read', 'update', 'delete'],
} as const

export const ORGANIZATION_HIERARCHY = [
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

export const ADMIN_HIERARCHY = [
  {
    name: 'admin:viewer',
    permissions: {
      'user': ['read'],
      'session': ['read'],
      'api-key': ['read'],
    },
  },
  {
    name: 'admin:manager',
    permissions: {
      'user': ['create', 'update'],
      'session': ['revoke'],
      'api-key': ['create', 'update'],
    },
  },
  {
    name: 'admin',
    permissions: {
      'user': ['delete', 'ban', 'impersonate'],
      'api-key': ['delete'],
    },
  },
]
