import { createAccessControl, role } from 'better-auth/plugins/access'

export const statements = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'create', 'update', 'delete'],
  invitation: ['read', 'create', 'cancel'],
} as const

export const ac = createAccessControl(statements)

export const viewerRole = role({
  organization: ['read'],
  member: ['read'],
  invitation: ['read'],
})

export const ORG_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES]
