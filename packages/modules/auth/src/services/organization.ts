import type { Relations } from '@czo/auth/relations'
import type { MemberSchema, OrganizationSchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { AccessRole } from './access'
import { invitations, members, organizations } from '@czo/auth/schema'
import { DrizzleDb } from '@czo/kit/db'
import { and, count, eq, like } from 'drizzle-orm'
import { Context, Data, Duration, Effect, Layer } from 'effect'
import { INVITATION_DURATION } from '../constants'
import { AccessService } from './access'
import { OrganizationEvents } from './events/organization'
import { validateRole } from './utils/validate-roles'

// ─── Permission helpers (formerly in layers/auth.ts) ─────────────────

// TODO: bound this cache (LRU / TTL). It grows one entry per organization and
// is never evicted — fine for a small tenant count, a slow leak otherwise.
// Carried over verbatim from the legacy auth service.
const cacheOrgRoles = new Map<string, { [x: string]: AccessRole | undefined }>()

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class OrganizationNotFound extends Data.TaggedError('OrganizationNotFound') {
  readonly code = 'ORGANIZATION_NOT_FOUND'
  get message() { return 'Organization not found' }
}

export class OrganizationSlugTaken extends Data.TaggedError('OrganizationSlugTaken')<{
  readonly slug: string
}> {
  readonly code = 'ORGANIZATION_SLUG_TAKEN'
  get message() { return `Organization slug '${this.slug}' is already taken` }
}

export class OrganizationLimitReached extends Data.TaggedError('OrganizationLimitReached') {
  readonly code = 'ORGANIZATION_LIMIT_REACHED'
  get message() { return 'You have reached the maximum number of organizations' }
}

export class OrgUserNotFound extends Data.TaggedError('OrgUserNotFound') {
  readonly code = 'ORG_USER_NOT_FOUND'
  get message() { return 'User not found' }
}

export class NotAMember extends Data.TaggedError('NotAMember') {
  readonly code = 'NOT_A_MEMBER'
  get message() { return 'You are not a member of this organization' }
}

export class MemberNotFound extends Data.TaggedError('MemberNotFound') {
  readonly code = 'MEMBER_NOT_FOUND'
  get message() { return 'Member not found in this organization' }
}

export class MemberAlreadyExists extends Data.TaggedError('MemberAlreadyExists')<{
  readonly member: OrganizationMember
}> {
  readonly code = 'MEMBER_ALREADY_EXISTS'
  get message() { return 'User is already a member of this organization' }
}

export class MemberLimitReached extends Data.TaggedError('MemberLimitReached') {
  readonly code = 'MEMBER_LIMIT_REACHED'
  get message() { return 'This organization has reached its member limit' }
}

export class CannotRemoveLastOwner extends Data.TaggedError('CannotRemoveLastOwner') {
  readonly code = 'CANNOT_REMOVE_LAST_OWNER'
  get message() { return 'Cannot remove the last owner of an organization' }
}

export class CannotPromoteToOwner extends Data.TaggedError('CannotPromoteToOwner') {
  readonly code = 'CANNOT_PROMOTE_TO_OWNER'
  get message() { return 'Only existing owners can grant the owner role' }
}

export class CannotLeaveAsLastOwner extends Data.TaggedError('CannotLeaveAsLastOwner') {
  readonly code = 'CANNOT_LEAVE_AS_LAST_OWNER'
  get message() { return 'You are the last owner — transfer ownership before leaving' }
}

export class OrgInvalidRole extends Data.TaggedError('OrgInvalidRole')<{
  readonly role: string
}> {
  readonly code = 'ORG_INVALID_ROLE'
  get message() { return `Invalid organization role: '${this.role}'` }
}

export class InvitationNotFound extends Data.TaggedError('InvitationNotFound') {
  readonly code = 'INVITATION_NOT_FOUND'
  get message() { return 'Invitation not found' }
}

export class InvitationExpired extends Data.TaggedError('InvitationExpired') {
  readonly code = 'INVITATION_EXPIRED'
  get message() { return 'Invitation has expired' }
}

export class InvitationAlreadyExists extends Data.TaggedError('InvitationAlreadyExists') {
  readonly code = 'INVITATION_ALREADY_EXISTS'
  get message() { return 'A pending invitation already exists for this email' }
}

export class InvitationLimitReached extends Data.TaggedError('InvitationLimitReached') {
  readonly code = 'INVITATION_LIMIT_REACHED'
  get message() { return 'Invitation limit reached for this organization' }
}

export class InvitationNotPending extends Data.TaggedError('InvitationNotPending') {
  readonly code = 'INVITATION_NOT_PENDING'
  get message() { return 'This invitation is no longer pending' }
}

export class InvitationEmailMismatch extends Data.TaggedError('InvitationEmailMismatch') {
  readonly code = 'INVITATION_EMAIL_MISMATCH'
  get message() { return 'Invitation email does not match the authenticated user' }
}

export class OrgNoChanges extends Data.TaggedError('OrgNoChanges') {
  readonly code = 'ORG_NO_CHANGES'
  get message() { return 'No changes provided' }
}

export class OrgDbFailed extends Data.TaggedError('OrgDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ORG_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type OrganizationError
  = | OrganizationNotFound
    | OrganizationSlugTaken
    | OrganizationLimitReached
    | OrgUserNotFound
    | NotAMember
    | MemberNotFound
    | MemberAlreadyExists
    | MemberLimitReached
    | CannotRemoveLastOwner
    | CannotPromoteToOwner
    | CannotLeaveAsLastOwner
    | OrgInvalidRole
    | InvitationNotFound
    | InvitationExpired
    | InvitationAlreadyExists
    | InvitationLimitReached
    | InvitationNotPending
    | InvitationEmailMismatch
    | OrgNoChanges
    | OrgDbFailed

// ─── Service contract (Effect Tag) ───────────────────────────────────
export interface CreateOrganizationInput {
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
  type?: string | null
  userId: number
}

export interface CreateOrgMemberInput {
  organizationId: number
  role: string
  userId: number
}

export interface OrganizationInvitation {
  id: number
  organizationId: number
  email: string
  role: string | null
  status: string
  expiresAt: Date
  inviterId: number
  createdAt: Date
}

interface RemoveOrgMemberInput {
  memberId: number
  organizationId: number
}

export interface UpdateOrganizationInput {
  name?: string | null
  slug?: string | null
  logo?: string | null
  metadata?: string | null
  type?: string | null
}

interface UpdateOrgMemberInput {
  id: number
  organizationId: number
  role: string | string[]
}

export type OrganizationMember = InferSelectModel<MemberSchema>

export type Organization = InferSelectModel<OrganizationSchema>

type OrgFindFirstConfig = Parameters<Database<Relations>['query']['organizations']['findFirst']>[0]
type OrgFindManyConfig = Parameters<Database<Relations>['query']['organizations']['findMany']>[0]
type MemberFindManyConfig = Parameters<Database<Relations>['query']['members']['findMany']>[0]
type MemberFindFirstConfig = Parameters<Database<Relations>['query']['members']['findFirst']>[0]
type InvitationFindManyConfig = Parameters<Database<Relations>['query']['invitations']['findMany']>[0]

export interface CreateOrgScope {
  /**
   * Optional organization-count limit per user. `function` form: caller
   *  decides reach by inspecting the creating user.
   */
  limit?: number | ((userId: number) => Promise<boolean>)
  /** Role to grant the creating user. Defaults to the configured org-owner role. */
  role?: string | string[]
}

export interface MemberScope {
  /**
   * Role of the actor performing the change (used to enforce e.g. "only
   *  owners can promote to owner"). Defaults to the configured org-owner role.
   */
  creatorRole?: string
}

export class OrganizationService extends Context.Service<
  OrganizationService,
  {
    // ── Reads ────────────────────────────────────────────────────────
    readonly checkMembership: (
      organizationId: number,
      userId: number,
    ) => Effect.Effect<boolean, OrgDbFailed>

    readonly checkSlug: (
      slug: string,
    ) => Effect.Effect<boolean, OrgDbFailed>

    readonly findFirst: (
      config?: OrgFindFirstConfig,
      authUserId?: number,
    ) => Effect.Effect<Organization, OrganizationNotFound | OrgDbFailed>

    readonly findMany: (
      config?: OrgFindManyConfig,
      authUserId?: number,
    ) => Effect.Effect<readonly Organization[], OrgDbFailed>

    // ── Writes ───────────────────────────────────────────────────────
    readonly create: (
      input: CreateOrganizationInput,
      scope?: CreateOrgScope,
    ) => Effect.Effect<
      Organization & { members: readonly OrganizationMember[] },
      OrgUserNotFound | OrganizationSlugTaken | OrganizationLimitReached | OrgDbFailed
    >

    readonly update: (
      id: number,
      input: UpdateOrganizationInput,
    ) => Effect.Effect<
      Organization,
      OrganizationNotFound | OrganizationSlugTaken | OrgNoChanges | OrgDbFailed
    >

    readonly remove: (
      id: number,
    ) => Effect.Effect<Organization, OrganizationNotFound | OrgDbFailed>

    // ── Members ──────────────────────────────────────────────────────
    readonly listMembers: (
      organizationId: number,
      config?: MemberFindManyConfig,
    ) => Effect.Effect<readonly OrganizationMember[], OrgDbFailed>

    readonly findFirstMember: (
      organizationId: number,
      config?: MemberFindFirstConfig,
    ) => Effect.Effect<OrganizationMember, MemberNotFound | OrgDbFailed>

    readonly addMember: (
      input: CreateOrgMemberInput,
      memberLimit?: number,
    ) => Effect.Effect<
      OrganizationMember,
      OrgUserNotFound | OrganizationNotFound | MemberAlreadyExists | MemberLimitReached
      | OrgInvalidRole | OrgDbFailed
    >

    readonly removeMember: (
      input: RemoveOrgMemberInput,
      scope?: MemberScope,
    ) => Effect.Effect<
      OrganizationMember,
      MemberNotFound | CannotRemoveLastOwner | OrgDbFailed
    >

    readonly updateMemberRole: (
      input: UpdateOrgMemberInput,
      scope?: MemberScope,
    ) => Effect.Effect<
      OrganizationMember,
      MemberNotFound | OrgInvalidRole | CannotPromoteToOwner
      | CannotLeaveAsLastOwner | OrgDbFailed
    >

    // ── Invitations ──────────────────────────────────────────────────
    readonly getInvitation: (
      id: number,
    ) => Effect.Effect<OrganizationInvitation, InvitationNotFound | OrgDbFailed>

    readonly listInvitations: (
      organizationId: number,
      config?: InvitationFindManyConfig,
    ) => Effect.Effect<readonly OrganizationInvitation[], OrgDbFailed>

    readonly listUserInvitations: (
      email: string,
      config?: InvitationFindManyConfig,
    ) => Effect.Effect<readonly OrganizationInvitation[], OrgDbFailed>

    readonly cancelInvitation: (
      id: number,
    ) => Effect.Effect<OrganizationInvitation, InvitationNotFound | OrgDbFailed>

    readonly createInvitation: (input: {
      readonly organizationId: number
      readonly email: string
      readonly role: string
      readonly inviterId: number
      /**
       * When a pending invite already exists: false/omitted -> fail
       *  `InvitationAlreadyExists`; true -> re-publish `InvitationCreated`
       *  for the existing invite and return it (idempotent re-notify).
       */
      readonly resend?: boolean
    }) => Effect.Effect<
      OrganizationInvitation,
      OrganizationNotFound | OrgInvalidRole | MemberAlreadyExists
      | InvitationAlreadyExists | OrgDbFailed
    >

    readonly acceptInvitation: (
      invitationId: number,
      userId: number,
    ) => Effect.Effect<
      { readonly invitation: OrganizationInvitation, readonly member: OrganizationMember },
      InvitationNotFound | InvitationNotPending | InvitationExpired
      | InvitationEmailMismatch | OrgUserNotFound | MemberAlreadyExists | OrgDbFailed
    >

    readonly rejectInvitation: (
      invitationId: number,
      userId: number,
    ) => Effect.Effect<
      OrganizationInvitation,
      InvitationNotFound | InvitationNotPending | InvitationEmailMismatch
      | OrgUserNotFound | OrgDbFailed
    >

    // ── Permissions ──────────────────────────────────────────────────
    readonly hasPermission: (input: {
      orgId: string
      role: string
      permissions: Record<string, string[]>
      connector?: 'AND' | 'OR'
      allowCreatorAllPermissions?: boolean
      dynamicAccessControl?: boolean
      creatorRole?: string
      useMemoryCache?: boolean
    }) => Effect.Effect<boolean>
  }
>()('@czo/auth/OrganizationService') {}

// ─── Layer ───────────────────────────────────────────────────────────────

function make(ownerRole: string) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const access = yield* AccessService
    const events = yield* OrganizationEvents

    const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
      eff.pipe(Effect.mapError(cause => new OrgDbFailed({ cause })))

    const ensureValidRole = (role: string | string[]) =>
      Effect.gen(function* () {
      // Live role set at request time (registry is complete only after all
      // modules' `onStart` — e.g. stock-location — which run post-construction).
        const roles = yield* access.roles
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

    const findFirstMember = (organizationId: number, config?: MemberFindFirstConfig) =>
      Effect.gen(function* () {
        const merged = { ...config, where: { ...config?.where, organizationId } }
        const row = yield* dbErr(db.query.members.findFirst(merged))
        if (!row)
          return yield* Effect.fail(new MemberNotFound())
        return row
      })

    return OrganizationService.of({
    // ── Reads ────────────────────────────────────────────────────────
      checkMembership: (organizationId, userId) =>
        findFirstMember(organizationId, { where: { userId } }).pipe(
          Effect.map(() => true),
          Effect.catchTag('MemberNotFound', () => Effect.succeed(false)),
        ),

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

      // ── Writes ───────────────────────────────────────────────────────

      create: (input, scope) =>
        Effect.gen(function* () {
          const { userId, ...orgData } = input
          const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId, deletedAt: { isNull: true } } }))
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
                role: Array.isArray(scope?.role) ? scope.role.join(',') : scope?.role || ownerRole,
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

      update: (id, input) =>
        Effect.gen(function* () {
          yield* findOrgById(id)

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

      remove: id =>
        Effect.gen(function* () {
          yield* findOrgById(id)

          const [org] = yield* dbErr(
            db.delete(organizations).where(eq(organizations.id, id)).returning(),
          )
          if (!org)
            return yield* Effect.fail(new OrgDbFailed({ cause: 'delete returned no row' }))
          yield* Effect.forkDetach(events.publish({ _tag: 'OrganizationDeleted', orgId: id }))
          return org
        }),

      // ── Members ──────────────────────────────────────────────────────

      listMembers: (organizationId, config) =>
        Effect.gen(function* () {
          const merged = { ...config, where: { ...config?.where, organizationId } }
          const rows = yield* dbErr(db.query.members.findMany(merged))
          return rows
        }),

      findFirstMember,

      addMember: (input, memberLimit) =>
        Effect.gen(function* () {
          const user = yield* dbErr(db.query.users.findFirst({ where: { id: input.userId, deletedAt: { isNull: true } } }))
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
          const { memberId, organizationId } = input

          const member = yield* dbErr(
            db.query.members.findFirst({ where: { id: memberId, organizationId } }),
          )
          if (!member)
            return yield* Effect.fail(new MemberNotFound())

          const creatorRole = scope?.creatorRole ?? ownerRole
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

          const creatorRole = scope?.creatorRole ?? ownerRole
          const newRoles = typeof input.role === 'string' ? input.role.split(',').map(r => r.trim()) : input.role
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

      // ── Invitations ──────────────────────────────────────────────────

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

      listUserInvitations: (email, config) =>
        Effect.gen(function* () {
          const merged = {
            ...config,
            where: { ...config?.where, email, status: 'pending' as const },
          }
          const rows = yield* dbErr(db.query.invitations.findMany(merged))
          return rows
        }),

      cancelInvitation: id =>
        Effect.gen(function* () {
          const existing = yield* dbErr(
            db.query.invitations.findFirst({ where: { id } }),
          )
          if (!existing)
            return yield* Effect.fail(new InvitationNotFound())

          const [invitation] = yield* dbErr(
            db.update(invitations).set({ status: 'cancelled' }).where(eq(invitations.id, id)).returning(),
          )
          if (!invitation)
            return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation update returned no row' }))
          return invitation
        }),

      createInvitation: input =>
        Effect.gen(function* () {
          yield* findOrgById(input.organizationId)
          const validRole = yield* ensureValidRole(input.role)

          const existingMember = yield* dbErr(db.query.members.findFirst({
            where: { organizationId: input.organizationId, user: { email: input.email } },
          }))
          if (existingMember)
            return yield* Effect.fail(new MemberAlreadyExists({ member: existingMember }))

          const pending = yield* dbErr(db.query.invitations.findFirst({
            where: { organizationId: input.organizationId, email: input.email, status: 'pending' },
          }))
          if (pending) {
            if (!input.resend)
              return yield* Effect.fail(new InvitationAlreadyExists())
            // resend: refresh the expiry window on the EXISTING invitation, then
            // re-publish `InvitationCreated` for it. No other column changes.
            const [refreshed] = yield* dbErr(db.update(invitations)
              .set({ expiresAt: new Date(Date.now() + Duration.toMillis(INVITATION_DURATION)) })
              .where(eq(invitations.id, pending.id))
              .returning())
            if (!refreshed)
              return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation resend update returned no row' }))
            // `role` is always set at insert time; the `??` only satisfies the column's `string | null` type.
            yield* Effect.forkDetach(events.publish({
              _tag: 'InvitationCreated',
              invitationId: refreshed.id,
              orgId: input.organizationId,
              email: input.email,
              role: refreshed.role ?? (validRole as string),
              inviterId: refreshed.inviterId,
            }))
            return refreshed
          }

          const now = new Date()
          const [invitation] = yield* dbErr(db.insert(invitations).values({
            organizationId: input.organizationId,
            email: input.email,
            role: validRole as string,
            status: 'pending',
            inviterId: input.inviterId,
            expiresAt: new Date(now.getTime() + Duration.toMillis(INVITATION_DURATION)),
            createdAt: now,
          }).returning())
          if (!invitation)
            return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation insert returned no row' }))

          yield* Effect.forkDetach(events.publish({
            _tag: 'InvitationCreated',
            invitationId: invitation.id,
            orgId: input.organizationId,
            email: input.email,
            role: validRole as string,
            inviterId: input.inviterId,
          }))
          return invitation
        }),

      acceptInvitation: (invitationId, userId) =>
        Effect.gen(function* () {
          const inv = yield* dbErr(db.query.invitations.findFirst({ where: { id: invitationId } }))
          if (!inv)
            return yield* Effect.fail(new InvitationNotFound())
          if (inv.status !== 'pending')
            return yield* Effect.fail(new InvitationNotPending())
          if (inv.expiresAt.getTime() <= Date.now())
            return yield* Effect.fail(new InvitationExpired())

          const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId, deletedAt: { isNull: true } } }))
          if (!user)
            return yield* Effect.fail(new OrgUserNotFound())
          if (user.email !== inv.email)
            return yield* Effect.fail(new InvitationEmailMismatch())

          const existing = yield* dbErr(db.query.members.findFirst({
            where: { organizationId: inv.organizationId, userId },
          }))
          if (existing)
            return yield* Effect.fail(new MemberAlreadyExists({ member: existing }))

          const result = yield* dbErr(db.transaction(tx =>
            Effect.gen(function* () {
              const [m] = yield* tx.insert(members).values({
                organizationId: inv.organizationId,
                userId,
                role: inv.role ?? 'org:member',
                createdAt: new Date(),
              }).returning()
              if (!m)
                return yield* Effect.fail(new Error('member insert returned no row'))
              const [accepted] = yield* tx.update(invitations)
                .set({ status: 'accepted' })
                .where(eq(invitations.id, invitationId))
                .returning()
              if (!accepted)
                return yield* Effect.fail(new Error('invitation update returned no row'))
              return { member: m, invitation: accepted }
            }),
          ))

          yield* Effect.forkDetach(events.publish({
            _tag: 'MemberAdded',
            orgId: inv.organizationId,
            userId,
            role: result.member.role,
          }))
          yield* Effect.forkDetach(events.publish({
            _tag: 'InvitationAccepted',
            invitationId,
            orgId: inv.organizationId,
            userId,
          }))
          return result
        }),

      rejectInvitation: (invitationId, userId) =>
        Effect.gen(function* () {
          const inv = yield* dbErr(db.query.invitations.findFirst({ where: { id: invitationId } }))
          if (!inv)
            return yield* Effect.fail(new InvitationNotFound())
          if (inv.status !== 'pending')
            return yield* Effect.fail(new InvitationNotPending())

          // Note: expiry is not enforced on rejection — a user may reject a lapsed invite.
          const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId, deletedAt: { isNull: true } } }))
          if (!user)
            return yield* Effect.fail(new OrgUserNotFound())
          if (user.email !== inv.email)
            return yield* Effect.fail(new InvitationEmailMismatch())

          const [rejected] = yield* dbErr(db.update(invitations)
            .set({ status: 'rejected' })
            .where(eq(invitations.id, invitationId))
            .returning())
          if (!rejected)
            return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation update returned no row' }))
          yield* Effect.forkDetach(events.publish({
            _tag: 'InvitationRejected',
            invitationId,
            orgId: inv.organizationId,
          }))
          return rejected
        }),

      // ── Permissions ──────────────────────────────────────────────────

      hasPermission: input =>
        Effect.gen(function* () {
          if (input.allowCreatorAllPermissions && input.role.split(',').includes(input.creatorRole ?? ownerRole))
            return true

          // Live role set at request time — includes domains registered by other
          // modules' `onStart` (e.g. stock-location), which the old
          // construction-time snapshot missed (→ their perms always denied).
          const roles = yield* access.roles
          let acRoles: { [x: string]: AccessRole | undefined } = Object.assign({}, roles)

          if (input.dynamicAccessControl) {
          // TODO: this is a naive implementation that re-fetches all org roles on every permission check when
          // `dynamicAccessControl` is enabled. A more efficient approach would be to only fetch the relevant org's roles,
          // and to cache them with an appropriate invalidation strategy (e.g. subscribe to role change events).
          }

          if (input.useMemoryCache)
            acRoles = cacheOrgRoles.get(input.orgId) ?? acRoles
          cacheOrgRoles.set(input.orgId, acRoles)

          return yield* access.checkPermission(
            input.role,
            input.permissions,
            role => Effect.sync(() => acRoles[role]),
            input.connector,
          )
        }),
    })
  })
}

/** Live layer, parameterized by the org-owner role name (from `authConfig`). */
export const makeLayer = (ownerRole: string) => Layer.effect(OrganizationService, make(ownerRole))

/** Back-compat default-valued layer for tests that don't wire `authConfig`. */
export const layer = makeLayer('org:owner')
