import type { AccessRole, Auth } from '@czo/auth/config'
import type { AuthRelations, CancelOrgInvitationInput, CreateOrganizationInput, CreateOrgInvitationInput, CreateOrgMemberInput, Organization, OrganizationInvitation, OrganizationMember, RemoveOrgMemberInput, UpdateOrganizationInput, UpdateOrgMemberInput, User } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import { and, count, eq, like } from 'drizzle-orm'
import { invitations, members, organizations } from '../database/schema'
import { validateRole } from './utils/validate-roles'

interface CreateOrganizationOptions {
  onLimit?: () => Promise<void>
  limit?: number | ((user: User) => Promise<boolean>)
  role?: string | string[]
  onFailed?: () => Promise<void>
  onExists?: () => Promise<void>
  onUserNotFound?: () => Promise<void>
}

interface UpdateOrganizationOptions {
  // placeholder for now — likely won't need options for update, but keeping the signature consistent with create
  onFailed?: () => Promise<void>
  onNotFound?: () => Promise<void>
  authUserId?: number
  onIntrusion?: () => Promise<void>
  onSlugConflict?: () => Promise<void>
}

interface DeleteOrganizationOptions {
  // placeholder for now — likely won't need options for update, but keeping the signature consistent with create
  prevent?: boolean
  onFailed?: () => Promise<void>
  onNotFound?: () => Promise<void>
  session?: {
    userId: number
    organizationId: number
    token: string
  }
  onIntrusion?: () => Promise<void>
}

interface FindOneOptions {
  onNotFound?: () => Promise<void>
  auth?: {
    userId: number
  }
}

interface FindManyOptions {
  auth?: {
    userId: number
  }
}

interface AddMemberOptions {
  onUserNotFound?: () => Promise<void>
  onOrganizationNotFound?: () => Promise<void>
  onMemberExists?: (member: OrganizationMember) => Promise<void>
  onFailed?: () => Promise<void>
  limit?: number
  onLimit?: () => Promise<void>
  onInvalidRole?: () => Promise<void>
}

interface FindOneMemberOptions {
  onNotFound?: () => Promise<void>
}

interface RemoveMemberOptions {
  onFailed?: () => Promise<void>
  onNotFound?: () => Promise<void>
  creatorRole?: string
  onAttemptToRemoveLastOwner?: () => Promise<void>
  session?: {
    userId: number
    organizationId: number
    token: string
  }
}

interface UpdateMemberOptions {
  onFailed?: () => Promise<void>
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  onAttemptToSetOwner?: () => Promise<void>
  onAttemptToLeaveOrganizationWithoutAnOwner?: () => Promise<void>
  onInvalidRole?: () => Promise<void>
  creatorRole?: string
  session?: {
    userId: number
  }
}

interface CreateInvitationOptions {
  onFailed?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  onAttemptToSetOwner?: () => Promise<void>
  onMemberExists?: () => Promise<void>
  onExists?: () => Promise<void>
  cancelPendingOnReInvite?: boolean
  limit?: number | (() => Promise<number>)
  onLimitReached?: () => Promise<void>
  // sendInvitationEmail?: (invitation: OrganizationInvitation) => Promise<void>
  onInvalidRole?: () => Promise<void>
  expiration?: number
  creatorRole?: string
}

