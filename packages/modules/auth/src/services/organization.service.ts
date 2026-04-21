import type { Auth } from '@czo/auth/config'
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateOrganizationInput {
  name: string
  slug: string
  userId?: string
  logo?: string
  type?: string
  metadata?: Record<string, unknown>
  keepCurrentActiveOrganization?: boolean
}

export interface UpdateOrganizationInput {
  data: {
    name?: string
    slug?: string
    logo?: string
    type?: string
    metadata?: Record<string, unknown>
  }
  organizationId?: string
}

export interface InviteMemberInput {
  email: string
  role: string | string[]
  organizationId?: string
  resend?: boolean
}

export interface GetOrganizationInput {
  organizationId?: string
  organizationSlug?: string
  membersLimit?: number
}

export interface SetActiveOrganizationInput {
  organizationId?: string | null
  organizationSlug?: string
}

export interface RemoveMemberInput {
  memberIdOrEmail: string
  organizationId?: string
}

export interface UpdateMemberRoleInput {
  memberId: string
  role: string | string[]
  organizationId?: string
}

export interface GetActiveMemberRoleInput {
  userId?: string
  organizationId?: string
  organizationSlug?: string
}

export interface ListMembersParams {
  organizationId?: string
  organizationSlug?: string
  limit?: number | string
  offset?: number | string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  filterField?: string
  filterValue?: string | number | boolean
  filterOperator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
}

export type OrganizationService = ReturnType<typeof createOrganizationService>

// ─── hasPermission helpers (preserved verbatim from auth.service.ts) ─

const cacheOrgRoles = new Map<string, { [x: string]: Role<Record<string, string[]>> | undefined }>()

function isValidPermissionsRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const [key, actions] of Object.entries(value)) {
    if (typeof key !== 'string') return false
    if (!Array.isArray(actions)) return false
    if (!actions.every((a: unknown) => typeof a === 'string')) return false
  }
  return true
}

