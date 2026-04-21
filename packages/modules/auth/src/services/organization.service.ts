import type { Auth } from '@czo/auth/config'
import type { Database } from '@czo/kit/db'
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import type { InferSelectModel } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm'
import { invitations, members, organizations } from '../database/schema'
import { mapAPIError } from './_internal/map-error'

// ─── Row types ────────────────────────────────────────────────────────

export type OrganizationRow = InferSelectModel<typeof organizations>
export type MemberRow = InferSelectModel<typeof members>
export type InvitationRow = InferSelectModel<typeof invitations>

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

// ─── hasPermission helpers (preserved from auth.service.ts) ──────────

const cacheOrgRoles = new Map<string, { [x: string]: Role<Record<string, string[]>> | undefined }>()

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

export function createOrganizationService(db: Database, auth: Auth) {
  return {
    // ── Org reads — Drizzle direct ──

    async find(organizationId: string) {
      const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
      return row ?? null
    },

    async findBySlug(slug: string) {
      const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
      return row ?? null
    },

    async list(): Promise<OrganizationRow[]> {
      return db.select().from(organizations)
    },

    async exists(organizationId: string) {
      const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
      return row !== undefined
    },

    async get(input: GetOrganizationInput, headers: Headers) {
      // Full org with members — delegate to better-auth (session-aware, handles eager loading)
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

    async checkSlug(slug: string): Promise<{ status: boolean }> {
      const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
      return { status: !row }
    },

    // ── Org writes — Drizzle direct ──

    async create(input: CreateOrganizationInput): Promise<OrganizationRow> {
      const now = new Date()
      const id = crypto.randomUUID()

      const [row] = await db.insert(organizations).values({
        id,
        name: input.name,
        slug: input.slug,
        logo: input.logo ?? null,
        type: input.type ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt: now,
        updatedAt: now,
      }).returning()

      if (!row)
        throw new Error('Failed to create organization')

      return row
    },

    async update(input: UpdateOrganizationInput): Promise<OrganizationRow> {
      const { organizationId, data } = input
      if (!organizationId)
        throw new Error('organizationId required for update')

      const now = new Date()

      const updateData: Record<string, unknown> = { updatedAt: now }
      if (data.name !== undefined)
        updateData.name = data.name
      if (data.slug !== undefined)
        updateData.slug = data.slug
      if (data.logo !== undefined)
        updateData.logo = data.logo
      if (data.type !== undefined)
        updateData.type = data.type
      if (data.metadata !== undefined)
        updateData.metadata = JSON.stringify(data.metadata)

      const [row] = await db.update(organizations)
        .set(updateData as any)
        .where(eq(organizations.id, organizationId))
        .returning()

      if (!row)
        throw new Error(`Organization not found: ${organizationId}`)

      return row
    },

    async remove(organizationId: string): Promise<{ success: boolean }> {
      await db.delete(organizations).where(eq(organizations.id, organizationId))
      return { success: true }
    },

    // setActive modifies session state — better-auth's domain
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

    // ── Members — Drizzle direct ──

    async listMembers(params: ListMembersParams): Promise<MemberRow[]> {
      if (!params.organizationId)
        throw new Error('organizationId required for listMembers')
      return db.select().from(members).where(eq(members.organizationId, params.organizationId))
    },

    async addMember(input: { organizationId: string, userId: string, role?: string }): Promise<MemberRow> {
      const now = new Date()
      const id = crypto.randomUUID()

      const [row] = await db.insert(members).values({
        id,
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role ?? 'member',
        createdAt: now,
      }).returning()

      if (!row)
        throw new Error('Failed to add member')

      return row
    },

    async removeMember(input: RemoveMemberInput): Promise<{ success: boolean }> {
      const { memberIdOrEmail, organizationId } = input
      if (!organizationId)
        throw new Error('organizationId required')

      // memberIdOrEmail can be member id or user id/email; we treat it as userId
      await db.delete(members).where(
        and(
          eq(members.organizationId, organizationId),
          eq(members.userId, memberIdOrEmail),
        ),
      )

      return { success: true }
    },

    async updateMemberRole(input: UpdateMemberRoleInput): Promise<MemberRow> {
      const roleStr = Array.isArray(input.role) ? input.role.join(',') : input.role

      const [row] = await db.update(members)
        .set({ role: roleStr })
        .where(eq(members.id, input.memberId))
        .returning()

      if (!row)
        throw new Error(`Member not found: ${input.memberId}`)

      return row
    },

    async leave(organizationId: string, headers: Headers) {
      // leave requires knowing the current user — better-auth handles from session
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

    // ── Invitations — Drizzle direct ──

    async inviteMember(input: InviteMemberInput, headers: Headers) {
      // Invitation creates an email send flow — keep better-auth for email dispatch,
      // but record the invitation in DB via better-auth's createInvitation
      try {
        return await (auth.api as any).createInvitation({
          headers,
          body: { ...input, role: input.role as any },
        })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async getInvitation(invitationId: string): Promise<InvitationRow> {
      const [row] = await db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1)
      if (!row)
        throw new Error(`Invitation not found: ${invitationId}`)
      return row
    },

    async listInvitations(organizationId: string | undefined): Promise<InvitationRow[]> {
      if (!organizationId)
        return db.select().from(invitations)
      return db.select().from(invitations).where(eq(invitations.organizationId, organizationId))
    },

    async listUserInvitations(email?: string): Promise<InvitationRow[]> {
      if (!email)
        return db.select().from(invitations)
      return db.select().from(invitations).where(eq(invitations.email, email))
    },

    async cancelInvitation(invitationId: string): Promise<InvitationRow> {
      const [row] = await db.update(invitations)
        .set({ status: 'cancelled' })
        .where(eq(invitations.id, invitationId))
        .returning()

      if (!row)
        throw new Error(`Invitation not found: ${invitationId}`)

      return row
    },

    async acceptInvitation(invitationId: string, headers: Headers) {
      // Transactional: create member + mark invitation accepted
      // Better-auth handles the session/user lookup for the accepting user
      try {
        return await (auth.api as any).acceptInvitation({ headers, body: { invitationId } })
      }
      catch (err) { mapAPIError(err, 'Invitation') }
    },

    async rejectInvitation(invitationId: string): Promise<InvitationRow> {
      const [row] = await db.update(invitations)
        .set({ status: 'rejected' })
        .where(eq(invitations.id, invitationId))
        .returning()

      if (!row)
        throw new Error(`Invitation not found: ${invitationId}`)

      return row
    },

    // ── hasPermission — preserved verbatim from auth.service.ts ──────

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
      const { allowCreatorAllPermissions, useMemoryCache = false, connector = 'AND' } = options ?? {}

      const orgOptions = auth.options?.plugins?.find(
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
        if (result?.success)
          return true
      }
      return false
    },
  }
}