interface CancelInvitationOptions {
  onFailed?: () => Promise<void>
  onNotFound?: () => Promise<void>
  onIntrusion?: () => Promise<void>
  session?: {
    userId: number
  }
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

export function createOrganizationService(db: Database<AuthRelations>, auth: Auth, roles?: Record<string, AccessRole>) {
  const checkMembership = async (organizationId: number, userId: number) => {
    const isMember = await db.query.members.findFirst({
      where: {
        organizationId,
        userId,
      },
    })
    return !!isMember
  }

  const findFirst = async (config?: Parameters<typeof db.query.organizations.findFirst>[0], opts?: FindOneOptions) => {
    const { where } = config || {}
    const data = await db.query.organizations.findFirst(opts?.auth
      ? { ...config, where: {
          ...where,
          members: { userId: opts.auth.userId },
        } }
      : config)

    if (!data) {
      if (opts?.onNotFound)
        opts.onNotFound()
      return null
    }

    return data
  }

  const findFirstMember = async (orgId: number, config?: Parameters<typeof db.query.members.findFirst>[0], opts?: FindOneMemberOptions) => {
    const { where } = config || {}
    const data = await db.query.members.findFirst({ ...config, where: {
      ...where,
      organizationId: orgId,
    } })

    if (!data) {
      if (opts?.onNotFound)
        opts.onNotFound()
      return null
    }

    return data
  }

  const findFirstInvitation = async (orgId: number, config?: Parameters<typeof db.query.invitations.findFirst>[0], opts?: FindOneMemberOptions) => {
    const { where } = config || {}
    const data = await db.query.invitations.findFirst({ ...config, where: {
      ...where,
      organizationId: orgId,
    } })

    if (!data) {
      if (opts?.onNotFound)
        opts.onNotFound()
      return null
    }

    return data
  }

  const findManyInvitations = async (orgId: number, config?: Parameters<typeof db.query.invitations.findMany>[0]) => {
    const { where } = config || {}
    return await db.query.invitations.findMany({ ...config, where: {
      ...where,
      organizationId: orgId,
    }})
  }

  return {
    checkMembership,
    // ── Org reads — Drizzle direct ──

    findFirst,

    async findMany(config?: Parameters<typeof db.query.organizations.findMany>[0], opts?: FindManyOptions) {
      const { where } = config || {}
      return await db.query.organizations.findMany(opts?.auth
        ? { ...config, where: {
            ...where,
            members: { userId: opts.auth.userId },
          } }
        : config)
    },

    // ── Org writes — Drizzle direct ──

    async create(input: CreateOrganizationInput, opts?: CreateOrganizationOptions): Promise<Organization & { members: OrganizationMember[] } | null> {
      const { userId, ...orgData } = input
      const user = await db.query.users.findFirst({ where: { id: userId } })

      if (!user) {
        if (opts?.onUserNotFound)
          await opts.onUserNotFound()
        return null
      }

      if (opts?.limit) {
        let hasReachedLimit = false

        if (typeof opts.limit === 'function') {
          hasReachedLimit = await opts.limit(user)
        }
        else {
          const [value] = await db.select({ count: count() })
            .from(organizations)
            .innerJoin(members, eq(members.organizationId, organizations.id))
            .where(eq(members.userId, userId))
            .limit(1)

          hasReachedLimit = value ? value.count < opts.limit : false
        }

        if (hasReachedLimit) {
          if (opts?.onLimit)
            await opts.onLimit()
          return null
        }
      }

      const existing = await findFirst({ where: { slug: input.slug } })

      if (existing) {
        if (opts?.onExists)
          await opts.onExists()
        return null
      }

      try {
        const org = await db.transaction(async (tx) => {
          const now = new Date()
          const [_org] = await tx.insert(organizations).values({
            ...orgData,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt: now,
          }).returning()

          if (!_org)
            tx.rollback()

          const [member] = await tx.insert(members).values({
            organizationId: _org?.id as number,
            userId,
            role: Array.isArray(opts?.role) ? opts.role.join(',') : opts?.role || 'owner',
            createdAt: now,
          }).returning()

          if (!member)
            tx.rollback()

          return { ..._org!, members: [member!] }
        })

        return org
      }
      catch {
        if (opts?.onFailed)
          await opts.onFailed()
        return null
      }
    },

    async update(id: number, input: UpdateOrganizationInput, opts?: UpdateOrganizationOptions): Promise<Organization | null> {
      const existing = await findFirst({ where: { id } })

      if (!existing) {
        if (opts?.onNotFound)
          await opts.onNotFound()
        return null
      }

      if (opts?.authUserId) {
        const isMember = checkMembership(id, opts.authUserId)

        if (!isMember) {
          if (opts?.onIntrusion)
            await opts.onIntrusion()
          return null
        }
      }

      const slugConflict = input.slug ? await findFirst({ where: { slug: input.slug } }) : null

      if (slugConflict && slugConflict.id !== id) {
        if (opts?.onSlugConflict)
          await opts.onSlugConflict()
        return null
      }

      const [org] = await db.update(organizations)
        .set({
          ...input,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          updatedAt: new Date(),
        } as any)
        .where(eq(organizations.id, id))
        .returning()

      if (!org) {
        if (opts?.onFailed)
          await opts.onFailed()
        return null
      }

      return org
    },

    async delete(id: number, opts?: DeleteOrganizationOptions): Promise<Organization | null> {
      if (opts?.prevent)
        return null

      const existing = await findFirst({ where: { id } })

      if (!existing) {
        if (opts?.onNotFound)
          await opts.onNotFound()
        return null
      }
      if (opts?.session) {
        const isMember = await checkMembership(id, opts.session.userId)

        if (!isMember) {
          if (opts?.onIntrusion)
            await opts.onIntrusion()
          return null
        }

        if (opts.session.organizationId === id) {
          const authCtx = await auth.$context
          authCtx.internalAdapter.updateSession(opts.session.token, {
            activeOrganizationId: null,
          })
        }
      }

      const [org] = await db.delete(organizations).where(eq(organizations.id, id)).returning()

      if (!org) {
        if (opts?.onFailed)
          await opts.onFailed()
        return null
      }

      return org
    },

    // setActive modifies session state — better-auth's domain
    // async setActive(input: SetActiveOrganizationInput, opts: SetActiveOptions) {
    //   const slug = input.slug
    //   let id = input.id

    //   if( !slug && !id) {
    //     id = opts.auth.organizationId
    //     if (!id) {
    //       if (opts.onNotFound)
    //         await opts.onNotFound()
    //       return null
    //     }
    //   }

    //   const org = await findOne({
    //     where: id ? { id } : slug ? { slug } : undefined,
    //   }, {
    //     onNotFound: opts?.onNotFound,
    //     auth: opts?.auth,
    //     onIntrusion: opts?.onIntrusion,
    //   })

    //   try {
    //     return await (auth.api as any).setActiveOrganization({
    //       headers,
    //       body: {
    //         organizationId: input.organizationId,
    //         organizationSlug: input.organizationSlug,
    //       },
    //     })
    //   }
    //   catch (err) { mapAPIError(err, 'Organization') }
    // },

    // ── Members — Drizzle direct ──

    // async listMembers(params: ListMembersParams): Promise<MemberRow[]> {
    //   if (!params.organizationId)
    //     throw new Error('organizationId required for listMembers')
    //   return db.select().from(members).where(eq(members.organizationId, params.organizationId))
    // },

    async addMember(input: CreateOrgMemberInput, opts?: AddMemberOptions): Promise<OrganizationMember | null> {
      const existingUser = await db.query.users.findFirst({ where: { id: input.userId } })

      if (!existingUser) {
        if (opts?.onUserNotFound)
          await opts.onUserNotFound()
        return null
      }

      const existingMember = await findFirstMember(input.organizationId, { where: { userId: input.userId } })

      if (existingMember) {
        if (opts?.onMemberExists)
          await opts.onMemberExists(existingMember)
        return null
      }

      const existingOrg = await findFirst({ where: { id: input.organizationId } })

      if (!existingOrg) {
        if (opts?.onOrganizationNotFound)
          await opts.onOrganizationNotFound()
        return null
      }

      if (opts?.limit) {
        const count = await db.$count(members, eq(members.organizationId, input.organizationId))
        if (count >= opts.limit) {
          if (opts.onLimit)
            await opts.onLimit()
          return null
        }
      }

      const validRole = validateRole(input.role, roles)

      if (!validRole) {
        if (opts?.onInvalidRole) {
          await opts.onInvalidRole()
        }
        return null
      }

      const [member] = await db.insert(members).values({
        ...input,
        role: validRole,
        createdAt: new Date(),
      }).returning()

      if (!member) {
        if (opts?.onFailed)
          opts.onFailed()
        return null
      }

      return member
    },

    findFirstMember,

    async findManyMembers(orgId: number, config?: Parameters<typeof db.query.members.findMany>[0]) {
      const { where } = config || {}
      return await db.query.members.findMany({ ...config, where: {
        ...where,
        organizationId: orgId,
      } })
    },

    async removeMember(input: RemoveOrgMemberInput, opts?: RemoveMemberOptions): Promise<OrganizationMember | null> {
      const { identifier, organizationId } = input
      let member: OrganizationMember | null = null

      if (typeof identifier === 'string' && identifier.includes('@')) {
        member = await findFirstMember(organizationId, {
          where: {
            user: {
              email: identifier,
            },
          },
        })
      }
      else {
        member = await findFirstMember(organizationId, {
          where: {
            id: identifier as number,
            OR: [{
              user: { id: identifier as number },
            }],
          },
        })
      }

      if (!member) {
        if (opts?.onNotFound)
          await opts.onNotFound()
        return null
      }

      const _roles = member.role.split(',')
      const creatorRole = opts?.creatorRole || 'owner'
      const isOwner = _roles.includes(creatorRole)

      if (isOwner) {
        const ownersCount = await db.$count(members, and(
          like(members.role, `%${creatorRole}%`),
          eq(members.organizationId, input.organizationId),
        ))

        if (ownersCount <= 1) {
          if (opts?.onAttemptToRemoveLastOwner)
            await opts.onAttemptToRemoveLastOwner()

          return null
        }
      }

      const [_member] = await db.delete(members).where(and(
        eq(members.id, member.id),
        eq(members.organizationId, organizationId),
      )).returning()

      if (!_member) {
        if (opts?.onFailed)
          await opts.onFailed()

        return null
      }

      if (opts?.session) {
        if (opts.session.organizationId === organizationId && opts.session.userId === member.userId) {
          const authCtx = await auth.$context
          await authCtx.internalAdapter.updateSession(opts.session.token, {
            activeOrganizationId: null,
          })
        }
      }

      return _member
    },

    async updateMemberRole(input: UpdateOrgMemberInput, opts?: UpdateMemberOptions): Promise<OrganizationMember | null> {
      const existing = await findFirstMember(input.organizationId, { where: { id: input.id } })

      if (!existing) {
        if (opts?.onNotFound)
          await opts.onNotFound()

        return null
      }

      let updaterIsCreator = false
      const creatorRole = opts?.creatorRole || 'owner'
      const role = typeof input.role === 'string' ? [input.role] : input.role
      const isSettingCreatorRole = role.includes(creatorRole)
      const isUpdatingCreator = existing.role.split(',').includes(creatorRole)

      if (opts?.session) {
        const authMember = await findFirstMember(input.organizationId, {
          where: { userId: opts.session.userId },
        })

        if (!authMember) {
          if (opts.onIntrusion)
            await opts.onIntrusion()

          return null
        }

        updaterIsCreator = authMember.role.split(',').includes(creatorRole)
      }

      if (
        (isUpdatingCreator && !updaterIsCreator)
        || (isSettingCreatorRole && !updaterIsCreator)
      ) {
        if (opts?.onAttemptToSetOwner) {
          await opts.onAttemptToSetOwner()
        }

        return null
      }

      if (updaterIsCreator && (existing.userId === opts?.session?.userId)) {
        const ownerCount = await db.$count(members, and(
          like(members.role, `%${creatorRole}%`),
          eq(members.organizationId, input.organizationId),
        ))

        if (ownerCount <= 1 && !isSettingCreatorRole) {
          if (opts.onAttemptToLeaveOrganizationWithoutAnOwner)
            await opts.onAttemptToLeaveOrganizationWithoutAnOwner()

          return null
        }
      }

      const validatedRole = validateRole(role, roles)

      if (!validatedRole) {
        if (opts?.onInvalidRole)
          await opts.onInvalidRole()

        return null
      }

      const [member] = await db.update(members)
        .set({ role: validatedRole })
        .where(eq(members.id, input.id))
        .returning()

      if (!member) {
        if (opts?.onFailed)
          await opts.onFailed()

        return null
      }

      return member
    },

    // async leave(organizationId: string, headers: Headers) {
    //   // leave requires knowing the current user — better-auth handles from session
    //   try {
    //     return await (auth.api as any).leaveOrganization({ headers, body: { organizationId } })
    //   }
    //   catch (err) { mapAPIError(err, 'Organization') }
    // },

    // async getActiveMember(headers: Headers) {
    //   try {
    //     return await (auth.api as any).getActiveMember({ headers })
    //   }
    //   catch (err) { mapAPIError(err, 'Member') }
    // },

    // async getActiveMemberRole(input: GetActiveMemberRoleInput, headers: Headers) {
    //   try {
    //     return await (auth.api as any).getActiveMemberRole({
    //       headers,
    //       query: {
    //         userId: input.userId,
    //         organizationId: input.organizationId,
    //         organizationSlug: input.organizationSlug,
    //       },
    //     })
    //   }
    //   catch (err) { mapAPIError(err, 'Member') }
    // },

    // // ── Invitations — Drizzle direct ──

    async createInvitation(input: CreateOrgInvitationInput, opts?: CreateInvitationOptions) {
      const { resend, ..._input } = input
      const existingInviter = await findFirstMember(input.organizationId, {
        where: {
          userId: input.inviterId
        },
      }, { onNotFound: opts?.onIntrusion})
      const creatorRole = opts?.creatorRole ?? 'owner'
      const _roles = validateRole(input.role, roles)

      if (!_roles) {
        if (opts?.onInvalidRole)
          await opts.onInvalidRole()

        return null
      }

      if (!existingInviter?.role.split(',').includes(creatorRole) && _roles.split(',').includes(creatorRole)) {
        if (opts?.onAttemptToSetOwner)
          opts.onAttemptToSetOwner()

        return null
      }

      const existingMember = await findFirstMember(input.organizationId, {
        where: {
          user: { email: input.email },
        },
      })

      if (existingMember) {
        if (opts?.onMemberExists)
          await opts.onMemberExists()

        return null
      }

      const existing = await findFirstInvitation(input.organizationId, {
        where: { email: input.email },
      })

      if (existing && !resend) {
        if (opts?.onExists)
          await opts.onExists()

        return null
      }

      const expiration = opts?.expiration || 60 * 60 * 48

      if (existing && resend) {
        const [invitation] = await db.update(invitations)
          .set({ expiresAt: new Date(Date.now() + (expiration * 1000)) })
          .where(eq(invitations.id, existing.id))
          .returning()

        if (!invitation) {
          if (opts?.onFailed)
            await opts.onFailed()

          return null
        }

        // if (opts?.sendInvitationEmail)
        //   await opts.sendInvitationEmail(invitation)

        return invitation
      }

      if (existing && opts?.cancelPendingOnReInvite) {
        db.update(invitations)
          .set({ status: 'cancel' })
          .where(eq(invitations.id, existing.id))
      }

      const invitationLimit = typeof opts?.limit === 'function' ? (await opts.limit()) : (opts?.limit ?? 100)
      const pendingInvitations = await findManyInvitations(input.organizationId, {
        where: { status: 'pending' }
      })

      if (pendingInvitations.length >= invitationLimit) {
        if (opts?.onLimitReached)
          await opts.onLimitReached()

        return null
      }

      const [invitation] = await db.insert(invitations)
        .values({
          ..._input,
          status: 'pending',
          role: _roles,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + (expiration * 1000))
        })
        .returning()

      if (!invitation) {
        if (opts?.onFailed)
          await opts.onFailed()

        return null
      }

        // if (opts?.sendInvitationEmail)
        //   await opts.sendInvitationEmail(invitation)

      return invitation
    },

    async cancelInvitation(input: CancelOrgInvitationInput, opts?: CancelInvitationOptions){
      if (opts?.session?.userId && !(await checkMembership(input.organizationId, opts.session.userId))) {
        if (opts.onIntrusion)
          await opts.onIntrusion()

        return null
      }

      const existing = await findFirstInvitation(input.organizationId, {
        where: { id: input.id },
      })

      if (!existing) {
        if (opts?.onNotFound)
          await opts.onNotFound()

        return null
      }

      const [invitation] = await db.update(invitations)
        .set({ status: 'cancelled' })
        .where(eq(invitations.id, input.id))
        .returning()

      if (!invitation) {
        if (opts?.onFailed)
          await opts.onFailed()

        return null
      }

      return invitation
    },

    findFirstInvitation,

    findManyInvitations,

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
        // @ts-expect-error - we know this is the right shape, but TS doesn't
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
            // @ts-expect-error - we just verified this is the right shape, but TS doesn't know that
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
