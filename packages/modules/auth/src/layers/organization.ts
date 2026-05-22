import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { invitations, members, organizations } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db/effect'
import { and, count, eq, like } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import {
  AccessService,
  CannotLeaveAsLastOwner,
  CannotPromoteToOwner,
  CannotRemoveLastOwner,
  InvitationNotFound,
  MemberAlreadyExists,
  MemberLimitReached,
  MemberNotFound,
  NotAMember,
  OrganizationEvents,
  OrganizationLimitReached,
  OrganizationNotFound,
  OrganizationService,
  OrganizationSlugTaken,
  OrgDbFailed,
  OrgInvalidRole,
  OrgNoChanges,
  OrgUserNotFound,
  validateRole,
} from '../services'

/**
 * Build the `OrganizationService` Live layer.
 *
 * Roles are materialized from `AccessService.buildRoles` at layer build time
 * (memoized per-runtime by Effect).
 */
export function makeOrganizationServiceLive() {
  return Layer.effect(
    OrganizationService,
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const access = yield* AccessService
      const { roles } = yield* access.buildRoles
      const events = yield* OrganizationEvents

      const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
        eff.pipe(Effect.mapError(cause => new OrgDbFailed({ cause })))

      const ensureValidRole = (role: string | string[]) =>
        Effect.gen(function* () {
          const valid = validateRole(role, roles)
          if (!valid)
            return yield* Effect.fail(new OrgInvalidRole({ role: Array.isArray(role) ? role.join(',') : role }))
          return valid
        })

      const findOrgById = (id: number) =>
        Effect.gen(function* () {
          const row = yield* dbErr(db.query.organizations.findFirst({ where: { id } }))
          if (!row)
            return yield* Effect.fail(new OrganizationNotFound())
          return row
        })

      const findMemberInOrg = (organizationId: number, userId: number) =>
        dbErr(db.query.members.findFirst({ where: { organizationId, userId } }))

      const requireMembership = (organizationId: number, userId: number) =>
        Effect.gen(function* () {
          const isMember = yield* findMemberInOrg(organizationId, userId)
          if (!isMember)
            return yield* Effect.fail(new NotAMember())
          return isMember
        })

      return OrganizationService.of({
        // ── Reads ────────────────────────────────────────────────────

        checkMembership: (organizationId, userId) =>
          findMemberInOrg(organizationId, userId).pipe(Effect.map(m => !!m)),

        checkSlug: slug =>
          dbErr(db.query.organizations.findFirst({ where: { slug } })).pipe(
            Effect.map(row => !row),
          ),

        findFirst: (config, authUserId) =>
          Effect.gen(function* () {
            const where = config?.where
            const merged = authUserId !== undefined
              ? { ...config, where: { ...where, members: { userId: authUserId } } }
              : config
            const row = yield* dbErr(db.query.organizations.findFirst(merged))
            if (!row)
              return yield* Effect.fail(new OrganizationNotFound())
            return row
          }),

        findMany: (config, authUserId) =>
          Effect.gen(function* () {
            const where = config?.where
            const merged = authUserId !== undefined
              ? { ...config, where: { ...where, members: { userId: authUserId } } }
              : config
            const rows = yield* dbErr(db.query.organizations.findMany(merged))
            return rows
          }),

        // ── Writes ───────────────────────────────────────────────────

        create: (input, scope) =>
          Effect.gen(function* () {
            const { userId, ...orgData } = input
            const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId } }))
            if (!user)
              return yield* Effect.fail(new OrgUserNotFound())

            if (scope?.limit !== undefined) {
              const reached = typeof scope.limit === 'function'
                ? yield* Effect.promise(() => (scope.limit as (id: number) => Promise<boolean>)(userId))
                : yield* dbErr(
                  db.select({ count: count() })
                    .from(organizations)
                    .innerJoin(members, eq(members.organizationId, organizations.id))
                    .where(eq(members.userId, userId))
                    .limit(1)
                    .pipe(Effect.map(([row]) => (row?.count ?? 0) >= (scope.limit as number))),
                )
              if (reached)
                return yield* Effect.fail(new OrganizationLimitReached())
            }

            const slugTaken = yield* dbErr(
              db.query.organizations.findFirst({ where: { slug: input.slug } }),
            )
            if (slugTaken)
              return yield* Effect.fail(new OrganizationSlugTaken({ slug: input.slug as string }))

            const result = yield* dbErr(db.transaction(tx =>
              Effect.gen(function* () {
                const now = new Date()
                const [org] = yield* tx.insert(organizations).values({
                  ...orgData,
                  metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                  createdAt: now,
                }).returning()
                if (!org)
                  return yield* Effect.fail(new Error('organization insert returned no row'))

                const [member] = yield* tx.insert(members).values({
                  organizationId: org.id,
                  userId,
                  role: Array.isArray(scope?.role) ? scope.role.join(',') : scope?.role || 'owner',
                  createdAt: now,
                }).returning()
                if (!member)
                  return yield* Effect.fail(new Error('member insert returned no row'))

                return { ...org, members: [member] }
              }),
            ))
            yield* Effect.forkDetach(events.publish({
              _tag: 'OrganizationCreated',
              orgId: result.id,
              ownerId: userId,
              name: result.name,
              type: result.type ?? null,
            }))
            return result
          }),

        update: (id, input, actorId) =>
          Effect.gen(function* () {
            yield* findOrgById(id)

            if (actorId !== undefined)
              yield* requireMembership(id, actorId)

            if (input.slug) {
              const conflict = yield* dbErr(
                db.query.organizations.findFirst({ where: { slug: input.slug as string } }),
              )
              if (conflict && conflict.id !== id)
                return yield* Effect.fail(new OrganizationSlugTaken({ slug: input.slug as string }))
            }

            if (Object.keys(input).length === 0)
              return yield* Effect.fail(new OrgNoChanges())

            const [org] = yield* dbErr(
              db.update(organizations)
                .set({
                  ...input,
                  metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                  updatedAt: new Date(),
                } as never)
                .where(eq(organizations.id, id))
                .returning(),
            )
            if (!org)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'update returned no row' }))
            yield* Effect.forkDetach(events.publish({
              _tag: 'OrganizationUpdated',
              orgId: id,
              changes: input as Record<string, unknown>,
            }))
            return org
          }),

        remove: (id, actorId) =>
          Effect.gen(function* () {
            yield* findOrgById(id)
            if (actorId !== undefined)
              yield* requireMembership(id, actorId)

            const [org] = yield* dbErr(
              db.delete(organizations).where(eq(organizations.id, id)).returning(),
            )
            if (!org)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'delete returned no row' }))
            yield* Effect.forkDetach(events.publish({ _tag: 'OrganizationDeleted', orgId: id }))
            return org
          }),

        // ── Members ──────────────────────────────────────────────────

        listMembers: (organizationId, config) =>
          Effect.gen(function* () {
            const merged = { ...config, where: { ...config?.where, organizationId } }
            const rows = yield* dbErr(db.query.members.findMany(merged))
            return rows
          }),

        addMember: (input, memberLimit) =>
          Effect.gen(function* () {
            const user = yield* dbErr(db.query.users.findFirst({ where: { id: input.userId } }))
            if (!user)
              return yield* Effect.fail(new OrgUserNotFound())

            const existingMember = yield* dbErr(
              db.query.members.findFirst({
                where: { organizationId: input.organizationId, userId: input.userId },
              }),
            )
            if (existingMember)
              return yield* Effect.fail(new MemberAlreadyExists({ member: existingMember }))

            const org = yield* dbErr(
              db.query.organizations.findFirst({ where: { id: input.organizationId } }),
            )
            if (!org)
              return yield* Effect.fail(new OrganizationNotFound())

            if (memberLimit !== undefined) {
              const c = yield* dbErr(
                db.$count(members, eq(members.organizationId, input.organizationId)),
              )
              if (c >= memberLimit)
                return yield* Effect.fail(new MemberLimitReached())
            }

            const validRole = yield* ensureValidRole(input.role)

            const [member] = yield* dbErr(db.insert(members).values({
              ...input,
              role: validRole,
              createdAt: new Date(),
            }).returning())
            if (!member)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'member insert returned no row' }))
            yield* Effect.forkDetach(events.publish({
              _tag: 'MemberAdded',
              orgId: input.organizationId,
              userId: input.userId,
              role: validRole,
            }))
            return member
          }),

        removeMember: (input, scope) =>
          Effect.gen(function* () {
            const { identifier, organizationId } = input

            const isEmail = typeof identifier === 'string' && identifier.includes('@')
            const member = yield* dbErr(
              db.query.members.findFirst({
                where: isEmail
                  ? { organizationId, user: { email: identifier as string } }
                  : { organizationId, OR: [{ id: identifier as number }, { user: { id: identifier as number } }] },
              }),
            )
            if (!member)
              return yield* Effect.fail(new MemberNotFound())

            const creatorRole = scope?.creatorRole ?? 'owner'
            const memberRoles = (member.role as string).split(',')
            if (memberRoles.includes(creatorRole)) {
              const ownerCount = yield* dbErr(db.$count(members, and(
                like(members.role, `%${creatorRole}%`),
                eq(members.organizationId, organizationId),
              )))
              if (ownerCount <= 1)
                return yield* Effect.fail(new CannotRemoveLastOwner())
            }

            const [removed] = yield* dbErr(
              db.delete(members).where(and(
                eq(members.id, member.id),
                eq(members.organizationId, organizationId),
              )).returning(),
            )
            if (!removed)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'member delete returned no row' }))
            yield* Effect.forkDetach(events.publish({
              _tag: 'MemberRemoved',
              orgId: organizationId,
              userId: (removed).userId as number,
            }))
            return removed
          }),

        updateMemberRole: (input, scope) =>
          Effect.gen(function* () {
            const existing = yield* dbErr(
              db.query.members.findFirst({
                where: { id: input.id, organizationId: input.organizationId },
              }),
            )
            if (!existing)
              return yield* Effect.fail(new MemberNotFound())

            const creatorRole = scope?.creatorRole ?? 'owner'
            const newRoles = typeof input.role === 'string' ? [input.role] : input.role
            const settingCreatorRole = newRoles.includes(creatorRole)
            const updatingCreator = (existing.role as string).split(',').includes(creatorRole)

            // Promotion-to-owner is restricted: only existing owners can grant
            // the owner role. Demoting the last owner is also rejected — the
            // resolver should authorise actor-bound permissions before calling.
            if (settingCreatorRole && !updatingCreator)
              return yield* Effect.fail(new CannotPromoteToOwner())
            if (!settingCreatorRole && updatingCreator) {
              const ownerCount = yield* dbErr(db.$count(members, and(
                like(members.role, `%${creatorRole}%`),
                eq(members.organizationId, input.organizationId),
              )))
              if (ownerCount <= 1)
                return yield* Effect.fail(new CannotLeaveAsLastOwner())
            }

            const validatedRole = yield* ensureValidRole(newRoles)

            const [member] = yield* dbErr(
              db.update(members).set({ role: validatedRole }).where(eq(members.id, input.id)).returning(),
            )
            if (!member)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'member update returned no row' }))
            yield* Effect.forkDetach(events.publish({
              _tag: 'MemberRoleChanged',
              orgId: input.organizationId,
              userId: (existing).userId as number,
              previousRole: existing.role as string,
              newRole: validatedRole,
            }))
            return member
          }),

        // ── Invitations ──────────────────────────────────────────────

        getInvitation: id =>
          Effect.gen(function* () {
            const row = yield* dbErr(db.query.invitations.findFirst({ where: { id } }))
            if (!row)
              return yield* Effect.fail(new InvitationNotFound())
            return row
          }),

        listInvitations: (organizationId, config) =>
          Effect.gen(function* () {
            const merged = { ...config, where: { ...config?.where, organizationId } }
            const rows = yield* dbErr(db.query.invitations.findMany(merged))
            return rows
          }),

        listUserInvitations: email =>
          Effect.gen(function* () {
            const rows = yield* dbErr(
              db.query.invitations.findMany({ where: { email, status: 'pending' } }),
            )
            return rows
          }),

        cancelInvitation: (id, actorId) =>
          Effect.gen(function* () {
            const existing = yield* dbErr(
              db.query.invitations.findFirst({ where: { id } }),
            )
            if (!existing)
              return yield* Effect.fail(new InvitationNotFound())

            if (actorId !== undefined)
              yield* requireMembership(existing.organizationId as number, actorId)

            const [invitation] = yield* dbErr(
              db.update(invitations).set({ status: 'cancelled' }).where(eq(invitations.id, id)).returning(),
            )
            if (!invitation)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation update returned no row' }))
            return invitation
          }),
      })
    }),
  )
}