async function orgMemberHasPermission(
  auth: Auth,
  orgId: string,
  permissions: Record<string, string[]>,
  role: string,
  allowCreatorAllPermissions?: boolean,
  useMemoryCache = false,
  connector: 'AND' | 'OR' = 'AND',
): Promise<boolean> {
  const orgOptions = auth?.options?.plugins?.find(
    (p: { id: string }) => p.id === 'organization',
  )?.options as OrganizationOptions | undefined

  let acRoles: { [x: string]: Role<Record<string, string[]>> | undefined } = {
    ...(orgOptions?.roles || {}),
  }

  if (orgOptions?.dynamicAccessControl?.enabled && orgOptions?.ac && !useMemoryCache) {
    const dbRoles = await (await auth?.$context)?.adapter.findMany<
      OrganizationRole & { permission: string }
    >({
      model: 'organizationRole',
      where: [{ field: 'organizationId', value: orgId }],
    })

    if (dbRoles) {
      for (const { role: roleName, permission: permissionsString } of dbRoles) {
        if (roleName in acRoles) continue
        const parsed: unknown = JSON.parse(permissionsString)
        if (!isValidPermissionsRecord(parsed)) {
          throw new Error(`Invalid permissions for role ${roleName}`)
        }
        acRoles[roleName] = orgOptions.ac.newRole(parsed)
      }
    }
  }

  if (useMemoryCache) {
    acRoles = cacheOrgRoles.get(orgId) || acRoles
  }
  cacheOrgRoles.set(orgId, acRoles)

  if (!permissions) return false

  const roles = role.split(',')
  const creatorRole = orgOptions?.creatorRole || 'owner'
  const isCreator = roles.includes(creatorRole)

  if (isCreator && allowCreatorAllPermissions) return true

  for (const r of roles) {
    const acRole = acRoles[r as keyof typeof acRoles]
    const result = acRole?.authorize(permissions, connector)
    if (result?.success) return true
  }
  return false
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createOrganizationService(auth: Auth) {
  return {
    async create(input: CreateOrganizationInput, headers?: Headers) {
      try {
        const result = await (auth.api as any).createOrganization({ headers, body: input })
        await publishAuthEvent(AUTH_EVENTS.ORG_CREATED, {
          orgId: result.id,
          ownerId: input.userId ?? '',
          name: input.name,
          type: input.type ?? null,
        })
        return result
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async update(input: UpdateOrganizationInput, headers: Headers) {
      try {
        return await (auth.api as any).updateOrganization({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async remove(organizationId: string, headers: Headers) {
      try {
        return await (auth.api as any).deleteOrganization({ headers, body: { organizationId } })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async setActive(input: SetActiveOrganizationInput, headers: Headers) {
      try {
        return await (auth.api as any).setActiveOrganization({
          headers,
          body: {
            organizationId: input.organizationId,
            organizationSlug: input.organizationSlug,
          },
        })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async get(input: GetOrganizationInput, headers: Headers) {
      try {
        return await (auth.api as any).getFullOrganization({
          headers,
          query: {
            organizationId: input.organizationId,
            organizationSlug: input.organizationSlug,
            membersLimit: input.membersLimit,
          },
        })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async list(headers: Headers) {
      try {
        return await (auth.api as any).listOrganizations({ headers })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async inviteMember(input: InviteMemberInput, headers: Headers) {
      try {
        const result = await (auth.api as any).createInvitation({
          headers,
          body: { ...input, role: input.role as any },
        })
        await publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_ADDED, {
          orgId: input.organizationId ?? '',
          userId: '',
          role: Array.isArray(input.role) ? input.role.join(',') : input.role,
        })
        return result
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async cancelInvitation(invitationId: string, headers: Headers) {
      try {
        return await (auth.api as any).cancelInvitation({ headers, body: { invitationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async acceptInvitation(invitationId: string, headers: Headers) {
      try {
        return await (auth.api as any).acceptInvitation({ headers, body: { invitationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async getInvitation(invitationId: string, headers: Headers) {
      try {
        return await (auth.api as any).getInvitation({ headers, query: { id: invitationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async rejectInvitation(invitationId: string, headers: Headers) {
      try {
        return await (auth.api as any).rejectInvitation({ headers, body: { invitationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async listInvitations(organizationId: string | undefined, headers: Headers) {
      try {
        return await (auth.api as any).listInvitations({ headers, query: { organizationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async removeMember(input: RemoveMemberInput, headers: Headers) {
      try {
        const result = await (auth.api as any).removeMember({
          headers,
          body: { memberIdOrEmail: input.memberIdOrEmail, organizationId: input.organizationId },
        })
        await publishAuthEvent(AUTH_EVENTS.ORG_MEMBER_REMOVED, {
          orgId: input.organizationId ?? '',
          userId: input.memberIdOrEmail,
        })
        return result
      }
      catch (err) { mapAPIError(err, 'Member') }
    },

    async updateMemberRole(input: UpdateMemberRoleInput, headers: Headers) {
      try {
        return await (auth.api as any).updateMemberRole({
          headers,
          body: { memberId: input.memberId, role: input.role, organizationId: input.organizationId },
        })
      }
      catch (err) { mapAPIError(err, 'Member') }
    },

    async checkSlug(slug: string, headers?: Headers) {
      try {
        return await (auth.api as any).checkOrganizationSlug({ headers, body: { slug } })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async listUserInvitations(email?: string, headers?: Headers) {
      try {
        return await (auth.api as any).listUserInvitations({ headers, query: { email } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async listMembers(params: ListMembersParams, headers: Headers) {
      try {
        return await (auth.api as any).listMembers({ headers, query: { ...params } })
      }
      catch (err) { mapAPIError(err, 'Member') }
    },

    async leave(organizationId: string, headers: Headers) {
      try {
        return await (auth.api as any).leaveOrganization({ headers, body: { organizationId } })
      }
      catch (err) { mapAPIError(err, 'Organization') }
    },

    async getActiveMember(headers: Headers) {
      try {
        return await (auth.api as any).getActiveMember({ headers })
      }
      catch (err) { mapAPIError(err, 'Member') }
    },

    async getActiveMemberRole(input: GetActiveMemberRoleInput, headers: Headers) {
      try {
        return await (auth.api as any).getActiveMemberRole({
          headers,
          query: {
            userId: input.userId,
            organizationId: input.organizationId,
            organizationSlug: input.organizationSlug,
          },
        })
      }
      catch (err) { mapAPIError(err, 'Member') }
    },

    // ── hasPermission — preserved from auth.service.ts ──────────────

    async hasPermission(
      orgId: string,
      permissions: Record<string, string[]>,
      role: string,
      options?: {
        allowCreatorAllPermissions?: boolean
        useMemoryCache?: boolean
        connector?: 'AND' | 'OR'
      },
    ): Promise<boolean> {
      return orgMemberHasPermission(
        auth,
        orgId,
        permissions,
        role,
        options?.allowCreatorAllPermissions,
        options?.useMemoryCache,
        options?.connector,
      )
    },
  }
}
