import type { Auth } from '@czo/auth/config'
import type { Relations } from '@czo/auth/relations'
import type { OrganizationSchema } from '@czo/auth/schema'
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import { Database, Repository } from '@czo/kit/db'
import { APIError } from 'better-auth'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateOrganizationInput {
  name: string
  slug: string
  userId?: string
  logo?: string
  type?: string
  metadata?: Record<string, any>
  keepCurrentActiveOrganization?: boolean
}

export interface UpdateOrganizationInput {
  data: {
    name?: string
    slug?: string
    logo?: string
    type?: string
    metadata?: Record<string, any>
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

// ─── Helpers ─────────────────────────────────────────────────────────

const cacheOrgRoles = new Map<
  string,
  { [x: string]: Role<Record<string, string[]>> | undefined }
>()

function isValidPermissionsRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  for (const [key, actions] of Object.entries(value)) {
    if (typeof key !== 'string')
      return false
    if (!Array.isArray(actions))
      return false
    if (!actions.every((a: unknown) => typeof a === 'string'))
      return false
  }
  return true
}

// ─── Factory ─────────────────────────────────────────────────────────

// export function createOrganizationService_(auth: Auth) {
//   async function create(input: CreateOrganizationInput, headers?: Headers) {
//     try {
//       return await auth.api.createOrganization({
//         headers,
//         body: input,
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to create organization: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function update(input: UpdateOrganizationInput, headers: Headers) {
//     try {
//       return await auth.api.updateOrganization({
//         headers,
//         body: input,
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to update organization: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function remove(organizationId: string, headers: Headers) {
//     try {
//       return await auth.api.deleteOrganization({
//         headers,
//         body: { organizationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to delete organization: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function setActive(input: SetActiveOrganizationInput, headers: Headers) {
//     try {
//       return await auth.api.setActiveOrganization({
//         headers,
//         body: {
//           organizationId: input.organizationId,
//           organizationSlug: input.organizationSlug,
//         },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to set active organization: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function get(input: GetOrganizationInput, headers: Headers) {
//     try {
//       return await auth.api.getFullOrganization({
//         headers,
//         query: {
//           organizationId: input.organizationId,
//           organizationSlug: input.organizationSlug,
//           membersLimit: input.membersLimit,
//         },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Organization not found: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function list(headers: Headers) {
//     try {
//       return await auth.api.listOrganizations({ headers })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to list organizations: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function inviteMember(input: InviteMemberInput, headers: Headers) {
//     try {
//       return await auth.api.createInvitation({
//         headers,
//         body: { ...input, role: input.role as any },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to invite member: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function cancelInvitation(invitationId: string, headers: Headers) {
//     try {
//       return await auth.api.cancelInvitation({
//         headers,
//         body: { invitationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to cancel invitation: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function acceptInvitation(invitationId: string, headers: Headers) {
//     try {
//       return await auth.api.acceptInvitation({
//         headers,
//         body: { invitationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to accept invitation: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function getInvitation(invitationId: string, headers: Headers) {
//     try {
//       return await auth.api.getInvitation({
//         headers,
//         query: { id: invitationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Invitation not found: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function rejectInvitation(invitationId: string, headers: Headers) {
//     try {
//       return await auth.api.rejectInvitation({
//         headers,
//         body: { invitationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to reject invitation: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function listInvitations(organizationId: string | undefined, headers: Headers) {
//     try {
//       return await auth.api.listInvitations({
//         headers,
//         query: { organizationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to list invitations: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function removeMember(input: RemoveMemberInput, headers: Headers) {
//     try {
//       return await auth.api.removeMember({
//         headers,
//         body: { memberIdOrEmail: input.memberIdOrEmail, organizationId: input.organizationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to remove member: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function updateMemberRole(input: UpdateMemberRoleInput, headers: Headers) {
//     try {
//       return await auth.api.updateMemberRole({
//         headers,
//         body: { memberId: input.memberId, role: input.role, organizationId: input.organizationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to update member role: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function checkSlug(slug: string, headers?: Headers) {
//     try {
//       return await auth.api.checkOrganizationSlug({
//         headers,
//         body: { slug },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to check slug: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function listUserInvitations(email?: string, headers?: Headers) {
//     try {
//       return await auth.api.listUserInvitations({
//         headers,
//         query: { email },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to list user invitations: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function listMembers(params: ListMembersParams, headers: Headers) {
//     try {
//       return await auth.api.listMembers({
//         headers,
//         query: { ...params },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to list members: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function leave(organizationId: string, headers: Headers) {
//     try {
//       return await auth.api.leaveOrganization({
//         headers,
//         body: { organizationId },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to leave organization: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function getActiveMember(headers: Headers) {
//     try {
//       return await auth.api.getActiveMember({ headers })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to get active member: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   async function getActiveMemberRole(input: GetActiveMemberRoleInput, headers: Headers) {
//     try {
//       return await auth.api.getActiveMemberRole({
//         headers,
//         query: {
//           userId: input.userId,
//           organizationId: input.organizationId,
//           organizationSlug: input.organizationSlug,
//         },
//       })
//     }
//     catch (e: unknown) {
//       if (e instanceof APIError) {
//         throw new Error(`Failed to get active member role: ${e.message}`)
//       }
//       throw e
//     }
//   }

//   return {
//     create,
//     update,
//     remove,
//     setActive,
//     get,
//     list,
//     inviteMember,
//     cancelInvitation,
//     acceptInvitation,
//     getInvitation,
//     rejectInvitation,
//     listInvitations,
//     removeMember,
//     updateMemberRole,
//     leave,
//     getActiveMember,
//     getActiveMemberRole,
//     checkSlug,
//     listUserInvitations,
//     listMembers,
//   }
// }

class OrganizationRepository extends Repository<{ organizations: OrganizationSchema }, Relations, OrganizationSchema, 'organizations'> {
  get model() {
    return 'organizations' as const
  }

  async hasPermission(opts: {
    auth: Auth
    orgId: string
    permissions: { [key: string]: string[] }
    role: string
    allowCreatorAllPermissions?: boolean
    useMemoryCache?: boolean
    connector?: 'AND' | 'OR'
  }) {
    const { auth, orgId, permissions, role, allowCreatorAllPermissions, useMemoryCache = false, connector = 'AND' } = opts
    const orgOptions = auth.options.plugins.find(
      (p: { id: string }) => p.id === 'organization',
    )?.options as OrganizationOptions | undefined

    let acRoles: { [x: string]: Role<Record<string, string[]>> | undefined } = {
      ...(orgOptions?.roles || {}),
    }

    if (
      orgOptions?.dynamicAccessControl?.enabled
      && orgOptions?.ac
      && !useMemoryCache
    ) {
      const dbRoles = await (await auth?.$context)?.adapter.findMany<
          OrganizationRole & { permission: string }
      >({
        model: 'organizationRole',
        where: [{ field: 'organizationId', value: orgId }],
      })

      if (dbRoles) {
        for (const { role: roleName, permission: permissionsString } of dbRoles) {
          if (roleName in acRoles)
            continue

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

    if (!permissions)
      return false

    const roles = role.split(',')
    const creatorRole = orgOptions?.creatorRole || 'owner'
    const isCreator = roles.includes(creatorRole)

    if (isCreator && allowCreatorAllPermissions)
      return true

    for (const r of roles) {
      const acRole = acRoles[r as keyof typeof acRoles]
      const result = acRole?.authorize(permissions, connector)
      if (result?.success) {
        return true
      }
    }
    return false
  }
}

export const createOrganizationService = (db: Database) => OrganizationRepository.buildService([db])
