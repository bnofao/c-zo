import type { Auth } from '../config/auth'
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
  async function create(input: CreateOrganizationInput, headers?: Headers) {
    try {
      return await auth.api.createOrganization({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to create organization: ${e.message}`)
      }
      throw e
    }
  }

  async function update(input: UpdateOrganizationInput, headers: Headers) {
    try {
      return await auth.api.updateOrganization({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update organization: ${e.message}`)
      }
      throw e
    }
  }

  async function remove(organizationId: string, headers: Headers) {
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

  async function setActive(organizationId: string | null | undefined, headers: Headers, organizationSlug?: string) {
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

  async function get(organizationId: string | undefined, headers: Headers, organizationSlug?: string, membersLimit?: number) {
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

  async function inviteMember(input: InviteMemberInput, headers: Headers) {
    try {
      return await auth.api.createInvitation({
        headers,
        body: { ...input, role: input.role as any },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to invite member: ${e.message}`)
      }
      throw e
    }
  }

  async function cancelInvitation(invitationId: string, headers: Headers) {
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

  async function acceptInvitation(invitationId: string, headers: Headers) {
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

  async function getInvitation(invitationId: string, headers: Headers) {
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

  async function rejectInvitation(invitationId: string, headers: Headers) {
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

  async function listInvitations(organizationId: string | undefined, headers: Headers) {
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

  async function removeMember(memberIdOrEmail: string, headers: Headers, organizationId?: string) {
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

  async function updateMemberRole(memberId: string, role: string | string[], headers: Headers, organizationId?: string) {
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

  async function checkSlug(slug: string, headers?: Headers) {
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

  async function listUserInvitations(email?: string, headers?: Headers) {
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

  async function listMembers(params: ListMembersParams, headers: Headers) {
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
