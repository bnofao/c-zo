import type { Auth } from '../config/auth'
import { APIError } from 'better-auth'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateOrganizationInput {
  name: string
  slug: string
  userId?: string
  logo?: string
  metadata?: Record<string, any>
}

export interface UpdateOrganizationInput {
  data: {
    name?: string
    slug?: string
    logo?: string
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

// ─── Factory ─────────────────────────────────────────────────────────

export function createOrganizationService(auth: Auth) {
  async function create(headers: Headers, input: CreateOrganizationInput) {
    try {
      return await auth.api.createOrganization({
        headers,
        body: {
          name: input.name,
          slug: input.slug,
          userId: input.userId,
          logo: input.logo,
          metadata: input.metadata,
        },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to create organization: ${e.message}`)
      }
      throw e
    }
  }

  async function update(headers: Headers, input: UpdateOrganizationInput) {
    try {
      return await auth.api.updateOrganization({
        headers,
        body: {
          data: input.data,
          organizationId: input.organizationId,
        },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update organization: ${e.message}`)
      }
      throw e
    }
  }

  async function remove(headers: Headers, organizationId: string) {
    try {
      return await auth.api.deleteOrganization({
        headers,
        body: { organizationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to delete organization: ${e.message}`)
      }
      throw e
    }
  }

  async function setActive(headers: Headers, organizationId?: string | null, organizationSlug?: string) {
    try {
      return await auth.api.setActiveOrganization({
        headers,
        body: {
          organizationId,
          organizationSlug,
        },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to set active organization: ${e.message}`)
      }
      throw e
    }
  }

  async function get(headers: Headers, organizationId?: string, organizationSlug?: string, membersLimit?: number) {
    try {
      return await auth.api.getFullOrganization({
        headers,
        query: {
          organizationId,
          organizationSlug,
          membersLimit,
        },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Organization not found: ${e.message}`)
      }
      throw e
    }
  }

  async function list(headers: Headers) {
    try {
      return await auth.api.listOrganizations({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list organizations: ${e.message}`)
      }
      throw e
    }
  }

  async function inviteMember(headers: Headers, input: InviteMemberInput) {
    try {
      return await auth.api.createInvitation({
        headers,
        body: {
          email: input.email,
          role: input.role as any,
          organizationId: input.organizationId,
          resend: input.resend,
        },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to invite member: ${e.message}`)
      }
      throw e
    }
  }

  async function cancelInvitation(headers: Headers, invitationId: string) {
    try {
      return await auth.api.cancelInvitation({
        headers,
        body: { invitationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to cancel invitation: ${e.message}`)
      }
      throw e
    }
  }

  async function acceptInvitation(headers: Headers, invitationId: string) {
    try {
      return await auth.api.acceptInvitation({
        headers,
        body: { invitationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to accept invitation: ${e.message}`)
      }
      throw e
    }
  }

  async function getInvitation(headers: Headers, invitationId: string) {
    try {
      return await auth.api.getInvitation({
        headers,
        query: { id: invitationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Invitation not found: ${e.message}`)
      }
      throw e
    }
  }

  async function rejectInvitation(headers: Headers, invitationId: string) {
    try {
      return await auth.api.rejectInvitation({
        headers,
        body: { invitationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to reject invitation: ${e.message}`)
      }
      throw e
    }
  }

  async function listInvitations(headers: Headers, organizationId?: string) {
    try {
      return await auth.api.listInvitations({
        headers,
        query: { organizationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list invitations: ${e.message}`)
      }
      throw e
    }
  }

  async function removeMember(headers: Headers, memberIdOrEmail: string, organizationId?: string) {
    try {
      return await auth.api.removeMember({
        headers,
        body: { memberIdOrEmail, organizationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to remove member: ${e.message}`)
      }
      throw e
    }
  }

  async function updateMemberRole(headers: Headers, memberId: string, role: string | string[], organizationId?: string) {
    try {
      return await auth.api.updateMemberRole({
        headers,
        body: { memberId, role, organizationId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update member role: ${e.message}`)
      }
      throw e
    }
  }

  async function checkSlug(headers: Headers, slug: string) {
    try {
      return await auth.api.checkOrganizationSlug({
        headers,
        body: { slug },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to check slug: ${e.message}`)
      }
      throw e
    }
  }

  async function listUserInvitations(headers: Headers, email?: string) {
    try {
      return await auth.api.listUserInvitations({
        headers,
        query: { email },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list user invitations: ${e.message}`)
      }
      throw e
    }
  }

  async function listMembers(headers: Headers, params: ListMembersParams = {}) {
    try {
      return await auth.api.listMembers({
        headers,
        query: { ...params },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list members: ${e.message}`)
      }
      throw e
    }
  }

  return {
    create,
    update,
    remove,
    setActive,
    get,
    list,
    inviteMember,
    cancelInvitation,
    acceptInvitation,
    getInvitation,
    rejectInvitation,
    listInvitations,
    removeMember,
    updateMemberRole,
    checkSlug,
    listUserInvitations,
    listMembers,
  }
}
